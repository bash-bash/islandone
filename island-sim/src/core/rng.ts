import { fnv1a32 } from "./hash";

/**
 * Seeded pseudo-random numbers (xoshiro128**, seeded via splitmix32).
 *
 * Every subsystem draws from its own named stream, so adding draws in one
 * subsystem (e.g. weather) does not shift the sequence of another
 * (e.g. the character). Math.random must never be used in the simulation.
 */
export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: number) {
    let x = seed >>> 0;
    const next = (): number => {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  /** Uniform unsigned 32-bit integer. */
  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0;
    const t = this.s1 << 9;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    if (max < min) throw new Error(`Rng.int: max ${max} < min ${min}`);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Rng.pick: empty list");
    return items[this.int(0, items.length - 1)] as T;
  }

  /** Picks a key by weight. Keys are visited in the given order, so callers keep the order stable. */
  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
    let total = 0;
    for (const [, w] of entries) total += Math.max(0, w);
    if (total <= 0) throw new Error("Rng.weighted: no positive weight");
    let r = this.next() * total;
    for (const [item, w] of entries) {
      r -= Math.max(0, w);
      if (r < 0) return item;
    }
    return entries[entries.length - 1]![0];
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** Hands out one independent stream per subsystem name, derived from the run seed. */
export class RngStreams {
  private readonly streams = new Map<string, Rng>();

  constructor(readonly seed: number) {}

  get(name: string): Rng {
    let rng = this.streams.get(name);
    if (!rng) {
      rng = new Rng(fnv1a32(name, fnv1a32(String(this.seed))));
      this.streams.set(name, rng);
    }
    return rng;
  }
}
