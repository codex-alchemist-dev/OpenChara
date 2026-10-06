// The entity half of ghost blocks: spawns, updates and removes display entities so they match a wanted set of cells
// (see ghostBlocks.cjs for what they look like and the honest limits). One layer per player; every layer is rate
// limited (spawning entities is the expensive part) and released on every exit path.
//
// Two kinds of display entity:
//   cube  <ns>:ghost_block - our own textured/tinted translucent cube (blocks the build knows textures for, and every
//         mine highlight)
//   fmbe  a display from @openrock/fmbe (a vanilla fox holding the block's item): the game itself renders ANY block -
//         modded included - with its real model and texture. Spawning, keeping alive, pinning, muting, chunk-reload
//         re-apply and orphan cleanup are all the fmbe runtime's job; this file only decides WHICH cells get which kind.
// Entities are visible to every player (a Bedrock limit); each carries its owner's id so orphans (a crash, a /reload
// mid-build) are swept on startup and whenever their chunk loads.

import { world, system, ItemStack, EnchantmentType } from "@minecraft/server";
import { createFmbe } from "@openrock/fmbe";
import { GHOST_KIND, ghostYOffset, planGhostChanges, resolveGhostIndex, chooseStyle } from "./ghostBlocks.cjs";
import { RULES } from "../rules.js";
import { GHOST_INDEX } from "./ghostTable.generated.js";
import { NS, TAG } from "../ids.js";

export const GHOST_TYPE = `${NS}:ghost_block`;
const OWNER = `${NS}:ghostOwner`;
const P_KIND = `${NS}:ghost_kind`;
const P_TEX = `${NS}:ghost_tex`;

const layers = new Map(); // playerId -> layer

/** The shared FMBE runtime for ghosts (created on first use so importing this file costs nothing). */
let runtime = null;
function fmbeRuntime() {
    return runtime ??= createFmbe({
        world, system, server: { ItemStack, EnchantmentType },
        namespace: `${NS}_ghost`,
        maxSpawnPerTick: 8, maxPinPerTick: 24, maxReapplyPerTick: 6, reapplyTicks: 100,
        orphanPolicy: "sweep",
        onError: e => console.warn(`[${TAG}] ghost fmbe: ${e?.message ?? e}`),
    });
}

/** FMBE placement (rule ghostFmbe, adjustable at runtime by the `fmbe` spike): scale and 1/16-block offsets, entityY in blocks. */
let placement = { scale: 0.9, xpos: 0, ypos: 0, zpos: 0, entityY: 0, ...(RULES.ghostFmbe ?? {}) };
export const getGhostFmbe = () => ({ ...placement });
export const setGhostFmbe = patch => { placement = { ...placement, ...patch }; for (const l of layers.values()) l.reapplyAll(); };

const specFor = block => ({
    item: block,
    kind: "block",
    system: RULES.ghostFmbeSystem ?? "static",
    scale: placement.scale,
    pos: [placement.xpos / 16, placement.ypos / 16, placement.zpos / 16],
});
const anchorFor = c => ({ x: c.x + 0.5, y: c.y + placement.entityY, z: c.z + 0.5 });

const cellKey = c => `${c.x},${c.y},${c.z}`;
/** ghost_tex for a block id: its generated appearance index, or 0 (generic) when no source knew the block. */
export const ghostTextureIndex = blockId => resolveGhostIndex(GHOST_INDEX, blockId);

function place(e, c, kind, tex) {
    try { e.setProperty(P_KIND, kind); e.setProperty(P_TEX, tex); } catch (err) { console.warn(`[${TAG}] ghost property: ${err}`); }
    try { e.teleport({ x: c.x + 0.5, y: c.y + ghostYOffset(kind), z: c.z + 0.5 }); } catch (err) { /* unloaded */ }
}

/** One ghost in a layer: either our cube entity or an fmbe display, behind one small interface. */
const isGone = g => (g.display ? g.display.state === "removed" : !g.entity.isValid);
function dispose(g) {
    try { if (g.display) g.display.remove(); else if (g.entity.isValid) g.entity.remove(); } catch (e) { /* gone */ }
}

/**
 * @param {object} player
 * @param {{maxSpawn?: number, maxRemove?: number}} [limits]
 */
export function createGhostLayer(player, limits = {}) {
    const ents = new Map();   // key -> { entity | display, kind, tex, style, block, cell }
    let dimId = null;

    function removeAll() {
        for (const g of ents.values()) dispose(g);
        ents.clear();
        fmbeRuntime().releaseOwner(player.id);
    }

    function spawnCube(dim, k, c, want) {
        const e = dim.spawnEntity(GHOST_TYPE, { x: c.x + 0.5, y: c.y + ghostYOffset(want.kind), z: c.z + 0.5 });
        e.setDynamicProperty(OWNER, player.id);
        place(e, c, want.kind, want.tex);
        ents.set(k, { entity: e, kind: want.kind, tex: want.tex, style: "cube", block: want.block, cell: c });
    }

    function spawnOne(dim, k, c, want) {
        try {
            if (want.style === "fmbe") {
                const display = fmbeRuntime().spawn(dim, anchorFor(c), specFor(want.block), {
                    owner: player.id,
                    // no item form for this block: the cube is the fallback (replacing this entry only if it is still the same ghost)
                    onGiveUp: () => { const g = ents.get(k); if (g && g.display === display) { ents.delete(k); try { spawnCube(dim, k, c, { ...want, style: "cube" }); } catch (e) { /* retried on the next sync */ } } },
                });
                ents.set(k, { display, kind: want.kind, tex: want.tex, style: "fmbe", block: want.block, cell: c });
            } else spawnCube(dim, k, c, want);
        } catch (err) { /* chunk not loaded yet: it is retried on the next sync */ }
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
            for (const [k, g] of ents) if (isGone(g)) ents.delete(k); // killed or unloaded: respawn if still wanted

            const desired = new Map();
            const byKey = new Map();
            for (const c of cells) {
                const k = cellKey(c);
                const texIndex = c.op === "mine" ? 0 : ghostTextureIndex(c.block);
                desired.set(k, { kind: c.op === "mine" ? GHOST_KIND.MINE : GHOST_KIND.BUILD, tex: texIndex, style: chooseStyle(RULES.ghostStyle, { op: c.op, texIndex }), block: c.block });
                byKey.set(k, c);
            }
            const current = new Map([...ents].map(([k, g]) => [k, { kind: g.kind, tex: g.tex, style: g.style, block: g.block }]));
            const plan = planGhostChanges(current, desired, limits);

            for (const k of plan.remove) { dispose(ents.get(k)); ents.delete(k); }
            for (const k of plan.update) {
                const g = ents.get(k), want = desired.get(k);
                if (g.style !== want.style || g.block !== want.block) { dispose(g); ents.delete(k); spawnOne(dim, k, byKey.get(k), want); continue; }
                if (g.style === "cube") place(g.entity, g.cell, want.kind, want.tex);
                g.kind = want.kind; g.tex = want.tex;
            }
            for (const k of plan.spawn) spawnOne(dim, k, byKey.get(k), desired.get(k));
            return { shown: ents.size, pending: Math.max(0, desired.size - ents.size) };
        },
        /** Re-sends scale/position to every fmbe ghost (after the placement was changed). */
        reapplyAll() {
            for (const g of ents.values()) {
                if (!g.display) continue;
                g.display.moveTo(anchorFor(g.cell));
                g.display.set({ scale: placement.scale, pos: [placement.xpos / 16, placement.ypos / 16, placement.zpos / 16] });
            }
        },
        clear: removeAll,
        count: () => ents.size,
        foxCount: () => [...ents.values()].filter(g => g.display).length,
    };
    layers.set(player.id, layer);
    return layer;
}

export function releaseGhostLayer(playerId) {
    const l = layers.get(playerId);
    if (l) { l.clear(); layers.delete(playerId); }
}

/** Orphan cleanup (crash, reload, owner offline) for both kinds of ghost. Call once at startup. */
export function startGhostSweep() {
    const orphanCube = e => {
        let owner;
        try { owner = e.getDynamicProperty(OWNER); } catch (err) { return false; }
        return !owner || !layers.has(owner);
    };
    try {
        world.afterEvents.entityLoad.subscribe(ev => {
            if (ev.entity?.typeId === GHOST_TYPE && orphanCube(ev.entity)) system.run(() => { try { ev.entity.remove(); } catch (e) { /* fine */ } });
        });
    } catch (e) { /* older API */ }
    system.runTimeout(() => {
        for (const dim of ["overworld", "nether", "the_end"]) {
            try { for (const e of world.getDimension(dim).getEntities({ type: GHOST_TYPE })) if (orphanCube(e)) e.remove(); } catch (err) { /* fine */ }
        }
        fmbeRuntime().sweepOrphans(); // foxes of this namespace left by a previous run
    }, 80);
}
