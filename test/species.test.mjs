// Plain-Node tests for per-character visuals (src/build/species.js) and the character/rig/overlay/form validation. Run: node test/species.test.mjs
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
    b: { id: "b", index: 3, texture: "textures/entity/b", skins: { night: { texture: "textures/entity/b_n", emissiveTexture: "textures/entity/light/b_n" }, hunt: { texture: "textures/entity/b_h" } }, rig: "hus" },
    c: { id: "c", index: 7, texture: "textures/entity/c", body: { scale: 1.05 } },
};
const rigs = { wb: { id: "wb", index: 1, geometry: "geometry.waifuB", animate: ["boobs"] }, hus: { id: "hus", index: 2, geometry: "geometry.husband", material: "skeleton2" } };
const defaults = { geometry: "geometry.humanoid.custom", material: "skeleton" };
const overlays = { dirt: { id: "dirt", levels: { "*": ["textures/oc/dirt1", "textures/oc/dirt2"], hus: ["textures/oc/dirt_h1", "textures/oc/dirt_h2"] } } };

test("skinList gives every skin of every character a stable global id, default first, others sorted", () => {
    const list = sp.skinList(chars);
    assert.deepStrictEqual(list.map(s => `${s.char}:${s.name}:${s.id}`), ["a:default:0", "b:default:1", "b:hunt:2", "b:night:3", "c:default:4"]);
    assert.deepStrictEqual(sp.skinIds(chars), { a: { default: 0 }, b: { default: 1, hunt: 2, night: 3 }, c: { default: 4 } });
});

test("textureTable lists skin and glow textures by global id, overlay levels, and the blank fallback only when needed", () => {
    const t = sp.textureTable(chars, overlays);
    assert.strictEqual(t.skin0, "textures/entity/a");
    assert.strictEqual(t.glow0, "textures/entity/light/a");
    assert.strictEqual(t.skin3, "textures/entity/b_n");
    assert.strictEqual(t.glow3, "textures/entity/light/b_n");
    assert.strictEqual(t.skin2, "textures/entity/b_h");
    assert.strictEqual(t.glow2, undefined);
    assert.strictEqual(t.ov_dirt___2, "textures/oc/dirt2");
    assert.strictEqual(t.ov_dirt_hus_1, "textures/oc/dirt_h1");
    assert.strictEqual(t.blank, sp.BLANK_TEXTURE);
    assert.strictEqual(sp.textureTable({ z: { id: "z", index: 0, texture: "textures/z" } }).blank, undefined);
});

test("renderController: geometry/material by species, base texture by skin_id, glow layer, overlay layers by rig and level", () => {
    const { controller, geometries, materials, emissive, skinCount, overlayProperties } = sp.renderController({ ns: "cw", key: "waifu", characters: chars, rigs, overlays, defaults });
    const rc = controller.render_controllers["controller.render.cw_waifu"];
    assert.ok(emissive);
    assert.strictEqual(skinCount, 5);
    assert.deepStrictEqual(Object.values(geometries).sort(), ["geometry.humanoid.custom", "geometry.husband", "geometry.waifuB"]);
    assert.strictEqual(materials.glow, "entity_emissive_alpha");
    assert.strictEqual(materials.ov_dirt, "entity_alpha");
    assert.deepStrictEqual(rc.arrays.textures["Array.cw_skin"], ["Texture.skin0", "Texture.skin1", "Texture.skin2", "Texture.skin3", "Texture.skin4"]);
    assert.deepStrictEqual(rc.arrays.textures["Array.cw_glow"], ["Texture.glow0", "Texture.blank", "Texture.blank", "Texture.glow3", "Texture.blank"]);
    assert.strictEqual(rc.arrays.geometry["Array.cw_geo"].length, 8);
    assert.strictEqual(rc.textures[0], "Array.cw_skin[q.property('cw:skin_id')]");
    assert.deepStrictEqual(overlayProperties, { "cw:ov_dirt": { type: "int", range: [0, 2], default: 0, client_sync: true } });
    // overlay index = rig_index * 3 + level: rig 0 (none) -> "*" textures, rig 1 (wb) -> "*", rig 2 (hus) -> its own
    const dirt = rc.arrays.textures["Array.cw_ov_dirt"];
    assert.deepStrictEqual(dirt.slice(0, 3), ["Texture.blank", "Texture.ov_dirt___1", "Texture.ov_dirt___2"]);
    assert.deepStrictEqual(dirt.slice(6, 9), ["Texture.blank", "Texture.ov_dirt_hus_1", "Texture.ov_dirt_hus_2"]);
    const idx = rc.textures[2].match(/\[(.*)\]$/)[1];
    assert.strictEqual(evalMolang(idx, { "cw:rig_index": 2, "cw:ov_dirt": 1 }), 7);
});

test("renderController without glow or overlays stays a plain skin array", () => {
    const { controller, emissive } = sp.renderController({ ns: "cw", key: "waifu", characters: { a: { id: "a", index: 0, texture: "textures/a" } }, rigs: {}, defaults });
    const rc = controller.render_controllers["controller.render.cw_waifu"];
    assert.strictEqual(emissive, false);
    assert.strictEqual(rc.textures.length, 1);
    assert.strictEqual(rc.materials.length, 1);
});

test("lookupExpr returns each value for its index and the fallback elsewhere", () => {
    const pairs = [[2, 5], [9, 7], [4, 3], [100, 11], [101, 13]];
    for (const [i, v] of pairs) assert.strictEqual(evalMolang(sp.lookupExpr(pairs, "q.property('x')", 1), { x: i }), v);
    for (const i of [0, 3, 5, 99, 102, 5000]) assert.strictEqual(evalMolang(sp.lookupExpr(pairs, "q.property('x')", 1), { x: i }), 1);
    assert.strictEqual(sp.lookupExpr([], "q.property('x')", 4), "4");
});

test("scale and rig-feature expressions read the body_scale / rig_index properties", () => {
    assert.strictEqual(evalMolang(sp.scaleExpression(chars, "cw"), { "cw:body_scale": 900 }), 0.9);
    assert.strictEqual(sp.scaleExpression({ x: { index: 1, texture: "textures/x" } }, "cw"), null);
    assert.deepStrictEqual([sp.scaleProperty(0.9), sp.scaleProperty(undefined), sp.scaleProperty(1.0444)], [900, 1000, 1044]);
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
const fail = (files, re) => assert.throws(() => loadContent(project(files)), re);

test("loadContent accepts the full set of look fields: rigs, overlays, skins, rules, forms", () => {
    const c = loadContent(project({
        "rigs/wb.json": { index: 1, geometry: "geometry.waifuB", animate: ["boobs"] },
        "overlays/dirt.json": { levels: { "*": ["textures/oc/d1", "textures/oc/d2"] }, drive: { source: "dirt", thresholds: [0.3, 0.7] } },
        "classes/hunt.json": { displayName: "Hunt" },
        "classes/pres.json": { displayName: "Pres" },
        "characters/a.json": {
            ...ok, rig: "wb", body: { scale: 0.9 }, emissiveTexture: "textures/entity/light/a", legacy: { types: ["ac:a"] },
            skins: { night: { texture: "textures/entity/a_n" }, hunt: { texture: "textures/entity/a_h" }, hunt_night: { texture: "textures/entity/a_hn" } },
            skinRules: [{ skin: "hunt_night", priority: 20, when: { form: "hunt", time: "night", not: { random: { name: "x", of: 3, is: 0 } } } }, { skin: "night", when: { any: [{ time: "night" }, { dimension: "the_end" }] } }],
            forms: { hunt: { class: "hunt", skin: "hunt", weapons: ["sword"], tactics: [{ when: { nearestEnemy: { lt: 4 } }, score: 2, urgent: true }] }, preservation: { class: "pres", weapons: ["bow"] } },
            defaultForm: "hunt", formPolicy: { mode: "tactical", minDwellSeconds: 6 },
        },
    }));
    assert.strictEqual(c.rigs.wb.id, "wb");
    assert.strictEqual(c.overlays.dirt.id, "dirt");
    assert.strictEqual(c.characters.a.forms.hunt.class, "hunt");
});

test("loadContent rejects bad rigs, scales, skins, textures, legacy claims and overlays with the file named", () => {
    fail({ "characters/a.json": { ...ok, rig: "nope" } }, /characters\/a: unknown rig "nope"/);
    fail({ "rigs/r.json": { index: 0, geometry: "waifu" }, "characters/a.json": ok }, /rigs\/r: "geometry" must be a geometry id/);
    fail({ "rigs/r.json": { geometry: "geometry.x" }, "characters/a.json": ok }, /rigs\/r: "index" must be a non-negative integer/);
    fail({ "rigs/r.json": { index: 1, geometry: "geometry.x" }, "rigs/s.json": { index: 1, geometry: "geometry.y" }, "characters/a.json": ok }, /rigs: index 1 used by both/);
    fail({ "characters/a.json": { ...ok, body: { scale: 0 } } }, /body\.scale must be a number between/);
    fail({ "characters/a.json": { ...ok, skins: { "Bad-Name": { texture: "textures/x" } } } }, /skin name "Bad-Name"/);
    fail({ "characters/a.json": { ...ok, skins: { default: { texture: "textures/x" } } } }, /not be "default"/);
    fail({ "characters/a.json": { ...ok, skins: { night: {} } } }, /skins\.night\.texture must be a texture path/);
    fail({ "characters/a.json": { ...ok, texture: "entity/a" } }, /"texture" must be a texture path/);
    fail({ "characters/a.json": { ...ok, legacy: { types: ["nope"] } } }, /legacy\.types must be a non-empty array/);
    fail({ "characters/a.json": { ...ok, legacy: { types: ["ac:x"] } }, "characters/b.json": { id: "b", index: 1, texture: "textures/b", legacy: { types: ["ac:x"] } } }, /legacy entity type "ac:x" claimed by both "a" and "b"/);
    fail({ "overlays/Bad.json": { levels: { "*": ["textures/x"] } } }, /overlays\/Bad: id must start with a lowercase/);
    fail({ "overlays/d.json": { levels: { nope: ["textures/x"] } } }, /levels\.nope: unknown rig/);
    fail({ "overlays/d.json": { levels: { "*": ["textures/x"] }, drive: { source: "dirt", thresholds: [0.5, 0.2] } } }, /ascending/);
    fail({ "overlays/d.json": { levels: { "*": ["textures/x"] }, drive: { source: "dirt", thresholds: [0.2, 0.5] } } }, /only cover 1/);
});

test("loadContent rejects bad skin rules and forms", () => {
    const withSkin = extra => ({ "characters/a.json": { ...ok, skins: { night: { texture: "textures/n" } }, ...extra } });
    fail(withSkin({ skinRules: [{ skin: "dawn", when: {} }] }), /skinRules\[0\]\.skin "dawn" is not one of her skins/);
    fail(withSkin({ skinRules: [{ skin: "night", when: [] }] }), /skinRules\[0\]\.when must be an object/);
    fail(withSkin({ skinRules: [{ skin: "night", when: { all: [] } }] }), /when\.all must be a non-empty array/);
    fail(withSkin({ skinRules: [{ skin: "night", when: { "Bad": 1 } }] }), /not a valid condition name/);
    fail(withSkin({ forms: { hunt: { class: "ghost" } }, defaultForm: "hunt" }), /forms\.hunt\.class "ghost" is not a class/);
    fail(withSkin({ forms: { hunt: { skin: "dawn" } }, defaultForm: "hunt" }), /forms\.hunt\.skin "dawn" is not one of her skins/);
    fail(withSkin({ forms: { hunt: {} } }), /"defaultForm" must name one of her forms/);
    fail(withSkin({ forms: { hunt: { tactics: [{ when: {}, score: "x" }] } }, defaultForm: "hunt" }), /tactics\[0\]\.score must be a number/);
    fail(withSkin({ forms: { hunt: {} }, defaultForm: "hunt", formPolicy: { mode: "chaos" } }), /formPolicy\.mode "chaos"/);
    fail(withSkin({ defaultForm: "hunt" }), /need a "forms" table/);
});

console.log(`\n${passed} passed`);
