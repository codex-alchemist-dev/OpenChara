// Choosing a character's form (a named combat identity: skin + class + abilities + weapon, e.g. March 7th's Hunt vs
// Preservation). Pure: it scores a character's forms against a context and says which one fits best right now. The caller
// (formController.js) applies the answer - sets the form, swaps the weapon - and feeds this the squad AI's tactical picture.
//
// A form (characters/<id>.json "forms"):
//   { "displayName", "class", "skin", "weapons": ["sword"], "tactics": [ { "when": {...}, "score": 2, "urgent": true } ] }
// A character's formPolicy: { "mode": "tactical" | "weapon" | "manual", "minDwellSeconds": 8, "stickiness": 0.75, "swapCost": 0.5 }
//   tactical  the squad AI picks by scoring each form's `tactics` conditions against the situation (default)
//   weapon    whatever she holds decides (forms[x].weapons); no scoring
//   manual    only a player/script change moves her
// Scoring: the sum of the `score` of every tactic whose `when` holds, plus `stickiness` for the current form (so near-ties do
// not flap), minus `swapCost` when the form needs a different weapon than the one in her hand. A form whose weapon she cannot
// get is not a candidate. The current form is kept until `minDwellSeconds` passes, unless a matching tactic is `urgent`.
// The conditions are the same registry as skins (skinRules.js); the tactical ones below are registered with the builtins.

import { matches, registerSkinCondition } from "./skinRules.js";
import { compare } from "./builtinConditions.js";

const DEFAULT_POLICY = { mode: "tactical", minDwellSeconds: 8, stickiness: 0.75, swapCost: 0.5 };

let tacticalRegistered = false;
/** Situation conditions the squad AI fills into the context (enemies, nearestEnemy, alliesWounded, healer, posture, ...). */
export function registerTacticalConditions() {
    if (tacticalRegistered) return;
    tacticalRegistered = true;
    registerSkinCondition("enemies", (arg, ctx) => compare(ctx.enemies ?? 0, arg));
    registerSkinCondition("nearestEnemy", (arg, ctx) => compare(ctx.nearestEnemy ?? Infinity, arg));
    registerSkinCondition("targetDistance", (arg, ctx) => compare(ctx.targetDistance ?? Infinity, arg));
    registerSkinCondition("alliesWounded", (arg, ctx) => compare(ctx.alliesWounded ?? 0, arg));
    registerSkinCondition("alliesDown", (arg, ctx) => compare(ctx.alliesDown ?? 0, arg));
    registerSkinCondition("squadSize", (arg, ctx) => compare(ctx.squadSize ?? 1, arg));
    registerSkinCondition("healer", (arg, ctx) => Boolean(ctx.hasHealer) === Boolean(arg));
    registerSkinCondition("posture", (arg, ctx) => (Array.isArray(arg) ? arg : [arg]).includes(ctx.posture));
    registerSkinCondition("outnumbered", (arg, ctx) => ((ctx.enemies ?? 0) > (ctx.squadSize ?? 1)) === Boolean(arg));
    registerSkinCondition("selfHealth", (arg, ctx) => compare(ctx.healthFraction ?? 1, arg));
}

export const policyOf = species => ({ ...DEFAULT_POLICY, ...(species.formPolicy ?? {}) });
export const formIds = species => Object.keys(species.forms ?? {});
export const defaultFormOf = species => (species.forms?.[species.defaultForm] ? species.defaultForm : formIds(species)[0] ?? null);

/** The form her held weapon category belongs to (first form that lists it), or null. Used when something else changes her weapon. */
export function formForWeapon(species, weapon) {
    if (!weapon) return null;
    return formIds(species).find(id => species.forms[id].weapons?.includes(weapon)) ?? null;
}

/**
 * @param {object} p
 * @param {object} p.species  character data (forms, defaultForm, formPolicy)
 * @param {string|null} p.current   her current form id
 * @param {object} p.ctx      look context + tactical fields; ctx.weapon is the category in her hand
 * @param {number} p.now      ms
 * @param {number} [p.lastChangeAt] ms of her last form change (dwell)
 * @param {(formId: string) => boolean} [p.available] false when she cannot get that form's weapon right now
 * @returns {{ form: string|null, reason: string, scores?: Record<string, number>, urgent?: boolean }}
 */
export function chooseForm({ species, current, ctx, now, lastChangeAt = -Infinity, available = () => true }) {
    const ids = formIds(species);
    if (!ids.length) return { form: null, reason: "no forms" };
    const policy = policyOf(species);
    const fallback = species.forms[current] ? current : defaultFormOf(species);
    if (policy.mode === "manual") return { form: fallback, reason: "manual" };

    if (policy.mode === "weapon") {
        const byWeapon = formForWeapon(species, ctx.weapon);
        return { form: byWeapon && available(byWeapon) ? byWeapon : fallback, reason: byWeapon ? `holding ${ctx.weapon}` : "no weapon match" };
    }

    const candidates = ids.filter(id => available(id) || id === current);
    const scores = {}, urgentBy = {};
    for (const id of candidates) {
        const form = species.forms[id];
        let score = id === current ? policy.stickiness : 0;
        for (const t of form.tactics ?? []) {
            if (matches(t.when, ctx)) { score += t.score; if (t.urgent) urgentBy[id] = true; }
        }
        if (form.weapons?.length && !form.weapons.includes(ctx.weapon)) score -= policy.swapCost;
        scores[id] = score;
    }
    let best = null;
    for (const id of candidates) {
        if (best === null || scores[id] > scores[best] || (scores[id] === scores[best] && id === current)) best = id;
    }
    best ??= fallback;
    const urgent = Boolean(urgentBy[best]);
    if (best !== current && species.forms[current] && !urgent && now - lastChangeAt < policy.minDwellSeconds * 1000) {
        return { form: current, reason: "dwell", scores };
    }
    return { form: best, reason: best === current ? "unchanged" : urgent ? "urgent tactic" : "tactical score", scores, urgent };
}
