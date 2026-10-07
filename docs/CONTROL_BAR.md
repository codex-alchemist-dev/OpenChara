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

## Clickable inventory items and a custom inventory screen: what the docs say

I first wrote that neither is possible. That was wrong as stated, so here is what the Microsoft Learn and Bedrock Wiki pages actually say (checked 2026-10-07):

- **Detecting clicks on inventory items.** There is no "slot clicked" event, but there are two that cover it. `playerInventoryItemChange` (stable) fires when an item is added to or removed from the player's inventory, with the slot and the before/after stacks. `playerCursorItemGrab` / `playerCursorItemRelease` (pre-release / experimental only) fire when a player grabs an item from a container to the cursor and releases it. A slot-locked item (`ItemLockMode.slot`) cannot be picked up, so it produces no events; an item locked with `ItemLockMode.inventory` ("cannot be dropped or crafted with") can still be moved, so picking it up IS observable. A "button item" would therefore be an inventory-locked item that snaps back to its slot and runs its command when grabbed. Not confirmed in-game: run `/scriptevent <ns>:spike invclick`.
- **Editing the inventory screen.** Resource packs can modify vanilla JSON UI screens (`inventory_screen.json` is named in the wiki; the `modifications` property edits existing elements). Two caveats: Mojang is moving screens to Ore UI, which resource packs cannot modify, and I could not confirm from the docs whether the inventory screen is still JSON UI in the current game version. And the docs describe no way for a custom JSON-UI button to notify server scripts (forms are the documented UI to script path), so a custom inventory screen would need a trick - for example buttons that press real slots - to talk to scripts.

So today's bars use the parts that are confirmed (item use on the hotbar, pages, a form-based menu). Click-to-trigger inventory buttons and an edited inventory screen are possible follow-ups once the spike and a JSON-UI check say they work on the target game version.
