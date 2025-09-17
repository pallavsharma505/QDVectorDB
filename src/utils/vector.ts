import type { Vector } from "../types";

export function dot(a: Vector, b: Vector): number {
  assertSameDim(a, b);
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    s += ai * bi;
  }
  return s;
}

export function norm(a: Vector): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    s += ai * ai;
  }
  return Math.sqrt(s);
}

export function cosineSimilarity(a: Vector, b: Vector): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

export function euclideanDistance(a: Vector, b: Vector): number {
  assertSameDim(a, b);
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    const d = ai - bi;
    s += d * d;
  }
  return Math.sqrt(s);
}

export function assertSameDim(a: Vector, b: Vector) {
  if (a.length !== b.length) throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
}
