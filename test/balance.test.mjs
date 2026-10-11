// Launch balance: every class's base stats sit in the shared band. Run: node test/balance.test.mjs
import assert from "node:assert";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { validateClassBalance } = require("../src/build/balance.js");
const { loadContent } = require("../src/build/content.js");

const good = { id: "x", baseStats: { maxHp: 40, atk: 85, def: 50, spd: 100, critRate: 0.05, critDmg: 0.5 } };
const withStat = (k, v) => ({ id: "x", baseStats: { ...good.baseStats, [k]: v } });

const cases = [
    ["a balanced class passes", good, null],
    ["an OP attack is refused and named", withStat("atk", 115), /classes\/x: baseStats\.atk is 115/],
    ["an OP-tanky hp is refused", withStat("maxHp", 1500), /baseStats\.maxHp is 1500/],
    ["a missing stat is refused", { id: "x", baseStats: { maxHp: 40 } }, /baseStats\.atk is required/],
    ["an extreme crit is refused", withStat("critRate", 0.2), /baseStats\.critRate/],
];
let passed = 0;
for (const [name, cls, re] of cases) {
    try {
        if (re) assert.throws(() => validateClassBalance(cls), re); else validateClassBalance(cls);
        passed++; console.log(`ok - ${name}`);
    } catch (e) { console.error(`FAIL - ${name}`, e); process.exitCode = 1; }
}

// the shipped project must pass
const cw = path.resolve(import.meta.dirname, "../../Claude Waifus/PATCHES");
const real = loadContent({ patchesDir: cw });
assert.ok(Object.keys(real.classes).length >= 2);
passed++; console.log("ok - every shipped class is inside the launch balance band");
console.log(`\n${passed} passed`);
