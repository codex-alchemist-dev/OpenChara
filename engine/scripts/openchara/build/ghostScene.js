// Draws one frame of a ghost scene for a player: plan cells as ghost-block ENTITIES (nearest first, within the
// entity budget), and everything else - selection, chest markers and the plan cells over the budget - as particles.

import { parseKey } from "./schematicModel.js";
import { nearestCells } from "./ghostBlocks.cjs";
import { ghostItems, ghostFrame, drawGhosts } from "./ghostRender.js";

export const ENTITY_BUDGET = 220;
export const SCENE_RADIUS = 40;

/** The plan's cells within `radius` of `center` as { x, y, z, op, block } (pure). */
export function planCells(model, center, radius) {
    const r2 = radius * radius;
    const out = [];
    for (const [k, state] of model.cells) {
        const { x, y, z } = parseKey(k);
        if ((x + 0.5 - center.x) ** 2 + (y + 0.5 - center.y) ** 2 + (z + 0.5 - center.z) ** 2 > r2) continue;
        out.push({ x, y, z, op: state.op, block: state.block });
    }
    return out;
}

/**
 * @param {object} opts
 * @param {object} opts.player
 * @param {{sync: Function}|null} opts.layer - ghost entity layer; null draws everything as particles
 * @param {object} opts.model
 * @param {Set<string>} [opts.selection]
 * @param {{x:number,y:number,z:number}} opts.center
 * @param {number} opts.frame
 */
export function drawScene({ player, layer, model, selection = null, center, frame, budget = ENTITY_BUDGET, radius = SCENE_RADIUS, particleCap = 120 }) {
    const cells = planCells(model, center, radius);
    const { shown, overflow } = layer ? nearestCells(cells, center, budget) : { shown: [], overflow: cells };
    if (layer) layer.sync(shown);
    // Particles: selection, markers (via a model view with no cells) and the over-budget plan cells.
    const markerView = { cells: new Map(), markers: model.markers };
    const items = [
        ...ghostItems({ model: markerView, selection, center, radius }),
        ...overflow.map(c => ({ x: c.x, y: c.y, z: c.z, kind: c.op === "mine" ? "mine" : "build" })),
    ];
    drawGhosts(player, ghostFrame(items, particleCap, frame));
    return { entities: shown.length, particles: items.length };
}
