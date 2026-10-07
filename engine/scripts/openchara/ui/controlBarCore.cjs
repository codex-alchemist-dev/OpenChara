// Control bars: the locked tool items a camera mode (Command mode, Build mode, ...) puts in the player's hotbar, as ONE shared
// system. A bar is data - commands, pages of hotbar slots, fixed slots - and this file turns it into behaviour:
//
//   * every command is an item; using it runs the command, and SNEAK + use runs its alternate (if it has one)
//   * more commands than hotbar slots? Pages: a page item flips the hotbar between pages (sneak flips back)
//   * a menu item opens the full-screen button panel listing every command (and every alternate) with a label, so nothing
//     hides behind a modifier key
//   * every handler is guarded: a stray use after the mode ended does nothing, and a command that throws reports to the
//     action bar instead of breaking the mode
//
// Pure logic: the game (items, screens, action bar) comes in through `deps`, so the layout, paging and dispatch are unit-tested
// in plain Node. See controlBar.js for the binding to the real game.

const SPECIAL = new Set(["@page", "@menu"]);

/**
 * @param {object} def
 * @param {string} def.id unique bar id
 * @param {(player: object) => boolean} def.isActive whether the mode the bar belongs to is running for this player
 * @param {Record<string, {item: string, label: string, run: (player: object) => any, alt?: {label: string, run: (player: object) => any}, menu?: boolean}>} def.commands
 *   `menu: false` keeps a command out of the menu panel (use it for a hotbar shortcut of something the panel already lists, e.g. another command's alternate)
 * @param {Array<{title: string, slots: Record<number, string>}>} def.pages hotbar slot -> command id, per page
 * @param {Record<number, string>} [def.fixed] slots shown on every page: command ids, "@page" (flip pages) or "@menu" (the panel)
 * @param {string} [def.pageItem] item id of the page flipper (required when "@page" is used)
 * @param {string} [def.menuItem] item id of the menu opener (required when "@menu" is used)
 * @param {string[]|"all"} [def.inventory] commands that are ALSO offered as inventory buttons (locked marker items in the main inventory,
 *   slots 9 upward, click = run; sneak + click = the alternate). "all" = every command the menu lists, in menu order. Needs deps.setInventoryButtons.
 * @param {object} deps
 * @param {(itemId: string, handler: (player: object) => void) => void} deps.registerControlItem
 * @param {(player: object, slots: Record<number, string>) => void} deps.setControlItems
 * @param {(player: object) => void} deps.clearControlItems
 * @param {(player: object, barId: string) => void} deps.openMenu
 * @param {(player: object, text: string) => void} deps.notify action-bar message
 * @param {(player: object, buttons: object) => void} [deps.setInventoryButtons] see inventoryButtons.js
 * @param {(player: object) => void} [deps.clearInventoryButtons]
 */
function createControlBar(def, deps) {
    const { id, isActive, commands, pages, fixed = {} } = def;
    if (!id) throw new Error("control bar needs an id");
    if (!Array.isArray(pages) || pages.length === 0) throw new Error(`control bar "${id}" needs at least one page`);

    // ---- validation: a mistake here is a typo in a project file, so fail loudly at definition time ----
    const items = new Map();   // item id -> command id | "@page" | "@menu"
    for (const [cid, c] of Object.entries(commands)) {
        if (typeof c.run !== "function" || !c.item || !c.label) throw new Error(`control bar "${id}": command "${cid}" needs item, label and run`);
        if (c.alt && (typeof c.alt.run !== "function" || !c.alt.label)) throw new Error(`control bar "${id}": command "${cid}" alt needs label and run`);
        if (items.has(c.item)) throw new Error(`control bar "${id}": item ${c.item} is used by more than one command`);
        items.set(c.item, cid);
    }
    const usesSpecial = key => [...pages.flatMap(p => Object.values(p.slots)), ...Object.values(fixed)].includes(key);
    for (const [key, field] of [["@page", "pageItem"], ["@menu", "menuItem"]]) {
        if (usesSpecial(key)) {
            if (!def[field]) throw new Error(`control bar "${id}" uses ${key} but has no ${field}`);
            if (items.has(def[field])) throw new Error(`control bar "${id}": ${field} ${def[field]} is also a command item`);
            items.set(def[field], key);
        }
    }
    if (pages.length > 1 && !usesSpecial("@page")) throw new Error(`control bar "${id}" has ${pages.length} pages but no "@page" slot to flip them`);
    const fixedSlots = Object.keys(fixed).map(Number);
    pages.forEach((page, i) => {
        for (const [slot, cid] of Object.entries(page.slots)) {
            const n = Number(slot);
            if (!(n >= 0 && n <= 8)) throw new Error(`control bar "${id}" page ${i + 1}: slot ${slot} is not a hotbar slot (0-8)`);
            if (fixedSlots.includes(n)) throw new Error(`control bar "${id}" page ${i + 1}: slot ${slot} is also a fixed slot`);
            if (!SPECIAL.has(cid) && !commands[cid]) throw new Error(`control bar "${id}" page ${i + 1}: unknown command "${cid}"`);
        }
    });
    for (const [slot, cid] of Object.entries(fixed)) {
        if (!(Number(slot) >= 0 && Number(slot) <= 8)) throw new Error(`control bar "${id}": fixed slot ${slot} is not a hotbar slot (0-8)`);
        if (!SPECIAL.has(cid) && !commands[cid]) throw new Error(`control bar "${id}": fixed slot ${slot} names unknown command "${cid}"`);
    }

    const menuOrder = () => {
        const seen = new Set();
        const out = [];
        for (const page of pages) for (const cid of Object.values(page.slots)) if (!SPECIAL.has(cid) && !seen.has(cid) && commands[cid].menu !== false) { seen.add(cid); out.push(cid); }
        for (const cid of Object.values(fixed)) if (!SPECIAL.has(cid) && !seen.has(cid) && commands[cid].menu !== false) { seen.add(cid); out.push(cid); }
        return out;
    };
    const inventoryIds = def.inventory === "all" ? menuOrder() : (def.inventory ?? []);
    for (const cid of inventoryIds) if (!commands[cid]) throw new Error(`control bar "${id}": inventory names unknown command "${cid}"`);
    if (inventoryIds.length > 27) throw new Error(`control bar "${id}": ${inventoryIds.length} inventory buttons do not fit the 27 main-inventory slots`);
    if (inventoryIds.length && !deps.setInventoryButtons) throw new Error(`control bar "${id}" lists inventory buttons but no deps.setInventoryButtons was given`);

    const pageOf = new Map();   // player id -> page index
    const pageIndex = p => pageOf.get(p.id) ?? 0;
    const itemFor = cid => (cid === "@page" ? def.pageItem : cid === "@menu" ? def.menuItem : commands[cid].item);

    function layout(player) {
        const page = pages[pageIndex(player)];
        const slots = {};
        for (const [slot, cid] of Object.entries({ ...page.slots, ...fixed })) slots[slot] = itemFor(cid);
        return slots;
    }

    function show(player) {
        deps.clearControlItems(player);
        deps.setControlItems(player, layout(player));
    }

    function runCommand(player, cid, { alt = false } = {}) {
        if (!isActive(player)) return false;
        const c = commands[cid];
        if (!c) return false;
        const target = alt ? c.alt : c;
        if (!target) return false;
        try { target.run(player); return true; }
        catch (e) { deps.notify(player, `§c${e?.message ?? e}`); return false; }
    }

    function flip(player, delta) {
        if (!isActive(player) || pages.length < 2) return;
        const next = (pageIndex(player) + delta + pages.length) % pages.length;
        pageOf.set(player.id, next);
        show(player);
        deps.notify(player, `§7Page ${next + 1}/${pages.length}: ${pages[next].title}`);
    }

    const bar = {
        id,
        isActive,
        commands,
        pages,
        layout,
        inventoryButtonIds: inventoryIds,
        /** Starts at page 1 and puts the bar's items in the hotbar. */
        give(player) {
            pageOf.set(player.id, 0);
            show(player);
            if (inventoryIds.length) {
                const buttons = {};
                inventoryIds.forEach((cid, i) => {
                    const c = commands[cid];
                    buttons[9 + i] = {
                        item: c.item, name: `§f${c.label}`, lore: c.alt ? [`§7Sneak + click: ${c.alt.label}`] : [],
                        onPress: (p, info) => runCommand(p, cid, { alt: Boolean(info.sneaking) && Boolean(c.alt) }),
                    };
                });
                deps.setInventoryButtons(player, buttons);
            }
        },
        /** Takes the bar's items away and forgets the page (register this as the mode's exit hook). */
        clear(player) { pageOf.delete(player.id); deps.clearControlItems(player); deps.clearInventoryButtons?.(player); },
        page: pageIndex,
        flip,
        run: runCommand,
        /** Everything the menu panel lists, page by page: [{ title, entries: [{ id, label, alt?: string }] }]. */
        menu() {
            const seen = new Set();
            const out = pages.map(page => {
                const entries = [];
                for (const cid of Object.values(page.slots)) {
                    if (SPECIAL.has(cid) || seen.has(cid) || commands[cid].menu === false) continue;
                    seen.add(cid);
                    entries.push({ id: cid, label: commands[cid].label, alt: commands[cid].alt?.label ?? null });
                }
                return { title: page.title, entries };
            });
            const fixedEntries = Object.values(fixed).filter(cid => !SPECIAL.has(cid) && !seen.has(cid) && commands[cid].menu !== false).map(cid => ({ id: cid, label: commands[cid].label, alt: commands[cid].alt?.label ?? null }));
            if (fixedEntries.length) out.push({ title: "Always available", entries: fixedEntries });
            return out;
        },
    };

    // ---- the item handlers ----
    for (const [itemId, what] of items) {
        deps.registerControlItem(itemId, player => {
            if (!isActive(player)) return;   // stray use after the mode ended
            if (what === "@page") flip(player, player.isSneaking ? -1 : 1);
            else if (what === "@menu") deps.openMenu(player, id);
            else runCommand(player, what, { alt: Boolean(player.isSneaking) && Boolean(commands[what].alt) });
        });
    }
    return bar;
}

module.exports = { createControlBar };
