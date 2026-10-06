// Plain-Node tests for Build mode's pure modules and its MCLite-backed store. Run: node test/build.test.mjs
import assert from "node:assert";
import { createRequire } from "node:module";
import { createModel, setCell, getCell, clearCell, applyToKeys, clearKeys, addMarker, removeMarkerAt, bounds, stats, encode, decode, keyOf, MAX_MARKERS } from "../engine/scripts/openchara/build/schematicModel.js";
import { rectCells, circleCells, sphereCells, extendSelection, dominantAxis, cellFromBlock, MAX_SELECTION } from "../engine/scripts/openchara/build/buildSelection.js";
import { ghostItems, ghostFrame } from "../engine/scripts/openchara/build/ghostRender.js";
import { createSchematicStore, STATUS } from "../engine/scripts/openchara/build/schematicStore.js";

const require = createRequire(import.meta.url);
const mclite = require("../../MCLite/src/index.js");
const { createMockOwner } = require("../../MCLite/test/mockOwner.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

// ---- model ----------------------------------------------------------------------------------
test("model: set/get/clear cells, markers, bounds, stats", () => {
    const m = createModel();
    setCell(m, 1, 64, 2, { op: "build", block: "minecraft:stone" });
    setCell(m, 3, 66, 2, { op: "mine" });
    assert.deepStrictEqual(getCell(m, 1, 64, 2), { op: "build", block: "minecraft:stone" });
    assert.deepStrictEqual(bounds(m), { x0: 1, y0: 64, z0: 2, x1: 3, y1: 66, z1: 2 });
    assert.deepStrictEqual(stats(m), { cells: 2, build: 1, mine: 1, blocks: { "minecraft:stone": 1 }, markers: 0 });
    assert.ok(addMarker(m, "input", 5, 64, 5));
    assert.ok(!addMarker(m, "input", 5, 64, 5), "duplicate marker ignored");
    assert.strictEqual(removeMarkerAt(m, 5, 64, 5), 1);
    assert.ok(clearCell(m, 1, 64, 2));
    assert.strictEqual(bounds(createModel()), null);
    assert.throws(() => setCell(m, 0, 0, 0, { op: "nope" }), /unknown cell op/);
    assert.throws(() => setCell(m, 0, 0, 0, { op: "build" }), /block id/);
    const full = createModel();
    for (let i = 0; i < MAX_MARKERS; i++) addMarker(full, "x", i, 0, 0);
    assert.throws(() => addMarker(full, "x", 999, 0, 0), /too many markers/);
});

test("model: encode/decode round-trips and compresses a flat platform into one run per row", () => {
    const m = createModel();
    const keys = rectCells({ x: 0, y: 64, z: 0 }, { x: 9, y: 64, z: 9 });
    applyToKeys(m, keys, { op: "build", block: "minecraft:stone" });
    setCell(m, 20, 70, 20, { op: "build", block: "minecraft:glass" });
    setCell(m, 21, 70, 20, { op: "mine" });
    addMarker(m, "output", 1, 65, 1);
    const text = encode(m);
    assert.strictEqual(JSON.parse(text).r.length, 10 + 2);
    const back = decode(text);
    assert.deepStrictEqual([...back.cells].sort(), [...m.cells].sort());
    assert.deepStrictEqual(back.markers, m.markers);
});

test("model: negative coordinates and decode rejects garbage", () => {
    const m = createModel();
    setCell(m, -5, -64, -7, { op: "build", block: "minecraft:dirt" });
    setCell(m, -4, -64, -7, { op: "build", block: "minecraft:dirt" });
    assert.deepStrictEqual(decode(encode(m)).cells.get(keyOf(-4, -64, -7)), { op: "build", block: "minecraft:dirt" });
    assert.throws(() => decode("{nope"), /not valid JSON/);
    assert.throws(() => decode('{"v":99,"p":[],"r":[]}'), /unsupported/);
    assert.throws(() => decode('{"v":1,"p":[],"r":[[0,0,0,1,5]]}'), /palette/);
    assert.throws(() => decode('{"v":1,"p":[],"r":[[0,0,0,0,0]]}'), /run/);
});

test("model: clearKeys removes only listed cells", () => {
    const m = createModel();
    applyToKeys(m, rectCells({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }), { op: "mine" });
    assert.strictEqual(clearKeys(m, [keyOf(1, 0, 0), keyOf(9, 9, 9)]), 1);
    assert.strictEqual(m.cells.size, 2);
});

// ---- selection ------------------------------------------------------------------------------
test("selection: rect is inclusive and order-independent; caps absurd sizes", () => {
    assert.strictEqual(rectCells({ x: 0, y: 0, z: 0 }, { x: 2, y: 1, z: 3 }).size, 3 * 2 * 4);
    assert.deepStrictEqual([...rectCells({ x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })].sort(), [...rectCells({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 })].sort());
    assert.throws(() => rectCells({ x: 0, y: 0, z: 0 }, { x: 1000, y: 1000, z: 1000 }), /too large/);
    assert.ok(MAX_SELECTION > 1000);
});

test("selection: circle/sphere are symmetric and contain their center", () => {
    const c = circleCells({ x: 0, y: 5, z: 0 }, 4, "y");
    assert.ok(c.has(keyOf(0, 5, 0)) && c.has(keyOf(4, 5, 0)) && c.has(keyOf(-4, 5, 0)) && !c.has(keyOf(4, 5, 4)));
    for (const k of c) { const [x, y, z] = k.split(",").map(Number); assert.ok(c.has(keyOf(-x, y, -z)), "symmetric"); }
    assert.ok([...c].every(k => k.split(",")[1] === "5"), "flat on the chosen axis");
    const wall = circleCells({ x: 0, y: 0, z: 0 }, 2, "z");
    assert.ok([...wall].every(k => k.split(",")[2] === "0"));
    const s = sphereCells({ x: 0, y: 0, z: 0 }, 3);
    assert.ok(s.has(keyOf(3, 0, 0)) && s.has(keyOf(0, -3, 0)) && !s.has(keyOf(3, 3, 3)));
    assert.throws(() => sphereCells({ x: 0, y: 0, z: 0 }, 100), /too large/);
});

test("selection: extend extrudes along a direction and a negative amount trims the outer layers", () => {
    const base = rectCells({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 });
    const up = extendSelection(base, { x: 0, y: 1, z: 0 }, 3);
    assert.strictEqual(up.size, 4 * 4);
    assert.ok(up.has(keyOf(0, 3, 0)) && !up.has(keyOf(0, 4, 0)));
    const trimmed = extendSelection(up, { x: 0, y: 1, z: 0 }, -2);
    assert.strictEqual(trimmed.size, 4 * 2);
    assert.ok(trimmed.has(keyOf(0, 1, 0)) && !trimmed.has(keyOf(0, 2, 0)));
    const down = extendSelection(base, { x: 0, y: -1, z: 0 }, 2);
    assert.ok(down.has(keyOf(1, -2, 1)));
    assert.strictEqual(extendSelection(base, { x: 1, y: 0, z: 0 }, 0).size, 4);
});

test("selection: dominantAxis picks the grid direction of a view vector; cellFromBlock floors", () => {
    assert.deepStrictEqual(dominantAxis({ x: 0.2, y: -0.9, z: 0.3 }), { x: 0, y: -1, z: 0 });
    assert.deepStrictEqual(dominantAxis({ x: -0.8, y: 0.1, z: 0.3 }), { x: -1, y: 0, z: 0 });
    assert.deepStrictEqual(dominantAxis({ x: 0, y: 0, z: 0 }), { x: 1, y: 0, z: 0 });
    assert.deepStrictEqual(cellFromBlock({ x: 1.9, y: -0.1, z: 3 }), { x: 1, y: -1, z: 3 });
});

// ---- store (real MCLite) --------------------------------------------------------------------
function fresh(clock = { t: 1_000_000 }) {
    const store = createSchematicStore({ db: mclite, archiveDays: 30, now: () => clock.t });
    return { store, owner: createMockOwner(), world: createMockOwner("mock:world"), clock };
}
function bigModel(n) {
    const m = createModel();
    for (let i = 0; i < n; i++) setCell(m, i * 2, (i * 7) % 90, (i * 13) % 200, { op: "build", block: i % 3 ? "minecraft:stone" : "minecraft:oak_planks" });
    return m;
}

test("store: create/load round-trips, including a body far over the 32KB property ceiling", () => {
    const { store, owner, world } = fresh();
    const model = bigModel(20000);
    assert.ok(encode(model).length > 100000);
    const id = store.create(owner, world, { name: "Castle", model, origin: { x: 1, y: 2, z: 3, dim: "overworld" } });
    assert.ok(id);
    for (const key of owner.getDynamicPropertyIds()) assert.ok(String(owner.getDynamicProperty(key)).length <= 32000, key);
    const loaded = store.load(owner, world, id);
    assert.strictEqual(loaded.header.name, "Castle");
    assert.strictEqual(loaded.header.cells, 20000);
    assert.strictEqual(loaded.model.cells.size, 20000);
    assert.deepStrictEqual(store.list(owner).map(e => e.name), ["Castle"]);
});

test("store: save replaces the body and refreshes counts; rename and visibility", () => {
    const { store, owner, world, clock } = fresh();
    const id = store.create(owner, world, { name: "A", model: bigModel(10) });
    clock.t += 10;
    const m2 = bigModel(50); addMarker(m2, "input", 0, 0, 0);
    assert.ok(store.save(owner, world, id, m2));
    assert.strictEqual(store.load(owner, world, id).model.cells.size, 50);
    assert.strictEqual(store.header(owner, world, id).markers, 1);
    assert.ok(store.rename(owner, world, id, "Better name"));
    assert.ok(store.setVisible(owner, world, id, true));
    const h = store.header(owner, world, id);
    assert.deepStrictEqual([h.name, h.visible], ["Better name", true]);
    assert.strictEqual(store.list(owner)[0].visible, true);
    assert.strictEqual(store.save(owner, world, "nope", m2), false);
});

test("store: complete() archives and hides; restore reopens; list filters by status", () => {
    const { store, owner, world } = fresh();
    const a = store.create(owner, world, { name: "A", model: bigModel(5) });
    const b = store.create(owner, world, { name: "B", model: bigModel(5) });
    store.setVisible(owner, world, a, true);
    assert.ok(store.complete(owner, world, a));
    assert.strictEqual(store.header(owner, world, a).visible, false);
    assert.deepStrictEqual(store.list(owner).map(e => e.id), [b]);
    assert.deepStrictEqual(store.list(owner, { status: STATUS.ARCHIVED }).map(e => e.id), [a]);
    assert.ok(store.restore(owner, world, a));
    assert.strictEqual(store.list(owner).length, 2);
});

test("store: trash remembers the previous status; restore returns to it", () => {
    const { store, owner, world } = fresh();
    const id = store.create(owner, world, { name: "T", model: bigModel(5) });
    store.complete(owner, world, id);
    assert.ok(store.trash(owner, world, id));
    assert.strictEqual(store.header(owner, world, id).status, STATUS.TRASHED);
    assert.strictEqual(store.trash(owner, world, id), false, "already trashed");
    assert.ok(store.restore(owner, world, id));
    assert.strictEqual(store.header(owner, world, id).status, STATUS.ARCHIVED);
});

test("store: purge needs confirmation and removes every trace", () => {
    const { store, owner, world } = fresh();
    const id = store.create(owner, world, { name: "P", model: bigModel(3000) });
    assert.throws(() => store.purge(owner, world, id), /confirmed/);
    assert.throws(() => store.purge(owner, world, id, { confirmed: "yes" }), /confirmed/);
    assert.ok(store.header(owner, world, id));
    assert.ok(store.purge(owner, world, id, { confirmed: true }));
    assert.strictEqual(store.load(owner, world, id), null);
    assert.deepStrictEqual(store.list(owner, { status: null }), []);
    assert.deepStrictEqual(owner.getDynamicPropertyIds().filter(k => !k.startsWith("mclite:index:")), []);
    assert.deepStrictEqual(world.getDynamicPropertyIds(), []);
});

test("store: sweep purges archived/trashed items older than the grace period and keeps the rest", () => {
    const clock = { t: 1_000_000 };
    const { store, owner, world } = fresh(clock);
    const old = store.create(owner, world, { name: "old", model: bigModel(5) });
    const young = store.create(owner, world, { name: "young", model: bigModel(5) });
    const trashed = store.create(owner, world, { name: "trashed", model: bigModel(5) });
    const active = store.create(owner, world, { name: "active", model: bigModel(5) });
    store.complete(owner, world, old); store.trash(owner, world, trashed);
    clock.t += 31 * 24 * 60 * 60 * 1000;
    store.complete(owner, world, young);
    const purged = store.sweep(owner, world);
    assert.deepStrictEqual(purged.sort(), [old, trashed].sort());
    assert.ok(store.load(owner, world, young) && store.load(owner, world, active));
    assert.strictEqual(store.load(owner, world, old), null);
});

test("store: a damaged body part heals from its mirror; a destroyed header is recovered from the world mirror", () => {
    const { store, owner, world } = fresh();
    const id = store.create(owner, world, { name: "H", model: bigModel(8000) });
    for (const key of [...owner.getDynamicPropertyIds()]) if (key.startsWith("mclite:schb~:") && key.endsWith(":0")) owner.setDynamicProperty(key, "{garbage");
    assert.strictEqual(store.load(owner, world, id).model.cells.size, 8000);
    for (const key of [...owner.getDynamicPropertyIds()]) if (key.startsWith(`mclite:sch:${id}`)) owner.setDynamicProperty(key, "{garbage");
    assert.strictEqual(store.header(owner, world, id).name, "H");
});

test("store: repair reports schematics whose body is unreadable", () => {
    const { store, owner, world } = fresh();
    const id = store.create(owner, world, { name: "R", model: bigModel(5) });
    for (const k of [...owner.getDynamicPropertyIds()]) if (k.startsWith("mclite:schb")) owner.setDynamicProperty(k, undefined);
    for (const k of [...world.getDynamicPropertyIds()]) if (k.startsWith("mclite:mirror:schb")) world.setDynamicProperty(k, undefined);
    assert.deepStrictEqual(store.repair(owner, world), [id]);
});

test("store: players are isolated from each other", () => {
    const { store, world } = fresh();
    const p1 = createMockOwner(), p2 = createMockOwner();
    const id = store.create(p1, world, { name: "mine", model: bigModel(3) });
    assert.deepStrictEqual(store.list(p2), []);
    assert.strictEqual(store.load(p2, world, id)?.header?.name, "mine", "mirror recovery is by id (ids are unguessable UUIDs); the index stays per player");
});

test("ghost: items are limited to the radius, sorted, and kinds map from the model/selection/markers", () => {
    const m = createModel();
    setCell(m, 1, 0, 0, { op: "build", block: "minecraft:stone" });
    setCell(m, 2, 0, 0, { op: "mine" });
    setCell(m, 500, 0, 0, { op: "build", block: "minecraft:stone" });
    addMarker(m, "output", 0, 1, 0);
    const items = ghostItems({ model: m, selection: new Set([keyOf(0, 0, 0)]), center: { x: 0, y: 0, z: 0 }, radius: 10 });
    assert.strictEqual(items.length, 4);
    assert.ok(!items.some(i => i.x === 500));
    assert.deepStrictEqual(items.map(i => i.kind).sort(), ["build", "mine", "output", "selection"]);
    assert.ok(items.every((it, i) => i === 0 || items[i - 1].y < it.y || (items[i - 1].y === it.y && (items[i - 1].z < it.z || (items[i - 1].z === it.z && items[i - 1].x <= it.x)))), "sorted y, z, x");
});

test("ghost: a rotating window covers every item over a few frames and never exceeds the cap", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ x: i, y: 0, z: 0, kind: "build" }));
    assert.strictEqual(ghostFrame(items, 20, 0).length, 10);
    const seen = new Set();
    for (let f = 0; f < 4; f++) { const w = ghostFrame(items, 3, f); assert.strictEqual(w.length, 3); w.forEach(i => seen.add(i.x)); }
    assert.strictEqual(seen.size, 10);
});

console.log(`\n${passed} passed${process.exitCode ? ", with failures" : ""}`);
