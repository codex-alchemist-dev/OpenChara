"use strict";

// Ghost-block constants and planning (pure, no game imports). CommonJS on purpose: the build-time providers
// (src/build/*.js, plain Node) and the in-game engine (bundled by esbuild) both load this one file.
//
// A ghost is a cube ENTITY (<ns>:ghost_block). Its look comes from the synced properties `ghost_kind` (build or
// mine) and `ghost_tex` (an index into the block appearance table generated at BUILD time from Minecraft's own
// block data - src/build/blockAppearance.js - so every vanilla block and every block from your packs is covered
// with its real per-face textures; nothing here lists blocks by hand).
//
// Build: slightly smaller than a block, light-blue tinted and translucent. Mine: a slightly larger red translucent
// cube laid over the real block. Honest limits: the shape is always a cube (stairs/slabs show as cubes), and a block
// from an addon the build cannot see falls back to a generic stone ghost (list its resource pack under
// openchara.ghostSources). Entities are visible to every player, unlike particles.

const GHOST_KIND = Object.freeze({ MINE: 0, BUILD: 1 });

/** Look of each kind: tint (rgba 0..1) and the size factor relative to a full block. */
const GHOST_LOOK = Object.freeze({
    [GHOST_KIND.BUILD]: { tint: [0.55, 0.8, 1.0, 0.55], size: 0.9 },
    [GHOST_KIND.MINE]: { tint: [1.0, 0.12, 0.12, 0.5], size: 1.02 },
});

/**
 * Ids to try, in order, when looking a block up in the generated table. Minecraft's own data files still use some
 * legacy spellings next to the current ids (e.g. blocks.json says "grass" and "brick_block" where the game's ids
 * are "grass_block" and "bricks"), so the lookup tolerates the generic differences: a trailing "_block" and a
 * trailing plural "s". No per-block list.
 */
function blockIdCandidates(id) {
    const [ns, name] = id.includes(":") ? id.split(":") : ["minecraft", id];
    const names = [];
    const add = n => { if (n && !names.includes(n)) names.push(n); };
    for (const n of [name, name.endsWith("s") ? name.slice(0, -1) : `${name}s`]) {
        add(n);
        add(n.endsWith("_block") ? n.slice(0, -"_block".length) : null);
        add(`${n}_block`);
    }
    return names.map(n => `${ns}:${n}`);
}

/** ghost_tex for a block id from a generated id -> index table; 0 (the generic fallback) when no candidate is known. */
function resolveGhostIndex(table, id) {
    for (const c of blockIdCandidates(id)) if (c in table) return table[c];
    return 0;
}

/** Vertical nudge so a cube scaled about its bottom stays centred in its cell. */
const ghostYOffset = kind => (1 - GHOST_LOOK[kind].size) / 2;

// ---- reconcile planning ----------------------------------------------------------------------

/**
 * Diffs the ghosts that exist against the ones that should, within per-tick limits.
 * @param {Map<string,{kind:number,tex:number}>} current - key -> what the spawned entity shows
 * @param {Map<string,{kind:number,tex:number}>} desired - key -> what it should show
 * @returns {{spawn: string[], update: string[], remove: string[]}} keys, spawn/remove already truncated to the limits
 */
function planGhostChanges(current, desired, { maxSpawn = 8, maxRemove = 24 } = {}) {
    const spawn = [], update = [], remove = [];
    for (const [k, want] of desired) {
        const have = current.get(k);
        if (!have) { if (spawn.length < maxSpawn) spawn.push(k); }
        else if (have.kind !== want.kind || have.tex !== want.tex) update.push(k);
    }
    for (const k of current.keys()) if (!desired.has(k) && remove.length < maxRemove) remove.push(k);
    return { spawn, update, remove };
}

/** The nearest `cap` cells to `center` (squared distance), so the entity budget goes to what the player can actually see. */
function nearestCells(cells, center, cap) {
    if (cells.length <= cap) return { shown: cells, overflow: [] };
    const d = c => (c.x + 0.5 - center.x) ** 2 + (c.y + 0.5 - center.y) ** 2 + (c.z + 0.5 - center.z) ** 2;
    const sorted = [...cells].sort((a, b) => d(a) - d(b));
    return { shown: sorted.slice(0, cap), overflow: sorted.slice(cap) };
}


module.exports = { GHOST_KIND, GHOST_LOOK, ghostYOffset, blockIdCandidates, resolveGhostIndex, planGhostChanges, nearestCells };
