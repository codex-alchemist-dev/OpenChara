// Stable "random" variation. A character's minute differences (freckles, hair strands, outfit tweaks) must not flicker on every
// tick and must survive a relog, so they are not random at all: they are a hash of her permanent seed, the variation's name and
// a time bucket. The bucket decides how long a pick lasts. Pure: no game objects.

/** FNV-1a, 32 bit. */
export function hash32(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
}

/** A new permanent seed for a character (called once; stored in record.look.seed). */
export function newSeed(random = Math.random) { return Math.floor(random() * 0xffffffff) >>> 0; }

const BUCKET_MS = { hourly: 3600_000, daily: 86400_000, weekly: 7 * 86400_000 };

/**
 * The time bucket a pick lasts for. "stable" never changes; "session" changes when the world is (re)loaded; "hourly" /
 * "daily" / "weekly" follow the real clock; a number is a length in seconds.
 */
export function bucketOf(period, { now = Date.now(), session = 0 } = {}) {
    if (period === undefined || period === "stable") return 0;
    if (period === "session") return `s${session}`;
    if (typeof period === "number" && period > 0) return Math.floor(now / (period * 1000));
    if (BUCKET_MS[period]) return Math.floor(now / BUCKET_MS[period]);
    throw new Error(`unknown variation period "${period}" (stable, session, hourly, daily, weekly, or seconds)`);
}

/** A stable integer in [0, n) for (seed, name, bucket). */
export function pick(seed, name, n, bucket = 0) {
    if (!(n >= 1)) throw new Error("pick: n must be >= 1");
    return hash32(`${seed}|${name}|${bucket}`) % n;
}
