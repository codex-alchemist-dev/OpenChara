// The entity half of ghost blocks: spawns, updates and removes display entities so they match a wanted set of cells
// (see ghostBlocks.cjs for what they look like and the honest limits). One layer per player; every layer is rate
// limited (spawning entities is the expensive part) and released on every exit path.
//
// Two kinds of display entity:
//   cube  <ns>:ghost_block - our own textured/tinted translucent cube (blocks the build knows textures for, and every
//         mine highlight)
//   fmbe  a vanilla fox holding the block's item, scaled/placed with client animations (ghostFmbe.cjs): the game
//         itself renders ANY block - modded included - with its real model and texture
// Entities are visible to every player (a Bedrock limit); each carries its owner's id so orphans (a crash, a
// /reload mid-build) are swept on startup and whenever their chunk loads.

import { world, system } from "@minecraft/server";
import { GHOST_KIND, ghostYOffset, planGhostChanges, resolveGhostIndex, chooseStyle } from "./ghostBlocks.cjs";
import { fmbeCommands, stopSoundCommands, FMBE_EFFECTS } from "./ghostFmbe.cjs";
import { RULES } from "../rules.js";
import { GHOST_INDEX } from "./ghostTable.generated.js";
import { NS, TAG } from "../ids.js";

export const GHOST_TYPE = `${NS}:ghost_block`;
const FOX = "minecraft:fox";
const FOX_SPAWN = "minecraft:fox<minecraft:as_adult>";
const OWNER = `${NS}:ghostOwner`;
const FMBE_TAG = `${NS}_fmbe`;
const P_KIND = `${NS}:ghost_kind`;
const P_TEX = `${NS}:ghost_tex`;
const REAPPLY_TICKS = 100;   // client animations can reset when a chunk reloads: re-send them now and then
const REAPPLY_PER_TICK = 6;

const layers = new Map(); // playerId -> layer

/** FMBE placement (rule ghostFmbe, adjustable at runtime by the `fmbe` spike): scale and 1/16-block offsets, entityY in blocks. */
let fmbe = { scale: 0.9, xpos: 0, ypos: 0, zpos: 0, entityY: 0, ...(RULES.ghostFmbe ?? {}) };
export const getGhostFmbe = () => ({ ...fmbe });
export const setGhostFmbe = patch => { fmbe = { ...fmbe, ...patch }; for (const l of layers.values()) l.reapplyAll(); };

const cellKey = c => `${c.x},${c.y},${c.z}`;
/** ghost_tex for a block id: its generated appearance index, or 0 (generic) when no source knew the block. */
export const ghostTextureIndex = blockId => resolveGhostIndex(GHOST_INDEX, blockId);

function place(e, c, kind, tex) {
    try { e.setProperty(P_KIND, kind); e.setProperty(P_TEX, tex); } catch (err) { console.warn(`[${TAG}] ghost property: ${err}`); }
    try { e.teleport({ x: c.x + 0.5, y: c.y + ghostYOffset(kind), z: c.z + 0.5 }); } catch (err) { /* unloaded */ }
}

function runAll(entity, commands) {
    for (const cmd of commands) entity.runCommand(cmd);
}

/** Sends the FMBE animation commands (scale/position) to one display fox. */
function applyFmbe(entity) {
    runAll(entity, fmbeCommands({ scale: fmbe.scale, xpos: fmbe.xpos, ypos: fmbe.ypos, zpos: fmbe.zpos }));
}

/** A vanilla fox displaying `block` (FMBE). Throws if the game has no item for the block. */
function spawnFmbe(dim, player, c, block) {
    const fox = dim.spawnEntity(FOX_SPAWN, { x: c.x + 0.5, y: c.y + fmbe.entityY, z: c.z + 0.5 });
    try {
        fox.setDynamicProperty(OWNER, player.id);
        fox.addTag(FMBE_TAG);
        const given = fox.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${block}`);
        if (given && given.successCount === 0) throw new Error(`no item for ${block}`);
        for (const [effect, amplifier] of FMBE_EFFECTS) { try { fox.addEffect(effect, 20000000, { amplifier, showParticles: false }); } catch (e) { /* fine */ } }
        applyFmbe(fox);
    } catch (e) { try { fox.remove(); } catch (err) { /* gone */ } throw e; }
    return fox;
}

/**
 * @param {object} player
 * @param {{maxSpawn?: number, maxRemove?: number}} [limits]
 */
export function createGhostLayer(player, limits = {}) {
    const ents = new Map();   // key -> { entity, kind, tex, style, block, cell, applied }
    let dimId = null;
    let reapplyCursor = 0;

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
                const texIndex = c.op === "mine" ? 0 : ghostTextureIndex(c.block);
                desired.set(k, { kind: c.op === "mine" ? GHOST_KIND.MINE : GHOST_KIND.BUILD, tex: texIndex, style: chooseStyle(RULES.ghostStyle, { op: c.op, texIndex }), block: c.block });
                byKey.set(k, c);
            }
            const current = new Map([...ents].map(([k, g]) => [k, { kind: g.kind, tex: g.tex, style: g.style, block: g.block }]));
            const plan = planGhostChanges(current, desired, limits);

            const spawnOne = (k, c, want) => {
                try {
                    let style = want.style;
                    let e = null;
                    if (style === "fmbe") {
                        try { e = spawnFmbe(dim, player, c, want.block); } catch (err) { style = "cube"; } // no item for this block: fall back to the cube
                    }
                    if (!e) {
                        e = dim.spawnEntity(GHOST_TYPE, { x: c.x + 0.5, y: c.y + ghostYOffset(want.kind), z: c.z + 0.5 });
                        e.setDynamicProperty(OWNER, player.id);
                        place(e, c, want.kind, want.tex);
                    }
                    ents.set(k, { entity: e, kind: want.kind, tex: want.tex, style, block: want.block, cell: c, applied: system.currentTick });
                } catch (err) { /* chunk not loaded yet: it is retried on the next sync */ }
            };

            for (const k of plan.remove) { const g = ents.get(k); try { g.entity.remove(); } catch (e) { /* gone */ } ents.delete(k); }
            for (const k of plan.update) {
                const g = ents.get(k), want = desired.get(k);
                if (g.style !== want.style || g.block !== want.block) {
                    try { g.entity.remove(); } catch (e) { /* gone */ }
                    ents.delete(k);
                    spawnOne(k, byKey.get(k), want);
                    continue;
                }
                if (g.style === "cube") place(g.entity, g.cell, want.kind, want.tex);
                g.kind = want.kind; g.tex = want.tex;
            }
            for (const k of plan.spawn) spawnOne(k, byKey.get(k), desired.get(k));

            // A display fox is a real mob: it falls if nothing holds it (verified on a real server: it survives with the
            // effects but is not weightless), so pin every one to its cell each tick.
            let corrected = 0;
            for (const g of ents.values()) {
                if (g.style !== "fmbe" || corrected >= 24) continue;
                try {
                    const want = { x: g.cell.x + 0.5, y: g.cell.y + fmbe.entityY, z: g.cell.z + 0.5 };
                    const at = g.entity.location;
                    if (Math.abs(at.x - want.x) > 0.05 || Math.abs(at.y - want.y) > 0.05 || Math.abs(at.z - want.z) > 0.05) { g.entity.teleport(want); corrected++; }
                } catch (e) { /* unloaded */ }
            }

            // Re-send FMBE animations to a few display foxes per tick (client animation state can reset on chunk reloads).
            const list = [...ents.values()].filter(g => g.style === "fmbe" && system.currentTick - g.applied > REAPPLY_TICKS);
            for (let i = 0; i < Math.min(REAPPLY_PER_TICK, list.length); i++) {
                const g = list[(reapplyCursor + i) % list.length];
                try { applyFmbe(g.entity); g.applied = system.currentTick; } catch (e) { /* unloaded */ }
            }
            reapplyCursor += REAPPLY_PER_TICK;
            return { shown: ents.size, pending: Math.max(0, desired.size - ents.size) };
        },
        /** Re-sends scale/position to every display fox (after the placement was changed). */
        reapplyAll() {
            for (const g of ents.values()) {
                if (g.style !== "fmbe") continue;
                try { g.entity.teleport({ x: g.cell.x + 0.5, y: g.cell.y + fmbe.entityY, z: g.cell.z + 0.5 }); applyFmbe(g.entity); g.applied = system.currentTick; } catch (e) { /* unloaded */ }
            }
        },
        clear: removeAll,
        count: () => ents.size,
        foxCount: () => [...ents.values()].filter(g => g.style === "fmbe").length,
    };
    layers.set(player.id, layer);
    return layer;
}

export function releaseGhostLayer(playerId) {
    const l = layers.get(playerId);
    if (l) { l.clear(); layers.delete(playerId); }
}

/** Orphan cleanup (crash, reload, owner offline) plus muting the display foxes. Call once at startup. */
export function startGhostSweep() {
    const orphan = e => {
        let owner;
        try { owner = e.getDynamicProperty(OWNER); } catch (err) { return false; }
        if (e.typeId === FOX && !owner) return false; // a fox that is not ours
        return !owner || !layers.has(owner);
    };
    try {
        world.afterEvents.entityLoad.subscribe(ev => {
            if ((ev.entity?.typeId === GHOST_TYPE || ev.entity?.typeId === FOX) && orphan(ev.entity)) system.run(() => { try { ev.entity.remove(); } catch (e) { /* fine */ } });
        });
    } catch (e) { /* older API */ }
    system.runTimeout(() => {
        for (const dim of ["overworld", "nether", "the_end"]) {
            try { for (const type of [GHOST_TYPE, FOX]) for (const e of world.getDimension(dim).getEntities({ type })) if (orphan(e)) e.remove(); } catch (err) { /* fine */ }
        }
    }, 80);
    // Display foxes would otherwise make fox noises (stopsound list from the wiki page).
    system.runInterval(() => {
        if (![...layers.values()].some(l => l.foxCount() > 0)) return;
        const overworld = world.getDimension("overworld");
        for (const cmd of stopSoundCommands()) { try { overworld.runCommand(cmd); } catch (e) { /* fine */ } }
    }, 20);
}
