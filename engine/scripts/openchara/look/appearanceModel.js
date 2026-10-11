// The slow-changing appearance numbers: how wet she is and how dirty. Pure steps (seconds in, numbers out) so the model is
// tested without the game; lookState.js holds the per-character values and applies these once a second.
//
//   wetness 0..1  rises in water or open rain, dries slowly (fast in the Nether); drives the "wet" skin condition / overlays
//   dirt    0..1  added by the project (addDirt: combat, mining, mud...), washed off while she is wet

const clamp01 = v => Math.min(1, Math.max(0, v));

export const WET_RATE = { water: 0.35, rain: 0.12, dry: 0.015, dryNether: 0.1 };
export const WASH_RATE = 0.05;   // dirt lost per second while wetness >= WASH_MIN_WET
export const WASH_MIN_WET = 0.5;

/** @param {number} wetness @param {{ inWater: boolean, raining: boolean, nether: boolean, dt: number }} s */
export function stepWetness(wetness, { inWater, raining, nether = false, dt = 1 }) {
    if (inWater) return clamp01(wetness + WET_RATE.water * dt);
    if (raining) return clamp01(wetness + WET_RATE.rain * dt);
    return clamp01(wetness - (nether ? WET_RATE.dryNether : WET_RATE.dry) * dt);
}

/** Dirt after `dt` seconds: washes off while wet enough. */
export function stepDirt(dirt, wetness, dt = 1) {
    return wetness >= WASH_MIN_WET ? clamp01(dirt - WASH_RATE * dt) : dirt;
}

/**
 * The level (0..thresholds.length) of an overlay for a value: the number of thresholds the value has reached.
 * thresholds [0.2, 0.5, 0.8] -> value 0.1 = 0, 0.2 = 1, 0.6 = 2, 0.9 = 3.
 */
export function overlayLevel(value, thresholds) {
    let level = 0;
    for (const t of thresholds) if (value >= t) level++;
    return level;
}
