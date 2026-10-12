// Tests for the animation/face tooling (src/anim). Run: node test/anim.test.mjs
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const kit = require("../src/anim/faceKit.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); } catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

const geo = (extra = {}) => ({
    description: { identifier: "geometry.t", texture_width: 64, texture_height: 64, ...extra.description },
    bones: [
        { name: "root", pivot: [0, 0, 0] },
        { name: "h3ad", parent: "root", pivot: [0, 24, 0], cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0] }] },
        ...(extra.bones ?? []),
    ],
});
const byName = g => Object.fromEntries(g.bones.map(b => [b.name, b]));

test("default head reproduces the decoded reference numbers exactly", () => {
    const g = kit.injectFaceKit(geo(), { headBone: "h3ad" });
    const b = byName(g);
    assert.deepStrictEqual(b.eyeL.cubes[0].origin, [0.975, 26.975, -3.975]);
    assert.deepStrictEqual(b.eyeL.pivot, [1.5, 27.5, -3.975]);
    assert.deepStrictEqual(b.eyeR.cubes[0].origin, [-2.025, 26.975, -3.975]);
    assert.deepStrictEqual(b.lidUpperL.cubes[0].size, [2.05, 1.025, 0]);
    assert.deepStrictEqual(b.lidUpper.pivot, [0, 29, -4]);
    assert.deepStrictEqual(b.brow.cubes[0].origin, [-3.05, 28, -4.15]);
    assert.deepStrictEqual(b.mouth.cubes[0].origin, [-2, 25, -4.025]);
    assert.deepStrictEqual(b.mouth.pivot, [0, 25.5, -4.0125]);
    assert.deepStrictEqual(b.teethTop.cubes[0].size, [4.05, 0.5, 0.05]);
    assert.strictEqual(b.face.parent, "h3ad");
    assert.strictEqual(b.lidUpperL.parent, "lidUpper");
});

test("the kit hangs from the head bone and adds only the expected bones", () => {
    const g = kit.injectFaceKit(geo(), { headBone: "h3ad" });
    assert.deepStrictEqual(g.bones.slice(2).map(b => b.name), ["face", "eyeL", "eyeR", "lidUpper", "lidUpperL", "lidUpperR", "lidLower", "lidLowerL", "lidLowerR", "brow", "mouth", "teethTop", "teethBottom"]);
    assert.deepStrictEqual(kit.FACE_BONES.slice().sort(), g.bones.slice(2).map(b => b.name).sort());
    assert.strictEqual(g.bones.length, 15, "the original bones are kept");
});

test("a chibi head (origin y 12, z -4.5) shifts the whole kit down and back", () => {
    const g = geo();
    g.bones[1].cubes[0].origin = [-4, 12, -4.5];
    const k = byName(kit.injectFaceKit(g, { headBone: "h3ad" }));
    assert.deepStrictEqual(k.eyeL.cubes[0].origin, [0.975, 14.975, -4.475]);
    assert.deepStrictEqual(k.face.pivot, [0, 12, 0 + (-4.5 + 4)]);
});

test("a bigger head scales the kit about the front-bottom-center", () => {
    const g = geo();
    g.bones[1].cubes[0] = { origin: [-5, 24, -5], size: [10, 10, 10], uv: [0, 0] };
    const k = byName(kit.injectFaceKit(g, { headBone: "h3ad" }));
    assert.deepStrictEqual(k.mouth.cubes[0].size, [5, 1.25, 0.03125]);
    assert.deepStrictEqual(k.eyeR.pivot, [-1.875, 28.375, -4.96875]);
});

test("every plane samples inside its palette pixel, for any texture size", () => {
    for (const [W, H] of [[64, 64], [64, 85], [128, 128], [96, 64]]) {
        const g = kit.injectFaceKit(geo({ description: { texture_width: W, texture_height: H } }), { headBone: "h3ad" });
        for (const b of g.bones) for (const c of b.cubes ?? []) {
            if (!c.uv.north) continue;
            const { uv, uv_size } = c.uv.north;
            assert.ok(uv[0] >= 0 && uv[0] + uv_size[0] <= W && uv[1] >= 0 && uv[1] + uv_size[1] <= H);
            const px = Math.floor(uv[0] / (W / kit.PALETTE_SIZE)), pxEnd = Math.floor((uv[0] + uv_size[0]) / (W / kit.PALETTE_SIZE));
            assert.strictEqual(px, pxEnd, `${b.name} stays in one palette pixel at ${W}x${H}`);
            assert.strictEqual(Math.floor(uv[1] / (H / kit.PALETTE_SIZE)), 0, "row 0");
        }
    }
    const b = byName(kit.injectFaceKit(geo(), { headBone: "h3ad" }));
    assert.strictEqual(Math.floor(b.eyeL.cubes[0].uv.north.uv[0] / 4), kit.PALETTE.eye);
    assert.strictEqual(Math.floor(b.mouth.cubes[0].uv.north.uv[0] / 4), kit.PALETTE.mouth);
    assert.strictEqual(Math.floor(b.teethTop.cubes[0].uv.north.uv[0] / 4), kit.PALETTE.teeth);
});

test("name collisions are refused, a prefix resolves them, a missing head bone is refused", () => {
    const g = geo({ bones: [{ name: "mouth", parent: "h3ad", pivot: [0, 25, -4] }] });
    assert.throws(() => kit.injectFaceKit(g, { headBone: "h3ad" }), /already has a bone "mouth"/);
    const ok = kit.injectFaceKit(g, { headBone: "h3ad", prefix: "oc_" });
    assert.ok(ok.bones.some(b => b.name === "oc_mouth") && ok.bones.some(b => b.name === "mouth"));
    assert.throws(() => kit.injectFaceKit(geo(), { headBone: "head" }), /no bone "head"/);
});

test("visibility: the body controller hides the kit, the face controller shows only the kit", () => {
    const v = kit.visibility();
    assert.strictEqual(v.body.length, kit.CUBE_BONES.length);
    assert.ok(v.body.every(o => Object.values(o)[0] === false));
    assert.deepStrictEqual(v.face[0], { "*": false });
    assert.ok(v.face.slice(1).every(o => Object.values(o)[0] === true));
    assert.deepStrictEqual(kit.visibility("oc_").face[1], { oc_eyeL: true });
});

test("findHeadAnchor reads the head cube and rejects non-cubes", () => {
    assert.deepStrictEqual(kit.findHeadAnchor(geo(), "h3ad"), { origin: [-4, 24, -4], size: 8 });
    const g = geo();
    g.bones[1].cubes[0].size = [8, 4, 8];
    assert.strictEqual(kit.findHeadAnchor(g, "h3ad"), null);
});

// the real AC geometries, when AC is checked out next to this repo
const AC = path.resolve(import.meta.dirname, "../../Anime Characters [patched]/Anime Characters 10.0.10 R/models/entity");
test("the kit fits every real AC geometry (skipped if AC is not present)", () => {
    if (!fs.existsSync(AC)) { console.log("  (AC not found, skipped)"); return; }
    let n = 0, fitted = 0;
    const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of walk(AC).filter(f => f.endsWith(".json"))) {
        let doc;
        try { doc = JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, "")); } catch (e) { continue; }
        for (const g of doc["minecraft:geometry"] ?? []) {
            const head = g.bones.find(b => b.name === "h3ad");
            if (!head) continue;
            n++;
            const out = kit.injectFaceKit(g, { headBone: "h3ad", prefix: "oc_" });
            assert.strictEqual(out.bones.length, g.bones.length + kit.FACE_BONES.length);
            fitted++;
        }
    }
    assert.ok(n >= 50, `found ${n} AC geometries`);
    assert.strictEqual(fitted, n);
});

console.log(`\n${passed} passed`);
