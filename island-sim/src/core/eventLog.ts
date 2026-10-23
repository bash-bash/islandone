import { StreamHash } from "./hash";

/**
 * Everything that happens in a run is recorded here. The fingerprint over all
 * events is the reproducibility check: same seed, same fingerprint.
 */
export interface SimEvent {
  tick: number;
  /** Which subsystem produced it, e.g. "weather". */
  source: string;
  type: string;
  data?: Record<string, unknown>;
}

export class EventLog {
  private readonly events: SimEvent[] = [];
  private readonly hash = new StreamHash();
  private size = 0;

  constructor(
    private readonly keepEvents = true,
    private readonly listener?: (event: SimEvent) => void,
  ) {}

  push(event: SimEvent): void {
    this.listener?.(event);
    this.hash.update(canonicalJson(event));
    this.hash.update("\n");
    if (this.keepEvents) this.events.push(event);
    this.size++;
  }

  get count(): number {
    return this.size;
  }

  all(): readonly SimEvent[] {
    return this.events;
  }

  fingerprint(): string {
    return this.hash.digest();
  }
}

/** JSON with sorted object keys, so key insertion order never changes the hash. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`EventLog: non-finite number ${value}`);
  }
  return value;
}
