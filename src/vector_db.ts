import { randomUUID } from "crypto";
import type { Metadata, OpenOptions, RecordEntry, SearchResult, Vector } from "./types";
import { cosineSimilarity, euclideanDistance, assertSameDim } from "./utils/vector";
import { RWLock } from "./utils/rwlock";
import { LSMStorage } from "./storage/lsm";
import { KDTreeIndex } from "./index/kdtree";

export class VectorDB {
  private opts: OpenOptions;
  private lock = new RWLock();
  private storage: LSMStorage;
  private index?: KDTreeIndex;
  private dims?: number;

  private inMemory: Map<string, RecordEntry> = new Map();

  private constructor(opts: OpenOptions) {
    this.opts = opts;
    this.storage = new LSMStorage(opts);
  }

  static async open(opts: OpenOptions): Promise<VectorDB> {
    const db = new VectorDB(opts);
    await db.storage.init();
    await db.rebuildIndex();
    return db;
  }

  private ensureDims(v: Vector) {
    if (this.dims == null) this.dims = v.length;
    else if (this.dims !== v.length) throw new Error(`Vector dims mismatch: expected ${this.dims}, got ${v.length}`);
  }

  private async rebuildIndex() {
    const release = await this.lock.writeLock();
    try {
      const rows = await this.storage.scanAll();
      this.inMemory.clear();
      for (const r of rows) this.inMemory.set(r.id, r);
      const any = rows[0];
      if (any) this.dims = any.vector.length;
      if (this.dims) {
        this.index = new KDTreeIndex(this.dims);
        this.index.build(rows);
      }
    } finally {
      release();
    }
  }

  async add(vector: Vector, meta?: Metadata, id?: string): Promise<string> {
    this.ensureDims(vector);
    const release = await this.lock.writeLock();
    try {
      const rid = id ?? randomUUID();
      const rec: RecordEntry = { id: rid, vector: vector.slice(), meta };
      await this.storage.putBatch([rec]);
      this.inMemory.set(rid, rec);
      if (!this.index && this.dims) this.index = new KDTreeIndex(this.dims);
      this.index?.insert(rec);
      return rid;
    } finally {
      release();
    }
  }

  async addBatch(items: Array<{ vector: Vector; meta?: Metadata; id?: string }>): Promise<string[]> {
    if (items.length === 0) return [];
    this.ensureDims(items[0]!.vector);
    const release = await this.lock.writeLock();
    try {
      const rows: RecordEntry[] = items.map((it) => ({ id: it.id ?? randomUUID(), vector: it.vector.slice(), meta: it.meta }));
      await this.storage.putBatch(rows);
      for (const r of rows) {
        this.inMemory.set(r.id, r);
        if (!this.index && this.dims) this.index = new KDTreeIndex(this.dims);
        this.index?.insert(r);
      }
      return rows.map((r) => r.id);
    } finally {
      release();
    }
  }

  async delete(id: string): Promise<boolean> {
    const release = await this.lock.writeLock();
    try {
      if (!this.inMemory.has(id)) return false;
      await this.storage.deleteBatch([id]);
      this.inMemory.delete(id);
      this.index?.removeById(id);
      return true;
    } finally {
      release();
    }
  }

  async deleteBatch(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const release = await this.lock.writeLock();
    try {
      const existing = ids.filter((id) => this.inMemory.has(id));
      if (existing.length === 0) return 0;
      await this.storage.deleteBatch(existing);
      for (const id of existing) {
        this.inMemory.delete(id);
        this.index?.removeById(id);
      }
      return existing.length;
    } finally {
      release();
    }
  }

  async searchSimilar(query: Vector, k = 10): Promise<SearchResult[]> {
    if (!this.dims || this.inMemory.size === 0) return [];
    assertSameDim(query, Array.from(this.inMemory.values())[0]!.vector);
    const release = await this.lock.readLock();
    try {
      const idx = this.index;
      let candidates: string[];
      if (idx) candidates = idx.knnCosine(query, k * 3); // overfetch
      else candidates = Array.from(this.inMemory.keys());
      const results: SearchResult[] = [];
      for (const id of candidates) {
        const rec = this.inMemory.get(id);
        if (!rec) continue;
        const score = cosineSimilarity(query, rec.vector);
        results.push({ id, score, vector: rec.vector, meta: rec.meta });
      }
      results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      return results.slice(0, k);
    } finally {
      release();
    }
  }

  async searchNearby(query: Vector, k = 10): Promise<SearchResult[]> {
    if (!this.dims || this.inMemory.size === 0) return [];
    assertSameDim(query, Array.from(this.inMemory.values())[0]!.vector);
    const release = await this.lock.readLock();
    try {
      const idx = this.index;
      let candidates: string[];
      if (idx) candidates = idx.knnEuclidean(query, k * 3);
      else candidates = Array.from(this.inMemory.keys());
      const results: SearchResult[] = [];
      for (const id of candidates) {
        const rec = this.inMemory.get(id);
        if (!rec) continue;
        const distance = euclideanDistance(query, rec.vector);
        results.push({ id, distance, vector: rec.vector, meta: rec.meta });
      }
      results.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
      return results.slice(0, k);
    } finally {
      release();
    }
  }

  async count(): Promise<number> {
    const release = await this.lock.readLock();
    try {
      return this.inMemory.size;
    } finally {
      release();
    }
  }

  async save(): Promise<void> {
    const release = await this.lock.writeLock();
    try {
      await this.storage.flushMemtable();
    } finally {
      release();
    }
  }

  async close(): Promise<void> {
    await this.save();
  }
}
