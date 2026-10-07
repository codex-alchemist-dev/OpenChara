// Per-player cutscene state ("seen" markers and named flags), persisted through MCLite's record layer (never raw dynamic
// properties). The MCLite API is injected so this runs against any backend and in plain Node tests.

const KIND = "cinemaFlags";
// The world-scoped mirror is keyed by kind+id, so the id must be unique per player or one player's record would "recover" another's.
const recordId = player => `f${player.id}`;

export function createCinemaFlags({ db, world }) {
    for (const fn of ["registerRecordKind", "readRecord", "writeRecord", "verifyChecksum"]) {
        if (typeof db?.[fn] !== "function") throw new Error(`createCinemaFlags: db.${fn} is required (pass the MCLite API)`);
    }
    db.registerRecordKind(KIND, { keyPrefix: "cflag", validate: r => Boolean(r) && typeof r.flags === "object" && r.flags !== null && db.verifyChecksum(r) });

    const read = player => db.readRecord(player, world, KIND, recordId(player))?.flags ?? {};
    function set(player, name) {
        if (!name || typeof name !== "string") throw new Error("cinema flag needs a name");
        db.writeRecord(player, world, KIND, recordId(player), old => ({ ...(old ?? {}), id: recordId(player), flags: { ...(old?.flags ?? {}), [name]: true } }));
    }
    return {
        has: (player, name) => read(player)[name] === true,
        set,
        unset(player, name) {
            db.writeRecord(player, world, KIND, recordId(player), old => { const flags = { ...(old?.flags ?? {}) }; delete flags[name]; return { ...(old ?? {}), id: recordId(player), flags }; });
        },
        markSeen: (player, id) => set(player, `seen:${id}`),
        hasSeen: (player, id) => read(player)[`seen:${id}`] === true,
        list: player => Object.keys(read(player)),
    };
}
