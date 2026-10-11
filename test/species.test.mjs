// Plain-Node tests for per-character visuals (src/build/species.js) and the character/rig validation. Run: node test/species.test.mjs
import assert from "node:assert";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const sp = require("../src/build/species.js");
const { loadContent } = require("../src/build/content.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); } catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

// Molang's ternary/comparison subset is valid JavaScript, so a lookup expression can be evaluated by substitution.
const evalMolang = (expr, props) => Function(`"use strict"; return (${expr.replace(/q\.property\('([\w:]+)'\)/g, (_, k) => String(props[k]))});`)();

const chars = {
    a: { id: "a", index: 0, texture: "textures/entity/a", emissiveTexture: "textures/entity/light/a", body: { scale: 0.9 }, rig: "wb" },
    b: { id: "b", index: 3, texture: "textures/entity/b", skins: { night: { texture: "textures/entity/b_n", emissiveTexture: "textures/entity/light/b_n" } }, rig: "hus" },
    c: { id: "c", index: 7, texture: "textures/entity/c", body: { scale: 1.05 }, skins: { water: { texture: "textures/entity/c_w" } } },
};
const rigs = { wb: { id: "wb", index: 1, geometry: "geometry.waifuB", animate: ["boobs"] }, hus: { id: "hus", index: 2, geometry: "geometry.husband", material: "skeleton2" } };
const defaults = { geometry: "geometry.humanoid.custom", material: "skeleton" };

test("lookupExpr returns each value for its index and the fallback elsewhere", () => {
    const pairs = [[2, 5], [9, 7], [4, 3], [100, 11], [101, 13]];
    for (const [i, v] of pairs) assert.strictEqual(evalMolang(sp.lookupExpr(pairs, "q.property('x')", 1), { x: i }), v);
    for (const i of [0, 3, 5, 99, 102, 5000]) assert.strictEqual(evalMolang(sp.lookupExpr(pairs, "q.property('x')", 1), { x: i }), 1);
    assert.strictEqual(sp.lookupExpr([], "q.property('x')", 4), "4");
});

test("scaleExpression reads the body_scale property; scaleProperty converts to permille", () => {
    const e = sp.scaleExpression(chars, "cw");
    assert.strictEqual(evalMolang(e, { "cw:body_scale": 900 }), 0.9);
    assert.strictEqual(sp.scaleExpression({ x: { index: 1, texture: "textures/x" } }, "cw"), null, "no scaled character -> no client script");
    assert.deepStrictEqual([sp.scaleProperty(0.9), sp.scaleProperty(undefined), sp.scaleProperty(1.0444)], [900, 1000, 1044]);
});

test("textureTable lists base, glow and variant skins, plus the blank fallback only when something glows", () => {
    const t = sp.textureTable(chars);
    assert.strictEqual(t.species0, "textures/entity/a");
    assert.strictEqual(t.light0, "textures/entity/light/a");
    assert.strictEqual(t.species3_night, "textures/entity/b_n");
    assert.strictEqual(t.light3_night, "textures/entity/light/b_n");
    assert.strictEqual(t.species7_water, "textures/entity/c_w");
    assert.strictEqual(t.blank, sp.BLANK_TEXTURE);
    assert.strictEqual(sp.textureTable({ z: { index: 0, texture: "textures/z" } }).blank, undefined);
});

test("renderController: geometry/material per species from the rig, glow layer, skin variants", () => {
    const { controller, geometries, materials, emissive } = sp.renderController({ ns: "cw", key: "waifu", characters: chars, rigs, defaults });
    const rc = controller.render_controllers["controller.render.cw_waifu"];
    assert.ok(emissive);
    assert.deepStrictEqual(Object.values(geometries).sort(), ["geometry.humanoid.custom", "geometry.husband", "geometry.waifuB"]);
    assert.deepStrictEqual(Object.values(materials).sort(), ["skeleton", "skeleton2"]);
    const stride = 8;                       // max index 7 -> 8 slots per variant; defined variants: night, water -> 3 blocks
    assert.strictEqual(rc.arrays.textures["Array.cw_skin"].length, stride * 3);
    assert.strictEqual(rc.arrays.textures["Array.cw_glow"].length, stride * 3);
    assert.strictEqual(rc.arrays.geometry["Array.cw_geo"].length, stride);
    const skin = rc.arrays.textures["Array.cw_skin"], glow = rc.arrays.textures["Array.cw_glow"];
    assert.strictEqual(skin[0], "Texture.species0");
    assert.strictEqual(skin[stride + 3], "Texture.species3_night", "night block, species 3");
    assert.strictEqual(skin[stride + 0], "Texture.species0", "a character without a night skin keeps her default");
    assert.strictEqual(skin[2 * stride + 7], "Texture.species7_water");
    assert.strictEqual(glow[0], "Texture.light0");
    assert.strictEqual(glow[stride + 3], "Texture.light3_night");
    assert.strictEqual(glow[2 * stride + 7], "Texture.blank", "a variant skin without a glow texture shows none");
    assert.strictEqual(glow[3], "Texture.blank", "no default glow -> blank");
    // gaps fall back to the lowest-index character's visuals
    assert.strictEqual(skin[1], "Texture.species0");
    // the index expression picks the variant block: night is block 1, water block 2
    const idx = rc.textures[0].match(/\[(.*)\]$/)[1];
    for (const [variant, expect] of [[0, 3], [1, stride + 3], [2, 2 * stride + 3]]) assert.strictEqual(evalMolang(idx, { "cw:skin_variant": variant, "cw:species_index": 3 }), expect);
    assert.strictEqual(evalMolang(idx, { "cw:skin_variant": 3, "cw:species_index": 3 }), 3, "an undefined variant (waterNight) shows the default block");
});

test("renderController without skins or glow stays a single plain texture array", () => {
    const { controller, emissive } = sp.renderController({ ns: "cw", key: "waifu", characters: { a: { id: "a", index: 0, texture: "textures/a" } }, rigs: {}, defaults });
    const rc = controller.render_controllers["controller.render.cw_waifu"];
    assert.strictEqual(emissive, false);
    assert.deepStrictEqual(rc.textures, ["Array.cw_skin[q.property('cw:species_index')]"]);
    assert.strictEqual(rc.materials.length, 1);
});

test("featureExpression gates a shared animation to the rigs that list it", () => {
    const e = sp.featureExpression(rigs, "boobs", "cw");
    assert.strictEqual(evalMolang(e, { "cw:rig_index": 1 }), true);
    assert.strictEqual(evalMolang(e, { "cw:rig_index": 2 }), false);
    assert.strictEqual(sp.featureExpression(rigs, "tail", "cw"), "0");
});

// ---- content validation ----------------------------------------------------------------------
function project(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-species-"));
    for (const [rel, obj] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), JSON.stringify(obj));
    }
    return { patchesDir: dir };
}
const ok = { id: "a", index: 0, texture: "textures/entity/a" };

test("loadContent accepts the new character fields and loads rigs", () => {
    const c = loadContent(project({
        "rigs/wb.json": { index: 1, geometry: "geometry.waifuB", animate: ["boobs"] },
        "characters/a.json": { ...ok, rig: "wb", body: { scale: 0.9 }, emissiveTexture: "textures/entity/light/a", skins: { night: { texture: "textures/entity/a_n" } }, legacy: { types: ["ac:a"] } },
    }));
    assert.strictEqual(c.rigs.wb.id, "wb");
    assert.strictEqual(c.characters.a.legacy.types[0], "ac:a");
});

test("loadContent rejects bad rigs, scales, skins, textures and duplicate legacy claims with the file named", () => {
    const fail = (files, re) => assert.throws(() => loadContent(project(files)), re);
    fail({ "characters/a.json": { ...ok, rig: "nope" } }, /characters\/a: unknown rig "nope"/);
    fail({ "rigs/r.json": { index: 0, geometry: "waifu" }, "characters/a.json": ok }, /rigs\/r: "geometry" must be a geometry id/);
    fail({ "rigs/r.json": { geometry: "geometry.x" }, "characters/a.json": ok }, /rigs\/r: "index" must be a non-negative integer/);
    fail({ "rigs/r.json": { index: 1, geometry: "geometry.x" }, "rigs/s.json": { index: 1, geometry: "geometry.y" }, "characters/a.json": ok }, /rigs: index 1 used by both/);
    fail({ "characters/a.json": { ...ok, body: { scale: 0 } } }, /body\.scale must be a number between/);
    fail({ "characters/a.json": { ...ok, skins: { dusk: { texture: "textures/x" } } } }, /unknown skin variant "dusk"/);
    fail({ "characters/a.json": { ...ok, skins: { night: {} } } }, /skins\.night\.texture must be a texture path/);
    fail({ "characters/a.json": { ...ok, texture: "entity/a" } }, /"texture" must be a texture path/);
    fail({ "characters/a.json": { ...ok, legacy: { types: ["nope"] } } }, /legacy\.types must be a non-empty array/);
    fail({ "characters/a.json": { ...ok, legacy: { types: ["ac:x"] } }, "characters/b.json": { id: "b", index: 1, texture: "textures/b", legacy: { types: ["ac:x"] } } }, /legacy entity type "ac:x" claimed by both "a" and "b"/);
});

console.log(`\n${passed} passed`);
