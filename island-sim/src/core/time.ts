/** One tick is one virtual minute. */
export const TICKS_PER_HOUR = 60;
export const TICKS_PER_DAY = 24 * TICKS_PER_HOUR;

export interface SimTime {
  /** Day number starting at 1. */
  day: number;
  hour: number;
  minute: number;
}

export function timeOf(tick: number): SimTime {
  const dayTick = tick % TICKS_PER_DAY;
  return {
    day: Math.floor(tick / TICKS_PER_DAY) + 1,
    hour: Math.floor(dayTick / TICKS_PER_HOUR),
    minute: dayTick % TICKS_PER_HOUR,
  };
}

export function formatTime(tick: number): string {
  const t = timeOf(tick);
  return `Tag ${t.day} ${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
}
