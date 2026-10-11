// The runtime that makes a character LOOK right: once a second per manifested character it updates wetness/dirt, builds the look
// context, resolves her skin from her rules and form, drives the overlay layers, and writes the result onto her entity's
// properties (skin_id, ov_*). Instantly on manifest and when her form changes. All policy is data (skinRules, forms, overlays)
// or registered conditions; nothing here knows what "hunt" or "dirt" means.

import { world } from "@minecraft/server";
import { OVERLAYS } from "../content.generated.js";
import { NS, TAG } from "../ids.js";
import { on } from "../events.js";
import { getCharacter } from "../characterRecord.js";
import { resolveSkin } from "./skinRules.js";
import { registerBuiltinSkinConditions } from "./builtinConditions.js";
import { registerTacticalConditions } from "./formSelect.js";
import { buildLookContext } from "./lookContext.js";
import { getLookState, flushLookState, forgetLookState } from "./lookState.js";
import { stepWetness, stepDirt, overlayLevel } from "./appearanceModel.js";
import { formOf, speciesOf } from "./forms.js";

const SKIN_MIN_HOLD_MS = 2000;   // a skin does not change again sooner than this (a sneak toggle must not flicker her)
const applied = new Map();       // entity id -> { skin, at, overlays: { id: level } }
const unknownReported = new Set();

const reportUnknown = (key, err) => {
    const tag = `${key}${err ? `:${err}` : ""}`;
    if (unknownReported.has(tag)) return;
    unknownReported.add(tag);
    console.warn(`[${TAG}] skin condition "${key}" ${err ? `threw (${err})` : "is not registered"}; treated as false`);
};

const setProp = (entity, name, value) => { try { entity.setProperty(`${NS}:${name}`, value); } catch (e) { /* entity gone, or property not generated */ } };

/** The numeric value an overlay is driven by: dirt, wetness, damage (1 - health), or any numeric field of the context. */
function overlayValue(source, ctx) {
    if (source === "damage") return 1 - (ctx.healthFraction ?? 1);
    return typeof ctx[source] === "number" ? ctx[source] : 0;
}

/** Re-evaluates and applies one character's look. `force` skips the hold time (manifest, form change). */
export function refreshLook({ owner, characterId, entity, record, inCombat = false, force = false, dt = 0 }) {
    const species = speciesOf(record);
    if (!species?.skinIds) return;
    const state = getLookState(owner, characterId, record);
    if (dt > 0) {
        const env = buildLookContext({ entity, record, owner, state, inCombat });
        state.wetness = stepWetness(state.wetness, { inWater: env.inWater || env.underwater, raining: env.weather !== "clear" && env.dimension === "overworld", nether: env.dimension === "nether", dt });
        state.dirt = stepDirt(state.dirt, state.wetness, dt);
        if (state.dirt !== (record.look?.dirt ?? 0)) state.dirty = true;
    }

    const ctx = buildLookContext({ entity, record, owner, form: formOf(record), state, inCombat });
    const prev = applied.get(entity.id) ?? { skin: null, at: 0, overlays: {} };
    const now = Date.now();

    const { skin } = resolveSkin(species, ctx, reportUnknown);
    if (skin !== prev.skin && (force || now - prev.at >= SKIN_MIN_HOLD_MS)) {
        const id = species.skinIds[skin] ?? species.skinIds.default;
        setProp(entity, "skin_id", id);
        prev.skin = skin; prev.at = now;
    }
    for (const ov of Object.values(OVERLAYS)) {
        const level = overlayLevel(overlayValue(ov.drive?.source ?? ov.id, ctx), ov.drive?.thresholds ?? []);
        if (prev.overlays[ov.id] !== level) { setProp(entity, `ov_${ov.id}`, level); prev.overlays[ov.id] = level; }
    }
    applied.set(entity.id, prev);
}

export function startLookSystem() {
    registerBuiltinSkinConditions();
    registerTacticalConditions();
    on("manifest", ({ owner, characterId, entity }) => {
        const record = owner ? getCharacter(owner, characterId) : null;
        if (record) refreshLook({ owner, characterId, entity, record, force: true });
    });
    on("second", ({ owner, characterId, entity, inCombat }) => {
        const record = owner ? getCharacter(owner, characterId) : null;
        if (record) refreshLook({ owner, characterId, entity, record, inCombat, dt: 1 });
    });
    on("formChanged", ({ owner, characterId, record }) => {
        const entity = lookupEntity(record);
        if (entity) refreshLook({ owner, characterId, entity, record, force: true });
    });
    on("despawn", ({ owner, characterId }) => { flushLookState(owner, characterId); forgetLookState(characterId); });
}

function lookupEntity(record) {
    try { return record.manifestedEntityId ? world.getEntity(record.manifestedEntityId) ?? null : null; } catch (e) { return null; }
}
