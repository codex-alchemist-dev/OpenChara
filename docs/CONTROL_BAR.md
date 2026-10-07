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

## Why a hotbar and a menu, not clickable inventory slots

The script API has no event for clicking an item inside the inventory screen, so a locked item sitting in the inventory cannot act as a button, and the vanilla inventory screen cannot be replaced from scripts. What scripts DO get is item use (the hotbar) and forms (screens opened by script), so the bar uses exactly those: the hotbar for fast actions, pages for more of them, and the menu panel for the full interface.
