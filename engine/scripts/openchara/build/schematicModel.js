// Build-mode schematic data: a sparse set of block TASKS plus markers, with a compact serialization. Pure (no game
// imports) so it can be unit tested and stored through any record layer.
//
//   cell state   { op: "build", block: "minecraft:stone" }   place this block here
//                { op: "mine" }                              remove whatever is here
//   markers      [{ kind: "input"|"output"|string, x, y, z }]   chests/areas a project assigns meaning to later
//
// Serialization (`encode`): { v, p: palette[], r: runs[], m: markers[] }. Cells are grouped into runs along +x
// sharing (y, z, palette index): r = [[x, y, z, length, paletteIndex], ...] sorted by y, z, x. Palette index 0 is
// reserved for "mine"; build blocks start at 1. A flat 10x10 platform of stone is ONE run per row.

export const MODEL_VERSION = 1;
export const MAX_CELLS = 2_000_000;
export const MAX_MARKERS = 64;

export const keyOf = (x, y, z) => `${x},${y},${z}`;
export function parseKey(k) { const [x, y, z] = k.split(",").map(Number); return { x, y, z }; }

export function createModel() {
    return { cells: new Map(), markers: [] };
}

export const cellCount = model => model.cells.size;

function stateKey(state) { return state.op === "mine" ? "mine" : `build:${state.block}`; }

export function setCell(model, x, y, z, state) {
    if (state.op !== "mine" && state.op !== "build") throw new Error(`unknown cell op "${state.op}"`);
    if (state.op === "build" && (typeof state.block !== "string" || !state.block)) throw new Error("a build cell needs a block id");
    const k = keyOf(x, y, z);
    if (!model.cells.has(k) && model.cells.size >= MAX_CELLS) throw new Error(`schematic is too large (over ${MAX_CELLS} cells)`);
    model.cells.set(k, state.op === "mine" ? { op: "mine" } : { op: "build", block: state.block });
}

export function clearCell(model, x, y, z) { return model.cells.delete(keyOf(x, y, z)); }
export function getCell(model, x, y, z) { return model.cells.get(keyOf(x, y, z)) ?? null; }

/** Applies one state to many cells (selection keys). Returns how many cells changed. */
export function applyToKeys(model, keys, state) {
    let n = 0;
    for (const k of keys) { const { x, y, z } = parseKey(k); setCell(model, x, y, z, state); n++; }
    return n;
}
export function clearKeys(model, keys) { let n = 0; for (const k of keys) if (model.cells.delete(k)) n++; return n; }

export function addMarker(model, kind, x, y, z) {
    if (model.markers.length >= MAX_MARKERS) throw new Error(`too many markers (max ${MAX_MARKERS})`);
    if (model.markers.some(m => m.kind === kind && m.x === x && m.y === y && m.z === z)) return false;
    model.markers.push({ kind, x, y, z });
    return true;
}
export function removeMarkerAt(model, x, y, z) {
    const before = model.markers.length;
    model.markers = model.markers.filter(m => !(m.x === x && m.y === y && m.z === z));
    return before - model.markers.length;
}

export function bounds(model) {
    if (!model.cells.size) return null;
    const b = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
    for (const k of model.cells.keys()) {
        const { x, y, z } = parseKey(k);
        b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.z0 = Math.min(b.z0, z);
        b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y); b.z1 = Math.max(b.z1, z);
    }
    return b;
}

export function stats(model) {
    let build = 0, mine = 0;
    const blocks = {};
    for (const c of model.cells.values()) {
        if (c.op === "mine") mine++;
        else { build++; blocks[c.block] = (blocks[c.block] ?? 0) + 1; }
    }
    return { cells: model.cells.size, build, mine, blocks, markers: model.markers.length };
}

export function encode(model) {
    const palette = [];
    const index = new Map();
    const idxFor = state => {
        if (state.op === "mine") return 0;
        const k = stateKey(state);
        if (!index.has(k)) { palette.push(state.block); index.set(k, palette.length); }
        return index.get(k);
    };
    const rows = [...model.cells].map(([k, state]) => ({ ...parseKey(k), idx: idxFor(state) }));
    rows.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
    const runs = [];
    for (const c of rows) {
        const last = runs[runs.length - 1];
        if (last && last[1] === c.y && last[2] === c.z && last[4] === c.idx && last[0] + last[3] === c.x) last[3]++;
        else runs.push([c.x, c.y, c.z, 1, c.idx]);
    }
    return JSON.stringify({ v: MODEL_VERSION, p: palette, r: runs, m: model.markers });
}

export function decode(text) {
    let raw;
    try { raw = JSON.parse(text); } catch (e) { throw new Error("schematic data is not valid JSON"); }
    if (!raw || raw.v !== MODEL_VERSION || !Array.isArray(raw.p) || !Array.isArray(raw.r)) throw new Error("unsupported schematic data");
    const model = createModel();
    for (const [x, y, z, len, idx] of raw.r) {
        if (!Number.isInteger(len) || len < 1) throw new Error("corrupt run in schematic data");
        const state = idx === 0 ? { op: "mine" } : { op: "build", block: raw.p[idx - 1] };
        if (idx !== 0 && typeof state.block !== "string") throw new Error("corrupt palette index in schematic data");
        for (let i = 0; i < len; i++) setCell(model, x + i, y, z, state);
    }
    for (const m of raw.m ?? []) model.markers.push({ kind: String(m.kind), x: m.x, y: m.y, z: m.z });
    return model;
}
