/**
 * Episodic memory: what happened to the character, when and where (Handoff §6).
 * Bounded: when full, the least salient old episodes are forgotten first.
 */
export interface Episode {
  tick: number;
  kind: "ate" | "drank" | "failed" | "felt_sick" | "discovered" | "storm";
  place: string | null;
  /** Thing handle, if any. */
  thing?: string;
  /** The character's own category of the thing, if any. */
  category?: string;
  /** 0..1, how memorable. */
  salience: number;
}

export class EpisodicMemory {
  private readonly episodes: Episode[] = [];

  constructor(private readonly capacity = 400) {}

  remember(episode: Episode): void {
    this.episodes.push(episode);
    if (this.episodes.length <= this.capacity) return;
    // Forget the least salient episode among the older half.
    let worst = 0;
    const half = Math.floor(this.episodes.length / 2);
    for (let i = 1; i < half; i++) if (this.episodes[i]!.salience < this.episodes[worst]!.salience) worst = i;
    this.episodes.splice(worst, 1);
  }

  /** Episodes of a kind since a tick, newest first. */
  recall(kind: Episode["kind"], sinceTick: number): Episode[] {
    const out: Episode[] = [];
    for (let i = this.episodes.length - 1; i >= 0; i--) {
      const e = this.episodes[i]!;
      if (e.tick < sinceTick) break;
      if (e.kind === kind) out.push(e);
    }
    return out;
  }

  get size(): number {
    return this.episodes.length;
  }
}
