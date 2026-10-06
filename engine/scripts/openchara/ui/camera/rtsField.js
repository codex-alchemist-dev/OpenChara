// What an RTS selection can act on: the player's characters currently standing in the world, projected onto the
// command camera's screen. Thin game-facing glue around the pure modules (screenCursor.js, rtsSelection.js).

import { world } from "@minecraft/server";
import { readIndex } from "../../characterIndex.js";
import { getCharacter } from "../../characterRecord.js";
import { getSquad } from "../../squads.js";
import { worldToScreen } from "./screenCursor.js";

function live(id) { try { const e = id && world.getEntity(id); return e?.isValid ? e : null; } catch (e) { return null; } }

/** @returns {Array<{characterId:string, record:object, entity:object}>} the player's manifested characters. */
export function fieldedCharacters(player) {
    const out = [];
    for (const { id } of readIndex(player)) {
        const record = getCharacter(player, id);
        const entity = record ? live(record.manifestedEntityId) : null;
        if (entity) out.push({ characterId: id, record, entity });
    }
    return out;
}

/** Fielded characters with their screen position, for box select. Characters behind the camera are left out. */
export function projectFielded(player, camPos, pose, cfg, list = fieldedCharacters(player)) {
    const out = [];
    for (const f of list) {
        const p = f.entity.location;
        const s = worldToScreen({ x: p.x, y: p.y + 1, z: p.z }, camPos, pose, cfg);
        if (s) out.push({ characterId: f.characterId, squadId: f.record.squadId ?? null, u: s.u, v: s.v, entity: f.entity });
    }
    return out;
}

export const squadMemberIds = (player, squadId) => getSquad(player, squadId)?.memberIds ?? [];
