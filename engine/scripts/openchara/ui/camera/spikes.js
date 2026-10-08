// In-game spikes for the camera modes' unproven Bedrock behaviour. Run as `/scriptevent <ns>:spike <name> [args]`;
// each prints what it found to chat so the answer can be copied back. See OpenChara docs/BUILD.md ("Spikes").
//
//   fov                  S1  does the camera API expose FOV control? (prints the available camera methods)
//   anchor [distance]    S4  spawn a tick_world camera anchor <distance> blocks away (default 192) and report whether
//                            the chunk there becomes loaded, then remove it
//   hud [seconds]        S3  draw the fast-HUD cursor moving in a circle for N seconds (default 15), outside RTS
//   screen <w> <h>       S3  set this player's HUD screen size in GUI pixels (cursor/box calibration)
//   toast                S3a queue one normal HUD toast: does the plain (non-fast) HUD channel show anything at all?
//   hold                 S2  report itemUse/itemStartUse/itemStopUse events seen on the held item for 20s
//   ghosts [seconds]     S6  show every ghost-block texture in a row in front of you (plus a red mine cube) so a wrong
//                            texture path (missing-texture checkerboard) or tint problem is obvious
//   display <block id>   S7  show ONE block (any id, modded too) as an FMBE display fox (left) next to the generic ghost cube
//                            (right) - FMBE is how blocks with no texture data are shown. Removes them after 30s
//   fmbe [ypos scale xpos zpos entityY]  S7b show / set the FMBE display placement (then copy it into rule ghostFmbe)
//   invclick             S8  can a click on an inventory item be detected? Puts a stick (lock mode: inventory) in slot 20 and, for 40s,
//                            reports playerInventoryItemChange and - where this API version has them - playerCursorItemGrab/Release.
//                            Open your inventory, click / drag the stick, read the report
//   scroll               S5  list world events that look like hotbar/slot/scroll changes and report them for 20s
//                            (a scroll signal would let Build mode's extend tools use the mouse wheel)
//
// Everything is opt-in and removes what it spawned.

import { world, system, BlockTypes, ItemStack, ItemLockMode } from "@minecraft/server";
import { ANCHOR_TYPE } from "./chunkAnchor.js";
import { setRtsHudScreen, getRtsHudScreen, hudSpike } from "./rtsHud.js";
import { hudDebug, showToast } from "../hud.js";
import { createGhostLayer, releaseGhostLayer, ghostTextureIndex, setGhostFmbe, getGhostFmbe } from "../../build/ghostEntities.js";
import { GHOST_INDEX } from "../../build/ghostTable.generated.js";
import { NS } from "../../ids.js";

// Spike output goes to chat AND the content log (console.warn lands there), so a report can be read without copying chat.
const say = (p, m) => { console.warn(`[spike] ${m}`); try { p.sendMessage(`§e[spike] §r${m}`); } catch (e) { /* offline */ } };

function spikeFov(player) {
    const cam = player.camera;
    const methods = [];
    for (let o = cam; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) methods.push(...Object.getOwnPropertyNames(o));
    say(player, `camera API: ${[...new Set(methods)].filter(m => m !== "constructor").join(", ")}`);
    say(player, `setFov: ${typeof cam.setFov}`);
}

function spikeInvClick(player) {
    const inv = player.getComponent("minecraft:inventory").container;
    const probe = new ItemStack("minecraft:stick", 1);
    probe.nameTag = "§bclick me";
    probe.lockMode = ItemLockMode.inventory;
    const slot = 20;
    const before = inv.getItem(slot);
    inv.setItem(slot, probe);
    const subs = [];
    const watch = (signal, label) => {
        try {
            const sig = world.afterEvents[signal];
            if (!sig) { say(player, `${label}: not in this @minecraft/server version`); return; }
            const fn = ev => { if (ev.player?.id === player.id) say(player, `${label}: ${JSON.stringify({ slot: ev.slot, inventoryType: ev.inventoryType, item: (ev.itemStack ?? ev.item)?.typeId ?? null, before: ev.beforeItemStack?.typeId ?? null, keys: Object.keys(ev).slice(0, 8) })}`); };
            sig.subscribe(fn);
            subs.push(() => sig.unsubscribe(fn));
            say(player, `${label}: listening`);
        } catch (e) { say(player, `${label}: ${e?.message ?? e}`); }
    };
    watch("playerInventoryItemChange", "playerInventoryItemChange");
    watch("playerCursorItemGrab", "playerCursorItemGrab");
    watch("playerCursorItemRelease", "playerCursorItemRelease");
    say(player, "A '§bclick me§r' stick is in inventory slot 21 (lock: inventory). Open the inventory and click it, drag it, drop it outside. 40s.");
    system.runTimeout(() => {
        for (const off of subs) { try { off(); } catch (e) { /* fine */ } }
        try { if (inv.getItem(slot)?.typeId === "minecraft:stick") inv.setItem(slot, before); } catch (e) { /* fine */ }
        say(player, "invclick done.");
    }, 800);
}

function spikeAnchor(player, distance) {
    const here = player.location;
    const target = { x: here.x + distance, y: here.y + 5, z: here.z };
    const dim = player.dimension;
    const loadedBefore = (() => { try { return Boolean(dim.getBlock(target)); } catch (e) { return false; } })();
    let anchor;
    try {
        anchor = dim.spawnEntity(ANCHOR_TYPE, target);
    } catch (e) {
        say(player, `spawning the anchor failed (${e?.message ?? e}) - the target may be in an unloaded chunk; this is itself a finding.`);
        return;
    }
    say(player, `anchor spawned ${distance} blocks away (chunk loaded before: ${loadedBefore}). Checking in 3s and 10s...`);
    for (const ticks of [60, 200]) {
        system.runTimeout(() => {
            let loaded = false, ticking = false;
            try { loaded = Boolean(dim.getBlock(target)); } catch (e) { /* unloaded */ }
            try { ticking = Boolean(anchor?.isValid); } catch (e) { /* gone */ }
            say(player, `+${ticks / 20}s: block at target readable=${loaded}, anchor valid=${ticking}`);
        }, ticks);
    }
    system.runTimeout(() => { try { anchor?.remove(); } catch (e) { /* fine */ } say(player, "anchor removed."); }, 220);
}

function spikeHud(player, seconds) {
    hudSpike.set(player.id, system.currentTick + seconds * 20);
    // Layer-by-layer report so a missing sprite can be traced: server side first (this), then the client.
    const d = hudDebug(player);
    say(player, `HUD pipeline: ${d.huds.length} huds [${d.huds.join(", ")}]; providers: ${d.providers.includes("rtsCursor") ? "rtsCursor registered" : "rtsCursor MISSING"}`);
    let n = 0;
    const id = system.runInterval(() => {
        const q = hudDebug(player);
        say(player, `+${++n}s queued=${q.queued} fast=${q.queuedFast} lastSent=${q.lastSent.join(" | ")}`);
        if (n >= Math.min(seconds, 5)) system.clearRun(id);
    }, 20);
    say(player, `fast HUD test for ${seconds}s: a sprite circles the screen with a rectangle at the centre. Screen size used: ${JSON.stringify(getRtsHudScreen(player))}. Needs rtsHudCursor on to be useful in RTS.`);
}

function spikeToast(player) {
    showToast(player, "HUD toast test - if you can read this, the normal HUD channel works");
    say(player, "queued a toast (normal HUD channel, not the fast one). It should appear above the hotbar for ~3s. Settings > HUD must have it on.");
}

function spikeHold(player) {
    const seen = [];
    const rec = name => ev => { if (ev.source?.id === player.id) seen.push(`${name}:${ev.itemStack?.typeId ?? "?"}@${system.currentTick}`); };
    const subs = [];
    for (const name of ["itemUse", "itemStartUse", "itemStopUse", "itemReleaseUse"]) {
        try { const sig = world.afterEvents[name]; if (sig) { const fn = rec(name); sig.subscribe(fn); subs.push([sig, fn]); } } catch (e) { /* unavailable */ }
    }
    say(player, `listening 20s for use events on the held item (${subs.length} event kinds available)...`);
    system.runTimeout(() => {
        for (const [sig, fn] of subs) { try { sig.unsubscribe(fn); } catch (e) { /* fine */ } }
        say(player, seen.length ? seen.slice(0, 20).join("  ") : "no use events seen.");
    }, 400);
}

function spikeScroll(player) {
    const names = [];
    for (const src of [world.afterEvents, world.beforeEvents]) {
        try { for (const k of Object.keys(src)) if (/hotbar|slot|scroll|select/i.test(k)) names.push([k, src[k]]); } catch (e) { /* none */ }
    }
    say(player, names.length ? `candidate events: ${names.map(n => n[0]).join(", ")}` : "no hotbar/slot/scroll events exist on this API version.");
    const seen = [];
    const subs = [];
    for (const [k, sig] of names) {
        try { const fn = ev => seen.push(`${k}:${JSON.stringify(ev.newSlotIndex ?? ev.slot ?? "")}@${system.currentTick}`); sig.subscribe(fn); subs.push([sig, fn]); } catch (e) { /* before-events may need privileges */ }
    }
    if (!subs.length) return;
    say(player, "now scroll the hotbar / press number keys for 20s...");
    system.runTimeout(() => {
        for (const [sig, fn] of subs) { try { sig.unsubscribe(fn); } catch (e) { /* fine */ } }
        say(player, seen.length ? seen.slice(0, 20).join("  ") : "nothing fired.");
    }, 400);
}

function spikeGhosts(player, seconds) {
    const layer = createGhostLayer(player, { maxSpawn: 100 });
    const base = { x: Math.floor(player.location.x), y: Math.floor(player.location.y), z: Math.floor(player.location.z) + 3 };
    const perRow = 12;
    // A spread of real blocks from the generated table (every Nth, up to 60), one unknown block (generic fallback) and a mine cube.
    const ids = Object.keys(GHOST_INDEX);
    const step = Math.max(1, Math.floor(ids.length / 60));
    const sample = ids.filter((_, i) => i % step === 0).slice(0, 60);
    const cells = sample.map((block, i) => ({ x: base.x + (i % perRow) * 2, y: base.y + Math.floor(i / perRow) * 2, z: base.z, op: "build", block }));
    cells.push({ x: base.x, y: base.y - 2, z: base.z, op: "build", block: "modded:not_in_any_source" });
    cells.push({ x: base.x + 2, y: base.y - 2, z: base.z, op: "mine" });
    layer.sync(cells);
    // Which real block ids in this game have no appearance (so would show as the generic ghost)? Needs BlockTypes.
    let missing = [];
    try { missing = BlockTypes.getAll().map(t => t.id).filter(id => ghostTextureIndex(id) === 0 && id !== "minecraft:stone"); } catch (e) { /* older API */ }
    say(player, `${missing.length} block ids in this game have no appearance${missing.length ? `, e.g. ${missing.slice(0, 25).join(", ")}` : ""}.`);
    say(player, `${ids.length} blocks are in the ghost table. Placed ${cells.length} ghost cubes 3 blocks in front of you: ${sample.length} sampled blocks, then (front-left) one block that is in no source (generic fallback) and a red mine cube. Look for missing-texture checkerboards, wrong faces (grass top/side), tint and transparency. Removing in ${seconds}s.`);
    const tick = system.runInterval(() => { try { layer.sync(cells); } catch (e) { /* fine */ } }, 10);
    system.runTimeout(() => { system.clearRun(tick); releaseGhostLayer(player.id); say(player, "ghost cubes removed."); }, seconds * 20);
}

function spikeDisplay(player, blockId) {
    if (!blockId || !blockId.includes(":")) { say(player, "usage: display <namespace:block_id>, e.g. display minecraft:grass_block"); return; }
    const dim = player.dimension;
    const here = player.location;
    const at = dx => ({ x: Math.floor(here.x) + dx, y: Math.floor(here.y), z: Math.floor(here.z) + 3 });
    const layerCube = createGhostLayer(player, { maxSpawn: 100 });
    const fmbeLayer = createGhostLayer({ ...player, id: `${player.id}-display`, dimension: dim }, { maxSpawn: 100 });
    // Left: FMBE fox (any block, real model). Right: our generic cube (unknown block) for comparison.
    const left = at(-2), right = at(2);
    try {
        const f = fmbeLayer.sync([{ x: left.x, y: left.y, z: left.z, op: "build", block: blockId }]);
        say(player, `FMBE fox (left): ${f.shown ? "spawned" : "did not spawn"} - ${blockId}`);
    } catch (e) { say(player, `FMBE fox failed: ${e?.message ?? e}`); }
    try { layerCube.sync([{ x: right.x, y: right.y, z: right.z, op: "build", block: "modded:not_in_any_source" }]); } catch (e) { /* fine */ }
    say(player, `Does the left one look like the real block (right shape, right textures, sitting inside its cell, no fox body visible)? If it floats or sinks, use: /scriptevent ${NS}:spike fmbe <ypos> [scale] [xpos] [zpos] [entityY]. Removing in 30s.`);
    system.runTimeout(() => { fmbeLayer.clear(); layerCube.clear(); releaseGhostLayer(player.id); say(player, "display test removed."); }, 600);
}

export function startCameraSpikes() {
    try {
        system.afterEvents.scriptEventReceive.subscribe(ev => {
            if (ev.id !== `${NS}:spike`) return;
            const player = ev.sourceEntity;
            if (!player || player.typeId !== "minecraft:player") return;
            const args = ev.message.trim().split(/\s+/);
            const [name, a, b] = args;
            try {
                if (name === "fov") spikeFov(player);
                else if (name === "anchor") spikeAnchor(player, Number(a) || 192);
                else if (name === "hud") spikeHud(player, Number(a) || 15);
                else if (name === "screen") { setRtsHudScreen(player, Number(a), Number(b)); say(player, `HUD screen set to ${a}x${b}`); }
                else if (name === "hold") spikeHold(player);
                else if (name === "toast") spikeToast(player);
                else if (name === "invclick") spikeInvClick(player);
                else if (name === "scroll") spikeScroll(player);
                else if (name === "ghosts") spikeGhosts(player, Number(a) || 30);
                else if (name === "display") spikeDisplay(player, a);
                else if (name === "fmbe") {
                    const [ypos, scale, xpos, zpos, entityY] = [a, b, args[3], args[4], args[5]].map(v => (v === undefined ? undefined : Number(v)));
                    const patch = Object.fromEntries(Object.entries({ ypos, scale, xpos, zpos, entityY }).filter(([, v]) => v !== undefined && !Number.isNaN(v)));
                    if (Object.keys(patch).length) setGhostFmbe(patch);
                    say(player, `FMBE placement ${JSON.stringify(getGhostFmbe())} (copy into rule ghostFmbe once the block fills its cell)`);
                }
                else say(player, "spikes: fov | anchor [distance] | hud [seconds] | screen <w> <h> | hold | toast | invclick | scroll | ghosts [seconds] | display <block id> | fmbe [ypos scale xpos zpos entityY]");
            } catch (e) { say(player, `spike failed: ${e?.message ?? e}`); }
        });
    } catch (e) { /* older API */ }
}
