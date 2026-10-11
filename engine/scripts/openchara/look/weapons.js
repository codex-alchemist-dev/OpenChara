// Weapon categories. A form can require a category ("sword", "bow") and a skin/tactical rule can test it, so the category of an
// item id has to be one shared answer. The defaults cover vanilla; a project adds modded items with registerWeaponCategory.
// Pure: item ids in, category out.

const RULES = [];   // [regex, category]; project rules go first

export function registerWeaponCategory(pattern, category) {
    RULES.unshift([pattern instanceof RegExp ? pattern : new RegExp(pattern), category]);
}

const DEFAULTS = [
    [/(^|:)(.+_)?crossbow$/, "crossbow"], [/(^|:)bow$/, "bow"], [/(^|:)trident$/, "trident"], [/(^|:)mace$/, "mace"],
    [/_sword$/, "sword"], [/_axe$/, "axe"], [/(^|:)shield$/, "shield"], [/_spear$/, "spear"], [/_pickaxe$/, "pickaxe"], [/_shovel$/, "shovel"],
];

/** @returns {string|null} "sword", "bow", ... or null for anything that is not a weapon/tool of a known category */
export function weaponCategory(typeId) {
    if (!typeId) return null;
    for (const [re, cat] of [...RULES, ...DEFAULTS]) if (re.test(typeId)) return cat;
    return null;
}
