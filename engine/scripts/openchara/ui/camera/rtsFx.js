// Per-player world feedback for the command camera: cursor marker (per action), drag-box outline on the ground,
// selection and hover highlights. Particles only - spawnParticle on a Player is visible to that player alone, so
// nothing leaks to other players. Everything here is throttled by the caller (every 4 ticks).

import { screenToRay } from "./screenCursor.js";

const P = {
    cursor: "minecraft:endrod",
    selected: "minecraft:blue_flame_particle",
    hover: "minecraft:villager_happy",
    box: "minecraft:endrod",
    own: "minecraft:heart_particle",
    hostile: "minecraft:villager_angry",
};

// Cursor look per action (the held control item picks the action; see registerRtsActionFx in rts.js).
const CURSOR_FX = {
    move: pts => pts.square,
    attack: pts => [...pts.square, ...pts.cross],
    surround: pts => [...pts.ring],
    summon: pts => [...pts.square, ...pts.ring],
    formation: pts => pts.square,
    select: pts => pts.cross,
};

function spawn(player, id, p) { try { player.spawnParticle(id, p); } catch (e) { /* fine */ } }

function cursorPoints(b) {
    const y = b.y + 1.05;
    const square = [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9], [0.5, 0.5]].map(([dx, dz]) => ({ x: b.x + dx, y, z: b.z + dz }));
    const cross = [[0.5, 0.1], [0.5, 0.9], [0.1, 0.5], [0.9, 0.5]].map(([dx, dz]) => ({ x: b.x + dx, y, z: b.z + dz }));
    const ring = Array.from({ length: 8 }, (_, i) => ({ x: b.x + 0.5 + Math.cos(i * Math.PI / 4) * 1.4, y, z: b.z + 0.5 + Math.sin(i * Math.PI / 4) * 1.4 }));
    return { square, cross, ring };
}

export function drawCursor(player, { hitBlock, target, targetIsOwn, action = "move" }) {
    if (target) {
        const t = target.location;
        spawn(player, targetIsOwn ? P.own : P.hostile, { x: t.x, y: t.y + 2.3, z: t.z });
    } else if (hitBlock) {
        const pick = CURSOR_FX[action] ?? CURSOR_FX.move;
        for (const p of pick(cursorPoints(hitBlock))) spawn(player, P.cursor, p);
    }
}

/** Four small points around each character's feet. */
function markCharacter(player, entity, id) {
    const l = entity.location;
    for (const [dx, dz] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) spawn(player, id, { x: l.x + dx, y: l.y + 0.1, z: l.z + dz });
}

export function drawSelection(player, selectedEntities) { for (const e of selectedEntities) markCharacter(player, e, P.selected); }
export function drawHover(player, hoverEntities) { for (const e of hoverEntities) markCharacter(player, e, P.hover); }

/**
 * Outlines a screen rectangle on the ground: points along its edges are cast through the camera onto the plane y = groundY.
 * @param {{u0,v0,u1,v1}} rect
 */
export function drawBox(player, rect, camPos, pose, cfg, groundY, { perEdge = 10 } = {}) {
    const edges = [
        [[rect.u0, rect.v0], [rect.u1, rect.v0]], [[rect.u1, rect.v0], [rect.u1, rect.v1]],
        [[rect.u1, rect.v1], [rect.u0, rect.v1]], [[rect.u0, rect.v1], [rect.u0, rect.v0]],
    ];
    for (const [[ua, va], [ub, vb]] of edges) {
        for (let i = 0; i <= perEdge; i++) {
            const t = i / perEdge;
            const dir = screenToRay(ua + (ub - ua) * t, va + (vb - va) * t, pose, cfg);
            if (dir.y >= -0.001) continue;
            const k = (groundY + 1.05 - camPos.y) / dir.y;
            if (k <= 0 || k > 400) continue;
            spawn(player, P.box, { x: camPos.x + dir.x * k, y: groundY + 1.05, z: camPos.z + dir.z * k });
        }
    }
}
