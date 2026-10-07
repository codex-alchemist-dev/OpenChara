# Control bars

Command mode and Build mode both give the player a locked tool hotbar. That is one shared system now: `defineControlBar()` (engine `ui/controlBar.js`, logic and tests in `controlBarCore.cjs`). A bar is data:

```js
const bar = defineControlBar({
    id: "build", title: "Build mode", isActive: isInBuild,
    pageItem: `${NS}:build_page`, menuItem: `${NS}:build_menu`,
    commands: {
        rect: { item: `${NS}:build_rect`, label: "Select box", run: p => buildAction(p, "rect"),
                alt: { label: "Clear selection", run: p => buildAction(p, "clearSelection") } },
        ...
    },
    pages: [{ title: "Plan", slots: { 0: "rect", 1: "circle" } }, { title: "More", slots: { 0: "save" } }],
    fixed: { 7: "@page", 8: "exit" },          // on every page; "@page" flips pages, "@menu" opens the menu
});
registerBuildExitHook(p => bar.clear(p));      // and bar.give(player) when the mode starts
```

- **Use** an item to run its command; **sneak + use** runs its alternate. Stray uses after the mode ended do nothing; a command that throws reports on the action bar.
- **Pages:** more commands than hotbar slots? The `@page` item flips between pages (sneak flips back) and the action bar says which page you are on.
- **Menu:** the `@menu` item opens a full-screen panel (a MinUI screen the project draws, `<screen id="control_menu" params="bar" data="controlMenu">`) listing every command and every sneak-alternate as a button, so nothing is hidden behind a modifier key. `menu: false` keeps a hotbar shortcut out of the panel when the panel already lists it as an alternate.
- Definition mistakes (a slot outside the hotbar, a slot used twice, a missing page item, an unknown command) throw when the bar is defined, naming the bar.

## Inventory buttons (the same trick as our horse and container screens)

Our horse/container screens already have working buttons, and the MinUI notes (`lib/entity-container.js`) say why they work: a UI control cannot call a script, but a REAL SLOT can be watched. A "button" is a locked marker item in a slot; clicking it picks the item up, the script sees the slot change, puts the marker back, clears the cursor and runs the action. `defineControlBar({ inventory: "all" })` does exactly that for the player's own inventory (`ui/inventoryButtons.js`, decision logic in `inventoryButtonsCore.cjs`, tested):

- every command the menu lists also becomes a marker item in the main inventory (slots 9-35, in menu order), named after the command, with "Sneak + click: ..." in its lore when it has an alternate;
- click = run; sneak + click = the alternate; markers are locked `inventory` (cannot be dropped or crafted with, but can be moved - moving one is the click), kept on death, swept from the cursor and from any slot they end up in;
- if the player swaps a real item into a button slot, the real item is kept (given back to a free slot, or dropped) and the marker is restored;
- detection is a 2-tick poll while a player has buttons, plus the stable `playerInventoryItemChange` event as a fast path - the poll alone is enough, which is why it does not depend on the experimental cursor events.

What it looks like today is the vanilla inventory screen with named marker items. Restyling those slots as real button art (as `Button()` does for the horse screen) means overriding `inventory_screen` in JSON UI and positioning overlays over the right grid cells; the horse-screen history shows that takes screenshot-driven iteration, so it is not shipped blind.

`/scriptevent <ns>:spike invclick` additionally reports which inventory events fire for a moved inventory-locked item, including the experimental `playerCursorItemGrab/Release` where the API version has them.
