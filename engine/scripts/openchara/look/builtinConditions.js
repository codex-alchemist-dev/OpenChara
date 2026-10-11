// The conditions every project gets. All read plain fields of the look context (lookContext.js), so each is a one-line pure
// function and can be tested without the game. Register more with registerSkinCondition() in the project.
//
//   form              "hunt" | ["hunt","preservation"]           time        "day"|"night"|"dawn"|"dusk" (or a list)
//   weather           "clear"|"rain"|"thunder"                   wet         "dry"|"damp"|"wet"|"soaked" or { gte: 0.5 }
//   inWater / underwater / sneaking / sitting / sleeping / swimming / riding / combat   true | false
//   dimension         "overworld"|"nether"|"the_end"             biome       "snow" | ["desert","badlands"]  (substring of the biome id)
//   health            "healthy"|"wounded"|"critical" or { lt: 0.5 } (fraction)       dirt  { gte: 0.6 } (0..1)
//   light             { lt: 5 } (block light 0..15)              holding     "sword" (weapon category)
//   armor             "chest" | { chest: false }                 date  { from: "12-24", to: "12-26" } (month-day, wraps the year)
//   level / relationship  number or { gte, lt, ... }             squad  true|false   order  "follow"|"stay"|...
//   random            { name, of, is, period? }  stable minute variation: is = index or list of indexes out of `of`

import { registerSkinCondition } from "./skinRules.js";
import { pick, bucketOf } from "./variation.js";

const list = v => (Array.isArray(v) ? v : [v]);

/** Number comparison: a plain number means equals; an object may combine eq/gt/gte/lt/lte. */
export function compare(value, arg) {
    if (typeof arg === "number") return value === arg;
    if (typeof value !== "number") return false;
    return (arg.eq === undefined || value === arg.eq) && (arg.gt === undefined || value > arg.gt) && (arg.gte === undefined || value >= arg.gte) &&
        (arg.lt === undefined || value < arg.lt) && (arg.lte === undefined || value <= arg.lte);
}

const WETNESS = [["soaked", 0.75], ["wet", 0.4], ["damp", 0.1], ["dry", 0]];
const wetName = w => WETNESS.find(([, min]) => w >= min)[0];
const HEALTH = [["critical", 0.33], ["wounded", 0.66], ["healthy", 1.01]];
const healthName = f => HEALTH.find(([, max]) => f < max)[0];

const md = (month, day) => month * 100 + day;
const parseMd = s => { const [m, d] = s.split("-").map(Number); return md(m, d); };

let registered = false;
export function registerBuiltinSkinConditions() {
    if (registered) return;
    registered = true;
    const flag = (name, field) => registerSkinCondition(name, (arg, ctx) => Boolean(ctx[field ?? name]) === Boolean(arg));
    registerSkinCondition("form", (arg, ctx) => list(arg).includes(ctx.form));
    registerSkinCondition("time", (arg, ctx) => list(arg).includes(ctx.time));
    registerSkinCondition("weather", (arg, ctx) => list(arg).includes(ctx.weather));
    registerSkinCondition("dimension", (arg, ctx) => list(arg).includes(ctx.dimension));
    registerSkinCondition("biome", (arg, ctx) => list(arg).some(b => String(ctx.biome ?? "").includes(b)));
    registerSkinCondition("wet", (arg, ctx) => (typeof arg === "string" || Array.isArray(arg) ? list(arg).includes(wetName(ctx.wetness ?? 0)) : compare(ctx.wetness ?? 0, arg)));
    registerSkinCondition("health", (arg, ctx) => (typeof arg === "string" || Array.isArray(arg) ? list(arg).includes(healthName(ctx.healthFraction ?? 1)) : compare(ctx.healthFraction ?? 1, arg)));
    registerSkinCondition("dirt", (arg, ctx) => compare(ctx.dirt ?? 0, arg));
    registerSkinCondition("light", (arg, ctx) => compare(ctx.light ?? 15, arg));
    registerSkinCondition("holding", (arg, ctx) => list(arg).includes(ctx.weapon));
    registerSkinCondition("armor", (arg, ctx) => (typeof arg === "string" ? Boolean(ctx.armor?.[arg]) : Object.entries(arg).every(([slot, want]) => Boolean(ctx.armor?.[slot]) === Boolean(want))));
    registerSkinCondition("level", (arg, ctx) => compare(ctx.level ?? 0, arg));
    registerSkinCondition("relationship", (arg, ctx) => compare(ctx.relationship ?? 0, arg));
    registerSkinCondition("order", (arg, ctx) => list(arg).includes(ctx.order));
    registerSkinCondition("date", (arg, ctx) => {
        const now = md(ctx.date?.month ?? 0, ctx.date?.day ?? 0), from = parseMd(arg.from), to = parseMd(arg.to);
        return from <= to ? now >= from && now <= to : now >= from || now <= to;
    });
    registerSkinCondition("random", (arg, ctx) => {
        const v = pick(ctx.seed ?? 0, arg.name, arg.of, bucketOf(arg.period, { now: ctx.now, session: ctx.session }));
        return list(arg.is).includes(v);
    });
    for (const name of ["inWater", "underwater", "sneaking", "sitting", "sleeping", "swimming", "riding", "combat"]) flag(name);
    flag("squad", "inSquad");
}
