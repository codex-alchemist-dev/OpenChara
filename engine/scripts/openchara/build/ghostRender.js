// Ghost-block rendering for Build mode and the schematic overlay. Per-player PARTICLES only: spawnParticle on a
// Player is visible to that player alone, so nobody else sees a stranger's plans. Nothing here places a block.
// (Solid ghosts through a display entity are an optional later spike - entities are visible to everyone.)
//
// The pure half (`ghostItems`, `ghostFrame`) decides WHICH cells to draw this frame: everything within `radius` of
// the viewer, nearest first is not needed - a rotating window of at most `cap` cells per frame, so large
// schematics still draw completely over a few frames instead of flooding the particle budget.

import { parseKey } from "./schematicModel.js";

export const PARTICLES = Object.freeze({
    build: "minecraft:blue_flame_particle",
    mine: "minecraft:basic_flame_particle",
    selection: "minecraft:endrod",
    input: "minecraft:villager_happy",
    output: "minecraft:heart_particle",
    anchor: "minecraft:endrod",
});

/**
 * Flattens a model (+ optional selection and markers) into drawable items within `radius` blocks of `center`.
 * @returns {Array<{x:number,y:number,z:number,kind:string}>} deterministic order (sorted by y, z, x) so frames rotate cleanly.
 */
export function ghostItems({ model, selection = null, center, radius }) {
    const r2 = radius * radius;
    const near = (x, y, z) => (x + 0.5 - center.x) ** 2 + (y + 0.5 - center.y) ** 2 + (z + 0.5 - center.z) ** 2 <= r2;
    const out = [];
    if (model) {
        for (const [k, state] of model.cells) {
            const { x, y, z } = parseKey(k);
            if (near(x, y, z)) out.push({ x, y, z, kind: state.op === "mine" ? "mine" : "build" });
        }
        for (const m of model.markers) if (near(m.x, m.y, m.z)) out.push({ x: m.x, y: m.y, z: m.z, kind: m.kind === "output" ? "output" : "input" });
    }
    if (selection) {
        for (const k of selection) {
            const { x, y, z } = parseKey(k);
            if (near(x, y, z)) out.push({ x, y, z, kind: "selection" });
        }
    }
    out.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
    return out;
}

/** The window of `items` to draw on `frame`: at most `cap`, advancing each frame so every item comes up. */
export function ghostFrame(items, cap, frame) {
    if (items.length <= cap) return items;
    const start = (frame * cap) % items.length;
    const slice = items.slice(start, start + cap);
    return slice.length < cap ? [...slice, ...items.slice(0, cap - slice.length)] : slice;
}

/** Draws items for one player. Selection cells get a corner marker so a big selection reads as a box, not a cloud. */
export function drawGhosts(player, items) {
    for (const it of items) {
        try { player.spawnParticle(PARTICLES[it.kind] ?? PARTICLES.build, { x: it.x + 0.5, y: it.y + 0.5, z: it.z + 0.5 }); } catch (e) { /* unloaded / gone */ }
    }
}
