// Block appearance table for ghost blocks, generated at build time from Minecraft's own data files - no hand-typed list.
//
// Sources (later wins):
//   1. the vanilla resource pack's blocks.json + textures/terrain_texture.json (OPENROCK_VANILLA_RP, else a cached
//      copy of Mojang's public bedrock-samples downloaded into <modDir>/.openrock-cache/vanilla/)
//   2. every package in the build that ships its own blocks.json / textures/terrain_texture.json in its resource
//      overlay (OpenRock mods and libraries, including modded blocks)
//   3. extra resource-pack folders listed in the mod manifest's openchara.ghostSources
// Each block gets a side, top and bottom texture (blocks.json "textures": a string or { up, down, side, north.. }).
// A block that is not in any source (e.g. a separately installed addon the build can't see) falls back to the
// generic entry at index 0, or add that addon's resource-pack folder to openchara.ghostSources.
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const RAW = "https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack";
const FALLBACK_TEXTURE = "textures/blocks/stone";
const MINE_TEXTURE = "textures/ui/White";

const readJson = file => {
    try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")); } catch (e) { return null; }
};
const withNs = id => (id.includes(":") ? id : `minecraft:${id}`);

/** blocks.json -> Map<blockId, {side, up, down}> of texture KEYS. Entries with no textures (air, markers) are skipped. */
function parseBlocksJson(json) {
    const out = new Map();
    for (const [rawId, def] of Object.entries(json ?? {})) {
        if (rawId === "format_version" || !def || typeof def !== "object") continue;
        const t = def.textures;
        if (t === undefined) continue;
        let side, up, down;
        if (typeof t === "string") side = up = down = t;
        else if (t && typeof t === "object") {
            side = t.side ?? t.north ?? t.south ?? t.east ?? t.west ?? t.up ?? t.down;
            up = t.up ?? side;
            down = t.down ?? side;
        }
        if (typeof side === "string") out.set(withNs(rawId), { side, up: up ?? side, down: down ?? side });
    }
    return out;
}

/** terrain_texture.json -> Map<textureKey, path>. A key may list variations (first is used) or objects with a path. */
function parseTerrainTextures(json) {
    const out = new Map();
    for (const [key, v] of Object.entries(json?.texture_data ?? {})) {
        let t = v?.textures;
        if (Array.isArray(t)) t = t[0];
        if (t && typeof t === "object") t = t.path;
        if (typeof t === "string") out.set(key, t);
    }
    return out;
}

/**
 * Merges any number of { blocks, terrain } source pairs (JSON objects; later pairs override earlier ones).
 * @returns {{ blocks: Array<{id:string, side:string, up:string, down:string}>, textures: string[] }}
 *   `blocks[i]` is ghost index i+1 (index 0 is the generic fallback); `textures` is the unique path list.
 */
function buildAppearance(sources) {
    const keyed = new Map();
    const paths = new Map();
    for (const { blocks, terrain } of sources) {
        for (const [id, faces] of parseBlocksJson(blocks)) keyed.set(id, faces);
        for (const [k, p] of parseTerrainTextures(terrain)) paths.set(k, p);
    }
    const resolve = key => paths.get(key) ?? `textures/blocks/${key}`;
    const list = [...keyed].map(([id, f]) => ({ id, side: resolve(f.side), up: resolve(f.up), down: resolve(f.down) }))
        .sort((a, b) => a.id.localeCompare(b.id));
    const textures = [...new Set([FALLBACK_TEXTURE, ...list.flatMap(b => [b.side, b.up, b.down])])];
    return { blocks: list, textures };
}

/** Client-entity `textures` map: u0..uN for the unique paths, plus `mine`. */
function textureMap(appearance) {
    const out = {};
    appearance.textures.forEach((p, i) => { out[`u${i}`] = p; });
    out.mine = MINE_TEXTURE;
    return out;
}

/** Per-face arrays of texture refs indexed by ghost index (0 = fallback). */
function faceArrays(appearance) {
    const idx = new Map(appearance.textures.map((p, i) => [p, i]));
    const ref = p => `Texture.u${idx.get(p)}`;
    const fb = ref(FALLBACK_TEXTURE);
    return {
        side: [fb, ...appearance.blocks.map(b => ref(b.side))],
        top: [fb, ...appearance.blocks.map(b => ref(b.up))],
        bottom: [fb, ...appearance.blocks.map(b => ref(b.down))],
    };
}

/** id -> ghost index (1-based; absent ids use 0). The runtime half is a generated virtual module. */
function indexTable(appearance) {
    return Object.fromEntries(appearance.blocks.map((b, i) => [b.id, i + 1]));
}

/** Look constants are shared with the runtime (build/ghostBlocks.cjs). */
function ghostRenderController(ns, appearance, look) {
    const q = `query.property('${ns}:ghost_kind')`;
    const arrays = faceArrays(appearance);
    const faceExpr = name => `${q} == ${look.MINE} ? Texture.mine : Array.${ns}_ghost_${name}[query.property('${ns}:ghost_tex')]`;
    const [m, b] = [look.tint[look.MINE], look.tint[look.BUILD]];
    const pick = i => `${q} == ${look.MINE} ? ${m[i]} : ${b[i]}`;
    return {
        format_version: "1.10.0",
        render_controllers: {
            [`controller.render.${ns}_ghost_block`]: {
                arrays: { textures: Object.fromEntries(Object.entries(arrays).map(([name, list]) => [`Array.${ns}_ghost_${name}`, list])) },
                geometry: "Geometry.default",
                // One material per face group; the geometry's bones are named side/top/bottom, textures are parallel to materials.
                materials: [{ side: "Material.default" }, { top: "Material.default" }, { bottom: "Material.default" }],
                textures: [faceExpr("side"), faceExpr("top"), faceExpr("bottom")],
                color: { r: pick(0), g: pick(1), b: pick(2), a: pick(3) },
            },
        },
    };
}

// ---- gathering the source files ---------------------------------------------------------------

function vanillaFiles(modDir, env = process.env) {
    const dir = env.OPENROCK_VANILLA_RP;
    if (dir) return { blocks: path.join(dir, "blocks.json"), terrain: path.join(dir, "textures", "terrain_texture.json"), origin: dir };
    const cache = path.join(modDir, ".openrock-cache", "vanilla");
    return { blocks: path.join(cache, "blocks.json"), terrain: path.join(cache, "terrain_texture.json"), origin: cache, cache };
}

/** Downloads the two vanilla data files into the cache (synchronously, via a child node process). Returns true on success. */
function downloadVanilla(files) {
    fs.mkdirSync(files.cache, { recursive: true });
    const script = `
        const fs = require("fs");
        (async () => {
            for (const [url, out] of ${JSON.stringify([[`${RAW}/blocks.json`, files.blocks], [`${RAW}/textures/terrain_texture.json`, files.terrain]])}) {
                const r = await fetch(url);
                if (!r.ok) throw new Error(url + " -> " + r.status);
                fs.writeFileSync(out, await r.text());
            }
        })().catch(e => { console.error(e.message); process.exit(1); });`;
    try { execFileSync(process.execPath, ["-e", script], { stdio: "pipe", timeout: 60000 }); return true; } catch (e) { return false; }
}

function packSources(packageDirs) {
    const out = [];
    for (const dir of packageDirs) {
        const blocks = readJson(path.join(dir, "blocks.json"));
        const terrain = readJson(path.join(dir, "textures", "terrain_texture.json"));
        if (blocks || terrain) out.push({ blocks, terrain });
    }
    return out;
}

let cached = null;

/**
 * The appearance for a build. Cached per set of source files (path + mtime + size) so repeated providers in one
 * build (and dev rebuilds) don't re-parse ~400 KB of JSON.
 * @param {{modDir:string, packages:Array<{manifest:object, dir:string}>, extraDirs?:string[], env?:object, log?:Function}} ctx
 */
function loadAppearance({ modDir, packages = [], extraDirs = [], env = process.env, log = console.warn }) {
    const v = vanillaFiles(modDir, env);
    if (!fs.existsSync(v.blocks) || !fs.existsSync(v.terrain)) {
        if (v.cache && downloadVanilla(v)) log(`[openchara] downloaded Mojang's vanilla block data into ${v.cache}`);
        else log(`[openchara] ghost blocks: no vanilla block data (${v.origin}); only blocks from your own packs get real textures. Set OPENROCK_VANILLA_RP or allow the one-time download.`);
    }
    const packDirs = [];
    for (const { manifest, dir } of packages) {
        const rp = manifest.content?.rpOverlayDir;
        if (rp) packDirs.push(path.resolve(dir, rp));
    }
    packDirs.push(...extraDirs.map(d => path.resolve(modDir, d)));

    const files = [v.blocks, v.terrain, ...packDirs.flatMap(d => [path.join(d, "blocks.json"), path.join(d, "textures", "terrain_texture.json")])];
    const sig = files.map(f => { try { const s = fs.statSync(f); return `${f}:${s.mtimeMs}:${s.size}`; } catch (e) { return `${f}:-`; } }).join("|");
    if (cached?.sig === sig) return cached.appearance;

    const sources = [{ blocks: readJson(v.blocks), terrain: readJson(v.terrain) }, ...packSources(packDirs)];
    const appearance = buildAppearance(sources);
    cached = { sig, appearance };
    return appearance;
}

module.exports = {
    FALLBACK_TEXTURE, MINE_TEXTURE,
    parseBlocksJson, parseTerrainTextures, buildAppearance, textureMap, faceArrays, indexTable, ghostRenderController,
    vanillaFiles, loadAppearance,
};
