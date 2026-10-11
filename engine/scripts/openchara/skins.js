// Alternate skins of a character (night / water / waterNight), chosen per ENTITY through the skin_variant property.
// Which variant applies when (time of day, being in water...) is the project's policy; this only sets it. A character
// without that skin keeps showing its default one, so setting a variant is always safe.

import { NS } from "./ids.js";

export const SKIN_VARIANTS = ["default", "night", "water", "waterNight"];   // property values 0..3, same order as src/build/species.js

/** @param {string} variant one of SKIN_VARIANTS */
export function setSkinVariant(entity, variant) {
    const v = SKIN_VARIANTS.indexOf(variant);
    if (v < 0) throw new Error(`unknown skin variant "${variant}"`);
    try { entity.setProperty(`${NS}:skin_variant`, v); } catch (e) { /* entity gone */ }
}

export function getSkinVariant(entity) {
    try { return SKIN_VARIANTS[entity.getProperty(`${NS}:skin_variant`)] ?? "default"; } catch (e) { return "default"; }
}
