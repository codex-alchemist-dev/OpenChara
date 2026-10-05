// The project description OpenChara's build needs, read from the consuming mod's openrock.mod.json:
//   "openchara": { "patchesDir": "PATCHES", "character": { key, nouns, geometry, material },
//                  "navigationSlots": 10000, "devTools": true, "chatTag": "...", "rules": { ... } }
// plus the mod's namespace/name/description. Mirrors the legacy PATCHES/project.json fields.
"use strict";

const path = require("path");
const { loadContent } = require("./content.js");

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function projectFromMod(mod, modDir) {
    const oc = mod.openchara;
    if (!oc) throw new Error(`"${mod.name}" depends on @openchara/core but has no "openchara" block in its manifest`);
    const need = (cond, msg) => { if (!cond) throw new Error(`openchara config: ${msg}`); };
    need(/^[a-z][a-z0-9_]*$/.test(oc.character?.key ?? ""), "character.key must be lowercase letters/digits/underscores");
    const character = {
        ...oc.character,
        nouns: oc.character.nouns ?? { one: oc.character.key, many: `${oc.character.key}s` },
        geometry: oc.character.geometry ?? "geometry.humanoid.custom",
        material: oc.character.material ?? "entity_alphatest",
    };
    return {
        name: mod.displayName ?? mod.name,
        namespace: mod.namespace,
        character,
        chatTag: oc.chatTag,
        devTools: oc.devTools ?? false,
        navigationSlots: oc.navigationSlots ?? 10000,
        rules: oc.rules ?? {},
        patchesDir: path.resolve(modDir, oc.patchesDir ?? "PATCHES"),
    };
}

/** Template variables the legacy build filled into engine templates ({{char}} {{Char}} {{chars}} {{Chars}}). */
function nounVars(p) {
    const n = p.character.nouns;
    return { char: p.character.key, Char: capitalize(n.one), chars: n.many, Chars: capitalize(n.many) };
}

function loadProjectContent(mod, modDir) {
    const p = projectFromMod(mod, modDir);
    return { p, content: loadContent(p) };
}

module.exports = { projectFromMod, nounVars, loadProjectContent };
