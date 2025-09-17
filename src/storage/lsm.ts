import { promises as fs } from "fs";
import { mkdir, readdir, readFile, writeFile, stat } from "fs/promises";
import { join } from "path";
import type { OpenOptions, RecordEntry } from "../types";

type WALRecord = { type: "put" | "del"; id: string; vector?: number[]; meta?: Record<string, unknown> };

export class LSMStorage {
  private dir: string;
  private memtable = new Map<string, RecordEntry>();
  private tombstones = new Set<string>();
  private walPath: string;
  private sstCounter = 0;
  private memtableFlushSize: number;
  private maxSSTablesBeforeCompact: number;

  constructor(opts: OpenOptions) {
    this.dir = opts.dir;
    this.walPath = join(this.dir, "wal.jsonl");
    this.memtableFlushSize = opts.memtableFlushSize ?? 1000;
    this.maxSSTablesBeforeCompact = opts.maxSSTablesBeforeCompact ?? 4;
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
    // load wal
    try {
      const walStat = await stat(this.walPath).catch(() => undefined);
      if (walStat && walStat.size > 0) {
        const content = await readFile(this.walPath, "utf8");
        for (const line of content.split(/\n/)) {
          if (!line.trim()) continue;
          const rec = JSON.parse(line) as WALRecord;
          if (rec.type === "put" && rec.vector) {
            this.memtable.set(rec.id, { id: rec.id, vector: rec.vector, meta: rec.meta });
            this.tombstones.delete(rec.id);
          } else if (rec.type === "del") {
            this.memtable.delete(rec.id);
            this.tombstones.add(rec.id);
          }
        }
      }
    } catch (e) {
      // ignore
    }
    // track existing SSTables
    const files = await readdir(this.dir).catch(() => []);
    const ssts = files.filter((f) => f.startsWith("sst_") && f.endsWith(".json"));
    this.sstCounter = ssts.length;
  }

  private async appendWAL(rec: WALRecord) {
    const line = JSON.stringify(rec) + "\n";
    await fs.appendFile(this.walPath, line, "utf8");
  }

  async putBatch(rows: RecordEntry[]) {
    if (rows.length === 0) return;
    // append to WAL in one chunk
    const lines = rows.map((r) => JSON.stringify({ type: "put", id: r.id, vector: r.vector, meta: r.meta } as WALRecord)).join("\n") + "\n";
    await fs.appendFile(this.walPath, lines, "utf8");
    for (const r of rows) {
      this.memtable.set(r.id, r);
      this.tombstones.delete(r.id);
    }
    if (this.memtable.size >= this.memtableFlushSize) await this.flushMemtable();
  }

  async deleteBatch(ids: string[]) {
    if (ids.length === 0) return;
    const lines = ids.map((id) => JSON.stringify({ type: "del", id } as WALRecord)).join("\n") + "\n";
    await fs.appendFile(this.walPath, lines, "utf8");
    for (const id of ids) {
      this.memtable.delete(id);
      this.tombstones.add(id);
    }
    if (this.memtable.size >= this.memtableFlushSize) await this.flushMemtable();
  }

  async get(id: string): Promise<RecordEntry | undefined> {
    if (this.tombstones.has(id)) return undefined;
    const inMem = this.memtable.get(id);
    if (inMem) return inMem;
    // search SSTables newest to oldest
    const files = await readdir(this.dir).catch(() => []);
    const ssts = files.filter((f) => f.startsWith("sst_") && f.endsWith(".json")).sort().reverse();
    for (const f of ssts) {
      const arr = JSON.parse(await readFile(join(this.dir, f), "utf8")) as RecordEntry[];
      const found = arr.find((r) => r.id === id);
      if (found) return found;
    }
    return undefined;
  }

  // Full scan across memtable + SSTables; caller filters tombstones
  async scanAll(): Promise<RecordEntry[]> {
    const out = new Map<string, RecordEntry>();
    for (const [id, r] of this.memtable) out.set(id, r);
    const files = await readdir(this.dir).catch(() => []);
    const ssts = files.filter((f) => f.startsWith("sst_") && f.endsWith(".json")).sort().reverse();
    for (const f of ssts) {
      const arr = JSON.parse(await readFile(join(this.dir, f), "utf8")) as RecordEntry[];
      for (const r of arr) if (!out.has(r.id) && !this.tombstones.has(r.id)) out.set(r.id, r);
    }
    // tombstones take precedence
    for (const id of this.tombstones) out.delete(id);
    return Array.from(out.values());
  }

  async flushMemtable() {
    if (this.memtable.size === 0) return;
    const arr = Array.from(this.memtable.values());
    this.sstCounter++;
    const file = join(this.dir, `sst_${String(this.sstCounter).padStart(6, "0")}.json`);
    // Sort by id for potential future merge efficiency
    arr.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    await writeFile(file, JSON.stringify(arr), "utf8");
    this.memtable.clear();
    // Optionally compact
    await this.maybeCompact();
  }

  private async maybeCompact() {
    const files = await readdir(this.dir).catch(() => []);
    const ssts = files.filter((f) => f.startsWith("sst_") && f.endsWith(".json"));
    if (ssts.length < this.maxSSTablesBeforeCompact) return;
    // Simple compaction: merge all SSTables into one, newest wins
    ssts.sort();
    const map = new Map<string, RecordEntry>();
    for (const f of ssts) {
      const arr = JSON.parse(await readFile(join(this.dir, f), "utf8")) as RecordEntry[];
      for (const r of arr) map.set(r.id, r);
    }
    for (const id of this.tombstones) map.delete(id);
    const merged = Array.from(map.values()).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const file = join(this.dir, `sst_${String(++this.sstCounter).padStart(6, "0")}_compact.json`);
    await writeFile(file, JSON.stringify(merged), "utf8");
    // remove old SSTables
    await Promise.all(ssts.map((f) => fs.unlink(join(this.dir, f)).catch(() => {})));
  }

  async close() {
    await this.flushMemtable();
  }
}
