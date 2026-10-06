// Binds the schematic store to the real MCLite and the live world. Everything persistent in Build mode goes
// through here (and so through MCLite's record layer).

import { world } from "@minecraft/server";
import * as mclite from "@mclite/core";
import { createSchematicStore, STATUS } from "./schematicStore.js";
import { RULES } from "../rules.js";

let store = null;
const getStore = () => (store ??= createSchematicStore({ db: mclite, archiveDays: RULES.buildArchiveDays }));

export { STATUS };

/** The store's API with this player as owner and the real world for mirrors/registry. */
export function schematicsOf(player) {
    const s = getStore();
    return {
        create: opts => s.create(player, world, opts),
        save: (id, model) => s.save(player, world, id, model),
        load: id => s.load(player, world, id),
        header: id => s.header(player, world, id),
        list: opts => s.list(player, opts),
        rename: (id, name) => s.rename(player, world, id, name),
        setVisible: (id, v) => s.setVisible(player, world, id, v),
        complete: id => s.complete(player, world, id),
        archive: id => s.archive(player, world, id),
        trash: id => s.trash(player, world, id),
        restore: id => s.restore(player, world, id),
        purge: (id, opts) => s.purge(player, world, id, opts),
        sweep: () => s.sweep(player, world),
        repair: () => s.repair(player, world),
    };
}
