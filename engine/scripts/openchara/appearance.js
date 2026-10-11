// Writes a character's species-driven look onto her entity: which species (skin/geometry), body scale and rig.
// Every character is the same entity; this is all that makes one different from the next. Skin variants are the
// project's policy and live in skins.js.

import { NS } from "./ids.js";
import { RIGS } from "./content.generated.js";

const SCALE_UNIT = 1000;   // body_scale property is permille (same as src/build/species.js)

export const getRig = id => (id ? RIGS[id] ?? null : null);

/** @param {object} entity the spawned character @param {object} species getSpeciesInfo() result */
export function applyAppearance(entity, species) {
    const set = (key, value) => { try { entity.setProperty(`${NS}:${key}`, value); } catch (e) { /* entity gone, or property not generated */ } };
    set("species_index", species.index);
    set("body_scale", Math.round((typeof species.body?.scale === "number" ? species.body.scale : 1) * SCALE_UNIT));
    set("rig_index", getRig(species.rig)?.index ?? 0);
}
