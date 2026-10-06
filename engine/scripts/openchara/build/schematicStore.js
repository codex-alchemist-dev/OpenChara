// Schematic persistence for Build mode. EVERYTHING goes through MCLite's record layer (the adapter-agnostic storage
// API) - this file never calls setDynamicProperty. The MCLite API is injected (`db`), so the store works against any
// backend MCLite grows and is unit-testable with a plain mock owner.
//
//   header   record kind "schematic"      small, atomic A/B record: name, status, visibility, counts, timestamps
//   body     chunked kind "schematicBody" the encoded model (any size - split into parts by MCLite's chunkedRecord)
//   index    per-owner summaries          listing never loads a body
//   registry world-scoped id -> owner     so an id found anywhere can be traced to its player
//
// Lifecycle:  active --complete()/archive()--> archived --restore()--> active
//             any status --trash()--> trashed --restore()--> its previous status
//             purge({confirmed:true}) deletes for good; sweep() purges archived/trashed items older than archiveDays.

import { encode, decode, stats } from "./schematicModel.js";

export const STATUS = Object.freeze({ ACTIVE: "active", ARCHIVED: "archived", TRASHED: "trashed" });
const DAY_MS = 24 * 60 * 60 * 1000;
const HEADER_KIND = "schematic";
const BODY_KIND = "schematicBody";

export function createSchematicStore({ db, archiveDays = 30, now = () => Date.now() } = {}) {
    for (const fn of ["registerRecordKind", "writeRecord", "readRecord", "deleteRecord", "registerChunkedKind", "writeChunked", "readChunked", "deleteChunked", "registerIndexKind", "upsertIndexEntry", "removeIndexEntry", "readIndex", "generateId", "registerOwner", "clearOwner", "verifyChecksum"]) {
        if (typeof db?.[fn] !== "function") throw new Error(`createSchematicStore: db.${fn} is required (pass the MCLite API)`);
    }
    const isValidHeader = r => Boolean(r) && typeof r.id === "string" && typeof r.name === "string" && Object.values(STATUS).includes(r.status) && db.verifyChecksum(r);
    db.registerRecordKind(HEADER_KIND, { keyPrefix: "sch", validate: isValidHeader });
    db.registerChunkedKind(BODY_KIND, { keyPrefix: "schb" });
    db.registerIndexKind(HEADER_KIND, {
        project: r => ({ id: r.id, name: r.name, status: r.status, visible: r.visible, cells: r.cells, updatedAt: r.updatedAt, archivedAt: r.archivedAt, deletedAt: r.deletedAt }),
    });

    const readHeader = (owner, world, id) => db.readRecord(owner, world, HEADER_KIND, id);
    function writeHeader(owner, world, id, mutate) {
        const rec = db.writeRecord(owner, world, HEADER_KIND, id, old => { const next = mutate(old); return next ? { ...next, updatedAt: now() } : null; });
        if (rec) db.upsertIndexEntry(owner, HEADER_KIND, id, rec);
        return rec;
    }
    const countsOf = model => { const s = stats(model); return { cells: s.cells, build: s.build, mine: s.mine, markers: s.markers }; };

    return {
        STATUS,

        /** @returns {string|null} the new schematic id, or null if it could not be stored. */
        create(owner, world, { name, model, origin }) {
            const id = db.generateId();
            if (!db.writeChunked(owner, world, BODY_KIND, id, encode(model))) return null;
            const header = writeHeader(owner, world, id, () => ({
                id, name: String(name || "Untitled").slice(0, 40), status: STATUS.ACTIVE, visible: false, origin: origin ?? null,
                createdAt: now(), archivedAt: null, deletedAt: null, previousStatus: null, ...countsOf(model),
            }));
            if (!header) { db.deleteChunked(owner, world, BODY_KIND, id); return null; }
            db.registerOwner(world, HEADER_KIND, id, owner.id ?? "");
            return id;
        },

        /** Replaces the body (the working model) and refreshes the counts. */
        save(owner, world, id, model) {
            if (!readHeader(owner, world, id)) return false;
            if (!db.writeChunked(owner, world, BODY_KIND, id, encode(model))) return false;
            return Boolean(writeHeader(owner, world, id, old => ({ ...old, ...countsOf(model) })));
        },

        load(owner, world, id) {
            const header = readHeader(owner, world, id);
            if (!header) return null;
            const text = db.readChunked(owner, world, BODY_KIND, id);
            if (text === null) return null;
            try { return { header, model: decode(text) }; } catch (e) { return null; }
        },

        header: readHeader,

        /** Index summaries, newest first; filter by status (default: active only). */
        list(owner, { status = STATUS.ACTIVE } = {}) {
            return db.readIndex(owner, HEADER_KIND).filter(e => !status || e.status === status).sort((a, b) => b.updatedAt - a.updatedAt);
        },

        rename(owner, world, id, name) { return Boolean(writeHeader(owner, world, id, old => (old ? { ...old, name: String(name).slice(0, 40) } : null))); },
        setVisible(owner, world, id, visible) { return Boolean(writeHeader(owner, world, id, old => (old ? { ...old, visible: Boolean(visible) } : null))); },

        /** Marks the build finished: archived, hidden. The sweep purges it after archiveDays. */
        complete(owner, world, id) { return this.archive(owner, world, id); },
        archive(owner, world, id) {
            return Boolean(writeHeader(owner, world, id, old => (old && old.status !== STATUS.TRASHED ? { ...old, status: STATUS.ARCHIVED, archivedAt: now(), visible: false } : null)));
        },
        trash(owner, world, id) {
            return Boolean(writeHeader(owner, world, id, old => (old && old.status !== STATUS.TRASHED ? { ...old, status: STATUS.TRASHED, previousStatus: old.status, deletedAt: now(), visible: false } : null)));
        },
        restore(owner, world, id) {
            return Boolean(writeHeader(owner, world, id, old => {
                if (!old || old.status === STATUS.ACTIVE) return null;
                const back = old.status === STATUS.TRASHED ? (old.previousStatus ?? STATUS.ACTIVE) : STATUS.ACTIVE;
                return { ...old, status: back, previousStatus: null, deletedAt: null, archivedAt: back === STATUS.ARCHIVED ? old.archivedAt : null };
            }));
        },

        /** Permanent deletion of the header, body parts, index entry and registry entry. Requires { confirmed: true }. */
        purge(owner, world, id, { confirmed = false } = {}) {
            if (confirmed !== true) throw new Error("purge needs { confirmed: true } - permanent deletion must be confirmed by the player");
            const existed = Boolean(readHeader(owner, world, id));
            db.deleteChunked(owner, world, BODY_KIND, id);
            db.deleteRecord(owner, world, HEADER_KIND, id);
            db.removeIndexEntry(owner, HEADER_KIND, id);
            db.clearOwner(world, HEADER_KIND, id);
            return existed;
        },

        /** Purges archived and trashed schematics older than the grace period. @returns {string[]} the purged ids. */
        sweep(owner, world) {
            const cutoff = now() - archiveDays * DAY_MS;
            const purged = [];
            for (const e of db.readIndex(owner, HEADER_KIND)) {
                const since = e.status === STATUS.ARCHIVED ? e.archivedAt : e.status === STATUS.TRASHED ? e.deletedAt : null;
                if (since !== null && since !== undefined && since < cutoff) { this.purge(owner, world, e.id, { confirmed: true }); purged.push(e.id); }
            }
            return purged;
        },

        /** Drops index entries whose header is gone and reports header ids whose body is unreadable. */
        repair(owner, world) {
            db.reconcileIndex?.(owner, HEADER_KIND, id => Boolean(readHeader(owner, world, id)));
            return db.readIndex(owner, HEADER_KIND).filter(e => db.readChunked(owner, world, BODY_KIND, e.id) === null).map(e => e.id);
        },
    };
}
