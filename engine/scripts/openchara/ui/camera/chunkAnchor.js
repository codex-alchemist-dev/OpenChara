// Keeps the chunks around a camera loaded without moving the player. Two strategies, chosen by the project rule
// `cameraChunkMode`:
//   "anchor"   (default) an invisible <ns>:camera_anchor entity carrying minecraft:tick_world follows the camera
//   "teleport" the legacy behaviour - the (invisible) player is teleported under the camera every so often
// "anchor" is unproven in-game until spike S4 (/scriptevent <ns>:spike anchor) passes; flip the rule if it doesn't.

import { world, system } from "@minecraft/server";
import { RULES } from "../../rules.js";
import { NS, TAG } from "../../ids.js";

export const ANCHOR_TYPE = `${NS}:camera_anchor`;
const OWNER_TAG = `${NS}:anchorOwner`;
const MOVE_EPSILON2 = 4; // only re-teleport the anchor once the camera is 2 blocks away from it

export const chunkMode = () => (RULES.cameraChunkMode === "teleport" ? "teleport" : "anchor");

function live(id) { try { const e = id && world.getEntity(id); return e?.isValid ? e : null; } catch (e) { return null; } }

/**
 * Per-player handle. Call follow(pos) every tick; it moves the anchor (or teleports the player in teleport mode)
 * only when needed, and release() on every exit path.
 */
export function createChunkAnchor(player) {
    const mode = chunkMode();
    let entity = null;
    let last = null;

    function ensure(pos) {
        if (entity?.isValid) return entity;
        try {
            entity = player.dimension.spawnEntity(ANCHOR_TYPE, { x: pos.x, y: pos.y, z: pos.z });
            entity.setDynamicProperty(OWNER_TAG, player.id);
            try { entity.addEffect("invisibility", 20000000, { showParticles: false }); } catch (e) { /* fine */ }
        } catch (e) { console.warn(`[${TAG}] camera anchor spawn failed: ${e}`); entity = null; }
        return entity;
    }

    return {
        mode,
        /** @param {{x,y,z}} pos camera position; `groundY` only used by teleport mode (y of the block under the camera). */
        follow(pos, { groundY, behind = 14 } = {}) {
            if (mode === "teleport") {
                if (groundY === undefined) return;
                const d = Math.hypot(player.location.x - pos.x, player.location.z - (pos.z + behind));
                if (d > 6) { try { player.teleport({ x: pos.x, y: groundY + 1, z: pos.z + behind }, { keepVelocity: false }); } catch (e) { /* unloaded */ } }
                return;
            }
            const e = ensure(pos);
            if (!e) return;
            if (last && (pos.x - last.x) ** 2 + (pos.z - last.z) ** 2 + (pos.y - last.y) ** 2 < MOVE_EPSILON2) return;
            try { e.teleport({ x: pos.x, y: pos.y, z: pos.z }); last = { x: pos.x, y: pos.y, z: pos.z }; } catch (err) { /* unloaded: tick_world loads it next tick */ }
        },
        release() {
            const e = entity;
            entity = null; last = null;
            try { if (e?.isValid) e.remove(); } catch (err) { /* fine */ }
        },
        entityId: () => entity?.id ?? null,
    };
}

/**
 * Removes anchors nobody is using (their owner is offline or in no camera session) when their chunk loads, and
 * once shortly after startup for the ones already loaded. `isCameraActive(playerId)` comes from the session layer.
 */
export function startChunkAnchorSweep(isCameraActive) {
    const sweepOne = e => {
        let ownerId;
        try { ownerId = e.getDynamicProperty(OWNER_TAG); } catch (err) { return; }
        if (ownerId && isCameraActive(ownerId)) return;
        system.run(() => { try { e.remove(); } catch (err) { /* fine */ } });
    };
    try {
        world.afterEvents.entityLoad.subscribe(ev => { if (ev.entity?.typeId === ANCHOR_TYPE) sweepOne(ev.entity); });
    } catch (e) { /* older API */ }
    system.runTimeout(() => {
        for (const dim of ["overworld", "nether", "the_end"]) {
            try { for (const e of world.getDimension(dim).getEntities({ type: ANCHOR_TYPE })) sweepOne(e); } catch (err) { /* fine */ }
        }
    }, 60);
}
