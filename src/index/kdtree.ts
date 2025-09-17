import type { RecordEntry, Vector } from "../types";
import { cosineSimilarity, euclideanDistance } from "../utils/vector";

type Node = {
  point: RecordEntry;
  axis: number;
  left?: Node;
  right?: Node;
};

export class KDTreeIndex {
  private root?: Node;
  private dims: number;

  constructor(dims: number) {
    this.dims = dims;
  }

  build(points: RecordEntry[]) {
    const dims = this.dims;
    const buildRec = (pts: RecordEntry[], depth: number): Node | undefined => {
      if (pts.length === 0) return undefined;
      const axis = depth % dims;
      pts.sort((a, b) => a.vector[axis]! - b.vector[axis]!);
      const mid = Math.floor(pts.length / 2);
      return {
        point: pts[mid]!,
        axis,
        left: buildRec(pts.slice(0, mid), depth + 1),
        right: buildRec(pts.slice(mid + 1), depth + 1),
      };
    };
    this.root = buildRec(points.slice(), 0);
  }

  insert(p: RecordEntry) {
    const dims = this.dims;
    const rec = (node: Node | undefined, depth: number): Node => {
      if (!node) return { point: p, axis: depth % dims };
      const axis = node.axis;
      if (p.vector[axis]! < node.point.vector[axis]!) node.left = rec(node.left, depth + 1);
      else node.right = rec(node.right, depth + 1);
      return node;
    };
    this.root = rec(this.root, 0);
  }

  removeById(id: string) {
    // Lazy: actual deletion in index is expensive; rebuild periodically from source of truth.
    // We do nothing here; searches will filter deleted via storage layer.
  }

  knnCosine(query: Vector, k: number): string[] {
    // return top-k ids by cosine similarity
    const heap: Array<{ id: string; score: number }> = [];
    const visit = (node?: Node) => {
      if (!node) return;
      const score = cosineSimilarity(query, node.point.vector);
      pushTopKMax(heap, { id: node.point.id, score }, k);
      const axis = node.axis;
      const diff = query[axis]! - node.point.vector[axis]!;
      const first = diff < 0 ? node.left : node.right;
      const second = diff < 0 ? node.right : node.left;
      visit(first);
      // heuristic bound: if potential remains on other side
      if (heap.length < k || Math.abs(diff) > 0) visit(second);
    };
    visit(this.root);
    // sort desc by score
    heap.sort((a, b) => b.score - a.score);
    return heap.map((h) => h.id);
  }

  knnEuclidean(query: Vector, k: number): string[] {
    const heap: Array<{ id: string; dist: number }> = [];
    const visit = (node?: Node) => {
      if (!node) return;
      const dist = euclideanDistance(query, node.point.vector);
      pushTopKMin(heap, { id: node.point.id, dist }, k);
      const axis = node.axis;
      const diff = query[axis]! - node.point.vector[axis]!;
      const first = diff < 0 ? node.left : node.right;
      const second = diff < 0 ? node.right : node.left;
      visit(first);
      if (heap.length < k || Math.abs(diff) < heap[heap.length - 1]!.dist) visit(second);
    };
    visit(this.root);
    heap.sort((a, b) => a.dist - b.dist);
    return heap.map((h) => h.id);
  }
}

function pushTopKMax<T extends { score: number }>(arr: T[], item: T, k: number) {
  arr.push(item);
  arr.sort((a, b) => b.score - a.score);
  if (arr.length > k) arr.pop();
}

function pushTopKMin<T extends { dist: number }>(arr: T[], item: T, k: number) {
  arr.push(item);
  arr.sort((a, b) => a.dist - b.dist);
  if (arr.length > k) arr.pop();
}
