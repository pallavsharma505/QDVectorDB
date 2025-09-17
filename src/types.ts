export type Vector = number[];

export type Metadata = Record<string, unknown>;

export type RecordEntry = {
  id: string;
  vector: Vector; // stored as original
  meta?: Metadata;
  deleted?: boolean;
};

export type SearchResult = {
  id: string;
  score?: number; // cosine similarity (higher is better)
  distance?: number; // euclidean distance (lower is better)
  vector: Vector;
  meta?: Metadata;
};

export type OpenOptions = {
  dir: string; // storage directory
  memtableFlushSize?: number; // threshold for flush to SSTable
  maxSSTablesBeforeCompact?: number; // trigger compaction
};
