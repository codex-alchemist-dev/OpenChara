// Build-time validation of everything that controls how a character looks and which form she is in: textures, rigs, body,
// skins, skinRules, forms, overlays, legacy import types. Errors name the file. Condition NAMES inside a `when` are not
// checked here: projects register their own conditions at runtime (engine look/skinRules.js), so only the structure is.
"use strict";

const { SKIN_NAME, DEFAULT_SKIN } = require("./species.js");

const TEXTURE_PATH = /^textures\/[\w\/.-]+$/;
const FORM_MODES = ["tactical", "weapon", "manual"];
const COMBINATORS = new Set(["all", "any", "not"]);

/** A `when` is { cond: arg, ... } (all must hold) plus the combinators all/any (arrays) and not (one when). */
function checkWhen(when, bad, where, depth = 0) {
    if (depth > 8) bad(`${where}: conditions nested deeper than 8 levels`);
    if (typeof when !== "object" || when === null || Array.isArray(when)) bad(`${where} must be an object like { "time": "night" }`);
    for (const [key, arg] of Object.entries(when)) {
        if (key === "all" || key === "any") {
            if (!Array.isArray(arg) || !arg.length) bad(`${where}.${key} must be a non-empty array of conditions`);
            arg.forEach((w, i) => checkWhen(w, bad, `${where}.${key}[${i}]`, depth + 1));
        } else if (key === "not") checkWhen(arg, bad, `${where}.not`, depth + 1);
        else if (!/^[a-z][A-Za-z0-9_]*$/.test(key)) bad(`${where}: "${key}" is not a valid condition name`);
    }
}

/** Visual / form / import fields of one character. `skinNames` includes "default". */
function validateCharacter(c, { rigs, classes }, legacySeen) {
    const bad = msg => { throw new Error(`characters/${c.id}: ${msg}`); };
    if (!TEXTURE_PATH.test(c.texture)) bad(`"texture" must be a texture path like textures/entity/${c.id}`);
    if (c.emissiveTexture !== undefined && !TEXTURE_PATH.test(c.emissiveTexture)) bad(`"emissiveTexture" must be a texture path`);
    if (c.rig !== undefined && !rigs[c.rig]) bad(`unknown rig "${c.rig}" (rigs/${c.rig}.json)`);
    if (c.body !== undefined) {
        if (typeof c.body !== "object" || c.body === null) bad(`"body" must be an object like { "scale": 0.9 }`);
        if (c.body.scale !== undefined && !(typeof c.body.scale === "number" && c.body.scale > 0.1 && c.body.scale < 10)) bad(`body.scale must be a number between 0.1 and 10`);
    }

    const skinNames = new Set([DEFAULT_SKIN]);
    for (const [name, skin] of Object.entries(c.skins ?? {})) {
        if (!SKIN_NAME.test(name) || name === DEFAULT_SKIN) bad(`skin name "${name}" must start with a lowercase letter, use letters/digits/underscores, and not be "default"`);
        if (!TEXTURE_PATH.test(skin?.texture ?? "")) bad(`skins.${name}.texture must be a texture path`);
        if (skin.emissiveTexture !== undefined && !TEXTURE_PATH.test(skin.emissiveTexture)) bad(`skins.${name}.emissiveTexture must be a texture path`);
        skinNames.add(name);
    }

    if (c.skinRules !== undefined) {
        if (!Array.isArray(c.skinRules)) bad(`"skinRules" must be an array of { skin, when, priority? }`);
        c.skinRules.forEach((r, i) => {
            const at = `skinRules[${i}]`;
            if (!skinNames.has(r?.skin)) bad(`${at}.skin "${r?.skin}" is not one of her skins (${[...skinNames].join(", ")})`);
            checkWhen(r.when, bad, `${at}.when`);
            if (r.priority !== undefined && typeof r.priority !== "number") bad(`${at}.priority must be a number`);
        });
    }

    if (c.forms !== undefined) {
        if (typeof c.forms !== "object" || c.forms === null || !Object.keys(c.forms).length) bad(`"forms" must be an object of form id -> definition`);
        for (const [fid, f] of Object.entries(c.forms)) {
            const at = `forms.${fid}`;
            if (!SKIN_NAME.test(fid)) bad(`form id "${fid}" must start with a lowercase letter and use letters/digits/underscores`);
            if (f.class !== undefined && f.class !== "generalist" && !classes[f.class]) bad(`${at}.class "${f.class}" is not a class (classes/${f.class}.json)`);
            if (f.skin !== undefined && !skinNames.has(f.skin)) bad(`${at}.skin "${f.skin}" is not one of her skins`);
            if (f.weapons !== undefined && !(Array.isArray(f.weapons) && f.weapons.every(w => typeof w === "string"))) bad(`${at}.weapons must be an array of weapon categories like ["sword"]`);
            if (f.tactics !== undefined) {
                if (!Array.isArray(f.tactics)) bad(`${at}.tactics must be an array of { when, score }`);
                f.tactics.forEach((t, i) => { checkWhen(t.when, bad, `${at}.tactics[${i}].when`); if (typeof t.score !== "number") bad(`${at}.tactics[${i}].score must be a number`); });
            }
        }
        if (!c.defaultForm || !c.forms[c.defaultForm]) bad(`"defaultForm" must name one of her forms (${Object.keys(c.forms).join(", ")})`);
        const mode = c.formPolicy?.mode ?? "tactical";
        if (!FORM_MODES.includes(mode)) bad(`formPolicy.mode "${mode}" must be one of ${FORM_MODES.join(", ")}`);
        if (c.formPolicy?.minDwellSeconds !== undefined && !(c.formPolicy.minDwellSeconds >= 0)) bad(`formPolicy.minDwellSeconds must be >= 0`);
    } else if (c.defaultForm !== undefined || c.formPolicy !== undefined) bad(`"defaultForm"/"formPolicy" need a "forms" table`);

    if (c.legacy !== undefined) {
        const types = c.legacy?.types;
        if (!Array.isArray(types) || !types.length || !types.every(t => /^[a-z0-9_]+:[a-z0-9_.-]+$/.test(t))) bad(`legacy.types must be a non-empty array of entity ids like ["ac:${c.id}"]`);
        for (const t of types) {
            if (legacySeen.has(t)) throw new Error(`characters: legacy entity type "${t}" claimed by both "${legacySeen.get(t)}" and "${c.id}"`);
            legacySeen.set(t, c.id);
        }
    }
}

function validateRig(r, rigIdx) {
    if (!Number.isInteger(r.index) || r.index < 0) throw new Error(`rigs/${r.id}: "index" must be a non-negative integer (it is stored on entities - never renumber)`);
    if (rigIdx.has(r.index)) throw new Error(`rigs: index ${r.index} used by both "${rigIdx.get(r.index)}" and "${r.id}"`);
    rigIdx.set(r.index, r.id);
    if (typeof r.geometry !== "string" || !r.geometry.startsWith("geometry.")) throw new Error(`rigs/${r.id}: "geometry" must be a geometry id like "geometry.waifuB"`);
    if (r.animate !== undefined && !(Array.isArray(r.animate) && r.animate.every(a => typeof a === "string"))) throw new Error(`rigs/${r.id}: "animate" must be an array of animation names`);
}

function validateOverlay(o, rigs) {
    const bad = msg => { throw new Error(`overlays/${o.id}: ${msg}`); };
    if (!SKIN_NAME.test(o.id)) bad(`id must start with a lowercase letter and use letters/digits/underscores (it names an entity property)`);
    if (typeof o.levels !== "object" || o.levels === null || !Object.keys(o.levels).length) bad(`"levels" must map a rig id (or "*") to an array of textures, one per level`);
    for (const [rigId, texs] of Object.entries(o.levels)) {
        if (rigId !== "*" && !rigs[rigId]) bad(`levels.${rigId}: unknown rig`);
        if (!Array.isArray(texs) || !texs.length || !texs.every(t => TEXTURE_PATH.test(t))) bad(`levels.${rigId} must be a non-empty array of texture paths`);
    }
    if (o.drive !== undefined) {
        const t = o.drive.thresholds;
        if (typeof o.drive.source !== "string") bad(`drive.source must name what drives it: "dirt", "wetness", "damage", or any numeric look-context field`);
        if (!Array.isArray(t) || !t.length || !t.every((x, i) => typeof x === "number" && (i === 0 || x > t[i - 1]))) bad(`drive.thresholds must be an ascending array of numbers, one per level`);
        const maxLevels = Math.max(...Object.values(o.levels).map(l => l.length));
        if (t.length > maxLevels) bad(`drive.thresholds has ${t.length} levels but the textures only cover ${maxLevels}`);
    }
}

module.exports = { validateCharacter, validateRig, validateOverlay, checkWhen, FORM_MODES, TEXTURE_PATH };
