// In-game spikes for the camera modes' unproven Bedrock behaviour. Run as `/scriptevent <ns>:spike <name> [args]`;
// each prints what it found to chat so the answer can be copied back. See OpenChara docs/BUILD.md ("Spikes").
//
//   fov                  S1  does the camera API expose FOV control? (prints the available camera methods)
//   anchor [distance]    S4  spawn a tick_world camera anchor <distance> blocks away (default 192) and report whether
//                            the chunk there becomes loaded, then remove it
//   hud [seconds]        S3  draw the fast-HUD cursor moving in a circle for N seconds (default 15), outside RTS
//   screen <w> <h>       S3  set this player's HUD screen size in GUI pixels (cursor/box calibration)
//   hold                 S2  report itemUse/itemStartUse/itemStopUse events seen on the held item for 20s
//   ghosts [seconds]     S6  show every ghost-block texture in a row in front of you (plus a red mine cube) so a wrong
//                            texture path (missing-texture checkerboard) or tint problem is obvious
//   scroll               S5  list world events that look like hotbar/slot/scroll changes and report them for 20s
//                            (a scroll signal would let Build mode's extend tools use the mouse wheel)
//
// Everything is opt-in and removes what it spawned.

import { world, system } from "@minecraft/server";
import { ANCHOR_TYPE } from "./chunkAnchor.js";
import { setRtsHudScreen, getRtsHudScreen, hudSpike } from "./rtsHud.js";
import { createGhostLayer, releaseGhostLayer } from "../../build/ghostEntities.js";
import { GHOST_BLOCKS } from "../../build/ghostBlocks.cjs";
import { NS } from "../../ids.js";

const say = (p, m) => { try { p.sendMessage(`§e[spike] §r${m}`); } catch (e) { /* offline */ } };

function spikeFov(player) {
    const cam = player.camera;
    const methods = [];
    for (let o = cam; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) methods.push(...Object.getOwnPropertyNames(o));
    say(player, `camera API: ${[...new Set(methods)].filter(m => m !== "constructor").join(", ")}`);
    say(player, `setFov: ${typeof cam.setFov}`);
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
    say(player, `fast HUD test for ${seconds}s: a sprite circles the screen with a rectangle at the centre. Screen size used: ${JSON.stringify(getRtsHudScreen(player))}. Needs rtsHudCursor on to be useful in RTS.`);
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
    const cells = GHOST_BLOCKS.map(([block], i) => ({ x: base.x + (i % perRow) * 2, y: base.y + Math.floor(i / perRow) * 2, z: base.z, op: "build", block }));
    cells.push({ x: base.x, y: base.y - 2, z: base.z, op: "mine" });
    layer.sync(cells);
    say(player, `${cells.length} ghost cubes placed 3 blocks in front of you (${GHOST_BLOCKS.length} block textures + one red mine cube). Check for missing-texture checkerboards, tint and transparency. Removing in ${seconds}s.`);
    const tick = system.runInterval(() => { try { layer.sync(cells); } catch (e) { /* fine */ } }, 10);
    system.runTimeout(() => { system.clearRun(tick); releaseGhostLayer(player.id); say(player, "ghost cubes removed."); }, seconds * 20);
}

export function startCameraSpikes() {
    try {
        system.afterEvents.scriptEventReceive.subscribe(ev => {
            if (ev.id !== `${NS}:spike`) return;
            const player = ev.sourceEntity;
            if (!player || player.typeId !== "minecraft:player") return;
            const [name, a, b] = ev.message.trim().split(/\s+/);
            try {
                if (name === "fov") spikeFov(player);
                else if (name === "anchor") spikeAnchor(player, Number(a) || 192);
                else if (name === "hud") spikeHud(player, Number(a) || 15);
                else if (name === "screen") { setRtsHudScreen(player, Number(a), Number(b)); say(player, `HUD screen set to ${a}x${b}`); }
                else if (name === "hold") spikeHold(player);
                else if (name === "scroll") spikeScroll(player);
                else if (name === "ghosts") spikeGhosts(player, Number(a) || 30);
                else say(player, "spikes: fov | anchor [distance] | hud [seconds] | screen <w> <h> | hold | scroll | ghosts [seconds]");
            } catch (e) { say(player, `spike failed: ${e?.message ?? e}`); }
        });
    } catch (e) { /* older API */ }
}
