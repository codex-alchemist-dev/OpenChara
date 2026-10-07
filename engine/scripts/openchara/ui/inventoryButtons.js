// Inventory buttons bound to the real game (the decision is inventoryButtonsCore.cjs): locked marker items in the player's
// inventory slots that run an action when clicked. Works in the vanilla inventory screen as it is; a custom inventory screen
// could restyle those slots as real buttons (see docs/CONTROL_BAR.md).
//
//   setInventoryButtons(player, { 9: { item: "cw:rts_move", name: "Move here", lore: ["..."], onPress(player, { sneaking }) {} } });
//   clearInventoryButtons(player);
//
// Detection is a short poll while a player has buttons (every POLL_TICKS) plus the stable playerInventoryItemChange event as a
// fast path. Markers are locked "inventory" (cannot be dropped or crafted with, but CAN be moved - moving one is the click),
// kept on death, and swept from anywhere they end up.

import { world, system, ItemStack, ItemLockMode } from "@minecraft/server";
import core from "./inventoryButtonsCore.cjs";
import { TAG } from "../ids.js";

const MARKER = "§r§8oc:btn";
const POLL_TICKS = 2;
const FIRST_SLOT = 9, LAST_SLOT = 35;   // the main inventory; the hotbar belongs to the control bar's item-use tools

const state = new Map();   // player id -> { buttons: Map<slot, spec> }
let started = false;

const isMarker = item => { try { return Boolean(item?.getLore?.().includes(MARKER)); } catch (e) { return false; } };

function makeMarker(spec) {
    const item = new ItemStack(spec.item, 1);
    try { if (spec.name) item.nameTag = spec.name; } catch (e) { /* fine */ }
    try { item.setLore([...(spec.lore ?? []), MARKER]); } catch (e) { /* fine */ }
    try { item.lockMode = ItemLockMode.inventory; } catch (e) { /* fine */ }
    try { item.keepOnDeath = true; } catch (e) { /* fine */ }
    return item;
}

function container(player) { return player.getComponent("minecraft:inventory")?.container; }

function check(player) {
    const st = state.get(player.id);
    if (!st) return;
    let inv, cursor;
    try { inv = container(player); cursor = player.getComponent("minecraft:cursor_inventory"); } catch (e) { return; }
    if (!inv) return;

    const slots = new Map();
    for (let i = 0; i < inv.size; i++) {
        const it = inv.getItem(i);
        const marker = isMarker(it);
        if (st.buttons.has(i) || marker) slots.set(i, { marker, empty: !it });
    }
    const plan = core.reconcile({ buttons: st.buttons.keys(), slots, cursorMarker: isMarker(cursor?.item) });

    if (plan.clearCursor) { try { cursor.clear(); } catch (e) { /* fine */ } }
    for (const slot of plan.stray) { try { inv.setItem(slot, undefined); } catch (e) { /* fine */ } }
    for (const slot of plan.displaced) {
        const real = inv.getItem(slot);     // the player swapped a real item in: keep it, never overwrite it
        inv.setItem(slot, undefined);
        try { const left = inv.addItem(real); if (left) player.dimension.spawnItem(left, player.location); } catch (e) { /* fine */ }
    }
    for (const slot of plan.restore) { try { inv.setItem(slot, makeMarker(st.buttons.get(slot))); } catch (e) { console.warn(`[${TAG}] inventory button restore: ${e}`); } }
    for (const slot of plan.pressed) {
        const spec = st.buttons.get(slot);
        try { spec.onPress?.(player, { sneaking: Boolean(player.isSneaking), slot }); }
        catch (e) { try { player.onScreenDisplay.setActionBar(`§c${e?.message ?? e}`); } catch (err) { /* offline */ } }
    }
}

function start() {
    if (started) return;
    started = true;
    system.runInterval(() => { for (const id of [...state.keys()]) { const p = world.getAllPlayers().find(x => x.id === id); if (p) check(p); else state.delete(id); } }, POLL_TICKS);
    try {
        world.afterEvents.playerInventoryItemChange.subscribe(ev => {
            if (state.has(ev.player.id) && isMarker(ev.beforeItemStack)) system.run(() => check(ev.player));
        });
    } catch (e) { /* the poll alone is enough */ }
}

/**
 * @param {object} player
 * @param {Record<number, {item: string, name?: string, lore?: string[], onPress?: (player: object, info: {sneaking: boolean, slot: number}) => void}>} buttons slot -> button
 */
export function setInventoryButtons(player, buttons) {
    start();
    clearInventoryButtons(player);
    const map = new Map();
    const inv = container(player);
    for (const [slot, spec] of Object.entries(buttons)) {
        const n = Number(slot);
        if (!(n >= FIRST_SLOT && n <= LAST_SLOT)) throw new Error(`inventory button slot ${slot} is not in the main inventory (${FIRST_SLOT}-${LAST_SLOT})`);
        map.set(n, spec);
        // whatever the player had there is not destroyed: it is returned (to a free slot, or dropped)
        const existing = inv.getItem(n);
        if (existing && !isMarker(existing)) {
            inv.setItem(n, undefined);
            try { const left = inv.addItem(existing); if (left) player.dimension.spawnItem(left, player.location); } catch (e) { /* fine */ }
        }
        inv.setItem(n, makeMarker(spec));
    }
    state.set(player.id, { buttons: map });
}

/** Removes the player's buttons and every marker item wherever it ended up. */
export function clearInventoryButtons(player) {
    state.delete(player.id);
    try {
        const cursor = player.getComponent("minecraft:cursor_inventory");
        if (isMarker(cursor?.item)) cursor.clear();
    } catch (e) { /* fine */ }
    try {
        const inv = container(player);
        for (let i = 0; i < inv.size; i++) if (isMarker(inv.getItem(i))) inv.setItem(i, undefined);
    } catch (e) { /* fine */ }
}

export const hasInventoryButtons = player => state.has(player.id);
