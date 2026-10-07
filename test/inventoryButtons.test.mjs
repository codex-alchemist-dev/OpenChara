// Run: node test/inventoryButtons.test.mjs
import assert from "node:assert";
import { createRequire } from "node:module";
const { reconcile } = createRequire(import.meta.url)("../engine/scripts/openchara/ui/inventoryButtonsCore.cjs");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}
const slots = obj => new Map(Object.entries(obj).map(([k, v]) => [Number(k), v]));
const M = { marker: true, empty: false }, EMPTY = { marker: false, empty: true }, REAL = { marker: false, empty: false };

test("nothing happens while every button still holds its marker", () => {
    assert.deepStrictEqual(reconcile({ buttons: [9, 10], slots: slots({ 9: M, 10: M }), cursorMarker: false }), { pressed: [], displaced: [], restore: [], stray: [], clearCursor: false });
});

test("a picked-up marker (slot now empty) is a press: restore it, clear the cursor marker", () => {
    assert.deepStrictEqual(reconcile({ buttons: [9, 10], slots: slots({ 9: EMPTY, 10: M }), cursorMarker: true }), { pressed: [9], displaced: [], restore: [9], stray: [], clearCursor: true });
});

test("a marker swapped for a real item: the real item is displaced (kept), the marker restored, still a press", () => {
    const r = reconcile({ buttons: [9], slots: slots({ 9: REAL }), cursorMarker: true });
    assert.deepStrictEqual([r.pressed, r.displaced, r.restore], [[9], [9], [9]]);
});

test("a marker dropped into another slot is stray and removed; its home slot counts as pressed", () => {
    const r = reconcile({ buttons: [9], slots: slots({ 9: EMPTY, 20: M }), cursorMarker: false });
    assert.deepStrictEqual([r.pressed, r.stray, r.clearCursor], [[9], [20], false]);
});

test("a button slot missing from the snapshot counts as empty (pressed)", () => {
    assert.deepStrictEqual(reconcile({ buttons: [9], slots: new Map(), cursorMarker: false }).pressed, [9]);
});

console.log(`\n${passed} passed`);
