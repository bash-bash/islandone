/**
 * Small, platform-independent hashes. No Node crypto, so the simulation can
 * later run unchanged in the browser or a worker.
 */

/** 32-bit FNV-1a over a string (UTF-16 code units). */
export function fnv1a32(text: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Incremental 64-bit hash built from two independent 32-bit lanes
 * (cyrb53-style mixing). Used for the event-log fingerprint.
 */
export class StreamHash {
  private h1 = 0xdeadbeef;
  private h2 = 0x41c6ce57;

  update(text: string): void {
    let h1 = this.h1;
    let h2 = this.h2;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    this.h1 = h1;
    this.h2 = h2;
  }

  /** 16 hex digits. Does not change the internal state. */
  digest(): string {
    let h1 = this.h1;
    let h2 = this.h2;
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return hex32(h2) + hex32(h1);
  }
}

function hex32(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}
