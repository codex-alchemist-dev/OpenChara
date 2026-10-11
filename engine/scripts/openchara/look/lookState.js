// Per-character appearance state that changes while she is out: wetness (memory only), dirt and her permanent variation seed
// (both persisted in record.look). Kept in memory while manifested and written back on despawn, so the database is not touched
// once a second. Mechanism only: what makes a character dirty (combat, mining, mud) is the project's, through addDirt().

import { updateCharacter } from "../characterRecord.js";
import { newSeed } from "./variation.js";

const states = new Map();   // characterId -> { seed, dirt, wetness, dirty }

/** The live state, created from the record on first use. A missing seed is created and persisted once. */
export function getLookState(owner, characterId, record) {
    let s = states.get(characterId);
    if (s) return s;
    const look = record?.look ?? {};
    s = { seed: look.seed ?? newSeed(), dirt: look.dirt ?? 0, wetness: 0, dirty: false };
    states.set(characterId, s);
    if (look.seed === undefined && owner) persist(owner, characterId, s);
    return s;
}

/** Adds (or with a negative amount, removes) dirt, 0..1. */
export function addDirt(characterId, amount) {
    const s = states.get(characterId);
    if (!s) return;
    s.dirt = Math.min(1, Math.max(0, s.dirt + amount));
    s.dirty = true;
}

export function setWetness(characterId, value) {
    const s = states.get(characterId);
    if (s) s.wetness = Math.min(1, Math.max(0, value));
}

function persist(owner, characterId, s) {
    try { updateCharacter(owner, characterId, old => ({ ...old, look: { ...(old.look ?? {}), seed: s.seed, dirt: +s.dirt.toFixed(3) } })); s.dirty = false; }
    catch (e) { /* offline or record gone; retried on the next despawn */ }
}

/** Writes dirt back if it changed. Called on despawn. */
export function flushLookState(owner, characterId) {
    const s = states.get(characterId);
    if (s?.dirty && owner) persist(owner, characterId, s);
}

export function forgetLookState(characterId) { states.delete(characterId); }
