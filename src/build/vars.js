// content.dslVarsProvider: computed values for OpenChara's entity/item sources and templates.
"use strict";

const { loadProjectContent, nounVars } = require("./project.js");
const species = require("./species.js");
const { loadAppearance, textureMap } = require("./blockAppearance.js");

module.exports = ctx => {
    const { p, content } = loadProjectContent(ctx.mod, ctx.modDir);
    const appearance = loadAppearance({ modDir: ctx.modDir, packages: ctx.packages, extraDirs: ctx.mod.openchara?.ghostSources ?? [] });
    const characters = Object.values(content.characters).sort((a, b) => a.index - b.index);
    const visual = species.renderController({ ns: ctx.mod.namespace, key: p.character.key, characters: content.characters, rigs: content.rigs, defaults: p.character });
    const scale = species.scaleExpression(content.characters, ctx.mod.namespace);
    return {
        ...nounVars(p),
        navigationSlots: p.navigationSlots,
        maxCharacterIndex: Math.max(15, ...characters.map(c => c.index)),
        characterTextures: species.textureTable(content.characters),
        characterGeometry: visual.geometries,
        characterMaterials: { ...visual.materials, ...(visual.emissive ? { glow: "entity_emissive_alpha" } : {}) },
        characterClientScripts: scale ? { scale } : undefined,
        skinVariantMax: species.SKIN_VARIANTS.length - 1,
        maxRigIndex: Math.max(0, ...Object.values(content.rigs).map(r => r.index)),
        ghostTextures: textureMap(appearance),
        ghostBlockCount: appearance.blocks.length + 1, // + the generic fallback at index 0
    };
};
