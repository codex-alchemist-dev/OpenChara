// Build mode: a free-fly camera (WASD relative to where you look, jump/sneak for up/down, rotation copied from the
// player's own facing - the AC rtsSpike flight) plus a selection toolkit that turns selections into a persistent
// SCHEMATIC (blocks to build, blocks to mine, chest markers). No waifu logic yet - this is the UX and the data.
//
// The safety-critical camera/body-double/gear-swap part is ui/camera/cameraSession.js (shared with RTS). A
// project wires `buildAction(player, action)` to whatever it likes (hotbar items, a menu); see Claude Waifus'
// PATCHES/scripts/buildControls.js.
//
// Actions (all throw a player-facing Error on a bad call):
//   rect | circle | sphere   two-click shapes: first use sets a corner/centre at the targeted block, second finishes it
//   extendPlus | extendMinus grow / shrink the selection one layer along the axis you are looking along
//   mine                     mark every non-air block in the selection to be mined
//   build                    mark every selected cell to hold the chosen block (setBuildBlock) - ghost blocks
//   erase                    drop the selected cells from the schematic
//   markInput | markOutput   chest markers at the targeted block (UX only for now)
//   clearSelection | save
// The working schematic autosaves on a timer, on every exit path of the session and whenever you save.

import { system } from "@minecraft/server";
import { createCameraSession, startCameraSessions } from "../ui/camera/cameraSession.js";
import { createChunkAnchor } from "../ui/camera/chunkAnchor.js";
import { freeFly, readInputs } from "../ui/camera/cameraRig.js";
import { rectCells, circleCells, sphereCells, extendSelection, dominantAxis, cellFromBlock } from "./buildSelection.js";
import { createModel, applyToKeys, clearKeys, addMarker, keyOf, parseKey, stats } from "./schematicModel.js";
import { PARTICLES } from "./ghostRender.js";
import { createGhostLayer, releaseGhostLayer } from "./ghostEntities.js";
import { drawScene } from "./ghostScene.js";
import { schematicsOf } from "./schematicDb.js";
import { closeContainer } from "../ui/container.js";
import { NS, TAG } from "../ids.js";

const FACE = { Up: [0, 1, 0], Down: [0, -1, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0] };
const FX_EVERY = 4;
const AUTOSAVE_TICKS = 20 * 30;
const REACH = 96;

const say = (p, m) => { try { p.sendMessage(m); } catch (e) { /* offline */ } };
const bar = (p, m) => { try { p.onScreenDisplay.setActionBar(m); } catch (e) { /* fine */ } };

const session = createCameraSession({
    id: "build",
    label: "Build mode",
    dpState: `${NS}:build`,
    dpBackup: `${NS}:buildBackup`,
    effects: ["invisibility", "resistance", "fire_resistance", "water_breathing"],
    tickInterval: 1,
    prepare: closeContainer,
    makeState: (player, { loc, rot }) => ({
        cam: { x: loc.x, y: loc.y + 1.62, z: loc.z },
        origin: { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z), dim: player.dimension.id },
        model: createModel(),
        schematicId: null,
        dirty: false,
        selection: new Set(),
        pending: null,              // { tool, a } while a two-click shape is half done
        blockId: "minecraft:stone",
        hit: null,                  // { cell, face, block } under the crosshair
        frame: 0,
        lastSave: 0,
        anchor: createChunkAnchor(player),
        layer: createGhostLayer(player),
    }),
    onStart: (player, s) => {
        const wanted = pendingOpen.get(player.id);
        pendingOpen.delete(player.id);
        if (wanted) {
            const loaded = schematicsOf(player).load(wanted);
            if (loaded) { s.model = loaded.model; s.schematicId = wanted; s.origin = loaded.header.origin ?? s.origin; }
            else say(player, "§c[Build mode] That schematic couldn't be loaded - starting an empty one.");
        }
    },
    onStop: (playerId, s) => { s?.anchor?.release(); releaseGhostLayer(playerId); },
    onTick: (player, s) => tick(player, s),
});

const pendingOpen = new Map(); // playerId -> schematic id to open on the next enter

export function registerBuildExitHook(fn) { session.registerExitHook(fn); }
export const isInBuild = player => session.isActive(player);

/** Enters Build mode, optionally opening an existing schematic. */
export function enterBuild(player, { schematicId = null } = {}) {
    if (schematicId) pendingOpen.set(player.id, schematicId);
    const ok = session.enter(player);
    if (!ok) pendingOpen.delete(player.id);
    return ok;
}

export function exitBuild(player) {
    const s = session.state(player);
    if (s) persist(player, s, { force: true });
    session.exit(player);
}

export function startBuild() {
    startCameraSessions();
    // Whatever ends the session (item, relog, death, dimension change, reload restore), flush a dirty schematic.
    session.registerExitHook(player => { const s = lastState.get(player.id); if (s) { persist(player, s, { force: true }); lastState.delete(player.id); } });
}
const lastState = new Map(); // playerId -> state, kept so the exit hook can still flush a dirty schematic

// ---- persistence -------------------------------------------------------------------------------
function persist(player, s, { force = false } = {}) {
    if (!s.dirty && !force) return true;
    if (!s.dirty && s.schematicId) return true;
    if (s.model.cells.size === 0 && s.model.markers.length === 0 && !s.schematicId) return true; // nothing worth a record yet
    const db = schematicsOf(player);
    if (!s.schematicId) {
        const n = db.list({ status: null }).length + 1;
        s.schematicId = db.create({ name: `Build ${n}`, model: s.model, origin: s.origin });
        if (!s.schematicId) { say(player, "§c[Build mode] Couldn't save your schematic - it is still open; try again."); return false; }
    } else if (!db.save(s.schematicId, s.model)) {
        say(player, "§c[Build mode] Couldn't save your schematic - it is still open; try again.");
        return false;
    }
    s.dirty = false; s.lastSave = system.currentTick;
    return true;
}

// ---- the running camera ---------------------------------------------------------------------
function tick(player, s) {
    lastState.set(player.id, s);
    const rot = player.getRotation();
    const { mv, vertical } = readInputs(player);
    freeFly(s.cam, rot, mv, vertical);
    s.anchor.follow(s.cam, { groundY: Math.floor(s.cam.y) - 2, behind: 0 });

    // Crosshair: the player's own facing IS the camera's, so the ray is just where they look.
    try {
        const dir = player.getViewDirection();
        const hit = player.dimension.getBlockFromRay(s.cam, dir, { maxDistance: REACH });
        if (hit) {
            const n = FACE[hit.face] ?? [0, 0, 0];
            s.hit = { cell: cellFromBlock(hit.block.location), face: n, block: hit.block.typeId, dir };
        } else s.hit = { cell: null, face: null, block: null, dir };
    } catch (e) { s.hit = s.hit ? { ...s.hit, cell: null } : null; }

    try {
        player.camera.setCamera("minecraft:free", { location: s.cam, rotation: { x: rot.x, y: rot.y }, easeOptions: { easeTime: 0.05 } });
    } catch (e) { console.warn(`[${TAG}] Build camera: ${e}`); }

    if (system.currentTick % FX_EVERY === 0) draw(player, s);
    if (s.dirty && system.currentTick - s.lastSave > AUTOSAVE_TICKS) persist(player, s);
}

function draw(player, s) {
    s.frame++;
    drawScene({ player, layer: s.layer, model: s.model, selection: s.selection, center: s.cam, frame: s.frame });
    if (s.hit?.cell) {
        const c = s.hit.cell;
        for (const [dx, dz] of [[0.05, 0.05], [0.95, 0.05], [0.05, 0.95], [0.95, 0.95]]) {
            try { player.spawnParticle(PARTICLES.selection, { x: c.x + dx, y: c.y + 1.05, z: c.z + dz }); } catch (e) { /* fine */ }
        }
    }
    const st = stats(s.model);
    bar(player, `§bBuild §7| §f${s.selection.size} selected §7| §a${st.build} build §c${st.mine} mine §7| §f${s.blockId.replace("minecraft:", "")}${s.pending ? ` §e(${s.pending.tool}: pick the second point)` : ""}`);
}

// ---- actions ---------------------------------------------------------------------------------
function need(player) {
    const s = session.state(player);
    if (!s) throw new Error("Not in Build mode.");
    return s;
}
const needHit = s => { if (!s.hit?.cell) throw new Error("Look at a block first."); return s.hit.cell; };

function twoClick(s, tool, make) {
    const cell = needHit(s);
    if (!s.pending || s.pending.tool !== tool) { s.pending = { tool, a: cell }; return "first"; }
    const a = s.pending.a;
    s.pending = null;
    s.selection = make(a, cell);
    return "done";
}

export function setBuildBlock(player, blockId) {
    const s = need(player);
    if (typeof blockId !== "string" || !blockId.includes(":")) throw new Error("That isn't a block id.");
    s.blockId = blockId;
    bar(player, `§bBuilding with ${blockId.replace("minecraft:", "")}`);
}

export function buildAction(player, action) {
    const s = need(player);
    switch (action) {
        case "rect": {
            if (twoClick(s, "rect", (a, b) => rectCells(a, b)) === "first") bar(player, "§bCorner set - look at the opposite corner and use again");
            else bar(player, `§b${s.selection.size} blocks selected`);
            break;
        }
        case "circle":
        case "sphere": {
            const make = (a, b) => {
                const r = Math.round(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
                return action === "circle" ? circleCells(a, r, "y") : sphereCells(a, r);
            };
            if (twoClick(s, action, make) === "first") bar(player, "§bCentre set - look at the edge and use again");
            else bar(player, `§b${s.selection.size} blocks selected`);
            break;
        }
        case "extendPlus":
        case "extendMinus": {
            if (!s.selection.size) throw new Error("Select something first.");
            s.selection = extendSelection(s.selection, dominantAxis(s.hit?.dir ?? player.getViewDirection()), action === "extendPlus" ? 1 : -1);
            bar(player, `§b${s.selection.size} blocks selected`);
            break;
        }
        case "mine": {
            if (!s.selection.size) throw new Error("Select something first.");
            const keys = [...s.selection].filter(k => { const { x, y, z } = parseKey(k); try { return !player.dimension.getBlock({ x, y, z })?.isAir; } catch (e) { return false; } });
            applyToKeys(s.model, keys, { op: "mine" });
            s.dirty = true;
            bar(player, `§c${keys.length} blocks marked to mine`);
            break;
        }
        case "build": {
            if (!s.selection.size) throw new Error("Select something first.");
            applyToKeys(s.model, s.selection, { op: "build", block: s.blockId });
            s.dirty = true;
            bar(player, `§a${s.selection.size} blocks of ${s.blockId.replace("minecraft:", "")} planned`);
            break;
        }
        case "erase": {
            if (!s.selection.size) throw new Error("Select something first.");
            const n = clearKeys(s.model, s.selection);
            if (n) s.dirty = true;
            bar(player, `§e${n} cells removed from the plan`);
            break;
        }
        case "markInput":
        case "markOutput": {
            const c = needHit(s);
            const kind = action === "markInput" ? "input" : "output";
            if (addMarker(s.model, kind, c.x, c.y, c.z)) { s.dirty = true; bar(player, `§b${kind} chest marked`); }
            else bar(player, "§eAlready marked");
            break;
        }
        case "clearSelection": s.selection = new Set(); s.pending = null; bar(player, "§bSelection cleared"); break;
        case "save": if (persist(player, s, { force: true })) bar(player, "§aSaved"); break;
        default: throw new Error(`Unknown build action "${action}".`);
    }
}

/** For HUDs and screens. */
export function getBuildInfo(player) {
    const s = session.state(player);
    if (!s) return { active: false };
    const st = stats(s.model);
    return { active: true, selected: s.selection.size, build: st.build, mine: st.mine, markers: st.markers, block: s.blockId, schematicId: s.schematicId, dirty: s.dirty, pending: s.pending?.tool ?? null, looking: s.hit?.block ?? null };
}

export { keyOf };
