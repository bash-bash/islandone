import type { Item } from "./items";

/**
 * Something built at a place: a set of pieces, some of them tied
 * (Handoff §13). The simulation does not know "hut" or "lean-to"; it only
 * computes how much rain the pieces keep off.
 */
export interface Structure {
  id: string;
  place: string;
  parts: string[];
  /** Pieces tied in with fiber. */
  bound: Set<string>;
}

/** How much of the sky the structure covers for someone under it, 0..0.92. */
export function structureCover(structure: Structure, items: ReadonlyMap<string, Item>): number {
  let frame = 0;
  let roof = 0;
  for (const id of structure.parts) {
    const item = items.get(id);
    if (!item) continue;
    if ((item.material === "wood" || item.material === "bound") && item.length >= 0.9) frame += item.length;
    roof += item.area;
  }
  // Leaves lying around keep little rain off; held up by a frame they form a roof.
  const support = frame >= 3 ? 1 : frame >= 1.5 ? 0.6 : frame > 0 ? 0.25 : 0;
  return Math.min(0.92, roof * (0.08 + 0.32 * support));
}
