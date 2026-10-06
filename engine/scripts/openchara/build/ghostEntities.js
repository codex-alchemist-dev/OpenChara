// The entity half of ghost blocks: spawns, updates and removes <ns>:ghost_block cubes so they match a wanted set of
// cells (see ghostBlocks.cjs for what they look like and the honest limits). One layer per player; every layer
// is rate limited (spawning entities is the expensive part) and released on every exit path.
//
// Entities are visible to every player (a Bedrock limit); each carries its owner's id so orphans (a crash, a
// /reload mid-build) are swept on startup and whenever their chunk loads.

import { world, system } from "@minecraft/server";
import { GHOST_KIND, ghostTextureIndex, ghostYOffset, planGhostChanges } from "./ghostBlocks.cjs";
import { NS, TAG } from "../ids.js";

export const GHOST_TYPE = `${NS}:ghost_block`;
const OWNER = `${NS}:ghostOwner`;
const P_KIND = `${NS}:ghost_kind`;
const P_TEX = `${NS}:ghost_tex`;

const layers = new Map(); // playerId -> layer
const cellKey = c => `${c.x},${c.y},${c.z}`;

function place(e, c, kind, tex) {
    try { e.setProperty(P_KIND, kind); e.setProperty(P_TEX, tex); } catch (err) { console.warn(`[${TAG}] ghost property: ${err}`); }
    try { e.teleport({ x: c.x + 0.5, y: c.y + ghostYOffset(kind), z: c.z + 0.5 }); } catch (err) { /* unloaded */ }
}

/**
 * @param {object} player
 * @param {{maxSpawn?: number, maxRemove?: number}} [limits]
 */
export function createGhostLayer(player, limits = {}) {
    const ents = new Map();   // key -> { entity, kind, tex, cell }
    let dimId = null;

    function removeAll() {
        for (const g of ents.values()) { try { if (g.entity.isValid) g.entity.remove(); } catch (e) { /* gone */ } }
        ents.clear();
    }

    const layer = {
        /**
         * @param {Array<{x:number,y:number,z:number,op:"build"|"mine",block?:string}>} cells - the cells to show now
         * @returns {{shown: number, pending: number}} how many ghosts exist and how many are still queued
         */
        sync(cells) {
            const dim = player.dimension;
            if (dimId !== null && dimId !== dim.id) removeAll();
            dimId = dim.id;
            for (const [k, g] of ents) if (!g.entity.isValid) ents.delete(k); // killed or unloaded: respawn if still wanted

            const desired = new Map();
            const byKey = new Map();
            for (const c of cells) {
                const k = cellKey(c);
                desired.set(k, { kind: c.op === "mine" ? GHOST_KIND.MINE : GHOST_KIND.BUILD, tex: c.op === "mine" ? 0 : ghostTextureIndex(c.block) });
                byKey.set(k, c);
            }
            const current = new Map([...ents].map(([k, g]) => [k, { kind: g.kind, tex: g.tex }]));
            const plan = planGhostChanges(current, desired, limits);

            for (const k of plan.remove) { const g = ents.get(k); try { g.entity.remove(); } catch (e) { /* gone */ } ents.delete(k); }
            for (const k of plan.update) { const g = ents.get(k), want = desired.get(k); place(g.entity, g.cell, want.kind, want.tex); g.kind = want.kind; g.tex = want.tex; }
            for (const k of plan.spawn) {
                const c = byKey.get(k), want = desired.get(k);
                try {
                    const e = dim.spawnEntity(GHOST_TYPE, { x: c.x + 0.5, y: c.y + ghostYOffset(want.kind), z: c.z + 0.5 });
                    e.setDynamicProperty(OWNER, player.id);
                    place(e, c, want.kind, want.tex);
                    ents.set(k, { entity: e, kind: want.kind, tex: want.tex, cell: c });
                } catch (e) { /* chunk not loaded yet: it is retried on the next sync */ }
            }
            return { shown: ents.size, pending: Math.max(0, desired.size - ents.size) };
        },
        clear: removeAll,
        count: () => ents.size,
    };
    layers.set(player.id, layer);
    return layer;
}

export function releaseGhostLayer(playerId) {
    const l = layers.get(playerId);
    if (l) { l.clear(); layers.delete(playerId); }
}

/** Removes ghosts whose owner has no live layer (crash, reload, owner offline). Safe to call any time. */
export function startGhostSweep() {
    const orphan = e => {
        let owner;
        try { owner = e.getDynamicProperty(OWNER); } catch (err) { return false; }
        return !owner || !layers.has(owner);
    };
    try {
        world.afterEvents.entityLoad.subscribe(ev => {
            if (ev.entity?.typeId === GHOST_TYPE && orphan(ev.entity)) system.run(() => { try { ev.entity.remove(); } catch (e) { /* fine */ } });
        });
    } catch (e) { /* older API */ }
    system.runTimeout(() => {
        for (const dim of ["overworld", "nether", "the_end"]) {
            try { for (const e of world.getDimension(dim).getEntities({ type: GHOST_TYPE })) if (orphan(e)) e.remove(); } catch (err) { /* fine */ }
        }
    }, 80);
}
