// RTS multi-selection state and the two-click box-select state machine. Pure logic, no game imports: callers
// feed it screen positions (see screenCursor.js) and a list of candidates, and apply the result.
//
// Selection = individual characters + whole squads. Orders act on `resolveMembers()` (the union of both).
// Box select: the select item is used once to drop corner A (the live rectangle then follows the cursor and the
// hover preview shows what a commit would add), used again to commit the rectangle into the selection.

export function createSelection() {
    return { charIds: new Set(), squadIds: new Set(), cornerA: null };
}

export function clearSelection(sel) {
    sel.charIds.clear();
    sel.squadIds.clear();
    sel.cornerA = null;
}

export const isEmpty = sel => sel.charIds.size === 0 && sel.squadIds.size === 0;

/**
 * Candidates inside a screen rectangle.
 * @param {{u0:number,v0:number,u1:number,v1:number}} rect
 * @param {Array<{characterId:string, squadId?:string|null, u:number, v:number}>} candidates - waifus already projected to the screen
 * @returns {{charIds: string[], squadsTouched: string[], squadsFullyInside: string[]}}
 */
export function boxQuery(rect, candidates) {
    const inside = candidates.filter(c => c.u >= rect.u0 && c.u <= rect.u1 && c.v >= rect.v0 && c.v <= rect.v1);
    const bySquad = new Map();
    for (const c of candidates) if (c.squadId) bySquad.set(c.squadId, [...(bySquad.get(c.squadId) ?? []), c.characterId]);
    const insideIds = new Set(inside.map(c => c.characterId));
    const squadsTouched = [...new Set(inside.map(c => c.squadId).filter(Boolean))];
    const squadsFullyInside = squadsTouched.filter(q => bySquad.get(q).every(id => insideIds.has(id)));
    return { charIds: inside.map(c => c.characterId), squadsTouched, squadsFullyInside };
}

/**
 * One use of the select item.
 * @returns {{kind:"corner"} | {kind:"box", rect, result}} what happened. "corner": corner A was dropped.
 */
export function useSelect(sel, cursor, candidates, { additive = true } = {}) {
    if (!sel.cornerA) {
        sel.cornerA = { u: cursor.u, v: cursor.v };
        return { kind: "corner" };
    }
    const a = sel.cornerA, b = cursor;
    sel.cornerA = null;
    const rect = { u0: Math.min(a.u, b.u), v0: Math.min(a.v, b.v), u1: Math.max(a.u, b.u), v1: Math.max(a.v, b.v) };
    const result = boxQuery(rect, candidates);
    if (!additive) { sel.charIds.clear(); sel.squadIds.clear(); }
    for (const id of result.charIds) sel.charIds.add(id);
    for (const q of result.squadsFullyInside) sel.squadIds.add(q);
    return { kind: "box", rect, result };
}

/** Toggle one character (the click-on-a-waifu path). Returns true if she is now selected. */
export function toggleCharacter(sel, characterId) {
    if (sel.charIds.delete(characterId)) return false;
    sel.charIds.add(characterId);
    return true;
}

/** Live rectangle between corner A and the cursor, or null if no corner is dropped. */
export function pendingRect(sel, cursor) {
    if (!sel.cornerA) return null;
    const a = sel.cornerA;
    return { u0: Math.min(a.u, cursor.u), v0: Math.min(a.v, cursor.v), u1: Math.max(a.u, cursor.u), v1: Math.max(a.v, cursor.v) };
}

/**
 * Everyone an order should affect: selected characters plus the members of selected squads (no duplicates).
 * @param {(squadId:string) => string[]} membersOfSquad
 */
export function resolveMembers(sel, membersOfSquad) {
    const out = new Set(sel.charIds);
    for (const q of sel.squadIds) for (const id of membersOfSquad(q) ?? []) out.add(id);
    return [...out];
}

/** Drops characters/squads that no longer exist (released, deleted). */
export function prune(sel, { hasCharacter, hasSquad }) {
    for (const id of [...sel.charIds]) if (!hasCharacter(id)) sel.charIds.delete(id);
    for (const q of [...sel.squadIds]) if (!hasSquad(q)) sel.squadIds.delete(q);
}
