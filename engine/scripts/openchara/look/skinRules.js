// Which skin a character shows. A character's `skinRules` are { skin, when, priority? } entries; the highest-priority rule whose
// `when` holds wins (ties: the one written first), else her form's base skin, else "default". `when` is a set of named
// conditions that must all hold, plus the combinators all / any (arrays) and not. A condition is a function (arg, ctx) => boolean
// registered by name - the engine ships the builtins (builtinConditions.js) and a project registers its own, so "a dozen other
// conditions" is a registration, never an engine change. Pure: ctx is plain data built by lookContext.js.
//
//   { "skin": "hunt_night", "priority": 20, "when": { "form": "hunt", "time": "night", "random": { "name": "freckles", "of": 3, "is": 0 } } }

const conditions = new Map();

/** @param {string} name @param {(arg: any, ctx: object) => boolean} fn */
export function registerSkinCondition(name, fn) {
    if (!/^[a-z][A-Za-z0-9_]*$/.test(name)) throw new Error(`skin condition name "${name}" must start with a lowercase letter (letters/digits/underscores)`);
    if (conditions.has(name)) throw new Error(`skin condition "${name}" is already registered`);
    conditions.set(name, fn);
}

export const hasSkinCondition = name => conditions.has(name);
export const skinConditionNames = () => [...conditions.keys()].sort();

/** True when every part of `when` holds for `ctx`. An unknown condition name is false (and reported), never a crash. */
export function matches(when, ctx, onUnknown = () => {}) {
    for (const [key, arg] of Object.entries(when ?? {})) {
        if (key === "all") { if (!arg.every(w => matches(w, ctx, onUnknown))) return false; }
        else if (key === "any") { if (!arg.some(w => matches(w, ctx, onUnknown))) return false; }
        else if (key === "not") { if (matches(arg, ctx, onUnknown)) return false; }
        else {
            const fn = conditions.get(key);
            if (!fn) { onUnknown(key); return false; }
            let ok = false;
            try { ok = Boolean(fn(arg, ctx)); } catch (e) { onUnknown(key, e); }
            if (!ok) return false;
        }
    }
    return true;
}

/**
 * @param {object} species the character's data (skins, skinRules, forms)
 * @param {object} ctx     plain data: { form, ... } (see lookContext.js)
 * @returns {{ skin: string, rule: object|null }} the skin NAME (the caller maps it to a global skin id)
 */
export function resolveSkin(species, ctx, onUnknown) {
    const known = new Set(["default", ...Object.keys(species.skins ?? {})]);
    let best = null, bestPriority = -Infinity;
    for (const rule of species.skinRules ?? []) {
        if (!known.has(rule.skin)) continue;
        const priority = rule.priority ?? 0;
        if (priority <= bestPriority) continue;           // strictly greater: earlier rules win ties
        if (matches(rule.when, ctx, onUnknown)) { best = rule; bestPriority = priority; }
    }
    if (best) return { skin: best.skin, rule: best };
    const formSkin = ctx.form ? species.forms?.[ctx.form]?.skin : null;
    return { skin: formSkin && known.has(formSkin) ? formSkin : "default", rule: null };
}
