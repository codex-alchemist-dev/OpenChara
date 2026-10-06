// Player item snapshots for camera modes (RTS command mode, Build mode): the flat 42-slot layout shared by the
// body double and the serialized backup. 0-35 inventory, 36-39 armor, 40 offhand.
//
// A player's main hand is just their selected hotbar slot - restore it through the inventory only, never
// setEquipment(Mainhand) (rtsDummy note).

const ARMOR = ["Head", "Chest", "Legs", "Feet"];
export const SLOT_COUNT = 42;

export function snapshotPlayer(player) {
    const eq = player.getComponent("minecraft:equippable");
    const inv = player.getComponent("minecraft:inventory").container;
    const out = new Array(SLOT_COUNT).fill(undefined);
    for (let i = 0; i < 36 && i < inv.size; i++) out[i] = inv.getItem(i);
    ARMOR.forEach((s, k) => { try { out[36 + k] = eq.getEquipment(s); } catch (e) { /* fine */ } });
    try { out[40] = eq.getEquipment("Offhand"); } catch (e) { /* fine */ }
    return out;
}

export function writePlayer(player, items) {
    const eq = player.getComponent("minecraft:equippable");
    const inv = player.getComponent("minecraft:inventory").container;
    inv.clearAll();
    for (let i = 0; i < 36 && i < inv.size; i++) if (items[i]) inv.setItem(i, items[i]);
    ARMOR.forEach((s, k) => eq.setEquipment(s, items[36 + k]));
    eq.setEquipment("Offhand", items[40]);
}

export function clearPlayer(player) {
    const eq = player.getComponent("minecraft:equippable");
    player.getComponent("minecraft:inventory").container.clearAll();
    for (const s of [...ARMOR, "Offhand"]) { try { eq.setEquipment(s, undefined); } catch (e) { /* fine */ } }
}

export const itemSig = it => (it ? `${it.typeId}x${it.amount}` : "-");
