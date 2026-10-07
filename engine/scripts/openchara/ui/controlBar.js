// Control bars bound to the real game (the logic is controlBarCore.cjs): the hotbar items, the action bar, and the full-screen
// command menu - a MinUI screen the PROJECT draws (its art), fed by the provider and action registered here.
//
//   const bar = defineControlBar({ id: "build", isActive: isInBuild, commands, pages, fixed, pageItem, menuItem });
//   registerBuildExitHook(p => bar.clear(p));
//   bar.give(player);                       // on entering the mode
//
// The menu screen is declared in the project's UI as   <screen id="control_menu" params="bar" data="controlMenu"> ... </screen>
// and receives { title, buttons: [{ id, label, alt, header }] } (one entry per button: headings, commands, and each command's
// sneak-alternate); every entry is itself a button calling the action  controlBarRun(bar, id, alt)  (headings have id "" and do nothing).

import core from "./controlBarCore.cjs";
import { registerControlItem, setControlItems, clearControlItems } from "./controlItems.js";
import { registerUiProvider, registerUiAction, openScreen } from "./runtime.js";
import { setInventoryButtons, clearInventoryButtons } from "./inventoryButtons.js";

const bars = new Map();
let menuRegistered = false;

const notify = (player, text) => { try { player.onScreenDisplay.setActionBar(text); } catch (e) { /* offline */ } };

function registerMenu() {
    if (menuRegistered) return;
    menuRegistered = true;
    registerUiProvider("controlMenu", (player, params) => {
        const bar = bars.get(params?.bar);
        if (!bar) return { title: "", buttons: [] };
        const buttons = [];
        for (const page of bar.menu()) {
            if (page.entries.length === 0) continue;
            buttons.push({ header: true, label: page.title, id: "", alt: false });
            for (const e of page.entries) {
                buttons.push({ header: false, id: e.id, label: e.label, alt: false });
                if (e.alt) buttons.push({ header: false, id: e.id, label: `   + sneak: ${e.alt}`, alt: true });
            }
        }
        return { title: bar.title ?? bar.id, buttons };
    });
    registerUiAction("controlBarRun", (player, barId, commandId, alt) => {
        if (!commandId) return {};   // a page heading
        const bar = bars.get(barId);
        if (!bar) throw new Error("That menu is no longer available.");
        if (!bar.isActive(player)) return { close: true };
        bar.run(player, commandId, { alt: alt === true || alt === "true" });
        return { close: true };
    });
}

/** @see controlBarCore.cjs for the definition shape */
export function defineControlBar(def) {
    registerMenu();
    const bar = core.createControlBar(def, {
        registerControlItem, setControlItems, clearControlItems, setInventoryButtons, clearInventoryButtons, notify,
        openMenu: (player, id) => openScreen(player, "control_menu", id),
    });
    bar.title = def.title ?? def.id;
    bars.set(def.id, bar);
    return bar;
}
