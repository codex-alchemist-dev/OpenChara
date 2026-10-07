// Run: node test/cinemaFlags.test.mjs
import assert from "node:assert";
import { createRequire } from "node:module";
import { createCinemaFlags } from "../engine/scripts/openchara/cinema/cinemaFlags.js";
const require = createRequire(import.meta.url);
const mclite = require("../../MCLite/src/index.js");
const { createMockOwner } = require("../../MCLite/test/mockOwner.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

test("seen markers and flags persist per player through MCLite records, never raw", () => {
    const world = createMockOwner(), a = Object.assign(createMockOwner(), { id: "pa" }), b = Object.assign(createMockOwner(), { id: "pb" });
    const flags = createCinemaFlags({ db: mclite, world });
    assert.strictEqual(flags.hasSeen(a, "intro"), false);
    flags.markSeen(a, "intro");
    flags.set(a, "met_mira");
    assert.strictEqual(flags.hasSeen(a, "intro"), true);
    assert.strictEqual(flags.has(a, "met_mira"), true);
    assert.strictEqual(flags.hasSeen(b, "intro"), false, "per player");
    assert.deepStrictEqual(flags.list(a).sort(), ["met_mira", "seen:intro"]);
    assert.ok(a.getDynamicPropertyIds().every(k => k.startsWith("mclite:")), "only MCLite keys");
    const again = createCinemaFlags({ db: mclite, world });
    assert.strictEqual(again.hasSeen(a, "intro"), true, "survives a fresh store (restart)");
    assert.throws(() => flags.set(a, ""), /needs a name/);
    assert.throws(() => createCinemaFlags({ db: {}, world }), /db\.registerRecordKind is required/);
});

console.log(`\n${passed} passed`);
