import { VectorDB } from "./src/vector_db.ts";
import process from "process";
import fs from "fs";

fs.unlinkSync("Log.csv");

setInterval(() => {
    const RamUsage = process.memoryUsage.rss() / 1024 / 1024;
    fs.appendFileSync("Log.csv", `${new Date().toISOString()},${RamUsage.toFixed(2)}\n`);
}, 100); // keep alive for async ops

async function demo() {
    const db = await VectorDB.open({ dir: "./data", memtableFlushSize: 100, maxSSTablesBeforeCompact: 8 });

    // batch insert
    const batch = 1000;
    const batchCount = 100;
    const ids: string[] = [];
    console.time(`Insert ${batch * batchCount}`);
    for (let b = 0; b < batchCount; b++) {
        const items = Array.from({ length: batch }, (_, i) => ({ vector: [Math.cos(i + b * batch), Math.sin(i + b * batch)], meta: { i: i + b * batch } }));
        const batchIds = await db.addBatch(items);
        if (Array.isArray(batchIds)) ids.push(...batchIds);
    }
    console.timeEnd(`Insert ${batch * batchCount}`);
    console.time(`Count`);
    console.log("Inserted:", ids.length);
    console.timeEnd(`Count`);

    console.time(`Search Similarity(cosine)`);
    const query = [1, 0];
    const similar = await db.searchSimilar(query, 5);
    console.log("Top-5 cosine similar:", similar.map((r) => ({ id: r.id, score: r.score })));
    console.timeEnd(`Search Similarity(cosine)`);

    console.time(`Search Nearby(euclidean)`);
    const nearby = await db.searchNearby(query, 5);
    console.log("Top-5 euclidean nearby:", nearby.map((r) => ({ id: r.id, distance: r.distance })));
    console.timeEnd(`Search Nearby(euclidean)`);

    // delete a couple
    console.time(`Delete`);
    console.log("Count before delete:", await db.count());
    await db.deleteBatch(ids.slice(0, 3));
    console.log("Count after delete:", await db.count());
    console.timeEnd(`Delete`);

    // persist to disk
    console.time(`Save`);
    await db.save();
    console.timeEnd(`Save`);

    await db.close();
    setTimeout(() => process.exit(0), 2000); // wait for setInterval to log
}

setTimeout(() => {
    demo().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}, 1000);

export { VectorDB };