// OpenChara's cutscene service: the @openrock/cinema runtime plus an @openrock/fmbe runtime, with this engine's policy
// filled in - seen markers and flags persisted per player through MCLite, hold-jump-to-skip, and `/scriptevent <ns>:cinema`.
// A project passes its compiled content in (the build generates it from `content.cinemaDsl` / `content.fmbeDsl`):
//
//   import { CUTSCENES } from "@openrock/virtual/openrock-cinema-data";
//   import { SCENES } from "@openrock/virtual/openrock-fmbe-data";
//   export const cinema = startCinema({ cutscenes: CUTSCENES, scenes: SCENES, functions: { aoe_wave: (env, players) => {...} } });
//   cinema.play("first_meeting", player);

import * as server from "@minecraft/server";
import * as mclite from "@mclite/core";
import { createFmbe, spawnScene } from "@openrock/fmbe";
import { createCinemaRuntime } from "@openrock/cinema";
import { createCinemaFlags } from "./cinemaFlags.js";
import { NS, TAG } from "../ids.js";

const { world, system } = server;
const SKIP_HOLD_TICKS = 30;   // hold jump this long to skip (shown as an action-bar hint)

/**
 * @param {{cutscenes: object, scenes?: object, functions?: object, hooks?: object, emit?: Function, onFinish?: Function}} options
 *   hooks: letterbox(players, on), screenShow(players, texture, {fill, fade}), screenHide(players, {fade}), say(name, text, ticks, players);
 *   markSeen/setFlag default to the MCLite-backed flags below and can be overridden.
 */
export function startCinema({ cutscenes, scenes = {}, functions = {}, hooks = {}, emit, onFinish } = {}) {
    const flags = createCinemaFlags({ db: mclite, world });
    const fmbe = createFmbe({
        world, system, server, namespace: `${NS}_cinema`, orphanPolicy: "sweep",
        onError: e => console.warn(`[${TAG}] cinema fmbe: ${e?.message ?? e}`),
    });
    const runtime = createCinemaRuntime({
        bedrock: server,
        cutscenes, scenes, spawnScene, fmbe, functions, emit,
        hooks: { markSeen: flags.markSeen, setFlag: flags.set, ...hooks },
        warn: m => console.warn(`[${TAG}] ${m}`),
        onError: (e, info) => console.warn(`[${TAG}] cutscene ${info?.cutsceneId ?? "?"}: ${e?.message ?? e}`),
        onFinish,
    });

    // Skipping: hold jump for a second. (Input can be locked during a cutscene; whether jump still reads while locked is an
    // in-game question - `/scriptevent <ns>:cinema skip` always works.)
    const held = new Map();
    system.runInterval(() => {
        for (const p of world.getAllPlayers()) {
            if (!runtime.isPlaying(p)) { held.delete(p.id); continue; }
            let down = false;
            try { down = String(p.inputInfo.getButtonState(server.InputButton?.Jump ?? "Jump")).toLowerCase() === "pressed"; } catch (e) { /* no input info */ }
            const n = down ? (held.get(p.id) ?? 0) + 1 : 0;
            held.set(p.id, n);
            if (n === 1) { try { p.onScreenDisplay.setActionBar("§7Hold jump to skip"); } catch (e) { /* fine */ } }
            if (n >= SKIP_HOLD_TICKS) { held.delete(p.id); runtime.skip(p); }
        }
    }, 2);

    system.afterEvents.scriptEventReceive.subscribe(ev => {
        if (ev.id !== `${NS}:cinema`) return;
        const p = ev.sourceEntity;
        if (!p || p.typeId !== "minecraft:player") return;
        const [sub, arg] = ev.message.trim().split(/\s+/);
        try {
            if (sub === "play" && arg) runtime.play(arg, [p]);
            else if (sub === "skip") runtime.skip(p);
            else if (sub === "stop") runtime.stop(p);
            else if (sub === "list") p.sendMessage(`cutscenes: ${Object.keys(cutscenes).join(", ") || "none"}`);
            else p.sendMessage("/scriptevent " + NS + ":cinema play <id> | skip | stop | list");
        } catch (e) { p.sendMessage(`§c${e?.message ?? e}`); }
    });

    system.runTimeout(() => fmbe.sweepOrphans(), 80);

    return {
        play: (id, players, opts) => runtime.play(id, players, opts),
        skip: p => runtime.skip(p),
        stop: p => runtime.stop(p),
        isPlaying: p => runtime.isPlaying(p),
        stopAll: () => runtime.stopAll(),
        hasSeen: flags.hasSeen,
        hasFlag: flags.has,
        /** The raw runtimes, for projects that need more. */
        runtime, fmbe, flags,
    };
}
