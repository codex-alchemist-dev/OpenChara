// Applies form selection in the world. The squad AI (coordinationTick) hands each member the tactical picture; this builds the
// selection context, asks chooseForm (formSelect.js), then makes the choice real: stores the form, swaps the weapon the new
// form needs, and re-asserts her combat role. Characters outside a squad are evaluated once a second on their own.
//
// Two ways a form changes, both handled here:
//   tactical  the AI decides a different form fits the situation -> switch form AND put that form's weapon in her hand
//   external  something else put a different weapon in her hand (a player, a script) -> she follows: the form matching the
//             weapon wins. A swap this controller started is remembered for a few seconds so it is not mistaken for this.

import { EquipmentSlot } from "@minecraft/server";
import { on } from "../events.js";
import { getCharacter } from "../characterRecord.js";
import { findNearbyHostiles } from "../perception.js";
import { healthBucket } from "../fsm.js";
import { weaponCategory } from "./weapons.js";
import { chooseForm, formForWeapon, formIds } from "./formSelect.js";
import { buildLookContext } from "./lookContext.js";
import { getLookState } from "./lookState.js";
import { formOf, speciesOf, setForm, applyCombatRole } from "./forms.js";

const SWAP_GRACE_MS = 4000;
const lastChange = new Map();     // characterId -> ms of the last form change
const lastHeld = new Map();       // characterId -> weapon category seen last evaluation
const swapUntil = new Map();      // characterId -> ms until which a weapon change is our own

/** Weapon categories she holds or carries (hand + inventory), as a Set. */
export function carriedWeapons(entity) {
    const out = new Set();
    try {
        const held = entity.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
        if (held) out.add(weaponCategory(held.typeId));
        const inv = entity.getComponent("minecraft:inventory")?.container;
        for (let i = 0; inv && i < inv.size; i++) { const it = inv.getItem(i); if (it) out.add(weaponCategory(it.typeId)); }
    } catch (e) { /* fine */ }
    out.delete(null);
    return out;
}

/** Moves the first carried item of one of `categories` into her main hand (the old hand item goes to its slot). */
export function equipWeapon(entity, categories) {
    try {
        const eq = entity.getComponent("minecraft:equippable"), inv = entity.getComponent("minecraft:inventory")?.container;
        const held = eq.getEquipment(EquipmentSlot.Mainhand);
        if (held && categories.includes(weaponCategory(held.typeId))) return true;
        for (let i = 0; inv && i < inv.size; i++) {
            const it = inv.getItem(i);
            if (it && categories.includes(weaponCategory(it.typeId))) { eq.setEquipment(EquipmentSlot.Mainhand, it); inv.setItem(i, held); return true; }
        }
    } catch (e) { /* fine */ }
    return false;
}

/** The squad AI's picture for one member, as context fields the tactical conditions read. */
export function tacticalFields({ member, members = [], hostiles = [], posture = null }) {
    const loc = member.entity.location;
    const dists = hostiles.map(h => Math.hypot(h.location.x - loc.x, h.location.z - loc.z)).sort((a, b) => a - b);
    const others = members.filter(m => m !== member);
    return {
        enemies: hostiles.length,
        nearestEnemy: dists[0] ?? Infinity,
        alliesWounded: others.filter(m => healthBucket(m.entity) !== "healthy").length,
        alliesDown: others.filter(m => healthBucket(m.entity) === "critical").length,
        squadSize: Math.max(1, members.length),
        hasHealer: others.some(m => speciesOf(m.record)?.forms && formOf(m.record) && /healer/.test(String(m.record.class))),
        posture,
    };
}

/** Decides and applies one character's form. `tactical` = extra context fields (tacticalFields). */
export function evaluateForm({ owner, characterId, entity, record = getCharacter(owner, characterId), tactical = {} }) {
    const species = speciesOf(record);
    if (!species?.forms || !owner) return null;
    const now = Date.now();
    const current = formOf(record);
    const state = getLookState(owner, characterId, record);
    const ctx = { ...buildLookContext({ entity, record, owner, form: current, state }), ...tactical };

    // external weapon change: she follows what is in her hand
    const prevHeld = lastHeld.get(characterId);
    lastHeld.set(characterId, ctx.weapon);
    if (prevHeld !== undefined && prevHeld !== ctx.weapon && now >= (swapUntil.get(characterId) ?? 0)) {
        const byWeapon = formForWeapon(species, ctx.weapon);
        if (byWeapon && byWeapon !== current) return commit(owner, characterId, entity, byWeapon, "weapon changed", now);
    }

    const carried = carriedWeapons(entity);
    const available = id => { const w = species.forms[id].weapons; return !w || w.some(x => carried.has(x)); };
    const choice = chooseForm({ species, current, ctx, now, lastChangeAt: lastChange.get(characterId), available });
    if (!choice.form || choice.form === current) return null;
    return commit(owner, characterId, entity, choice.form, choice.reason, now);
}

function commit(owner, characterId, entity, formId, reason, now) {
    const species = speciesOf(getCharacter(owner, characterId));
    const weapons = species.forms[formId].weapons;
    if (weapons?.length) { swapUntil.set(characterId, now + SWAP_GRACE_MS); equipWeapon(entity, weapons); }
    const next = setForm(owner, characterId, formId, reason);
    if (!next) return null;
    lastChange.set(characterId, now);
    lastHeld.set(characterId, weaponCategory(safeHeld(entity)));
    applyCombatRole(entity, next);
    return next;
}

const safeHeld = entity => { try { return entity.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand)?.typeId; } catch (e) { return undefined; } };

/** Called by the squad loop after it has the members, hostiles and posture for a cycle. */
export function evaluateSquadForms(owner, members, hostiles, posture) {
    for (const member of members) {
        evaluateForm({ owner, characterId: member.characterId, entity: member.entity, record: member.record, tactical: tacticalFields({ member, members, hostiles, posture }) });
    }
}

/** Characters that are not in a squad are evaluated on their own once a second, with whatever hostiles are near. */
export function startFormController() {
    on("second", ({ owner, characterId, entity }) => {
        const record = owner ? getCharacter(owner, characterId) : null;
        if (!record || record.squadId || !speciesOf(record)?.forms) return;
        let hostiles = [];
        try { hostiles = findNearbyHostiles(entity.dimension, entity.location, 16); } catch (e) { /* fine */ }
        evaluateForm({ owner, characterId, entity, record, tactical: tacticalFields({ member: { entity, record }, members: [{ entity, record }], hostiles }) });
    });
    on("despawn", ({ characterId }) => { lastChange.delete(characterId); lastHeld.delete(characterId); swapUntil.delete(characterId); });
}

export { formIds };
