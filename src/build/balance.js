// The project's launch balance rule: no character is particularly powerful when first created. Every class's base stats must
// sit inside a shared band, so individual differences come from skill trees, eidolons and gear later, never from the starting
// class. The bands are deliberately wide enough for small individual differences and narrow enough to stop one class being
// stronger than the rest. A project that wants a different launch balance edits these bands in one place.
"use strict";

const BASE_BANDS = {
    maxHp: [30, 50],   // the real in-game health scale (characters are spawned with 40 health)
    atk: [70, 100],
    def: [40, 70],
    spd: [90, 110],
    critRate: [0.03, 0.08],
    critDmg: [0.4, 0.7],
};

/** Throws, naming the class and the stat, if any base stat falls outside its band. */
function validateClassBalance(cls) {
    for (const [stat, [min, max]] of Object.entries(BASE_BANDS)) {
        const v = cls.baseStats?.[stat];
        if (typeof v !== "number") throw new Error(`classes/${cls.id}: baseStats.${stat} is required (a number)`);
        if (v < min || v > max) throw new Error(`classes/${cls.id}: baseStats.${stat} is ${v}, outside the launch balance band ${min}-${max} (no character starts particularly powerful; see src/build/balance.js)`);
    }
}

module.exports = { validateClassBalance, BASE_BANDS };
