# qd-vectordb

Persistent vector database with cosine similarity and euclidean distance, KD-Tree indexing, LSM-like persistence, concurrency, and batch operations.

To install dependencies:

```bash
bun install
```

To run demo:

```bash
bun run index.ts

## API

```ts
import { VectorDB } from "./src/vector_db.ts";

const db = await VectorDB.open({ dir: "./data" });

// add vectors
const id = await db.add([0.1, 0.2, 0.3], { label: "a" });
const ids = await db.addBatch([
	{ vector: [1, 0], meta: { label: "x" } },
	{ vector: [0, 1], meta: { label: "y" } },
]);

// similarity (cosine)
const similar = await db.searchSimilar([0.9, 0.1], 5);
// nearby (euclidean)
const nearby = await db.searchNearby([0.9, 0.1], 5);

// delete
await db.delete(id);
await db.deleteBatch(ids);

// persist and close
await db.save();
await db.close();
```

Notes
- Concurrency: readers/writers are coordinated with an async RWLock.
- Persistence: WAL + SSTables in the `dir`. Memtable flush threshold is configurable.
- Index: KD-Tree rebuilt on open and incrementally updated on inserts (removals are lazily handled; full rebuild on restart or can be triggered by an explicit method in the future).
- Scalability: LSM design enables fast writes; KD-Tree accelerates k-NN queries for moderate dimensions.
```

This project was created using `bun init` in bun v1.2.22. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
