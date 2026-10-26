// Where island-sim's places (a graph, island.ts) lie on the ~30 m test beach. Land is -X, sea is +X.
// The beach only shows part of the island: places beyond it have an exit point at the edge of
// the scene, where the figure walks to and then leaves the picture until it comes back.

export interface PlaceSpot {
  x: number;
  z: number;
  /** false: off the test beach; the figure walks to (x, z) and disappears there. */
  visible: boolean;
}

export const PLACE_SPOTS: Record<string, PlaceSpot> = {
  p1: { x: -1.4, z: -0.6, visible: true }, // Strand am Camp: open sand between fire, hut and workbench
  p2: { x: -9.5, z: -6.5, visible: true }, // Palmenhain: under the palms behind the camp
  p3: { x: -7.8, z: 8.5, visible: true }, // Waldrand: jungle edge by the young palm
  p4: { x: -12, z: 10, visible: false }, // Quelle im Inland: into the jungle
  p5: { x: 2.8, z: 8, visible: true }, // Felsen mit Überhang: the big rocks at the waterline
  p6: { x: 6.5, z: -2, visible: true }, // Flachwasser: wading as far out as the collision allows
  p7: { x: 3.8, z: -9.5, visible: true }, // Spülsaum: the shoreline past the pier
};

export function spotOf(place: string): PlaceSpot {
  return PLACE_SPOTS[place] ?? PLACE_SPOTS.p1;
}
