// content.dslVarsProvider: computed values for OpenChara's entity/item sources and templates.
"use strict";

const { loadProjectContent, nounVars } = require("./project.js");
const { loadAppearance, textureMap } = require("./blockAppearance.js");

module.exports = ctx => {
    const { p, content } = loadProjectContent(ctx.mod, ctx.modDir);
    const appearance = loadAppearance({ modDir: ctx.modDir, packages: ctx.packages, extraDirs: ctx.mod.openchara?.ghostSources ?? [] });
    const characters = Object.values(content.characters).sort((a, b) => a.index - b.index);
    const characterTextures = {};
    for (const c of characters) characterTextures[`species${c.index}`] = c.texture;
    return {
        ...nounVars(p),
        navigationSlots: p.navigationSlots,
        maxCharacterIndex: Math.max(15, ...characters.map(c => c.index)),
        characterTextures,
        characterGeometry: p.character.geometry,
        characterMaterial: p.character.material,
        ghostTextures: textureMap(appearance),
        ghostBlockCount: appearance.blocks.length + 1, // + the generic fallback at index 0
    };
};
