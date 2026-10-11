// Content tables from a project's PATCHES directory (characters/classes/abilities/quests/database schema),
// validated exactly as the legacy tools/lib/build.js did.
"use strict";

const fs = require("fs");
const path = require("path");

function readJson(file) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (e) { throw new Error(`${file}: ${e.message}`); }
}

function walk(dir, base = dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, base, out);
        else out.push(path.relative(base, full).split(path.sep).join("/"));
    }
    return out.sort();
}

function loadTable(dir, label) {
    const table = {};
    for (const rel of walk(dir)) {
        if (!rel.endsWith(".json")) continue;
        const obj = readJson(path.join(dir, rel));
        const id = obj.id ?? path.basename(rel, ".json");
        if (table[id]) throw new Error(`${label}: duplicate id "${id}" (${rel})`);
        table[id] = { ...obj, id };
    }
    return table;
}

function loadContent(p) {
    const d = sub => path.join(p.patchesDir, sub);
    const characters = loadTable(d("characters"), "characters");
    const classes = loadTable(d("classes"), "classes");
    const abilities = loadTable(d("abilities"), "abilities");
    const quests = loadTable(d("quests"), "quests");
    const rigs = loadTable(d("rigs"), "rigs");
    const schemaFile = path.join(p.patchesDir, "database", "schema.json");
    const schema = fs.existsSync(schemaFile) ? readJson(schemaFile) : {};
    schema.version ??= 1;
    schema.fields ??= {};
    schema.bondTracks ??= [];
    const TYPES = new Set(["string", "number", "boolean", "object", "array", "any"]);
    for (const [name, f] of Object.entries(schema.fields)) {
        if (!TYPES.has(f.type)) throw new Error(`database/schema.json: field "${name}" has unknown type "${f.type}"`);
        if (CORE_FIELDS.has(name)) throw new Error(`database/schema.json: "${name}" is an engine core field - a project can't redefine it`);
    }

    const seen = new Map();
    const legacySeen = new Map();
    const rigIdx = new Map();
    for (const r of Object.values(rigs)) {
        if (!Number.isInteger(r.index) || r.index < 0) throw new Error(`rigs/${r.id}: "index" must be a non-negative integer (it is stored on entities - never renumber)`);
        if (rigIdx.has(r.index)) throw new Error(`rigs: index ${r.index} used by both "${rigIdx.get(r.index)}" and "${r.id}"`);
        rigIdx.set(r.index, r.id);
        if (typeof r.geometry !== "string" || !r.geometry.startsWith("geometry.")) throw new Error(`rigs/${r.id}: "geometry" must be a geometry id like "geometry.waifuB"`);
        if (r.animate !== undefined && !(Array.isArray(r.animate) && r.animate.every(a => typeof a === "string"))) throw new Error(`rigs/${r.id}: "animate" must be an array of animation names`);
    }
    for (const c of Object.values(characters)) {
        if (!Number.isInteger(c.index) || c.index < 0) throw new Error(`characters/${c.id}: "index" must be a non-negative integer (it is stored on entities - never renumber)`);
        if (seen.has(c.index)) throw new Error(`characters: index ${c.index} used by both "${seen.get(c.index)}" and "${c.id}"`);
        seen.set(c.index, c.id);
        if (typeof c.texture !== "string") throw new Error(`characters/${c.id}: "texture" is required`);
        if (c.class && !classes[c.class] && c.class !== "generalist") throw new Error(`characters/${c.id}: unknown class "${c.class}"`);
        validateVisuals(c, rigs, legacySeen);
    }
    for (const cls of Object.values(classes)) {
        for (const a of cls.defaultAbilities ?? []) if (!abilities[a]) throw new Error(`classes/${cls.id}: unknown ability "${a}"`);
    }
    return { characters, classes, abilities, quests, rigs, schema };
}


const SKIN_VARIANTS = ["night", "water", "waterNight"];
const TEXTURE_PATH = /^textures\/[\w\/.-]+$/;

/** The optional visual / import fields of a character (see src/build/species.js and docs/PATCHES.md). */
function validateVisuals(c, rigs, legacySeen) {
    const bad = msg => { throw new Error(`characters/${c.id}: ${msg}`); };
    if (!TEXTURE_PATH.test(c.texture)) bad(`"texture" must be a texture path like textures/entity/${c.id}`);
    if (c.emissiveTexture !== undefined && !TEXTURE_PATH.test(c.emissiveTexture)) bad(`"emissiveTexture" must be a texture path`);
    if (c.rig !== undefined && !rigs[c.rig]) bad(`unknown rig "${c.rig}" (rigs/${c.rig}.json)`);
    if (c.body !== undefined) {
        if (typeof c.body !== "object" || c.body === null) bad(`"body" must be an object like { "scale": 0.9 }`);
        if (c.body.scale !== undefined && !(typeof c.body.scale === "number" && c.body.scale > 0.1 && c.body.scale < 10)) bad(`body.scale must be a number between 0.1 and 10`);
    }
    for (const [name, skin] of Object.entries(c.skins ?? {})) {
        if (!SKIN_VARIANTS.includes(name)) bad(`unknown skin variant "${name}" (known: ${SKIN_VARIANTS.join(", ")})`);
        if (!TEXTURE_PATH.test(skin?.texture ?? "")) bad(`skins.${name}.texture must be a texture path`);
        if (skin.emissiveTexture !== undefined && !TEXTURE_PATH.test(skin.emissiveTexture)) bad(`skins.${name}.emissiveTexture must be a texture path`);
    }
    if (c.legacy !== undefined) {
        const types = c.legacy?.types;
        if (!Array.isArray(types) || !types.length || !types.every(t => /^[a-z0-9_]+:[a-z0-9_.-]+$/.test(t))) bad(`legacy.types must be a non-empty array of entity ids like ["ac:${c.id}"]`);
        for (const t of types) {
            if (legacySeen.has(t)) throw new Error(`characters: legacy entity type "${t}" claimed by both "${legacySeen.get(t)}" and "${c.id}"`);
            legacySeen.set(t, c.id);
        }
    }
}

const CORE_FIELDS = new Set(["v", "pv", "nickname", "species", "soulId", "class", "gear", "inventory", "squadId", "order",
    "homeLocation", "lastManifestLocation", "manifestedEntityId", "createdAt", "deletedAt", "migratedFrom", "quests", "bondPartners"]);


module.exports = { loadContent, walk, readJson, SKIN_VARIANTS_ALLOWED: SKIN_VARIANTS };
