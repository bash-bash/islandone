/**
 * The character's body as objective world state (Handoff §6 "Current State").
 * Exact numbers stay in the world; the character only feels coarse levels
 * (see src/perception).
 *
 * Scales: hunger, thirst, sickness 0 = fine … 100 = extreme;
 * energy, warmth, health 100 = fine … 0 = exhausted / freezing / dead.
 */
export interface Body {
  hunger: number;
  thirst: number;
  energy: number;
  warmth: number;
  health: number;
  sickness: number;
  /** 0 = dry, 1 = soaked. */
  wetness: number;
  asleep: boolean;
}

export function createBody(): Body {
  return { hunger: 20, thirst: 20, energy: 80, warmth: 100, health: 100, sickness: 0, wetness: 0, asleep: false };
}

/** Per-minute rates. Tuned so that: no water kills in about 3–4 days, no food in about 3–4 weeks. */
export const RATES = {
  thirstPerMin: 100 / (2.2 * 1440),
  hungerPerMin: 100 / (6 * 1440),
  energyAwakePerMin: 100 / (20 * 60),
  energyAsleepPerMin: 100 / (7 * 60),
  /** Extra factor while doing strenuous things (walking, gathering, fishing). */
  activeFactor: 1.4,
  heatThirstFactor: 1.6,
  sickThirstFactor: 1.4,
  /** Warmth lost per minute when soaked and fully exposed; scaled by wetness, exposure (1 − cover), wind, night and activity. */
  wetChillPerMin: 0.06,
  warmUpPerMin: 0.08,
  nightChillPerMin: 0.08,
  fireWarmthPerMin: 0.4,
  dryPerMin: 1 / 180,
  sicknessDecayPerMin: 0.04,
  healPerMin: 0.012,
} as const;

/** Health lost per minute while a need is critical. */
export const DAMAGE = {
  thirst: { above: 80, perMin: 0.03 },
  hunger: { above: 85, perMin: 0.008 },
  cold: { below: 25, perMin: 0.02 },
  sickness: { above: 30, perMin: 0.012 },
  exhaustion: { below: 3, perMin: 0.005 },
} as const;

export type DamageCause = keyof typeof DAMAGE;

export interface BodyEnvironment {
  raining: boolean;
  windy: boolean;
  hot: boolean;
  dark: boolean;
  /** Cover of the current place, 0..1. */
  cover: number;
  active: boolean;
  /** A flame burns at the character's place: warms and dries. */
  nearFire?: boolean;
}

/**
 * Advances the body by one minute. Returns the health damage per cause this
 * minute, so the world can tell what a death was caused by.
 */
export function tickBody(body: Body, env: BodyEnvironment): Partial<Record<DamageCause, number>> {
  const activity = env.active ? RATES.activeFactor : 1;

  let thirstRate = RATES.thirstPerMin * activity;
  if (env.hot) thirstRate *= RATES.heatThirstFactor;
  if (body.sickness > 20) thirstRate *= RATES.sickThirstFactor;
  body.thirst = clamp(body.thirst + thirstRate * (body.asleep ? 0.6 : 1));
  body.hunger = clamp(body.hunger + RATES.hungerPerMin * activity * (body.asleep ? 0.6 : 1));

  if (body.asleep) body.energy = clamp(body.energy + RATES.energyAsleepPerMin);
  else body.energy = clamp(body.energy - RATES.energyAwakePerMin * activity);

  const exposure = 1 - env.cover;
  if (env.raining && exposure > 0.15) body.wetness = Math.min(1, body.wetness + 0.05 * exposure);
  else body.wetness = Math.max(0, body.wetness - RATES.dryPerMin * (env.hot ? 2 : 1) * (env.raining ? 0.5 : 1) * (env.nearFire ? 6 : 1));

  // Tropical air: being wet only chills in wind or at night; moving keeps you warmer.
  const chill =
    body.wetness *
    RATES.wetChillPerMin *
    exposure *
    (env.windy ? 2 : 1) *
    (env.dark ? 1.5 : env.windy ? 0.6 : 0) *
    (env.active ? 0.5 : 1);
  // Nights are cool in the open, a little less under cover; a fire warms.
  const nightChill = env.dark ? RATES.nightChillPerMin * (0.3 + 0.7 * exposure) : 0;
  const warmUp = RATES.warmUpPerMin * (1 - body.wetness * 0.7) + (env.nearFire ? RATES.fireWarmthPerMin : 0);
  body.warmth = clamp(body.warmth + warmUp - chill - nightChill);

  body.sickness = clamp(body.sickness - RATES.sicknessDecayPerMin);

  const damage: Partial<Record<DamageCause, number>> = {};
  if (body.thirst > DAMAGE.thirst.above) damage.thirst = DAMAGE.thirst.perMin;
  if (body.hunger > DAMAGE.hunger.above) damage.hunger = DAMAGE.hunger.perMin;
  if (body.warmth < DAMAGE.cold.below) damage.cold = DAMAGE.cold.perMin;
  if (body.sickness > DAMAGE.sickness.above) damage.sickness = DAMAGE.sickness.perMin;
  if (body.energy < DAMAGE.exhaustion.below) damage.exhaustion = DAMAGE.exhaustion.perMin;

  let total = 0;
  for (const v of Object.values(damage)) total += v;
  if (total > 0) body.health = clamp(body.health - total);
  else if (body.thirst < 70 && body.hunger < 75 && body.warmth > 50) {
    body.health = clamp(body.health + RATES.healPerMin * (body.asleep ? 2 : 1));
  }
  return damage;
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 100 ? 100 : v;
}
