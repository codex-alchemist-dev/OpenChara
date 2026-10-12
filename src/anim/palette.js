// Derives the face palette (the 16x16 texture the face kit samples) from a character's own skin. Pure: takes pixel data
// ({ width, height, data: RGBA bytes }) and returns colors; png.js-style helpers turn them into an image.
//
// A standard 64x64 Minecraft skin has the face at (8,8)-(16,16) and the hat layer at (40,8)-(48,16). Inside the 8x8 face:
// eyes on row 4 (columns 1-2 and 5-6), mouth on row 6 (columns 3-4), hair line on rows 0-1. Skins that follow the layout give
// good colors; others fall back to the dominant colors of the face region, then to defaults. Nothing here can fail on a real image.
"use strict";

const { PALETTE, PALETTE_SIZE } = require("./faceKit.js");

const DEFAULTS = { skin: [242, 205, 177, 255], eye: [40, 40, 60, 255], lid: [242, 205, 177, 255], brow: [90, 60, 40, 255], mouth: [190, 100, 100, 255], inside: [110, 40, 50, 255], teeth: [245, 245, 245, 255], blush: [235, 150, 150, 255] };

const px = (img, x, y) => {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null;
    const i = (y * img.width + x) * 4;
    const a = img.data[i + 3];
    return a < 128 ? null : [img.data[i], img.data[i + 1], img.data[i + 2], 255];
};
const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const mix = (a, b, t) => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t)).concat(255);
const darker = (c, t) => mix(c, [0, 0, 0, 255], t);

/** The most common color of a list (colors quantized to 16 levels so near-identical shades count together), as the first real sample of that bucket. */
function dominant(colors) {
    const buckets = new Map();
    for (const c of colors) {
        if (!c) continue;
        const k = c.slice(0, 3).map(v => v >> 4).join(",");
        const b = buckets.get(k) ?? { n: 0, c };
        b.n++;
        buckets.set(k, b);
    }
    let best = null;
    for (const b of buckets.values()) if (!best || b.n > best.n) best = b;
    return best ? best.c : null;
}

const rect = (img, x0, y0, w, h) => {
    const out = [];
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) out.push(px(img, x, y));
    return out;
};

/**
 * @param {{width:number,height:number,data:Uint8Array}} img  the character's skin
 * @param {{face?: number[], hat?: number[]}} [layout]  face and hat-layer rects [x,y,w,h]; defaults are the standard 64x64 skin
 * @returns {Record<keyof typeof PALETTE, number[]>} RGBA per palette color
 */
function derivePalette(img, layout = {}) {
    const scale = img.width / 64;                       // hi-res skins (128x128...) scale the same layout
    const [fx, fy, fw, fh] = (layout.face ?? [8, 8, 8, 8]).map(v => v * scale);
    const cell = fw / 8;                                // one face "pixel" in texture pixels
    const at = (cx, cy) => px(img, Math.floor(fx + (cx + 0.5) * cell), Math.floor(fy + (cy + 0.5) * cell));

    const faceAll = rect(img, fx, fy, fw, fh);
    // skin: the dominant color of the lower face (cheeks/chin), where there is no hair or features
    const skin = dominant(rect(img, fx, fy + 4 * cell, fw, 4 * cell)) ?? dominant(faceAll) ?? DEFAULTS.skin;
    // brow: the hair line (top rows of the face); if it equals the skin there is no hair on the face, so use the head top
    let brow = dominant(rect(img, fx, fy, fw, 1.5 * cell));
    if (!brow || lum(brow) > lum(skin) + 60 || sameish(brow, skin)) {
        brow = dominant(rect(img, 8 * scale, 0, 8 * scale, 8 * scale)) ?? DEFAULTS.brow;
        if (sameish(brow, skin)) brow = darker(skin, 0.45);
    }
    // eye: the darkest or most saturated of the standard eye cells
    const eyeCells = [at(1, 4), at(2, 4), at(5, 4), at(6, 4)].filter(Boolean);
    const eye = eyeCells.length ? eyeCells.reduce((a, b) => (lum(b) < lum(a) ? b : a)) : DEFAULTS.eye;
    // mouth: the mouth cells, unless they match the skin (then a darker skin tone)
    const mouthCells = [at(3, 6), at(4, 6)].filter(Boolean);
    let mouth = mouthCells.length ? dominant(mouthCells) : null;
    if (!mouth || sameish(mouth, skin)) mouth = mix(skin, DEFAULTS.mouth, 0.55);
    const inside = darker(mouth, 0.55);
    const blush = mix(skin, [255, 120, 140, 255], 0.35);
    return { skin, eye, lid: skin, brow, mouth, inside, teeth: DEFAULTS.teeth, blush };
}

function sameish(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 36; }

/** A 16x16 RGBA image with each palette color in its pixel of row 0 (the rest transparent). */
function paletteImage(colors) {
    const data = new Uint8Array(PALETTE_SIZE * PALETTE_SIZE * 4);
    for (const [name, i] of Object.entries(PALETTE)) {
        const c = colors[name] ?? DEFAULTS[name];
        data.set([c[0], c[1], c[2], 255], i * 4);
    }
    return { width: PALETTE_SIZE, height: PALETTE_SIZE, data };
}

module.exports = { derivePalette, paletteImage, DEFAULTS };
