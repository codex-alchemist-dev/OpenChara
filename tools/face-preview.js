// Face kit preview: draws a character's face with the kit on top, in several mouth/blink states, so the planes can be judged on a real skin.
//
//   node tools/face-preview.js <skin.png> [--mode full|talk] [--out face-preview.png] [--scale 12]
//
// A flat (front-on) rendering of the kit's front planes in head pixels; z-order is the kit's own (back to front). Not a 3D render: it shows
// where the planes sit and what blink/open/wide/closed do to them.
"use strict";
const fs = require("fs");
const path = require("path");
const { decodePng, encodePng, createImage, getPixel, setPixel, blendPixel } = require("../../MinUI/lib/png.js");
const { KIT, MODES } = require("../src/anim/faceKit.js");
const { derivePalette } = require("../src/anim/palette.js");
const { faceTransforms } = require("../src/anim/faceAnimations.js");

const STATES = [
    ["rest", { open: 0, wide: 1, closed: 1 }],
    ["open .5", { open: 0.5, wide: 1, closed: 0 }],
    ["open 1", { open: 1, wide: 1, closed: 0 }],
    ["open 1 narrow", { open: 1, wide: 0, closed: 0 }],
    ["blink", { open: 0, wide: 1, closed: 1, blink: 1 }],
];

/** A kit bone's accumulated transform (own plus parents') applied to a front-plane rectangle {x, y, w, h} in head units (y up). */
function transformed(rect, bone, byName, t) {
    let r = { ...rect };
    for (let b = bone; b; b = byName[b.parent]) {
        const tr = t[b.name];
        if (!tr) continue;
        const [px, py] = [b.pivot[0], b.pivot[1]];
        const [sx, sy] = tr.scale ?? [1, 1, 1];
        const [dx, dy] = tr.position ?? [0, 0, 0];
        r = { x: px + (r.x - px) * sx + dx, y: py + (r.y - py) * sy + dy, w: r.w * sx, h: r.h * sy };
    }
    return r;
}

function drawFace(skin, mode, state, scale, palette) {
    const img = createImage(8 * scale, 8 * scale);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {   // the skin's own face, hat layer on top
        let c = getPixel(skin, 8 + x, 8 + y);
        const h = getPixel(skin, 40 + x, 8 + y);
        if (h[3] > 0) c = h;
        for (let j = 0; j < scale; j++) for (let i = 0; i < scale; i++) setPixel(img, x * scale + i, y * scale + j, c);
    }
    const wanted = MODES[mode];
    const byName = Object.fromEntries(KIT.map(k => [k.name, k]));
    const t = faceTransforms({ ...state, talkOnly: mode === "talk" });
    const fill = (r, color) => {
        const x0 = Math.max(0, Math.round((r.x + 4) * scale)), x1 = Math.min(8 * scale, Math.round((r.x + r.w + 4) * scale));
        const y0 = Math.max(0, Math.round((32 - (r.y + r.h)) * scale)), y1 = Math.min(8 * scale, Math.round((32 - r.y) * scale));
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) blendPixel(img, x, y, [color[0], color[1], color[2], 255]);
    };
    // paint back to front: cover, eyes, lids, mouth, teeth. The brow stays hidden until an expression pose shows it (restAnimation).
    for (const name of ["cover", "eyeL", "eyeR", "lidUpperL", "lidUpperR", "lidLowerL", "lidLowerR", "mouth", "teethBottom", "teethTop"]) {
        const k = byName[name];
        if (!k?.cube || !wanted.has(name)) continue;
        const r = { x: k.cube.origin[0], y: k.cube.origin[1], w: k.cube.size[0], h: k.cube.size[1] };
        const flat = name === "brow" ? { ...r, h: 1 } : r;
        const tr = transformed(flat, k, byName, t);
        if (tr.w <= 0.001 || tr.h <= 0.001) continue;
        fill(tr, palette[k.color]);
    }
    return img;
}

function main() {
    const a = process.argv.slice(2);
    const file = a.find(x => !x.startsWith("--") && x.endsWith(".png"));
    if (!file) throw new Error("usage: node tools/face-preview.js <skin.png> [--mode full|talk] [--out file.png] [--scale 12]");
    const opt = n => (a.includes(n) ? a[a.indexOf(n) + 1] : undefined);
    const mode = opt("--mode") ?? "full", scale = Number(opt("--scale") ?? 12), out = opt("--out") ?? "face-preview.png";
    if (!MODES[mode]) throw new Error(`mode must be one of ${Object.keys(MODES).join(", ")}`);
    const skin = decodePng(fs.readFileSync(file));
    const palette = derivePalette(skin);
    const sheet = createImage(STATES.length * (8 * scale + 8), 8 * scale + 8);
    STATES.forEach(([, state], i) => {
        const face = drawFace(skin, mode, state, scale, palette);
        for (let y = 0; y < face.height; y++) for (let x = 0; x < face.width; x++) setPixel(sheet, 4 + i * (8 * scale + 8) + x, 4 + y, getPixel(face, x, y));
    });
    fs.writeFileSync(out, encodePng(sheet));
    console.log(`${path.basename(file)}: ${STATES.map(s => s[0]).join(" | ")} -> ${out}`);
}

if (require.main === module) {
    try { main(); } catch (e) { console.error(e.message); process.exit(1); }
}
module.exports = { drawFace, STATES };
