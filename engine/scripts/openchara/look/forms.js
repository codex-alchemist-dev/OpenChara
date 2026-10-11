// Forms at the record level. A character's FORM is a named combat identity she can switch between (March 7th: "hunt" with a
// sword, "preservation" with a bow). A form can change her class - so her stats, abilities and skill tree - her base skin, and
// the weapon she carries. Only the form id is stored (record.form); everything else is looked up from her species data.
// Skill progress that belongs to one form is just skill nodes of that form's class: ids are unique per class, so a flat
// unlockedSkills list already keeps the trees apart.

import { CHARACTERS } from "../content.generated.js";
import { getClass } from "../classData.js";
import { updateCharacter } from "../characterRecord.js";
import { emit } from "../events.js";
import { NS } from "../ids.js";
import { defaultFormOf, formIds } from "./formSelect.js";

export const speciesOf = record => CHARACTERS[record?.species] ?? null;

/** Her current form id, or null when her species has no forms. A stale/unknown stored form falls back to the species default. */
export function formOf(record) {
    const sp = speciesOf(record);
    if (!sp?.forms) return null;
    return sp.forms[record.form] ? record.form : defaultFormOf(sp);
}

export const formDef = record => { const sp = speciesOf(record), f = formOf(record); return f ? sp.forms[f] : null; };

/** The class id in force: her form's class when it has one, else her own. Use this everywhere instead of record.class. */
export function classIdOf(record) {
    return formDef(record)?.class ?? record.class;
}

export const classOf = record => getClass(classIdOf(record));

/** Combat style from her class (the entity's role_melee / role_ranged component groups). Safe on a gone entity. */
export function applyCombatRole(entity, record) {
    const ranged = classOf(record).positioning?.role === "ranged";
    try { entity.triggerEvent(ranged ? `${NS}:role_ranged` : `${NS}:role_melee`); } catch (e) { /* fine */ }
}

/**
 * Switches her form. Stored on the record (derived fields are recomputed by updateCharacter) and announced with
 * on("formChanged", { owner, characterId, from, to, reason, record }) so the look system, UI and project can follow.
 * @returns {object|null} the new record, or null if nothing changed
 */
export function setForm(owner, characterId, formId, reason = "script") {
    let from = null;
    const next = updateCharacter(owner, characterId, old => {
        const sp = speciesOf(old);
        if (!sp?.forms?.[formId]) throw new Error(`${old.species} has no form "${formId}" (${formIds(sp ?? {}).join(", ") || "none"})`);
        from = formOf(old);
        if (from === formId && old.form === formId) return null;
        return { ...old, form: formId };
    });
    if (!next || from === formId) return null;
    emit("formChanged", { owner, characterId, from, to: formId, reason, record: next });
    return next;
}

/**
 * The abilities she can use right now: the defaults of her current class plus any ability her unlocked skill nodes of THAT class
 * grant (`node.grantsAbility`). Switching form switches the whole set, so each form has its own kit and tree.
 */
export function activeAbilities(record) {
    const cls = classOf(record);
    const out = new Set(cls.defaultAbilities ?? []);
    for (const id of record.unlockedSkills ?? []) {
        const granted = cls.skillTree?.nodes?.[id]?.grantsAbility;
        if (granted) out.add(granted);
    }
    return [...out];
}
