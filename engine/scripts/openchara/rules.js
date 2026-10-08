// Tunable numbers for the engine's own mechanisms, from the project's
// project.json "rules". Everything has a working default, so a project only
// lists what it wants different. Game-design numbers (level caps, XP
// curves...) are NOT here - those belong to the project's own scripts.

import { CONFIG } from "./content.generated.js";

const DEFAULTS = {
    maxRoster: 50,          // active characters per player (the Trash doesn't count)
    trashGraceDays: 30,     // how long a released character stays restorable
    maxSquads: 5,
    maxSquadMembers: 10,
    knockoutHp: 8,          // at/below this entity HP she's knocked out instead of dying
    knockoutSeconds: 30,    // how long a knocked-out character can't be re-summoned
    combatWindowSeconds: 5, // "in combat" = dealt or took damage this recently
    cameraChunkMode: "anchor", // how camera modes keep chunks loaded: "anchor" (tick_world entity) or "teleport" (legacy)
    ghostStyle: "auto",     // Build mode ghosts: "auto" (our cube for known blocks, a real-block FMBE fox for the rest), "cube" or "fmbe"
    ghostFmbeSystem: "static", // which @openrock/fmbe system draws ghosts: "static" (3 commands, cheapest), "advanced" (5, wiki diagonal-transformation) or "basic" (8)
    ghostFmbe: { scale: 0.9, xpos: 0, ypos: 0, zpos: 0, entityY: 0 }, // FMBE placement: size, 1/16-block offsets, spawn height offset (calibrate with the fmbe spike)
    rtsHudCursor: true,     // draw the RTS cursor and selection box as a HUD sprite (a particle cursor is invisible from the command camera's height); false = particles only
    buildArchiveDays: 30,   // how long an archived build schematic is kept before it is purged
};

export const RULES = { ...DEFAULTS, ...(CONFIG.rules ?? {}) };
