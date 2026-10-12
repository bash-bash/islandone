import type { Features } from "./types";

/**
 * The character's own way of grouping things: by how they look (Handoff §5).
 * Two things that look alike fall into the same category, whatever they are
 * objectively. A category is a stable string built from the look features;
 * volatile features (how many are left) are ignored.
 */
const VOLATILE = new Set(["amount", "roof", "uprights", "leaves", "tied"]);

export function categoryOf(features: Features): string {
  return Object.keys(features)
    .filter((k) => !VOLATILE.has(k))
    .sort()
    .map((k) => `${k}=${String(features[k])}`)
    .join(";");
}
