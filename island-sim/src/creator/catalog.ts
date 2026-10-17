import type { ThingKind } from "../world/island";

/**
 * What the world can offer, in plain property words, for the Creator
 * (Handoff §8, §9). This is the world author's view, never the character's:
 * src/mind and the thinkers must not import it (see test/architecture.test.ts).
 *
 * Each entry follows from the physics in src/world (items.ts, tools.ts,
 * structures.ts, fire.ts). Latent things exist on the island but give nothing
 * away by their looks (Handoff §8).
 */
export interface CatalogEntry {
  kind: ThingKind | "bound piece" | "built frame" | "fire";
  latent: boolean;
  offers: string[];
}

export const WORLD_CATALOG: readonly CatalogEntry[] = [
  { kind: "spring", latent: false, offers: ["frisches Trinkwasser, fließt immer"] },
  { kind: "sea", latent: false, offers: ["Salzwasser, macht durstiger", "trägt Treibholz an den Strand"] },
  { kind: "fruit_bush", latent: false, offers: ["weiche gelbe Früchte, essbar, wachsen langsam nach"] },
  { kind: "red_berry_bush", latent: true, offers: ["kleine rote Beeren, leicht giftig, machen übel"] },
  { kind: "coconut_palm", latent: false, offers: ["harte runde Früchte mit Saft und Fleisch, nur mit schwerem hartem Schlagstück zu öffnen"] },
  { kind: "shellfish", latent: false, offers: ["Muscheln am Fels, essbar, mit dünner harter Kante leichter zu lösen"] },
  { kind: "fish", latent: false, offers: ["flinke Fische im Flachwasser, essbar, mit langem spitzem Stück zu fangen, werden bei viel Fang knapp"] },
  { kind: "stones", latent: false, offers: ["runde schwere harte Steine zum Schlagen", "flache Steine", "scharfkantige Steine mit Schneide oder Spitze, hart, bis 20 cm lang"] },
  { kind: "branches", latent: false, offers: ["Stöcke 0,5 bis 2,2 m, leicht, mittelhart, manche spitz", "trockenes Holz zum Reiben und Brennen"] },
  { kind: "driftwood", latent: false, offers: ["schwere Holzklötze 0,6 bis 1,8 m", "Holz zum Brennen, nach Regen nass"] },
  { kind: "fiber_plant", latent: false, offers: ["lange zähe Blätter als Schnur zum Binden und Festbinden", "trockene feine Fasern, die an Glut aufflammen"] },
  { kind: "palm_fronds", latent: false, offers: ["große flache breite Wedel bis 2,5 m, bis 1,6 m² Fläche, decken Regen ab, wenn ein Gerüst sie hält"] },
  { kind: "bound piece", latent: false, offers: ["zwei Stücke mit Faser zusammengebunden: Länge des längeren, Spitze des schärferen, Verbindung so fest wie die Faser, kann beim Gebrauch aufgehen"] },
  { kind: "built frame", latent: false, offers: ["Gebautes aus langen Stöcken mit Wedeln darauf hält Regen ab (bis gut 90 %), festgebundene Teile halten Sturm besser"] },
  { kind: "fire", latent: false, offers: ["trockenes Holz kräftig an Holz gerieben gibt manchmal Glut", "Glut mit trockener Faser darauf flammt auf", "Feuer wärmt, trocknet, gart Fisch und Muscheln, frisst Holz, geht im Regen aus"] },
];

/** Changes whenever the catalog changes, so recorded Creator verdicts are not reused for a different world. */
export const CATALOG_VERSION = "v0-2026-10-12";
