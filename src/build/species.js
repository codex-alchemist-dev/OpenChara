// How per-character DATA becomes the one character entity's visuals. Every character of a project is the SAME entity
// ({{ns}}:{{char}}); what differs is data keyed by its `species_index` (and `skin_variant`) entity properties. This module
// is the pure part of that: it turns the characters + rigs tables into texture/geometry tables, the render controller, and
// the Molang lookup expressions the client entity uses. No file IO, so it is unit-tested without a build.
//
// Character fields it understands (all optional except texture):
//   texture, emissiveTexture   base skin and its glow layer
//   skins                      { night|water|waterNight: { texture, emissiveTexture? } } alternate skins (entity property skin_variant)
//   rig                        id of rigs/<id>.json - which geometry/material/animation set the character uses
//   body                       { scale } model scale (client-side: scripts.scale reads the entity's body_scale property)
// Rig fields: { id, index, geometry, material?, animate?: string[] } - `index` is permanent (it is stored on entities as rig_index).
"use strict";

const SKIN_VARIANTS = ["default", "night", "water", "waterNight"];   // skin_variant property values 0..3 (never reorder: stored on entities)
const SCALE_UNIT = 1000;                                            // body_scale property is permille
const BLANK_TEXTURE = "textures/oc/blank";                            // 1x1 transparent PNG shipped by OpenChara (emissive layer fallback)

const keyOfIndex = i => `species${i}`;
const lightKeyOfIndex = i => `light${i}`;
const variantKey = (i, variant, light) => `${light ? "light" : "species"}${i}_${variant}`;

/** The characters sorted by index, plus the highest index. */
function layout(characters) {
    const list = Object.values(characters).sort((a, b) => a.index - b.index);
    return { list, max: Math.max(0, ...list.map(c => c.index)) };
}

/** Which of the non-default skin variants any character defines. */
function usedVariants(list) {
    return SKIN_VARIANTS.slice(1).filter(v => list.some(c => c.skins?.[v]));
}

/**
 * Texture short-names -> paths for the CLIENT entity description. Includes the blank fallback only when something glows.
 * @returns {Record<string, string>}
 */
function textureTable(characters) {
    const { list } = layout(characters);
    const out = {};
    const anyLight = list.some(c => c.emissiveTexture || Object.values(c.skins ?? {}).some(s => s.emissiveTexture));
    for (const c of list) {
        out[keyOfIndex(c.index)] = c.texture;
        if (c.emissiveTexture) out[lightKeyOfIndex(c.index)] = c.emissiveTexture;
        for (const v of usedVariants(list)) {
            const s = c.skins?.[v];
            if (!s) continue;
            out[variantKey(c.index, v, false)] = s.texture;
            if (s.emissiveTexture) out[variantKey(c.index, v, true)] = s.emissiveTexture;
        }
    }
    if (anyLight) out.blank = BLANK_TEXTURE;
    return out;
}

/** Whether the project needs the emissive layer at all. */
function hasEmissive(characters) {
    return Object.values(characters).some(c => c.emissiveTexture || Object.values(c.skins ?? {}).some(s => s.emissiveTexture));
}

/**
 * A balanced-ternary Molang expression returning values[i] for the integer `indexExpr`, or `fallback` out of range.
 * (Molang has no arrays outside render controllers; this is how scale/animation gating follow the species.)
 * @param {Array<[number, number|string]>} pairs [index, value] entries, any order, unique indexes
 */
function lookupExpr(pairs, indexExpr, fallback = 1) {
    const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
    const build = (lo, hi) => {
        if (lo > hi) return String(fallback);
        if (lo === hi) return `(${indexExpr}==${sorted[lo][0]}?${sorted[lo][1]}:${fallback})`;
        const mid = (lo + hi) >> 1;
        return `(${indexExpr}<${sorted[mid + 1] ? sorted[mid + 1][0] : sorted[mid][0] + 1}?${build(lo, mid)}:${build(mid + 1, hi)})`;
    };
    return build(0, sorted.length - 1);
}

/** The client entity `scripts.scale` expression: the per-entity body_scale property (permille), set from the species at manifest. */
function scaleExpression(characters, ns) {
    if (!Object.values(characters).some(c => typeof c.body?.scale === "number" && c.body.scale !== 1)) return null;
    return `q.property('${ns}:body_scale') / ${SCALE_UNIT}`;
}

/** The body_scale property value for a species' body.scale (permille, rounded; 1000 = natural size). */
const scaleProperty = scale => Math.round((typeof scale === "number" ? scale : 1) * SCALE_UNIT);

/** Molang that is 1 for entities whose rig_index property belongs to a rig listing `feature` in animate, else 0. */
function featureExpression(rigs, feature, ns) {
    const idx = Object.values(rigs).filter(r => r.animate?.includes(feature)).map(r => r.index);
    return idx.length ? `(${idx.map(i => `q.property('${ns}:rig_index')==${i}`).join(" || ")})` : "0";
}

/**
 * The render controller document for the character. Geometry and material follow the rig; texture follows species and skin
 * variant; glow layers (when any exist) ride a second texture with the emissive material.
 */
function renderController({ ns, key, characters, rigs, defaults }) {
    const { list, max } = layout(characters);
    const first = list[0];
    const variants = usedVariants(list);
    const slotOf = i => (list.some(c => c.index === i) ? i : first?.index ?? 0);
    const rigOf = c => rigs[c.rig] ?? { geometry: defaults.geometry, material: defaults.material };

    const table = textureTable(characters);
    // The texture short-name for index i, variant v (null = default skin) on the base or glow layer. A character without that
    // variant shows its default skin (and default glow); a variant skin without a glow texture shows none.
    const baseOf = (i, v, light) => {
        const c = list.find(x => x.index === i) ?? first;
        if (!c) return "Texture.blank";
        const variantSkin = v && c.skins?.[v];
        if (variantSkin) return light ? (variantSkin.emissiveTexture ? `Texture.${variantKey(c.index, v, true)}` : "Texture.blank") : `Texture.${variantKey(c.index, v, false)}`;
        return light ? (table[lightKeyOfIndex(c.index)] ? `Texture.${lightKeyOfIndex(c.index)}` : "Texture.blank") : `Texture.${keyOfIndex(c.index)}`;
    };

    const stride = max + 1;
    const flat = light => {
        const out = [];
        for (const v of [null, ...variants]) for (let i = 0; i <= max; i++) out.push(baseOf(slotOf(i), v, light));
        return out;
    };
    const idxExpr = variants.length
        ? `${variantOffsetExpr(variants, ns, stride)} + q.property('${ns}:species_index')`
        : `q.property('${ns}:species_index')`;

    // geometry: one array entry per index, from the rig (distinct geometries become Geometry.<name> entries)
    const geoNames = new Map();
    const geoFor = c => { const g = rigOf(c).geometry; if (!geoNames.has(g)) geoNames.set(g, `g${geoNames.size}`); return geoNames.get(g); };
    const geoArr = [];
    for (let i = 0; i <= max; i++) geoArr.push(`Geometry.${geoFor(list.find(x => x.index === slotOf(i)) ?? first ?? { rig: undefined })}`);
    const geometries = {};
    for (const [g, name] of geoNames) geometries[name] = g;

    const materials = new Map();
    const matFor = c => { const m = rigOf(c).material ?? defaults.material; if (!materials.has(m)) materials.set(m, `m${materials.size}`); return materials.get(m); };
    const matArr = [];
    for (let i = 0; i <= max; i++) matArr.push(`Material.${matFor(list.find(x => x.index === slotOf(i)) ?? first ?? {})}`);

    const emissive = hasEmissive(characters);
    const doc = {
        arrays: {
            textures: { [`Array.${ns}_skin`]: flat(false) },
            geometry: { [`Array.${ns}_geo`]: geoArr },
            materials: { [`Array.${ns}_mat`]: matArr },
        },
        geometry: `Array.${ns}_geo[q.property('${ns}:species_index')]`,
        materials: [{ "*": `Array.${ns}_mat[q.property('${ns}:species_index')]` }],
        textures: [`Array.${ns}_skin[${idxExpr}]`],
    };
    if (emissive) {
        doc.arrays.textures[`Array.${ns}_glow`] = flat(true);
        doc.materials.push({ "*": "Material.glow" });
        doc.textures.push(`Array.${ns}_glow[${idxExpr}]`);
    }
    return { controller: { format_version: "1.10.0", render_controllers: { [`controller.render.${ns}_${key}`]: doc } }, geometries, materials: Object.fromEntries([...materials].map(([m, n]) => [n, m])), emissive };
}

function variantOffsetExpr(variants, ns, stride) {
    // skin_variant v (1..3) -> position of that variant among the defined ones, times stride (variant 0 -> 0)
    const pairs = variants.map(v => [SKIN_VARIANTS.indexOf(v), (variants.indexOf(v) + 1) * stride]);
    return lookupExpr(pairs, `q.property('${ns}:skin_variant')`, 0);
}

module.exports = { SKIN_VARIANTS, SCALE_UNIT, BLANK_TEXTURE, scaleProperty, textureTable, hasEmissive, lookupExpr, scaleExpression, featureExpression, renderController, usedVariants };
