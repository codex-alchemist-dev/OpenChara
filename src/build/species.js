// How per-character DATA becomes the one character entity's visuals. Every character of a project is the SAME entity
// ({{ns}}:{{char}}); what differs is data keyed by entity properties. This module is the pure build-time part: it turns the
// characters, rigs and overlays tables into texture/geometry tables, the render controller, and the client expressions.
// No file IO, so it is unit-tested without a build. The runtime that DECIDES which skin to show is engine/.../look/.
//
// Entity properties (all client-synced):
//   species_index  geometry / material (through the character's rig)
//   skin_id        which texture: a GLOBAL id over every skin of every character (assigned here, regenerated each build,
//                  never stored - the entity is a puppet, the record is the truth)
//   body_scale     model scale in permille            rig_index   which rig (animation gating)
//   ov_<name>      level (0 = off) of each overlay layer (dirt, wetness, wounds...)
//
// Character fields it understands (all optional except texture):
//   texture, emissiveTexture   the "default" skin and its glow layer
//   skins                      { <name>: { texture, emissiveTexture? } } every other skin (night, hunt, hunt_night, freckled_2...)
//   rig                        id of rigs/<id>.json        body   { scale }
// Which skin shows when is skinRules / forms (engine look/skinRules.js, validated in content.js).
// Overlay fields: overlays/<id>.json { id, material?, levels: { "<rig id>" | "*": [texture for level 1, level 2, ...] } }.
"use strict";

const SCALE_UNIT = 1000;                                            // body_scale property is permille
const BLANK_TEXTURE = "textures/oc/blank";                          // 1x1 transparent PNG shipped by OpenChara
const DEFAULT_SKIN = "default";
const SKIN_NAME = /^[a-z][A-Za-z0-9_]*$/;

const byIndex = characters => Object.values(characters).sort((a, b) => a.index - b.index);

/** Every skin of every character, in a stable order, with its global id: [{ id, char, name, texture, emissive }]. */
function skinList(characters) {
    const out = [];
    for (const c of byIndex(characters)) {
        out.push({ id: out.length, char: c.id, name: DEFAULT_SKIN, texture: c.texture, emissive: c.emissiveTexture ?? null });
        for (const name of Object.keys(c.skins ?? {}).sort()) out.push({ id: out.length, char: c.id, name, texture: c.skins[name].texture, emissive: c.skins[name].emissiveTexture ?? null });
    }
    return out;
}

/** character id -> { skinName: global id } (always includes "default"). */
function skinIds(characters) {
    const ids = {};
    for (const s of skinList(characters)) (ids[s.char] ??= {})[s.name] = s.id;
    return ids;
}

const hasEmissive = characters => skinList(characters).some(s => s.emissive);

/** Overlay layers sorted by name (stable property / array order). */
const overlayList = overlays => Object.values(overlays ?? {}).sort((a, b) => a.id.localeCompare(b.id));
const overlayLevels = ov => Math.max(1, ...Object.values(ov.levels ?? {}).map(l => l.length));
const overlayKey = (ov, rigId, level) => `ov_${ov.id}_${String(rigId).replace(/\W/g, "_")}_${level}`;

/**
 * Texture short-names -> paths for the CLIENT entity description.
 * @returns {Record<string, string>}
 */
function textureTable(characters, overlays = {}) {
    const out = {};
    const list = skinList(characters);
    for (const s of list) {
        out[`skin${s.id}`] = s.texture;
        if (s.emissive) out[`glow${s.id}`] = s.emissive;
    }
    for (const ov of overlayList(overlays)) for (const [rigId, levels] of Object.entries(ov.levels ?? {})) levels.forEach((tex, i) => { out[overlayKey(ov, rigId, i + 1)] = tex; });
    if (hasEmissive(characters) || overlayList(overlays).length) out.blank = BLANK_TEXTURE;
    return out;
}

/**
 * A balanced-ternary Molang expression returning the value for the integer `indexExpr`, or `fallback` out of range.
 * (Molang has no arrays outside render controllers.) Small tables only - big per-species data belongs in a property.
 * @param {Array<[number, number|string]>} pairs [index, value] entries, unique indexes
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
 * The render controller document. Geometry and material follow the rig (by species); the base texture follows skin_id; glow
 * (when any skin glows) is a second layer; each overlay is one more alpha layer chosen by rig and its level property.
 */
function renderController({ ns, key, characters, rigs, overlays = {}, defaults }) {
    const list = byIndex(characters);
    const first = list[0];
    const max = Math.max(0, ...list.map(c => c.index));
    const slotOf = i => (list.some(c => c.index === i) ? i : first?.index ?? 0);
    const charAt = i => list.find(x => x.index === slotOf(i)) ?? first ?? {};
    const rigOf = c => rigs[c.rig] ?? { geometry: defaults.geometry, material: defaults.material };

    const skins = skinList(characters);
    const emissive = hasEmissive(characters);

    const geoNames = new Map(), matNames = new Map();
    const geoArr = [], matArr = [];
    for (let i = 0; i <= max; i++) {
        const rig = rigOf(charAt(i));
        if (!geoNames.has(rig.geometry)) geoNames.set(rig.geometry, `g${geoNames.size}`);
        const mat = rig.material ?? defaults.material;
        if (!matNames.has(mat)) matNames.set(mat, `m${matNames.size}`);
        geoArr.push(`Geometry.${geoNames.get(rig.geometry)}`);
        matArr.push(`Material.${matNames.get(mat)}`);
    }

    const skinProp = `q.property('${ns}:skin_id')`;
    const doc = {
        arrays: {
            textures: { [`Array.${ns}_skin`]: skins.length ? skins.map(s => `Texture.skin${s.id}`) : ["Texture.blank"] },
            geometry: { [`Array.${ns}_geo`]: geoArr },
            materials: { [`Array.${ns}_mat`]: matArr },
        },
        geometry: `Array.${ns}_geo[q.property('${ns}:species_index')]`,
        materials: [{ "*": `Array.${ns}_mat[q.property('${ns}:species_index')]` }],
        textures: [`Array.${ns}_skin[${skinProp}]`],
    };
    const materials = Object.fromEntries([...matNames].map(([m, n]) => [n, m]));
    if (emissive) {
        doc.arrays.textures[`Array.${ns}_glow`] = skins.map(s => (s.emissive ? `Texture.glow${s.id}` : "Texture.blank"));
        doc.materials.push({ "*": "Material.glow" });
        doc.textures.push(`Array.${ns}_glow[${skinProp}]`);
        materials.glow = "entity_emissive_alpha";
    }

    // overlays: index = rig_index * (levels + 1) + level; a rig without textures for the overlay shows nothing
    const maxRig = Math.max(0, ...Object.values(rigs).map(r => r.index));
    const rigIdOfIndex = new Map(Object.values(rigs).map(r => [r.index, r.id]));
    const overlayProperties = {};
    for (const ov of overlayList(overlays)) {
        const levels = overlayLevels(ov), stride = levels + 1, arr = [];
        for (let r = 0; r <= maxRig; r++) {
            const rigId = rigIdOfIndex.get(r);
            const useKey = rigId && ov.levels?.[rigId] ? rigId : "*";
            const set = ov.levels?.[useKey] ?? [];
            for (let l = 0; l <= levels; l++) arr.push(l > 0 && set[l - 1] ? `Texture.${overlayKey(ov, useKey, l)}` : "Texture.blank");
        }
        const name = `Array.${ns}_ov_${ov.id}`;
        doc.arrays.textures[name] = arr;
        doc.materials.push({ "*": `Material.ov_${ov.id}` });
        doc.textures.push(`${name}[q.property('${ns}:rig_index') * ${stride} + q.property('${ns}:ov_${ov.id}')]`);
        materials[`ov_${ov.id}`] = ov.material ?? "entity_alpha";
        overlayProperties[`${ns}:ov_${ov.id}`] = { type: "int", range: [0, Math.max(1, levels)], default: 0, client_sync: true };
    }

    const geometries = Object.fromEntries([...geoNames].map(([g, n]) => [n, g]));
    return { controller: { format_version: "1.10.0", render_controllers: { [`controller.render.${ns}_${key}`]: doc } }, geometries, materials, emissive, skinCount: skins.length, overlayProperties };
}

module.exports = {
    SCALE_UNIT, BLANK_TEXTURE, DEFAULT_SKIN, SKIN_NAME,
    skinList, skinIds, hasEmissive, textureTable, lookupExpr, scaleExpression, scaleProperty, featureExpression, renderController, overlayList, overlayLevels,
};
