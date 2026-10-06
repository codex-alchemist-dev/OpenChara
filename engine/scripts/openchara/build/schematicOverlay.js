// Shows a player's VISIBLE schematics as ghost blocks in the world even outside Build mode, and runs the periodic
// purge of expired archived/trashed schematics. Particles only (per player, see ghostRender.js).

import { world, system } from "@minecraft/server";
import { createGhostLayer, releaseGhostLayer } from "./ghostEntities.js";
import { drawScene } from "./ghostScene.js";
import { schematicsOf } from "./schematicDb.js";
import { isInBuild } from "./buildMode.js";

const OVERLAY_EVERY = 20;
const SWEEP_EVERY = 20 * 60 * 5;
const OVERLAY_BUDGET = 120;
const layers = new Map(); // playerId -> ghost layer (only while the player has a visible schematic)

const cache = new Map(); // schematic id -> { updatedAt, model }
let frame = 0;

function modelFor(db, entry) {
    const hit = cache.get(entry.id);
    if (hit && hit.updatedAt === entry.updatedAt) return hit.model;
    const loaded = db.load(entry.id);
    if (!loaded) { cache.delete(entry.id); return null; }
    cache.set(entry.id, { updatedAt: entry.updatedAt, model: loaded.model, dim: loaded.header.origin?.dim ?? null });
    return loaded.model;
}

function drawFor(player) {
    if (isInBuild(player)) { releaseGhostLayer(player.id); layers.delete(player.id); return; } // Build mode draws its own working model
    const db = schematicsOf(player);
    let drew = false;
    for (const entry of db.list()) {
        if (!entry.visible) { cache.delete(entry.id); continue; }
        const model = modelFor(db, entry);
        if (!model) continue;
        const dim = cache.get(entry.id)?.dim;
        if (dim && dim !== player.dimension.id) continue;
        let layer = layers.get(player.id);
        if (!layer) { layer = createGhostLayer(player); layers.set(player.id, layer); }
        drawScene({ player, layer, model, center: player.location, frame, budget: OVERLAY_BUDGET, radius: 32, particleCap: 80 });
        drew = true;
        break; // one visible schematic at a time keeps the entity budget honest
    }
    if (!drew && layers.has(player.id)) { releaseGhostLayer(player.id); layers.delete(player.id); }
}

export function startSchematicOverlay() {
    world.afterEvents.playerLeave.subscribe(ev => { releaseGhostLayer(ev.playerId); layers.delete(ev.playerId); });
    system.runInterval(() => {
        frame++;
        for (const p of world.getAllPlayers()) { try { drawFor(p); } catch (e) { /* a bad schematic never breaks the loop */ } }
    }, OVERLAY_EVERY);
    system.runInterval(() => {
        for (const p of world.getAllPlayers()) { try { schematicsOf(p).sweep(); } catch (e) { /* fine */ } }
    }, SWEEP_EVERY);
}
