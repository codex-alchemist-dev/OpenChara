// Camera sessions: the shared mechanism behind every mode that takes the camera away from the player (RTS command
// mode, Build mode). A session owns the safety-critical part - the BODY DOUBLE + gear swap and every way back
// out of it - while each mode only supplies its own state and per-tick behaviour.
//
// Entering (session.enter):
//   1. A body double is spawned where the player stands and takes a full copy of their gear + inventory. Only once
//      that copy is confirmed are the player's own items cleared (the rtsDummy rule: the trusted copy is never
//      destroyed before the new one is confirmed). A serialized backup also goes into a player dynamic property.
//   2. The player turns invisible and protected, and loses movement input (the mode reads WASD itself).
// Leaving (session.exit, or automatically on relog / respawn / death / dimension change / /reload): the player goes
// back to the body double, gets their items back from it (or the backup if it's gone), and only then is it
// removed. Exit hooks run on every one of those paths so a project can reliably clean up what it gave the player.
//
// Modes are described by a plain object:
//   {
//     id, label,                         // "rts", "Command mode"
//     dpState, dpBackup,                 // player dynamic-property keys (never change after release)
//     effects: [...],                    // effect ids applied while active (amplifier 4 for "resistance")
//     tickInterval,                      // ticks between onTick calls
//     prepare?(player),                  // before anything is touched (e.g. close a container screen)
//     makeState(player, { loc, rot, body }) -> state,
//     onStart?(player, state), onStop?(playerId, state),
//     onTick(player, state),
//   }
// At most one session is active per player; the body double entity type and owner tag are shared by all modes.

import { world, system, InputPermissionCategory } from "@minecraft/server";
import { serializeItem, deserializeItem } from "../../itemSerializer.js";
import { NS, TAG } from "../../ids.js";
import { snapshotPlayer, writePlayer, clearPlayer, itemSig, SLOT_COUNT } from "./playerItems.js";

export const BODY_TYPE = `${NS}:rts_body`;
const OWNER_TAG = `${NS}:rtsOwner`;

const sessions = [];
const busy = new Set(); // playerIds mid-enter or mid-restore (shared: one transition per player at a time)
let wired = false;

const say = (p, m) => { try { p.sendMessage(m); } catch (e) { /* offline */ } };
function live(id) { try { const e = id && world.getEntity(id); return e?.isValid ? e : null; } catch (e) { return null; } }

export function createCameraSession(mode) {
    const active = new Map(); // playerId -> state
    const exitHooks = [];
    const readState = player => { try { return JSON.parse(player.getDynamicProperty(mode.dpState) ?? "null"); } catch (e) { return null; } };
    const runExitHooks = player => { for (const fn of exitHooks) { try { fn(player); } catch (e) { console.warn(`[${TAG}] ${mode.label} exit hook: ${e}`); } } };

    function stop(playerId) {
        const s = active.get(playerId);
        if (s) system.clearRun(s.run);
        active.delete(playerId);
        try { mode.onStop?.(playerId, s); } catch (e) { console.warn(`[${TAG}] ${mode.label} stop: ${e}`); }
    }

    // Puts the player back at their body double and hands their items back.
    // Waits (up to ~5s) for the body's chunk to load; falls back to the backup.
    function restore(player) {
        if (busy.has(player.id)) return;
        const st = readState(player);
        try { player.camera.clear(); } catch (e) { /* fine */ }
        try { player.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, true); } catch (e) { /* fine */ }
        for (const fx of mode.effects) { try { player.removeEffect(fx); } catch (e) { /* fine */ } }
        if (!st) { runExitHooks(player); return; }
        busy.add(player.id);
        try { player.teleport(st.loc, { dimension: world.getDimension(st.dim), rotation: st.rot }); } catch (e) { /* fine */ }
        let tries = 0;
        const wait = system.runInterval(() => {
            tries++;
            const body = live(st.bodyId);
            if (!body && tries < 25) return;
            system.clearRun(wait);
            try {
                let items;
                if (body) {
                    const inv = body.getComponent("minecraft:inventory").container;
                    items = [];
                    for (let i = 0; i < SLOT_COUNT; i++) items.push(inv.getItem(i));
                } else {
                    const backup = JSON.parse(player.getDynamicProperty(mode.dpBackup) ?? "null");
                    if (!backup) {
                        say(player, `§c[${mode.label}] Your body double and backup are both gone - your items couldn't be restored. Please report this.`);
                        player.setDynamicProperty(mode.dpState, undefined);
                        runExitHooks(player);
                        return;
                    }
                    items = backup.map(x => (x ? deserializeItem(x) : undefined));
                    say(player, `§e[${mode.label}] Your body double wasn't found - restored your items from the backup.`);
                }
                writePlayer(player, items);
                // Only once the player has everything back does the body go.
                if (body) { body.getComponent("minecraft:inventory").container.clearAll(); body.remove(); }
                player.setDynamicProperty(mode.dpState, undefined);
                player.setDynamicProperty(mode.dpBackup, undefined);
                runExitHooks(player);
                say(player, `§b[${mode.label}] Back in your body.`);
            } catch (e) {
                say(player, `§c[${mode.label}] Couldn't restore your items yet - your body double still holds them. (${e?.message ?? e})`);
            } finally { busy.delete(player.id); }
        }, 4);
    }

    function enter(player) {
        if (active.has(player.id) || busy.has(player.id)) return false;
        if (sessions.some(s => s !== api && s.isActive(player))) { say(player, "§c[Camera] Leave your current camera mode first."); return false; }
        if (readState(player)) { restore(player); return false; }
        busy.add(player.id);
        try {
            mode.prepare?.(player);
            const items = snapshotPlayer(player);            // read only - nothing touched yet
            const rot = player.getRotation();
            const loc = { ...player.location };
            const body = player.dimension.spawnEntity(BODY_TYPE, loc);
            try { body.teleport(loc, { rotation: rot }); } catch (e) { /* fine */ }
            const bodyInv = body.getComponent("minecraft:inventory").container;
            items.forEach((it, i) => { if (it) bodyInv.setItem(i, it); });
            // Confirm the copy before touching the player's own items.
            for (let i = 0; i < SLOT_COUNT; i++) {
                if (itemSig(bodyInv.getItem(i)) !== itemSig(items[i])) {
                    bodyInv.clearAll(); body.remove();
                    throw new Error("couldn't copy your items safely - nothing was changed");
                }
            }
            try { body.nameTag = player.name; body.setDynamicProperty(OWNER_TAG, player.id); } catch (e) { /* fine */ }
            player.setDynamicProperty(mode.dpState, JSON.stringify({ bodyId: body.id, dim: player.dimension.id, loc, rot }));
            try { player.setDynamicProperty(mode.dpBackup, JSON.stringify(items.map(it => (it ? serializeItem(it) : null)))); }
            catch (e) { console.warn(`[${TAG}] ${mode.label} backup skipped: ${e}`); }

            clearPlayer(player);
            for (const fx of mode.effects) { try { player.addEffect(fx, 20000000, { amplifier: fx === "resistance" ? 4 : 0, showParticles: false }); } catch (e) { /* fine */ } }
            try { player.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, false); } catch (e) { /* fine */ }

            const state = mode.makeState(player, { loc, rot, body });
            state.bodyId = body.id;
            mode.onStart?.(player, state);
            state.run = system.runInterval(() => {
                if (!player.isValid) { stop(player.id); return; }
                mode.onTick(player, state);
            }, mode.tickInterval ?? 2);
            active.set(player.id, state);
            return true;
        } catch (e) {
            say(player, `§c[${mode.label}] ${e?.message ?? e}`);
            return false;
        } finally { busy.delete(player.id); }
    }

    function exit(player) {
        stop(player.id);
        restore(player);
    }

    const api = {
        mode,
        enter, exit, stop, restore, readState,
        isActive: player => active.has(player.id),
        state: player => active.get(player.id) ?? null,
        registerExitHook: fn => { exitHooks.push(fn); },
    };
    sessions.push(api);
    return api;
}

/** Relog / respawn / death / dimension change / reload handling and orphan body cleanup, for every session. Idempotent. */
export function startCameraSessions() {
    if (wired) return;
    wired = true;
    world.afterEvents.playerSpawn.subscribe(ev => {
        for (const s of sessions) {
            if (s.isActive(ev.player)) s.stop(ev.player.id);
            if (s.readState(ev.player)) system.runTimeout(() => s.restore(ev.player), 20);
        }
    });
    world.afterEvents.playerLeave.subscribe(ev => { for (const s of sessions) s.stop(ev.playerId); });
    // Death: stop the loop at once (the respawn above restores the items from the body double).
    try {
        world.afterEvents.entityDie.subscribe(ev => {
            const id = ev.deadEntity?.id;
            if (ev.deadEntity?.typeId === "minecraft:player") for (const s of sessions) s.stop(id);
        });
    } catch (e) { /* older API */ }
    // Dimension change while in a camera mode: leave it cleanly (the player is returned to the body double).
    try {
        world.afterEvents.playerDimensionChange.subscribe(ev => { for (const s of sessions) if (s.isActive(ev.player)) s.exit(ev.player); });
    } catch (e) { /* older API */ }

    system.runTimeout(() => {
        for (const p of world.getAllPlayers()) for (const s of sessions) if (s.readState(p) && !s.isActive(p)) s.restore(p);
    }, 40);

    // A body double nobody is using (its owner is online and in no camera mode) is emptied and removed when its chunk loads.
    try {
        world.afterEvents.entityLoad.subscribe(ev => {
            const e = ev.entity;
            if (e?.typeId !== BODY_TYPE) return;
            let owner = null;
            try { owner = world.getAllPlayers().find(p => p.id === e.getDynamicProperty(OWNER_TAG)); } catch (err) { return; }
            if (!owner) return; // offline - they'll be restored from it on rejoin
            if (sessions.some(s => s.readState(owner)?.bodyId === e.id)) return;
            system.run(() => { try { e.getComponent("minecraft:inventory").container.clearAll(); e.remove(); } catch (err) { /* fine */ } });
        });
    } catch (e) { /* older API */ }
}
