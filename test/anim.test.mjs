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

test("default head reproduces the decoded reference layout (shifted forward of the head's front face, order kept)", () => {
    const g = kit.injectFaceKit(geo(), { headBone: "h3ad" });
    const b = byName(g);
    const Z = z => Math.round((z + kit.FRONT_SHIFT) * 1e5) / 1e5;
    assert.deepStrictEqual(b.eyeL.cubes[0].origin, [1, 27, Z(-3.975)], "eyes are 2x1 like a standard skin's");
    assert.deepStrictEqual(b.eyeL.cubes[0].size, [2, 1, 0]);
    assert.deepStrictEqual(b.eyeR.cubes[0].origin, [-3, 27, Z(-3.975)]);
    assert.deepStrictEqual(b.lidUpperL.cubes[0].size, [2.05, 1.025, 0]);
    assert.deepStrictEqual(b.lidUpper.pivot, [0, 29, Z(-4)]);
    assert.deepStrictEqual(b.brow.cubes[0].size, [6, 1, 1]);
    assert.deepStrictEqual(b.mouth.cubes[0].origin, [-2, 25, Z(-4.025)]);
    assert.deepStrictEqual(b.teethTop.cubes[0].size, [4.05, 0.5, 0.05]);
    assert.deepStrictEqual(b.cover.cubes[0].size, [8, 8, 0]);
    assert.strictEqual(b.face.parent, "h3ad");
    assert.strictEqual(b.lidUpperL.parent, "lidUpper");
    // layering (front-most first): brow, teeth, mouth, lids, eyes, cover - the reference order
    const zs = n => b[n].cubes[0].origin[2];
    assert.ok(zs("brow") < zs("teethTop") && zs("teethTop") < zs("mouth") && zs("mouth") < zs("lidUpperL") && zs("lidUpperL") < zs("eyeL") && zs("eyeL") < zs("cover"));
    assert.ok(zs("cover") < -4, "every plane is in front of the head's front face (z -4)");
});

test("the kit hangs from the head bone and adds only the expected bones", () => {
    const g = kit.injectFaceKit(geo(), { headBone: "h3ad" });
    assert.deepStrictEqual(g.bones.slice(2).map(b => b.name), ["face", "cover", "eyeL", "eyeR", "lidUpper", "lidUpperL", "lidUpperR", "lidLower", "lidLowerL", "lidLowerR", "brow", "mouth", "teethTop", "teethBottom"]);
    assert.deepStrictEqual(kit.FACE_BONES.slice().sort(), g.bones.slice(2).map(b => b.name).sort());
    assert.strictEqual(g.bones.length, 16, "the original bones are kept");
});

test("a chibi head (origin y 12, z -4.5) shifts the whole kit down and back", () => {
    const g = geo();
    g.bones[1].cubes[0].origin = [-4, 12, -4.5];
    const k = byName(kit.injectFaceKit(g, { headBone: "h3ad" }));
    assert.deepStrictEqual(k.eyeL.cubes[0].origin, [1, 15, -4.535]);
    assert.deepStrictEqual(k.face.pivot, [0, 12, -0.5]);
});

test("a bigger head scales the kit about the front-bottom-center", () => {
    const g = geo();
    g.bones[1].cubes[0] = { origin: [-5, 24, -5], size: [10, 10, 10], uv: [0, 0] };
    const k = byName(kit.injectFaceKit(g, { headBone: "h3ad" }));
    assert.deepStrictEqual(k.mouth.cubes[0].size, [5, 1.25, 0.03125]);
    assert.deepStrictEqual(k.eyeR.pivot, [-2.5, 28.375, -4.96875 + kit.FRONT_SHIFT * 1.25 + 0.03125 * 0 - 0.03125 * 0 - 0.03125 * 0 + 0]);
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
    assert.strictEqual(kit.visibility("", "talk").body.length, 3);
    assert.ok(v.body.every(o => Object.values(o)[0] === false));
    assert.deepStrictEqual(v.face[0], { "*": false });
    assert.ok(v.face.slice(1).every(o => Object.values(o)[0] === true));
    assert.deepStrictEqual(kit.visibility("oc_").face[1], { oc_cover: true });
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
            assert.strictEqual(kit.injectFaceKit(g, { headBone: "h3ad", prefix: "oc_", mode: "talk" }).bones.length, g.bones.length + 4);
            fitted++;
        }
    }
    assert.ok(n >= 50, `found ${n} AC geometries`);
    assert.strictEqual(fitted, n);
});

// ---- palette --------------------------------------------------------------------------------
const pal = require("../src/anim/palette.js");
function skinImage(w = 64, h = 64) {
    const data = new Uint8Array(w * h * 4);
    const set = (x, y, c) => data.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
    for (let y = 8; y < 16; y++) for (let x = 8; x < 16; x++) set(x, y, [240, 200, 170]);     // face skin
    for (let x = 8; x < 16; x++) { set(x, 8, [60, 40, 20]); }                                  // hair line (face row 0)
    for (const x of [9, 10, 13, 14]) set(x, 12, [20, 90, 160]);                                // eyes (face row 4)
    for (const x of [11, 12]) set(x, 14, [180, 60, 70]);                                       // mouth (face row 6)
    return { width: w, height: h, data };
}

test("derivePalette reads a standard skin: skin tone, hair-line brow, eye, mouth", () => {
    const p = pal.derivePalette(skinImage());
    assert.deepStrictEqual(p.skin, [240, 200, 170, 255]);
    assert.deepStrictEqual(p.eye, [20, 90, 160, 255]);
    assert.deepStrictEqual(p.mouth, [180, 60, 70, 255]);
    assert.deepStrictEqual(p.lid, p.skin, "lids are skin colored");
    assert.ok(p.brow[0] < 100 && p.brow[2] < 60, "brow follows the dark hair line");
    assert.deepStrictEqual(p.teeth, [245, 245, 245, 255]);
});

test("derivePalette handles hi-res skins and never throws on empty or odd images", () => {
    const big = skinImage();
    const scaled = { width: 128, height: 128, data: new Uint8Array(128 * 128 * 4) };
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) scaled.data.set(big.data.slice(((y >> 1) * 64 + (x >> 1)) * 4, ((y >> 1) * 64 + (x >> 1)) * 4 + 4), (y * 128 + x) * 4);
    assert.deepStrictEqual(pal.derivePalette(scaled).eye, [20, 90, 160, 255]);
    const empty = { width: 64, height: 64, data: new Uint8Array(64 * 64 * 4) };
    const e = pal.derivePalette(empty);
    for (const k of Object.keys(kit.PALETTE)) assert.strictEqual(e[k].length, 4, k);
});

test("a skin with no visible mouth gets a mouth tone derived from its skin, darker inside color", () => {
    const img = skinImage();
    for (const x of [11, 12]) img.data.set([240, 200, 170, 255], (14 * 64 + x) * 4);
    const p = pal.derivePalette(img);
    assert.notDeepStrictEqual(p.mouth, p.skin);
    assert.ok(p.inside[0] < p.mouth[0]);
});

test("paletteImage puts each color in its pixel of row 0 and is 16x16", () => {
    const im = pal.paletteImage(pal.derivePalette(skinImage()));
    assert.deepStrictEqual([im.width, im.height], [16, 16]);
    const at = i => Array.from(im.data.slice(i * 4, i * 4 + 4));
    assert.deepStrictEqual(at(kit.PALETTE.eye), [20, 90, 160, 255]);
    assert.deepStrictEqual(at(kit.PALETTE.teeth), [245, 245, 245, 255]);
    assert.strictEqual(at(10)[3], 0, "unused pixels are transparent");
});

// ---- face animations ------------------------------------------------------------------------
const fa = require("../src/anim/faceAnimations.js");
// Molang's arithmetic subset is valid JavaScript: evaluate an expression with the face variables substituted
const evalM = (expr, vars) => {
    if (typeof expr === "number") return expr;
    const js = expr.replace(/v\.oc_(\w+)/g, (_, k) => String(vars[k] ?? 0)).replace(/\?\?/g, "||");
    return Function(`"use strict"; return (${js});`)();
};

test("the generated Molang agrees with the plain math for every mouth state", () => {
    const anim = fa.mouthAnimation();
    for (const open of fa.OPEN_LEVELS) for (const wide of fa.WIDE_LEVELS) for (const closed of [0, 1]) for (const chibi of [0, 1]) {
        const vars = { open, wide, closed, chibi };
        const want = fa.faceTransforms({ open, wide, closed, chibi: Boolean(chibi) });
        for (const bone of ["mouth", "teethTop", "teethBottom"]) {
            const got = anim.bones[bone];
            if (got.scale) got.scale.forEach((e, i) => assert.ok(Math.abs(evalM(e, vars) - want[bone].scale[i]) < 1e-9, `${bone} scale[${i}] at ${JSON.stringify(vars)}`));
            if (got.position) got.position.forEach((e, i) => assert.ok(Math.abs(evalM(e, vars) - want[bone].position[i]) < 1e-9, `${bone} position[${i}] at ${JSON.stringify(vars)}`));
        }
    }
});

test("a closed mouth collapses the teeth; an open one moves the teeth apart and stretches the mouth", () => {
    const shut = fa.faceTransforms({ open: 0, wide: 1, closed: 1 });
    assert.deepStrictEqual(shut.teethTop.scale, [0, 0, 0]);
    const big = fa.faceTransforms({ open: 1, wide: 1, closed: 0 });
    assert.deepStrictEqual([big.teethTop.position[1], big.teethBottom.position[1]], [0.75, -0.75]);
    assert.strictEqual(big.mouth.scale[1], 2.5);
    assert.strictEqual(fa.faceTransforms({ open: 1, chibi: true }).teethTop.position[1], 1.5);
});

test("the blink closes both lids for 0.15 s with a random delay, and overrides lid animation", () => {
    const b = fa.blinkAnimation();
    assert.strictEqual(b.animation_length, 0.15);
    assert.strictEqual(b.override_previous_animation, true);
    assert.strictEqual(b.loop_delay, "Math.random(0.5,2.5)");
    assert.deepStrictEqual(b.bones.lidUpper.scale, [1, "2.02", 1]);
    assert.deepStrictEqual(fa.faceTransforms({ blink: 1 }).lidLower.scale, [1, 2.02, 1]);
    assert.strictEqual(fa.faceTransforms({ blink: 0 }).lidUpper, undefined);
});

test("every animated bone exists in the face kit and the defaults keep the mouth closed", () => {
    for (const a of [fa.mouthAnimation(), fa.blinkAnimation()]) for (const bone of Object.keys(a.bones)) assert.ok(kit.FACE_BONES.includes(bone), bone);
    assert.deepStrictEqual(fa.faceVariableDefaults(), ["v.oc_open=v.oc_open??0;", "v.oc_wide=v.oc_wide??1;", "v.oc_closed=v.oc_closed??1;"]);
});


test("talk mode: only mouth + teeth exist, and a closed mouth vanishes (math and Molang agree)", () => {
    const g = kit.injectFaceKit(geo(), { headBone: "h3ad", mode: "talk" });
    assert.deepStrictEqual(g.bones.slice(-4).map(b => b.name), ["face", "mouth", "teethTop", "teethBottom"]);
    const closed = fa.faceTransforms({ closed: 1, talkOnly: true });
    assert.deepStrictEqual(closed.mouth.scale, [0, 0, 1]);
    const open = fa.faceTransforms({ open: 1, wide: 1, closed: 0, talkOnly: true });
    assert.deepStrictEqual(open.mouth.scale, [1, 2.5, 1]);
    assert.ok(fa.mouthAnimation({ talkOnly: true }).bones.mouth.scale[0].includes("(1-v.oc_closed)"));
    assert.deepStrictEqual(fa.restAnimation().bones.brow.scale, [1, 0, 1]);
});
console.log(`\n${passed} passed`);
