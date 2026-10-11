// Everything the skin rules and form selection can ask about a character, gathered once into plain data. Impure (reads the
// entity and world) and defensive: any read that fails leaves its field at a neutral value, never throws. A project adds its own
// fields with registerLookContextProvider (level, relationship, quest flags...), which then work in `when` through
// registerSkinCondition.

import { world } from "@minecraft/server";
import { weaponCategory } from "./weapons.js";

const providers = [];
/** @param {(ctx: object, info: { entity: object, record: object, owner: object|null }) => object|void} fn may mutate ctx or return extra fields */
export function registerLookContextProvider(fn) { providers.push(fn); }

const SESSION = Date.now() % 1_000_000_000;   // changes every time the world is loaded ("session" variation period)

function timeName(t) {
    if (t >= 23000 || t < 1000) return "dawn";
    if (t < 12000) return "day";
    if (t < 13000) return "dusk";
    return "night";
}

const slotItem = (equippable, slot) => { try { return equippable?.getEquipment(slot); } catch (e) { return undefined; } };

export function buildLookContext({ entity, record, owner = null, form = null, state = {}, inCombat = false, now = Date.now() }) {
    const ctx = { form, now, session: SESSION, seed: state.seed ?? 0, dirt: state.dirt ?? 0, wetness: state.wetness ?? 0, combat: Boolean(inCombat), order: record?.order, level: record?.level, inSquad: Boolean(record?.squadId) };
    const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch (e) { return fallback; } };

    ctx.time = safe(() => timeName(world.getTimeOfDay()), "day");
    ctx.dimension = safe(() => entity.dimension.id.replace("minecraft:", ""), "overworld");
    ctx.weather = safe(() => String(entity.dimension.getWeather()).toLowerCase(), "clear");
    ctx.biome = safe(() => entity.dimension.getBiome?.(entity.location)?.id, undefined);
    ctx.inWater = safe(() => Boolean(entity.isInWater), false);
    ctx.swimming = safe(() => Boolean(entity.isSwimming), false);
    ctx.underwater = ctx.inWater && safe(() => (entity.dimension.getBlock(entity.getHeadLocation())?.typeId ?? "").includes("water"), false);
    ctx.sneaking = safe(() => Boolean(entity.isSneaking), false);
    ctx.sitting = record?.order === "stay";
    ctx.riding = safe(() => Boolean(entity.getComponent("minecraft:riding")), false);
    ctx.healthFraction = safe(() => { const h = entity.getComponent("minecraft:health"); return h.currentValue / h.effectiveMax; }, 1);
    ctx.light = safe(() => entity.dimension.getBlock(entity.location)?.getLightLevel?.(), 15);

    const eq = safe(() => entity.getComponent("minecraft:equippable"), undefined);
    ctx.weapon = weaponCategory(slotItem(eq, "Mainhand")?.typeId);
    ctx.armor = {};
    for (const slot of ["Head", "Chest", "Legs", "Feet"]) ctx.armor[slot.toLowerCase()] = Boolean(slotItem(eq, slot));

    const d = new Date(now);
    ctx.date = { month: d.getMonth() + 1, day: d.getDate() };

    for (const fn of providers) { try { Object.assign(ctx, fn(ctx, { entity, record, owner }) ?? {}); } catch (e) { /* a provider must not break the look */ } }
    return ctx;
}
