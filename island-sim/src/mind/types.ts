/**
 * The character's side of the epistemic firewall (Handoff §5, §28).
 *
 * Rule: nothing in src/mind may import from src/world or src/perception.
 * The mind only ever sees Observation objects and only ever emits Actions;
 * the world decides what an action actually does. test/architecture.test.ts
 * enforces this.
 *
 * Handles ("p3", "t7") are neutral ids. Everything the character knows about
 * a place or thing comes from perceivable features, never from its kind.
 */

export type FeatureValue = string | number | boolean;
export type Features = Readonly<Record<string, FeatureValue>>;

/** Felt intensity: 0 none, 1 slight, 2 noticeable, 3 strong, 4 severe. */
export type Level = 0 | 1 | 2 | 3 | 4;

export interface Feelings {
  thirst: Level;
  hunger: Level;
  tired: Level;
  cold: Level;
  wet: Level;
  nausea: Level;
  pain: Level;
}

export type Observation =
  /** The character is at a place and sees its surroundings and the ways on. */
  | { tick: number; kind: "place"; place: string; features: Features; exits: readonly string[] }
  /** A thing visible at the current place (a source of food, water or pieces, or something built). */
  | { tick: number; kind: "thing"; thing: string; place: string; features: Features }
  /** What the character is holding, whenever that changes. */
  | { tick: number; kind: "inventory"; items: readonly { item: string; features: Features }[] }
  | { tick: number; kind: "body"; feelings: Feelings }
  | { tick: number; kind: "sky"; features: Features }
  /** What the character noticed when an action ended. */
  | { tick: number; kind: "outcome"; action: Action; success: boolean; minutes: number; felt: Features };

/** Why the character does something. Used for analytics (idle rate, time shares). */
export type Purpose = "drink" | "eat" | "sleep" | "shelter" | "explore" | "rest" | "idle" | "experiment" | "work" | "plan";

/** What the character attempts. The outcome is computed by the world. */
export type Action =
  | { kind: "idle"; minutes: number; purpose: Purpose }
  | { kind: "rest"; minutes: number; purpose: Purpose }
  | { kind: "sleep"; purpose: Purpose }
  | { kind: "move"; to: string; purpose: Purpose }
  | { kind: "drink"; target: string; purpose: Purpose }
  /** Eat from a source; with a tool, the held piece is used on it (strike, stab, pry); `over` holds it over something first. */
  | { kind: "eat"; target: string; tool?: string; over?: string; purpose: Purpose }
  /** Pick up a piece from a source (stones, sticks, leaves, …). */
  | { kind: "take"; source: string; purpose: Purpose }
  | { kind: "drop"; item: string; purpose: Purpose }
  /** Tie two held pieces together with a held fiber strip. */
  | { kind: "bind"; items: readonly [string, string]; binder: string; purpose: Purpose }
  /** Put a held piece into what is built at the current place (starts something new if nothing is there); optionally tie it in. */
  | { kind: "build"; item: string; binder?: string; purpose: Purpose }
  /** Tie one loose part of what is built here with a held fiber strip. */
  | { kind: "tie"; binder: string; purpose: Purpose }
  /** Rub one held piece hard against another for a while. */
  | { kind: "rub"; item: string; against: string; purpose: Purpose }
  /** Put a held piece onto something here (whatever it is: something built, something glowing, …). */
  | { kind: "put"; item: string; onto: string; purpose: Purpose };

/** Something that happened inside the mind (a belief formed, learning used). Logged for analytics only. */
export interface MindEvent {
  tick: number;
  type: string;
  data?: Record<string, unknown>;
}

export interface Mind {
  /**
   * Asked whenever the character is free, before decide(): a request to think
   * (see src/mind/thinking.ts). The simulation answers it with receiveThought().
   */
  wantsThought?(): import("./thinking").ThinkRequest | null;
  receiveThought?(thought: import("./thinking").Thought, by: string): void;
  /** Receives everything perceived since the last call. */
  observe(observations: readonly Observation[]): void;
  /** Called whenever the character is free to act. */
  decide(tick: number): Action;
  /** Returns and clears what happened inside the mind since the last call. */
  drainEvents?(): MindEvent[];
}
