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
    for (const c of Object.values(characters)) {
        if (!Number.isInteger(c.index) || c.index < 0) throw new Error(`characters/${c.id}: "index" must be a non-negative integer (it is stored on entities - never renumber)`);
        if (seen.has(c.index)) throw new Error(`characters: index ${c.index} used by both "${seen.get(c.index)}" and "${c.id}"`);
        seen.set(c.index, c.id);
        if (typeof c.texture !== "string") throw new Error(`characters/${c.id}: "texture" is required`);
        if (c.class && !classes[c.class] && c.class !== "generalist") throw new Error(`characters/${c.id}: unknown class "${c.class}"`);
    }
    for (const cls of Object.values(classes)) {
        for (const a of cls.defaultAbilities ?? []) if (!abilities[a]) throw new Error(`classes/${cls.id}: unknown ability "${a}"`);
    }
    return { characters, classes, abilities, quests, schema };
}


const CORE_FIELDS = new Set(["v", "pv", "nickname", "species", "soulId", "class", "gear", "inventory", "squadId", "order",
    "homeLocation", "lastManifestLocation", "manifestedEntityId", "createdAt", "deletedAt", "migratedFrom", "quests", "bondPartners"]);


module.exports = { loadContent, walk, readJson };
