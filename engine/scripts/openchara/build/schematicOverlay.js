// Shows a player's VISIBLE schematics as ghost blocks in the world even outside Build mode, and runs the periodic
// purge of expired archived/trashed schematics. Particles only (per player, see ghostRender.js).

import { world, system } from "@minecraft/server";
import { ghostItems, ghostFrame, drawGhosts } from "./ghostRender.js";
import { schematicsOf } from "./schematicDb.js";
import { isInBuild } from "./buildMode.js";

const OVERLAY_EVERY = 20;
const SWEEP_EVERY = 20 * 60 * 5;
const RADIUS = 32;
const CAP = 80;

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
    if (isInBuild(player)) return; // Build mode draws its own working model
    const db = schematicsOf(player);
    for (const entry of db.list()) {
        if (!entry.visible) { cache.delete(entry.id); continue; }
        const model = modelFor(db, entry);
        if (!model) continue;
        const dim = cache.get(entry.id)?.dim;
        if (dim && dim !== player.dimension.id) continue;
        const items = ghostItems({ model, center: player.location, radius: RADIUS });
        drawGhosts(player, ghostFrame(items, CAP, frame));
    }
}

export function startSchematicOverlay() {
    system.runInterval(() => {
        frame++;
        for (const p of world.getAllPlayers()) { try { drawFor(p); } catch (e) { /* a bad schematic never breaks the loop */ } }
    }, OVERLAY_EVERY);
    system.runInterval(() => {
        for (const p of world.getAllPlayers()) { try { schematicsOf(p).sweep(); } catch (e) { /* fine */ } }
    }, SWEEP_EVERY);
}
