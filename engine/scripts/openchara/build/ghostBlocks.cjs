"use strict";

// Ghost-block visuals (pure data + planning, no game imports). CommonJS on purpose: the build-time providers
// (src/build/*.js, plain Node) and the in-game engine (bundled by esbuild) both load this one file.
//
// A ghost is a small cube ENTITY (<ns>:ghost_block) textured with the real block's own texture, drawn
// semi-transparent and slightly smaller than a block (build) - or a slightly larger red translucent cube laid over
// the real block (mine). The cube takes its texture from an array indexed by the entity property `ghost_tex`, and
// its tint/size from `ghost_kind`; both are synced to the client, so one entity type shows every block.
//
// Limits (be honest about them): the model is always a cube, so stairs/slabs/fences show as full cubes; a block with
// different face textures (grass, logs) shows one face texture on all sides; blocks missing from the table below use
// a generic tinted stone. Entities are visible to every player, unlike particles.
//
// Texture paths are vanilla resource-pack block textures. Unverified paths show Minecraft's missing-texture
// checkerboard in-game - the `/scriptevent <ns>:spike ghosts` spike lists them all in a row so a wrong one is easy to spot.

const GHOST_KIND = Object.freeze({ MINE: 0, BUILD: 1 });

// [blockId, texture path]. Index in this list = the `ghost_tex` value (index 0 is the generic fallback).
const GHOST_BLOCKS = Object.freeze([
    ["minecraft:stone", "textures/blocks/stone"],
    ["minecraft:cobblestone", "textures/blocks/cobblestone"],
    ["minecraft:stone_bricks", "textures/blocks/stonebrick"],
    ["minecraft:mossy_cobblestone", "textures/blocks/cobblestone_mossy"],
    ["minecraft:smooth_stone", "textures/blocks/stone_slab_top"],
    ["minecraft:andesite", "textures/blocks/stone_andesite"],
    ["minecraft:diorite", "textures/blocks/stone_diorite"],
    ["minecraft:granite", "textures/blocks/stone_granite"],
    ["minecraft:deepslate", "textures/blocks/deepslate/deepslate"],
    ["minecraft:deepslate_bricks", "textures/blocks/deepslate/deepslate_bricks"],
    ["minecraft:cobbled_deepslate", "textures/blocks/deepslate/cobbled_deepslate"],
    ["minecraft:dirt", "textures/blocks/dirt"],
    ["minecraft:grass_block", "textures/blocks/grass_side_carried"],
    ["minecraft:sand", "textures/blocks/sand"],
    ["minecraft:gravel", "textures/blocks/gravel"],
    ["minecraft:clay", "textures/blocks/clay"],
    ["minecraft:sandstone", "textures/blocks/sandstone_normal"],
    ["minecraft:red_sandstone", "textures/blocks/red_sandstone_normal"],
    ["minecraft:glass", "textures/blocks/glass"],
    ["minecraft:bricks", "textures/blocks/brick"],
    ["minecraft:oak_planks", "textures/blocks/planks_oak"],
    ["minecraft:spruce_planks", "textures/blocks/planks_spruce"],
    ["minecraft:birch_planks", "textures/blocks/planks_birch"],
    ["minecraft:jungle_planks", "textures/blocks/planks_jungle"],
    ["minecraft:acacia_planks", "textures/blocks/planks_acacia"],
    ["minecraft:dark_oak_planks", "textures/blocks/planks_big_oak"],
    ["minecraft:oak_log", "textures/blocks/log_oak"],
    ["minecraft:spruce_log", "textures/blocks/log_spruce"],
    ["minecraft:birch_log", "textures/blocks/log_birch"],
    ["minecraft:white_wool", "textures/blocks/wool_colored_white"],
    ["minecraft:black_wool", "textures/blocks/wool_colored_black"],
    ["minecraft:red_wool", "textures/blocks/wool_colored_red"],
    ["minecraft:blue_wool", "textures/blocks/wool_colored_blue"],
    ["minecraft:white_concrete", "textures/blocks/concrete_white"],
    ["minecraft:black_concrete", "textures/blocks/concrete_black"],
    ["minecraft:gray_concrete", "textures/blocks/concrete_gray"],
    ["minecraft:terracotta", "textures/blocks/hardened_clay"],
    ["minecraft:quartz_block", "textures/blocks/quartz_block_side"],
    ["minecraft:iron_block", "textures/blocks/iron_block"],
    ["minecraft:gold_block", "textures/blocks/gold_block"],
    ["minecraft:diamond_block", "textures/blocks/diamond_block"],
    ["minecraft:emerald_block", "textures/blocks/emerald_block"],
    ["minecraft:coal_block", "textures/blocks/coal_block"],
    ["minecraft:obsidian", "textures/blocks/obsidian"],
    ["minecraft:netherrack", "textures/blocks/netherrack"],
    ["minecraft:nether_bricks", "textures/blocks/nether_brick"],
    ["minecraft:glowstone", "textures/blocks/glowstone"],
    ["minecraft:bookshelf", "textures/blocks/bookshelf"],
    ["minecraft:hay_block", "textures/blocks/hay_block_side"],
    ["minecraft:bone_block", "textures/blocks/bone_block_side"],
    ["minecraft:prismarine", "textures/blocks/prismarine_rough"],
    ["minecraft:end_stone", "textures/blocks/end_stone"],
]);

/** Plain white square used for the mine highlight (tinted red by the render controller). */
const MINE_TEXTURE = "textures/ui/White";

const indexById = new Map(GHOST_BLOCKS.map(([id], i) => [id, i]));

/** `ghost_tex` value for a block id (0, the generic stone, when the block isn't in the table). */
const ghostTextureIndex = blockId => indexById.get(blockId) ?? 0;
const hasGhostTexture = blockId => indexById.has(blockId);

/** Client-entity `textures` map: t0..tN for blocks, plus the mine highlight. */
function ghostTextureMap() {
    const out = {};
    GHOST_BLOCKS.forEach(([, path], i) => { out[`t${i}`] = path; });
    out.mine = MINE_TEXTURE;
    return out;
}

/** Look of each kind: tint (rgba 0..1) and the size factor relative to a full block. */
const GHOST_LOOK = Object.freeze({
    [GHOST_KIND.BUILD]: { tint: [0.55, 0.8, 1.0, 0.55], size: 0.9 },
    [GHOST_KIND.MINE]: { tint: [1.0, 0.12, 0.12, 0.5], size: 1.02 },
});

/** Vertical nudge so a cube scaled about its bottom stays centred in its cell. */
const ghostYOffset = kind => (1 - GHOST_LOOK[kind].size) / 2;

/** Client render controller for `<ns>:ghost_block` (generated: it depends on the table above). */
function ghostRenderController(ns) {
    const arr = GHOST_BLOCKS.map((_, i) => `Texture.t${i}`);
    const q = `query.property('${ns}:ghost_kind')`;
    const [b, m] = [GHOST_LOOK[GHOST_KIND.BUILD].tint, GHOST_LOOK[GHOST_KIND.MINE].tint];
    const pick = i => `${q} == ${GHOST_KIND.MINE} ? ${m[i]} : ${b[i]}`;
    return {
        format_version: "1.10.0",
        render_controllers: {
            [`controller.render.${ns}_ghost_block`]: {
                arrays: { textures: { [`Array.${ns}_ghost_tex`]: arr } },
                geometry: "Geometry.default",
                materials: [{ "*": "Material.default" }],
                textures: [`${q} == ${GHOST_KIND.MINE} ? Texture.mine : Array.${ns}_ghost_tex[query.property('${ns}:ghost_tex')]`],
                color: { r: pick(0), g: pick(1), b: pick(2), a: pick(3) },
            },
        },
    };
}

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

module.exports = {
    GHOST_KIND, GHOST_BLOCKS, MINE_TEXTURE, ghostTextureIndex, hasGhostTexture, ghostTextureMap, GHOST_LOOK, ghostYOffset,
    ghostRenderController, planGhostChanges, nearestCells,
};
