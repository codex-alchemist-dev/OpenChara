// Species ("character type") registry, from the project's
// PATCHES/characters/*.json. Each entry's `index` is the value written to
// the entity's species_index property and the position of its texture in
// the generated render controller's species array - the build assigns
// nothing on its own, so indices stay stable as characters are added.
//
// Any other fields a project puts on a character (costs, favorite gifts,
// lore...) pass straight through getSpeciesInfo() for its own scripts.

import { CHARACTERS } from "./content.generated.js";



export const SPECIES = CHARACTERS;

// The first defined character (lowest index) - the default for anything
// that needs "some species" (dev tools, an unknown id on an old record).
export const DEFAULT_SPECIES = Object.values(CHARACTERS).sort((a, b) => a.index - b.index)[0]?.id ?? null;

export function getSpeciesInfo(species) {
    return { ...(SPECIES[species] ?? SPECIES[DEFAULT_SPECIES] ?? {}) };
}

/** The species id that claims a legacy entity type (a character's `legacy.types`, e.g. "ac:march7"), or null. */
export function findSpeciesByLegacyType(typeId) {
    for (const c of Object.values(CHARACTERS)) if (c.legacy?.types?.includes(typeId)) return c.id;
    return null;
}

/** Every legacy entity type any character claims, as { typeId: speciesId } (for importers and /scriptevent listings). */
export function legacyTypeMap() {
    const out = {};
    for (const c of Object.values(CHARACTERS)) for (const t of c.legacy?.types ?? []) out[t] = c.id;
    return out;
}
