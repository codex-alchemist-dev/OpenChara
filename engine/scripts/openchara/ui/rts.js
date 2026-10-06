// RTS command mode: a fixed top-down camera over the battlefield, a screen-space cursor driven by where the
// player looks, a two-click box selection and orders that act on the active selection.
//
// This module is pure mechanism: it owns the camera mode (state, per-tick behaviour) and exports one function per
// command (rtsSelectUse, rtsMove, ...) for a project to wire to whatever it wants - hotbar items, a menu, a chat
// command. It never decides how a player invokes a command; see MinUI's controlItems.js for a ready-made "locked
// hotbar item -> handler" helper (Claude Waifus' PATCHES/scripts/rtsControls.js is the reference wiring).
//
// The safety-critical part (body double, gear swap, every way back out) lives in ui/camera/cameraSession.js. Pure
// math is in ui/camera/{screenCursor,cameraRig,rtsSelection}.js; particle feedback in ui/camera/rtsFx.js.
//
// While in RTS:
//   - the player's body STAYS where it is (invisible, movement locked); a chunk anchor keeps the camera's
//     chunks loaded (ui/camera/chunkAnchor.js);
//   - camera: minecraft:free at a fixed pitch/yaw; WASD pans, jump/sneak raise/lower it;
//   - cursor: the head still turns freely; pitch and yaw map onto a screen coordinate (screenCursor.lookToScreen),
//     which a fixed-FOV camera turns into a world ray for the block/entity under it;
//   - selection: Select item once drops corner A, again commits the box (additive); orders use the selection.

import { world, system } from "@minecraft/server";
import { readSquads, getSquad } from "../squads.js";
import { getCharacter, setOrder } from "../characterRecord.js";
import { manifestCharacter, teleportToMe } from "../manifest.js";
import { executeFormation, FORMATION_TYPES } from "../formations.js";
import { startHunt } from "../hunt.js";
import { envelopTarget } from "../army.js";
import { setTaskLock } from "../fsm.js";
import { setFollowOverride } from "../orders.js";
import { identifyCharacter } from "../statTracking.js";
import { closeContainer } from "./container.js";
import { createCameraSession, startCameraSessions, BODY_TYPE as BODY } from "./camera/cameraSession.js";
import { createChunkAnchor } from "./camera/chunkAnchor.js";
import { panRts, readInputs } from "./camera/cameraRig.js";
import { DEFAULT_CURSOR_CONFIG as CURSOR_CFG, lookToScreen, screenToRay } from "./camera/screenCursor.js";
import { createSelection, clearSelection, useSelect, toggleCharacter, pendingRect, boxQuery, resolveMembers, prune, isEmpty } from "./camera/rtsSelection.js";
import { fieldedCharacters, projectFielded, squadMemberIds } from "./camera/rtsField.js";
import { drawCursor, drawSelection, drawHover, drawBox } from "./camera/rtsFx.js";
import { startCameraSpikes } from "./camera/spikes.js";
import { RULES } from "../rules.js";
import { NS, TAG } from "../ids.js";

const POSE = Object.freeze({ pitch: 55, yaw: 0 });
const LOCK_TICKS = 20 * 60 * 10;
const FX_EVERY = 4;

const say = (p, m) => { try { p.sendMessage(m); } catch (e) { /* offline */ } };
const bar = (p, m) => { try { p.onScreenDisplay.setActionBar(m); } catch (e) { /* fine */ } };

// A project maps its control items to the action each one performs, so the cursor can look different per action.
const actionByItem = new Map();
export function registerRtsActionFx(itemTypeId, action) { actionByItem.set(itemTypeId, action); }
function heldAction(player) {
    try {
        const item = player.getComponent("minecraft:inventory").container.getItem(player.selectedSlotIndex);
        return (item && actionByItem.get(item.typeId)) || "move";
    } catch (e) { return "move"; }
}

const session = createCameraSession({
    id: "rts",
    label: "Command mode",
    dpState: `${NS}:rts`,          // { bodyId, dim, loc, rot }
    dpBackup: `${NS}:rtsBackup`,   // serialized items (second safety net)
    effects: ["invisibility", "resistance", "fire_resistance", "water_breathing"],
    tickInterval: 2,
    prepare: closeContainer,
    makeState: (player, { loc, rot }) => ({
        cam: { x: loc.x, y: loc.y + 20, z: loc.z - 14 },
        r0: rot,
        sel: createSelection(),
        formation: FORMATION_TYPES.includes("circle") ? "circle" : FORMATION_TYPES[0],
        uv: { u: 0.5, v: 0.5 },
        cursor: null,
        target: null,
        anchor: createChunkAnchor(player),
    }),
    // "follow" characters follow the body double, not the player.
    onStart: (player, state) => {
        setFollowOverride(player.id, { location: { ...player.location }, dimension: player.dimension });
        const first = readSquads(player).find(s => s.memberIds.length);
        if (first) state.sel.squadIds.add(first.id);
    },
    onStop: (playerId, state) => { state?.anchor?.release(); setFollowOverride(playerId, null); },
    onTick: (player, s) => tick(player, s),
});

export function registerRtsExitHook(fn) { session.registerExitHook(fn); }
export function isInRts(player) { return session.isActive(player); }
export const enterRts = player => session.enter(player);
export const exitRts = player => session.exit(player);
export function startRts() { startCameraSessions(); startCameraSpikes(); }

// ---- the running camera --------------------------------------------------------------------
function tick(player, s) {
    const { mv, vertical } = readInputs(player);
    panRts(s.cam, mv, vertical, { groundY: s.groundY });

    // Cursor: where the player looks, as a screen point, cast through the fixed camera.
    try {
        s.uv = lookToScreen(player.getRotation(), s.r0.y, CURSOR_CFG);
        const dir = screenToRay(s.uv.u, s.uv.v, POSE, CURSOR_CFG);
        s.dir = dir;
        const origin = { ...s.cam };
        const hit = player.dimension.getBlockFromRay(origin, dir, { maxDistance: 160 });
        s.cursor = hit ? { x: hit.block.location.x + 0.5, y: hit.block.location.y + 1, z: hit.block.location.z + 0.5, block: hit.block.typeId } : null;
        let target = null;
        try {
            target = player.dimension.getEntitiesFromRay(origin, dir, { maxDistance: 160 })
                .map(h => h.entity)
                .find(e => e.isValid && e.typeId !== "minecraft:player" && e.typeId !== BODY && e.typeId !== `${NS}:container` && e.typeId !== `${NS}:camera_anchor` && e.typeId !== "minecraft:item") ?? null;
        } catch (e) { /* fine */ }
        s.target = target;
        if (system.currentTick % FX_EVERY === 0) drawFeedback(player, s, hit);
    } catch (e) { /* ray hiccup - skip this tick */ }

    if (system.currentTick % 10 === 0) {
        try {
            const top = player.dimension.getTopmostBlock({ x: s.cam.x, z: s.cam.z });
            if (top) s.groundY = top.location.y;
        } catch (e) { /* unloaded */ }
    }
    s.anchor.follow(s.cam, { groundY: s.groundY });
    try {
        player.camera.setCamera("minecraft:free", { location: s.cam, rotation: { x: POSE.pitch, y: POSE.yaw }, easeOptions: { easeTime: 0.15 } });
    } catch (e) { console.warn(`[${TAG}] RTS camera: ${e}`); }
}

function drawFeedback(player, s, hit) {
    prune(s.sel, { hasCharacter: id => Boolean(getCharacter(player, id)), hasSquad: id => Boolean(getSquad(player, id)) });
    const field = fieldedCharacters(player);
    const members = new Set(resolveMembers(s.sel, q => squadMemberIds(player, q)));
    drawSelection(player, field.filter(f => members.has(f.characterId)).map(f => f.entity));

    const rect = pendingRect(s.sel, s.uv);
    if (rect) {
        const projected = projectFielded(player, s.cam, POSE, CURSOR_CFG, field);
        const inside = new Set(boxQuery(rect, projected).charIds);
        drawHover(player, projected.filter(c => inside.has(c.characterId)).map(c => c.entity));
        drawBox(player, rect, s.cam, POSE, CURSOR_CFG, s.groundY ?? s.cam.y - 20);
    }
    const own = s.target ? identifyCharacter(s.target)?.ownerId === player.id : false;
    drawCursor(player, { hitBlock: hit && !RULES.rtsHudCursor ? hit.block.location : null, target: s.target, targetIsOwn: own, action: heldAction(player) });
}

// ---- commands ---------------------------------------------------------------------------------
// Each is a standalone, project-invokable primitive. Every one throws a player-facing Error on a bad call (nothing
// selected, nothing under the cursor, ...); a caller typically catches it and shows the message however it shows
// other action failures.
function needState(player) {
    const s = session.state(player);
    if (!s) throw new Error("Not in command mode.");
    return s;
}

/** Selected characters that are standing in the world right now. */
function selectedMembers(player, s) {
    const ids = new Set(resolveMembers(s.sel, q => squadMemberIds(player, q)));
    return fieldedCharacters(player).filter(f => ids.has(f.characterId)).map(f => ({ characterId: f.characterId, record: f.record, entity: f.entity }));
}
function needSelection(player, s) {
    if (isEmpty(s.sel)) throw new Error("Nothing selected - use Select (two clicks make a box).");
    return selectionLabel(player, s);
}
function selectionLabel(player, s) {
    const squads = [...s.sel.squadIds].map(q => getSquad(player, q)?.name).filter(Boolean);
    const n = resolveMembers(s.sel, q => squadMemberIds(player, q)).length;
    return squads.length === 1 && s.sel.charIds.size === 0 ? squads[0] : `${n} selected`;
}
function lockAndHold(player, members) {
    for (const m of members) {
        setTaskLock(m.characterId, "rts", system.currentTick + LOCK_TICKS);
        // A commanded waifu holds where she's sent instead of walking back to you.
        if (m.record.order === "follow") { try { setOrder(player, m.characterId, "stay"); } catch (e) { /* fine */ } }
    }
}

/**
 * The Select item. Sneak+use clears the selection. Using it on one of your own characters (with no box pending)
 * toggles her. Otherwise: first use drops corner A, second commits the box into the selection.
 */
export function rtsSelectUse(player, { clear = false } = {}) {
    const s = needState(player);
    if (clear) {
        clearSelection(s.sel);
        bar(player, "§bSelection cleared");
        return { kind: "clear" };
    }
    const own = !s.sel.cornerA && s.target ? identifyCharacter(s.target) : null;
    if (own && own.ownerId === player.id) {
        const now = toggleCharacter(s.sel, own.characterId);
        bar(player, now ? "§bAdded to selection" : "§bRemoved from selection");
        return { kind: "toggle" };
    }
    const projected = projectFielded(player, s.cam, POSE, CURSOR_CFG);
    const r = useSelect(s.sel, s.uv, projected);
    if (r.kind === "corner") bar(player, "§bCorner set - use Select again to finish the box");
    else bar(player, `§bSelected ${r.result.charIds.length} (${selectionLabel(player, s)})`);
    return r;
}

// Legacy single-squad selection: the squad of the character under the cursor, else the next squad with members.
export function rtsSelectSquad(player) {
    const s = needState(player);
    const id = s.target ? identifyCharacter(s.target) : null;
    const hers = id?.ownerId === player.id ? getCharacter(player, id.characterId)?.squadId : null;
    const squads = readSquads(player).filter(q => q.memberIds.length);
    if (!squads.length) throw new Error("You have no squads with members.");
    let pick = hers;
    if (!pick) {
        const cur = [...s.sel.squadIds][0];
        const i = squads.findIndex(q => q.id === cur);
        pick = squads[(i + 1) % squads.length].id;
    }
    s.sel.squadIds.clear(); s.sel.charIds.clear();
    s.sel.squadIds.add(pick);
    bar(player, `§bSelected: ${selectionLabel(player, s)}`);
}

export function rtsNextFormation(player) {
    const s = needState(player);
    const i = FORMATION_TYPES.indexOf(s.formation);
    s.formation = FORMATION_TYPES[(i + 1) % FORMATION_TYPES.length];
    bar(player, `§bFormation: ${s.formation} - Move Here uses it`);
}

export function rtsMove(player) {
    const s = needState(player);
    const label = needSelection(player, s);
    if (!s.cursor) throw new Error("Aim at the ground first.");
    const members = selectedMembers(player, s);
    if (!members.length) throw new Error(`${label} has nobody in the field - Summon Here.`);
    lockAndHold(player, members);
    const c = members.reduce((a, m) => ({ x: a.x + m.entity.location.x / members.length, z: a.z + m.entity.location.z / members.length }), { x: 0, z: 0 });
    const len = Math.hypot(s.cursor.x - c.x, s.cursor.z - c.z) || 1;
    const heading = { x: (s.cursor.x - c.x) / len, y: 0, z: (s.cursor.z - c.z) / len };
    const started = executeFormation(s.formation, player.dimension, s.cursor, heading, s.cursor, members);
    bar(player, `§a${label}: ${s.formation} at ${Math.floor(s.cursor.x)}, ${Math.floor(s.cursor.z)} (${started}/${members.length})`);
}

export function rtsAttack(player) {
    const s = needState(player);
    const label = needSelection(player, s);
    if (!s.target) throw new Error("Aim at a mob first.");
    if (identifyCharacter(s.target)) throw new Error("That's a waifu, not a target.");
    const members = selectedMembers(player, s);
    if (!members.length) throw new Error(`${label} has nobody in the field.`);
    lockAndHold(player, members);
    const desc = startHunt(members, s.target, msg => say(player, msg));
    bar(player, desc ? `§6${label} hunting: ${desc}` : "§cCouldn't start the attack.");
}

export function rtsSurround(player) {
    const s = needState(player);
    if (!s.target || identifyCharacter(s.target)) throw new Error("Aim at a mob first.");
    const n = envelopTarget(player, s.target);
    bar(player, n ? `§6${n} squad(s) surrounding the ${s.target.typeId.replace("minecraft:", "")}` : "§cNo squads in the field.");
}

export function rtsSummonHere(player) {
    const s = needState(player);
    const label = needSelection(player, s);
    if (!s.cursor) throw new Error("Aim at the ground first.");
    const live = id => { try { const e = id && world.getEntity(id); return e?.isValid ? e : null; } catch (err) { return null; } };
    let n = 0;
    for (const id of resolveMembers(s.sel, q => squadMemberIds(player, q))) {
        const rec = getCharacter(player, id);
        if (!rec) continue;
        const ok = live(rec.manifestedEntityId)
            ? teleportToMe(player, id, s.cursor, player.dimension)
            : manifestCharacter(player, id, s.cursor, player.dimension);
        if (ok) n++;
    }
    bar(player, `§a${label}: ${n} deployed`);
}

// For HUDs: what the player's command mode looks like right now.
export function getRtsInfo(player) {
    const s = session.state(player);
    if (!s) return { active: false };
    const all = resolveMembers(s.sel, q => squadMemberIds(player, q));
    const fielded = selectedMembers(player, s).length;
    let targetName = "";
    if (s.target) {
        try { targetName = s.target.nameTag || s.target.typeId.replace("minecraft:", "").replace(/_/g, " "); } catch (e) { /* fine */ }
    }
    return {
        active: true,
        squad: isEmpty(s.sel) ? "-" : selectionLabel(player, s),
        fielded,
        members: all.length,
        formation: s.formation,
        cursor: s.cursor ? `${Math.floor(s.cursor.x)}, ${Math.floor(s.cursor.y)}, ${Math.floor(s.cursor.z)}` : "-",
        target: targetName,
        height: s.groundY !== undefined ? Math.round(s.cam.y - s.groundY) : 20,
        screen: s.uv,
        rect: pendingRect(s.sel, s.uv),
        boxPending: Boolean(s.sel.cornerA),
        selected: all.length,
    };
}
