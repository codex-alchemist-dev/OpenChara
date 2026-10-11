// Plain-Node tests for the look & forms layer's pure modules (no game): skin conditions and rules, stable variation,
// weapon categories, the wetness/dirt model, and form selection (March 7th's Hunt vs Preservation as the worked example).
// Run: node test/look.test.mjs
import assert from "node:assert";
import { registerSkinCondition, resolveSkin, matches, hasSkinCondition } from "../engine/scripts/openchara/look/skinRules.js";
import { registerBuiltinSkinConditions, compare } from "../engine/scripts/openchara/look/builtinConditions.js";
import { pick, bucketOf, hash32 } from "../engine/scripts/openchara/look/variation.js";
import { weaponCategory, registerWeaponCategory } from "../engine/scripts/openchara/look/weapons.js";
import { stepWetness, stepDirt, overlayLevel } from "../engine/scripts/openchara/look/appearanceModel.js";
import { chooseForm, formForWeapon, registerTacticalConditions, defaultFormOf } from "../engine/scripts/openchara/look/formSelect.js";

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); } catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

registerBuiltinSkinConditions();
registerTacticalConditions();

// ---- conditions ------------------------------------------------------------------------------
test("compare: a number means equals, an object combines bounds", () => {
    assert.ok(compare(3, 3) && !compare(3, 4));
    assert.ok(compare(0.5, { gte: 0.5, lt: 1 }) && !compare(1, { gte: 0.5, lt: 1 }) && !compare(undefined, { gt: 0 }));
});

test("builtin conditions read the look context", () => {
    const ctx = {
        form: "hunt", time: "night", weather: "rain", dimension: "overworld", biome: "minecraft:snowy_plains", wetness: 0.5, healthFraction: 0.2, dirt: 0.7,
        light: 3, weapon: "sword", armor: { chest: true, head: false }, inWater: false, combat: true, inSquad: true, level: 12, order: "follow", sitting: false,
        date: { month: 12, day: 25 },
    };
    const yes = w => assert.ok(matches(w, ctx), JSON.stringify(w)), no = w => assert.ok(!matches(w, ctx), JSON.stringify(w));
    yes({ form: "hunt" }); yes({ form: ["x", "hunt"] }); no({ form: "preservation" });
    yes({ time: "night" }); no({ time: "day" }); yes({ weather: ["rain", "thunder"] }); yes({ dimension: "overworld" });
    yes({ biome: "snow" }); no({ biome: "desert" }); yes({ wet: "wet" }); no({ wet: "dry" }); yes({ wet: { gte: 0.4 } });
    yes({ health: "critical" }); yes({ health: { lt: 0.5 } }); yes({ dirt: { gte: 0.6 } }); yes({ light: { lt: 5 } });
    yes({ holding: "sword" }); no({ holding: "bow" }); yes({ armor: "chest" }); no({ armor: "head" }); yes({ armor: { chest: true, head: false } });
    yes({ combat: true }); yes({ inWater: false }); yes({ squad: true }); yes({ level: { gte: 10 } }); yes({ order: "follow" }); yes({ sitting: false });
    yes({ date: { from: "12-24", to: "12-26" } }); no({ date: { from: "01-01", to: "01-02" } }); yes({ date: { from: "12-20", to: "01-05" } });
    yes({ all: [{ form: "hunt" }, { time: "night" }] }); yes({ any: [{ time: "day" }, { combat: true }] }); yes({ not: { time: "day" } }); no({ not: { time: "night" } });
    yes({ form: "hunt", time: "night", combat: true }); no({ form: "hunt", time: "day" });
});

test("an unknown condition is false and reported, never a crash; a throwing one too", () => {
    const seen = [];
    assert.strictEqual(matches({ nonsense: 1 }, {}, k => seen.push(k)), false);
    registerSkinCondition("boom", () => { throw new Error("bad"); });
    assert.strictEqual(matches({ boom: 1 }, {}, (k, e) => seen.push(k + ":" + (e ? "threw" : ""))), false);
    assert.deepStrictEqual(seen, ["nonsense", "boom:threw"]);
});

test("a project registers its own condition and it works in rules; names are validated and unique", () => {
    registerSkinCondition("moonPhase", (arg, ctx) => ctx.moon === arg);
    assert.ok(hasSkinCondition("moonPhase"));
    assert.ok(matches({ moonPhase: 4 }, { moon: 4 }));
    assert.throws(() => registerSkinCondition("moonPhase", () => true), /already registered/);
    assert.throws(() => registerSkinCondition("Bad", () => true), /must start with a lowercase/);
});

// ---- skin resolution -------------------------------------------------------------------------
const march = {
    skins: { hunt: {}, hunt_night: {}, preservation: {}, preservation_wet: {}, hunt_freckled: {} },
    forms: { hunt: { skin: "hunt" }, preservation: { skin: "preservation" } },
    skinRules: [
        { skin: "hunt_night", priority: 20, when: { form: "hunt", time: "night" } },
        { skin: "preservation_wet", priority: 15, when: { form: "preservation", wet: ["wet", "soaked"] } },
        { skin: "hunt_freckled", priority: 5, when: { form: "hunt", random: { name: "freckles", of: 4, is: [0, 1] } } },
    ],
};

test("resolveSkin: highest priority matching rule, else the form skin, else default", () => {
    assert.strictEqual(resolveSkin(march, { form: "hunt", time: "night" }).skin, "hunt_night");
    assert.strictEqual(resolveSkin(march, { form: "hunt", time: "day", seed: 1, name: "x" }).skin === "hunt_night", false);
    assert.strictEqual(resolveSkin(march, { form: "preservation", time: "day", wetness: 0.6 }).skin, "preservation_wet");
    assert.strictEqual(resolveSkin(march, { form: "preservation", time: "day", wetness: 0 }).skin, "preservation");
    assert.strictEqual(resolveSkin(march, { form: undefined }).skin, "default");
    assert.strictEqual(resolveSkin({ skins: {}, skinRules: [{ skin: "ghost", when: {} }] }, {}).skin, "default", "a rule naming a missing skin is ignored");
});

test("resolveSkin: equal priorities go to the rule written first", () => {
    const sp = { skins: { a: {}, b: {} }, skinRules: [{ skin: "a", when: { time: "night" } }, { skin: "b", when: { time: "night" } }] };
    assert.strictEqual(resolveSkin(sp, { time: "night" }).skin, "a");
});

// ---- variation -------------------------------------------------------------------------------
test("variation is stable per (seed, name, bucket), varies across them, and respects n", () => {
    assert.strictEqual(pick(42, "freckles", 4), pick(42, "freckles", 4));
    const picks = new Set(Array.from({ length: 200 }, (_, s) => pick(s, "freckles", 4)));
    assert.deepStrictEqual([...picks].sort(), [0, 1, 2, 3]);
    assert.ok(pick(1, "a", 5) < 5);
    const names = new Set(["freckles", "hair", "outfit", "eyes"].map(n => hash32(`7|${n}|0`)));
    assert.strictEqual(names.size, 4);
    assert.throws(() => pick(1, "a", 0), /n must be/);
});

test("variation buckets: stable never changes, daily changes with the day, session with the session", () => {
    const d = 86400_000;
    assert.strictEqual(bucketOf("stable"), 0);
    assert.strictEqual(bucketOf("daily", { now: 3 * d + 5 }), 3);
    assert.strictEqual(bucketOf("daily", { now: 4 * d }), 4);
    assert.strictEqual(bucketOf("session", { session: 9 }), "s9");
    assert.strictEqual(bucketOf(60, { now: 125_000 }), 2);
    assert.throws(() => bucketOf("yearly"), /unknown variation period/);
    const a = pick(5, "x", 1000, bucketOf("daily", { now: d })), b = pick(5, "x", 1000, bucketOf("daily", { now: 40 * d }));
    assert.notStrictEqual(a, b);
});

// ---- weapons ---------------------------------------------------------------------------------
test("weapon categories cover vanilla and projects can add modded items first", () => {
    assert.deepStrictEqual(["minecraft:iron_sword", "minecraft:bow", "minecraft:crossbow", "minecraft:diamond_axe", "minecraft:shield", "minecraft:mace", "minecraft:stick", undefined].map(weaponCategory),
        ["sword", "bow", "crossbow", "axe", "shield", "mace", null, null]);
    registerWeaponCategory(/^mod:katana/, "sword");
    assert.strictEqual(weaponCategory("mod:katana_red"), "sword");
});

// ---- appearance model ------------------------------------------------------------------------
test("wetness rises in water and rain, dries slowly (fast in the Nether); dirt washes off only when wet", () => {
    assert.strictEqual(stepWetness(0, { inWater: true, raining: false, dt: 2 }), 0.7);
    assert.ok(stepWetness(0, { inWater: false, raining: true, dt: 1 }) > 0);
    assert.ok(stepWetness(1, { inWater: true, raining: false, dt: 10 }) === 1);
    assert.ok(stepWetness(0.5, { inWater: false, raining: false, dt: 1 }) < 0.5);
    assert.ok(stepWetness(0.5, { inWater: false, raining: false, nether: true, dt: 1 }) < stepWetness(0.5, { inWater: false, raining: false, dt: 1 }));
    assert.strictEqual(stepWetness(0, { inWater: false, raining: false, dt: 5 }), 0);
    assert.strictEqual(stepDirt(0.5, 0.2, 10), 0.5);
    assert.ok(stepDirt(0.5, 0.8, 4) < 0.5);
    assert.strictEqual(stepDirt(0.05, 1, 10), 0);
});

test("overlayLevel counts the thresholds reached", () => {
    const t = [0.2, 0.5, 0.8];
    assert.deepStrictEqual([0.1, 0.2, 0.6, 0.9].map(v => overlayLevel(v, t)), [0, 1, 2, 3]);
});

// ---- form selection: March 7th ---------------------------------------------------------------
// Hunt = sword: close-range follow-up attacker. Preservation = bow: ranged, protective.
const mar = {
    forms: {
        hunt: { weapons: ["sword"], tactics: [{ when: { nearestEnemy: { lt: 5 } }, score: 2 }, { when: { enemies: { lte: 2 } }, score: 1 }, { when: { alliesDown: { gte: 1 }, healer: false }, score: -1 }] },
        preservation: { weapons: ["bow"], tactics: [{ when: { nearestEnemy: { gte: 8 } }, score: 2 }, { when: { enemies: { gte: 4 } }, score: 2 }, { when: { alliesWounded: { gte: 2 } }, score: 3, urgent: true }] },
    },
    defaultForm: "hunt",
    formPolicy: { mode: "tactical", minDwellSeconds: 8, stickiness: 0.75, swapCost: 0.5 },
};
const carried = new Set(["sword", "bow"]);
const pickForm = (over = {}) => chooseForm({ species: mar, current: "hunt", now: 100_000, lastChangeAt: -Infinity, available: id => mar.forms[id].weapons.some(w => carried.has(w)), ...over, ctx: { weapon: "sword", ...(over.ctx ?? {}) } });

test("tactical: melee range picks Hunt, a distant crowd picks Preservation", () => {
    assert.strictEqual(pickForm({ current: "preservation", ctx: { weapon: "bow", nearestEnemy: 3, enemies: 1 } }).form, "hunt");
    assert.strictEqual(pickForm({ current: "hunt", ctx: { weapon: "sword", nearestEnemy: 12, enemies: 5 } }).form, "preservation");
});

test("stickiness stops flapping on near-ties; swapCost prefers the form already matching her weapon", () => {
    const tie = pickForm({ current: "hunt", ctx: { weapon: "sword", nearestEnemy: 6, enemies: 3 } });
    assert.strictEqual(tie.form, "hunt");
    assert.strictEqual(tie.reason, "unchanged");
    const none = pickForm({ current: "preservation", ctx: { weapon: "bow" } });
    assert.strictEqual(none.form, "preservation", "with no signal she stays in the form she is in");
});

test("a form whose weapon she cannot get is never chosen", () => {
    const noBow = pickForm({ current: "hunt", available: id => id === "hunt", ctx: { weapon: "sword", nearestEnemy: 12, enemies: 6, alliesWounded: 3 } });
    assert.strictEqual(noBow.form, "hunt");
});

test("dwell time holds the current form, except for an urgent tactic", () => {
    const calm = pickForm({ current: "hunt", now: 5000, lastChangeAt: 1000, ctx: { weapon: "sword", nearestEnemy: 12, enemies: 5 } });
    assert.deepStrictEqual([calm.form, calm.reason], ["hunt", "dwell"]);
    const urgent = pickForm({ current: "hunt", now: 5000, lastChangeAt: 1000, ctx: { weapon: "sword", nearestEnemy: 12, enemies: 5, alliesWounded: 2 } });
    assert.deepStrictEqual([urgent.form, urgent.reason], ["preservation", "urgent tactic"]);
    const later = pickForm({ current: "hunt", now: 20000, lastChangeAt: 1000, ctx: { weapon: "sword", nearestEnemy: 12, enemies: 5 } });
    assert.strictEqual(later.form, "preservation");
});

test("weapon mode follows what is in her hand; manual mode never moves; formForWeapon and defaults", () => {
    const byWeapon = { ...mar, formPolicy: { mode: "weapon" } };
    assert.strictEqual(chooseForm({ species: byWeapon, current: "hunt", ctx: { weapon: "bow" }, now: 0 }).form, "preservation");
    assert.strictEqual(chooseForm({ species: byWeapon, current: "hunt", ctx: { weapon: "stick" }, now: 0 }).form, "hunt");
    const manual = { ...mar, formPolicy: { mode: "manual" } };
    assert.strictEqual(chooseForm({ species: manual, current: "preservation", ctx: { weapon: "sword", nearestEnemy: 1 }, now: 0 }).form, "preservation");
    assert.strictEqual(formForWeapon(mar, "bow"), "preservation");
    assert.strictEqual(formForWeapon(mar, "axe"), null);
    assert.strictEqual(defaultFormOf(mar), "hunt");
    assert.strictEqual(chooseForm({ species: { forms: {} }, current: null, ctx: {}, now: 0 }).form, null);
});

console.log(`\n${passed} passed`);
