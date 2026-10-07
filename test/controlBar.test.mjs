// Run: node test/controlBar.test.mjs
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createControlBar } = require("../engine/scripts/openchara/ui/controlBarCore.cjs");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

function harness(overrides = {}) {
    const log = [];
    const handlers = new Map();
    const given = new Map();     // player id -> { slot: item }
    const deps = {
        registerControlItem: (id, fn) => handlers.set(id, fn),
        setControlItems: (p, slots) => { given.set(p.id, { ...(given.get(p.id) ?? {}), ...slots }); log.push(["set", slots]); },
        clearControlItems: p => { given.set(p.id, {}); log.push(["clear"]); },
        openMenu: (p, id) => log.push(["menu", id]),
        notify: (p, t) => log.push(["say", t]),
    };
    const player = { id: "p1", isSneaking: false };
    let active = true;
    const def = {
        id: "build", isActive: () => active, pageItem: "t:page", menuItem: "t:menu",
        commands: {
            rect: { item: "t:rect", label: "Rectangle", run: () => log.push(["rect"]), alt: { label: "Clear selection", run: () => log.push(["clear-sel"]) } },
            mine: { item: "t:mine", label: "Mine", run: () => log.push(["mine"]) },
            save: { item: "t:save", label: "Save", run: () => log.push(["save"]) },
            boom: { item: "t:boom", label: "Boom", run: () => { throw new Error("kaput"); } },
            exit: { item: "t:exit", label: "Exit", run: () => log.push(["exit"]) },
        },
        pages: [{ title: "Select", slots: { 0: "rect", 1: "mine" } }, { title: "Plan", slots: { 0: "save", 1: "boom", 2: "@menu" } }],
        fixed: { 7: "@page", 8: "exit" },
        ...overrides,
    };
    const bar = createControlBar(def, deps);
    return { bar, log, handlers, given, player, setActive: v => { active = v; }, use: (item, sneak = false) => { player.isSneaking = sneak; handlers.get(item)(player); } };
}

test("give() puts the first page plus the fixed slots in the hotbar", () => {
    const h = harness();
    h.bar.give(h.player);
    assert.deepStrictEqual(h.given.get("p1"), { 0: "t:rect", 1: "t:mine", 7: "t:page", 8: "t:exit" });
});

test("the page item flips pages (sneak flips back), re-gives the right items and says which page", () => {
    const h = harness();
    h.bar.give(h.player);
    h.use("t:page");
    assert.deepStrictEqual(h.given.get("p1"), { 0: "t:save", 1: "t:boom", 2: "t:menu", 7: "t:page", 8: "t:exit" }, "the previous page's items are gone");
    assert.ok(h.log.some(l => l[0] === "say" && /Page 2\/2: Plan/.test(l[1])));
    h.use("t:page");
    assert.strictEqual(h.bar.page(h.player), 0, "wraps around");
    h.use("t:page", true);
    assert.strictEqual(h.bar.page(h.player), 1, "sneak goes back");
});

test("using an item runs its command; sneak + use runs the alternate; items without an alternate ignore sneak", () => {
    const h = harness();
    h.bar.give(h.player);
    h.use("t:rect"); h.use("t:rect", true); h.use("t:mine", true);
    assert.deepStrictEqual(h.log.filter(l => ["rect", "clear-sel", "mine"].includes(l[0])).map(l => l[0]), ["rect", "clear-sel", "mine"]);
});

test("a command that throws reports on the action bar and the bar keeps working", () => {
    const h = harness();
    h.bar.give(h.player);
    h.use("t:boom");
    assert.deepStrictEqual(h.log.at(-1), ["say", "§ckaput"]);
    h.use("t:save");
    assert.deepStrictEqual(h.log.at(-1), ["save"]);
});

test("every handler is a no-op once the mode has ended", () => {
    const h = harness();
    h.bar.give(h.player);
    h.setActive(false);
    const before = h.log.length;
    for (const item of ["t:rect", "t:page", "t:menu", "t:exit"]) h.use(item);
    assert.strictEqual(h.log.length, before);
    assert.strictEqual(h.bar.run(h.player, "rect"), false);
});

test("the menu item opens the panel; the panel lists every command once, page by page, with alternates labelled", () => {
    const h = harness();
    h.bar.give(h.player);
    h.use("t:menu");
    assert.deepStrictEqual(h.log.at(-1), ["menu", "build"]);
    assert.deepStrictEqual(h.bar.menu(), [
        { title: "Select", entries: [{ id: "rect", label: "Rectangle", alt: "Clear selection" }, { id: "mine", label: "Mine", alt: null }] },
        { title: "Plan", entries: [{ id: "save", label: "Save", alt: null }, { id: "boom", label: "Boom", alt: null }] },
        { title: "Always available", entries: [{ id: "exit", label: "Exit", alt: null }] },
    ]);
});

test("run() works from the menu too (command and alternate), and clear() forgets the page and takes the items", () => {
    const h = harness();
    h.bar.give(h.player);
    h.use("t:page");
    assert.strictEqual(h.bar.run(h.player, "rect", { alt: true }), true);
    assert.deepStrictEqual(h.log.at(-1), ["clear-sel"]);
    assert.strictEqual(h.bar.run(h.player, "mine", { alt: true }), false, "no alternate: nothing runs");
    h.bar.clear(h.player);
    assert.strictEqual(h.bar.page(h.player), 0);
    assert.deepStrictEqual(h.given.get("p1"), {});
});

test("menu:false keeps a hotbar shortcut out of the panel", () => {
    const h = harness({ commands: { a: { item: "t:a", label: "A", run() {} }, b: { item: "t:b", label: "B (shortcut)", run() {}, menu: false } }, pages: [{ title: "p", slots: { 0: "a", 1: "b" } }], fixed: {}, pageItem: undefined, menuItem: undefined });
    assert.deepStrictEqual(h.bar.menu(), [{ title: "p", entries: [{ id: "a", label: "A", alt: null }] }]);
    h.bar.give(h.player);
    assert.deepStrictEqual(h.given.get("p1"), { 0: "t:a", 1: "t:b" }, "but it is still in the hotbar");
});

test("definition mistakes fail at definition time with a message naming the bar and the problem", () => {
    const bad = (over, re) => assert.throws(() => harness(over), re);
    bad({ pages: [] }, /needs at least one page/);
    bad({ pages: [{ title: "x", slots: { 9: "rect" } }], fixed: {} }, /slot 9 is not a hotbar slot/);
    bad({ pages: [{ title: "x", slots: { 7: "rect" } }] }, /slot 7 is also a fixed slot/);
    bad({ pages: [{ title: "x", slots: { 0: "nope" } }] }, /unknown command "nope"/);
    bad({ fixed: { 8: "exit" } }, /2 pages but no "@page" slot/);
    bad({ pageItem: undefined }, /uses @page but has no pageItem/);
    bad({ menuItem: "t:rect" }, /menuItem t:rect is also a command item/);
    bad({ commands: { a: { item: "t:x", label: "A", run() {} }, b: { item: "t:x", label: "B", run() {} } }, pages: [{ title: "p", slots: { 0: "a" } }], fixed: {} }, /t:x is used by more than one command/);
    bad({ commands: { a: { item: "t:x", label: "A" } }, pages: [{ title: "p", slots: { 0: "a" } }], fixed: {} }, /needs item, label and run/);
});

console.log(`\n${passed} passed`);
