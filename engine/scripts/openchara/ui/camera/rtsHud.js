// Numbers for a fast HUD (<hud id="rts" data="rtsHud" fast>) that draws the RTS cursor sprite and the drag-select
// rectangle as UI instead of particles. Pure given getRtsInfo(); a project registers it as the HUD provider:
//   registerHudProvider("rtsHud", rtsHudValues);
// Positions are GUI pixels, so the player's screen size in GUI units matters; it defaults to a 1080p / auto-scale
// guess and can be calibrated per player (setRtsHudScreen) - spike S3 measures the real value.

import { system } from "@minecraft/server";
import { NS } from "../../ids.js";
import { RULES } from "../../rules.js";
import { getRtsInfo } from "../rts.js";
import { DEFAULT_HUD_SCREEN, CURSOR_SIZE, hudValues } from "./rtsHudMath.js";

const KEY = `${NS}:rtsHudScreen`;
// playerId -> tick the spike ends; while set, rtsHudValues draws a test pattern instead of the RTS state.
export const hudSpike = new Map();
export { DEFAULT_HUD_SCREEN, CURSOR_SIZE, hudValues };

export function getRtsHudScreen(player) {
    try {
        const v = JSON.parse(player.getDynamicProperty(KEY) ?? "null");
        if (v && v.w > 100 && v.h > 100) return v;
    } catch (e) { /* default */ }
    return { ...DEFAULT_HUD_SCREEN };
}
export function setRtsHudScreen(player, w, h) { player.setDynamicProperty(KEY, JSON.stringify({ w: Math.round(w), h: Math.round(h) })); }

function spikeValues(player, screen) {
    const t = (system.currentTick % 120) / 120 * Math.PI * 2;
    return hudValues({ screen: { u: 0.5 + Math.cos(t) * 0.35, v: 0.5 + Math.sin(t) * 0.35 }, rect: { u0: 0.4, v0: 0.4, u1: 0.6, v1: 0.6 }, selected: 0 }, screen);
}

export function rtsHudValues(player) {
    const until = hudSpike.get(player.id);
    if (until !== undefined) {
        if (system.currentTick < until) return spikeValues(player, getRtsHudScreen(player));
        hudSpike.delete(player.id);
    }
    if (!RULES.rtsHudCursor) return { visible: false, cx: 0, cy: 0, bx: 0, by: 0, bw: 0, bh: 0 };
    const info = getRtsInfo(player);
    if (!info.active) return { visible: false, cx: 0, cy: 0, bx: 0, by: 0, bw: 0, bh: 0 };
    return hudValues(info, getRtsHudScreen(player));
}
