// The face kit: a set of zero-thickness colored planes just in front of a head that lets ANY rig blink, change expression and talk.
// Geometry numbers are the standard Minecraft face (decoded from a reference villager): eyes +3.5 and mouth +1.5 above the bottom
// of an 8x8x8 head, so the same kit fits the vanilla humanoid and 57 of AC's 62 geometries unchanged; a head anchor shifts/scales it
// for the others. Every plane samples ONE pixel of a 16x16 palette texture (see palette.js), drawn by a second render controller that
// shows only these bones, so the body texture is never touched. Pure functions: no IO.
"use strict";

const PALETTE_SIZE = 16;
const PALETTE = { skin: 0, eye: 1, lid: 2, brow: 3, mouth: 4, inside: 5, teeth: 6, blush: 7 };   // pixel index along row 0

const FACE_BONES = ["face", "cover", "eyeL", "eyeR", "lidUpper", "lidUpperL", "lidUpperR", "lidLower", "lidLowerL", "lidLowerR", "brow", "mouth", "teethTop", "teethBottom"];
const CUBE_BONES = ["cover", "eyeL", "eyeR", "lidUpperL", "lidUpperR", "lidLowerL", "lidLowerR", "brow", "mouth", "teethTop", "teethBottom"];

// The reference villager has NO front face on its head, so its planes sit right at the surface. A normal head has a front face, so
// every plane is pushed this far forward (keeping their order) or it would be hidden inside the head.
const FRONT_SHIFT = -0.06;

// Two ways to wear the kit:
//   full  a pixel skin: a skin-colored cover redraws the 8x8 face (eyes 2x1 like a standard skin's, brow, mouth) so everything can move
//   talk  a painted face (AC): ONLY the mouth and teeth, collapsed when closed, so the painted face is never covered
const MODES = { full: new Set(["cover", "eyeL", "eyeR", "lidUpper", "lidUpperL", "lidUpperR", "lidLower", "lidLowerL", "lidLowerR", "brow", "mouth", "teethTop", "teethBottom"]), talk: new Set(["mouth", "teethTop", "teethBottom"]) };

/** The default head: an 8x8x8 cube with origin [-4, 24, -4] (pivot of the head bone [0, 24, 0]). */
const DEFAULT_ANCHOR = { origin: [-4, 24, -4], size: 8 };

/** UV for one palette color: the middle half of that palette pixel, expressed in the geometry's own texture size so it works for any W x H. */
function paletteUv(color, tex) {
    const [W, H] = tex;
    const i = PALETTE[color];
    if (i === undefined) throw new Error(`faceKit: unknown palette color "${color}"`);
    return { uv: [((i + 0.25) / PALETTE_SIZE) * W, (0.25 / PALETTE_SIZE) * H], uv_size: [(0.5 / PALETTE_SIZE) * W, (0.5 / PALETTE_SIZE) * H] };
}

// The kit in head-local units, relative to an 8x8x8 head whose origin is [-4, 24, -4]. [x, y, z] origins and [w, h, d] sizes.
const Z = z => Math.round((z + FRONT_SHIFT) * 1e5) / 1e5;
const KIT = [
    { name: "cover", parent: "face", color: "skin", pivot: [0, 28, Z(-4)], cube: { origin: [-4, 24, Z(-3.96)], size: [8, 8, 0] } },
    // eyes: 2x1 like a standard skin's (columns 1-2 and 5-6 of the 8x8 face, row 4)
    { name: "eyeL", parent: "face", color: "eye", pivot: [2, 27.5, Z(-3.975)], cube: { origin: [1, 27, Z(-3.975)], size: [2, 1, 0] } },
    { name: "eyeR", parent: "face", color: "eye", pivot: [-2, 27.5, Z(-3.975)], cube: { origin: [-3, 27, Z(-3.975)], size: [2, 1, 0] } },
    { name: "lidUpper", parent: "face", pivot: [0, 29, Z(-4)] },
    { name: "lidUpperL", parent: "lidUpper", color: "lid", pivot: [2, 29, Z(-4)], cube: { origin: [0.9875, 28, Z(-4)], size: [2.05, 1.025, 0] } },
    { name: "lidUpperR", parent: "lidUpper", color: "lid", pivot: [-2, 29, Z(-4)], cube: { origin: [-3.0375, 28, Z(-4)], size: [2.05, 1.025, 0] } },
    { name: "lidLower", parent: "face", pivot: [0, 26, Z(-4)] },
    { name: "lidLowerL", parent: "lidLower", color: "lid", pivot: [2, 26, Z(-4)], cube: { origin: [0.9875, 25.975, Z(-4)], size: [2.05, 1.025, 0] } },
    { name: "lidLowerR", parent: "lidLower", color: "lid", pivot: [-2, 26, Z(-4)], cube: { origin: [-3.0375, 25.975, Z(-4)], size: [2.05, 1.025, 0] } },
    { name: "brow", parent: "face", color: "brow", pivot: [0, 28.5, Z(-4.15)], cube: { origin: [-3, 28, Z(-4.15)], size: [6, 1, 1] } },
    { name: "mouth", parent: "face", color: "mouth", pivot: [0, 25.5, Z(-4.0125)], cube: { origin: [-2, 25, Z(-4.025)], size: [4, 1, 0.025] } },
    { name: "teethTop", parent: "face", color: "teeth", pivot: [0, 25.7625, Z(-4.025)], cube: { origin: [-2.025, 25.525, Z(-4.05)], size: [4.05, 0.5, 0.05] } },
    { name: "teethBottom", parent: "face", color: "teeth", pivot: [0, 25.2375, Z(-4.025)], cube: { origin: [-2.025, 24.975, Z(-4.05)], size: [4.05, 0.5, 0.05] } },
];

const DEFAULT_PIVOT_ORIGIN = [-4, 24, -4];

/** A point of the default head mapped onto another head: scaled about the head's front-bottom-center and shifted. */
function mapPoint(p, anchor) {
    const s = anchor.size / 8;
    const dx = p[0] - (DEFAULT_PIVOT_ORIGIN[0] + 4), dy = p[1] - DEFAULT_PIVOT_ORIGIN[1], dz = p[2] - DEFAULT_PIVOT_ORIGIN[2];
    const [ox, oy, oz] = anchor.origin;
    return [round(ox + 4 * s + dx * s), round(oy + dy * s), round(oz + dz * s)];
}
function mapSize(sz, anchor) { const s = anchor.size / 8; return sz.map(v => round(v * s)); }
const round = v => Math.round(v * 1e5) / 1e5;

/**
 * The kit's bones for a head, as Bedrock geometry bone objects.
 * @param {{origin:number[], size:number}} anchor the head cube (origin and edge length)
 * @param {number[]} tex [texture_width, texture_height] of the geometry
 * @param {string} headBone the bone the kit hangs from
 * @param {{prefix?: string}} [opts] prefix bone names (default none) so a rig with its own `mouth` bone does not collide
 */
function faceBones(anchor, tex, headBone, opts = {}) {
    const prefix = opts.prefix ?? "";
    const wanted = MODES[opts.mode ?? "full"];
    if (!wanted) throw new Error(`faceKit: unknown mode "${opts.mode}" (full, talk)`);
    const n = name => prefix + name;
    const headPivot = mapPoint([0, 24, 0], anchor);
    const bones = [{ name: n("face"), parent: headBone, pivot: headPivot }];
    for (const k of KIT) {
        // a structural parent bone (lidUpper/lidLower) is kept only when one of its children is
        if (!wanted.has(k.name) && !KIT.some(c => c.parent === k.name && wanted.has(c.name))) continue;
        if (!wanted.has(k.name) && k.cube) continue;
        const bone = { name: n(k.name), parent: n(k.parent), pivot: mapPoint(k.pivot, anchor) };
        if (k.cube) {
            const px = paletteUv(k.color, tex);
            const faces = Object.fromEntries(["north", "east", "south", "west", "up", "down"].map(f => [f, px]));
            bone.cubes = [{ origin: mapPoint(k.cube.origin, anchor), size: mapSize(k.cube.size, anchor), uv: faces }];
        }
        bones.push(bone);
    }
    return bones;
}

/**
 * Adds the face kit to a geometry (returns a new object). The geometry must be Bedrock 1.12+ (`minecraft:geometry`).
 * @param {object} geometry one entry of `minecraft:geometry`
 * @param {{headBone: string, anchor?: {origin:number[], size:number}, prefix?: string}} opts
 */
function injectFaceKit(geometry, { headBone, anchor, prefix = "", mode = "full" } = {}) {
    if (!geometry?.description?.identifier) throw new Error("faceKit: not a geometry");
    const bones = geometry.bones ?? [];
    if (!bones.some(b => b.name === headBone)) throw new Error(`faceKit: ${geometry.description.identifier} has no bone "${headBone}"`);
    const tex = [geometry.description.texture_width ?? 64, geometry.description.texture_height ?? 64];
    const used = new Set(bones.map(b => b.name));
    const add = faceBones(anchor ?? findHeadAnchor(geometry, headBone) ?? DEFAULT_ANCHOR, tex, headBone, { prefix, mode });
    for (const b of add) if (used.has(b.name)) throw new Error(`faceKit: ${geometry.description.identifier} already has a bone "${b.name}" (use a prefix)`);
    return { ...geometry, bones: [...bones, ...add] };
}

/** The head cube of a bone (its first cube, if it is a cube of equal edges): { origin, size }, else null. */
function findHeadAnchor(geometry, headBone) {
    const b = (geometry.bones ?? []).find(x => x.name === headBone);
    const c = b?.cubes?.[0];
    if (!c || !Array.isArray(c.size)) return null;
    const [w, h, d] = c.size;
    if (Math.abs(w - d) > 0.5 || Math.abs(w - h) > 0.5) return null;
    return { origin: c.origin, size: w };
}

/** part_visibility lists for the two render controllers: the body controller hides the kit, the face controller shows ONLY the kit. */
function visibility(prefix = "", mode = "full") {
    const cubes = CUBE_BONES.filter(n => MODES[mode].has(n)).map(n => prefix + n);
    return {
        body: cubes.map(n => ({ [n]: false })),
        face: [{ "*": false }, ...cubes.map(n => ({ [n]: true }))],
    };
}

module.exports = { MODES, FRONT_SHIFT, PALETTE, PALETTE_SIZE, FACE_BONES, CUBE_BONES, DEFAULT_ANCHOR, KIT, paletteUv, faceBones, injectFaceKit, findHeadAnchor, visibility };
