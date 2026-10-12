// What the face kit does: blink, mouth shapes and expression poses, as (1) plain math (`faceTransforms`, used by the preview and
// the tests) and (2) the Bedrock animation JSON with Molang built from the SAME constants (`blinkAnimation`, `mouthAnimation`).
// Mouth model (decoded from the reference): three variables sampled per frame -
//   v.oc_open   0 .25 .5 .75 1   how far the lips part: teethTop up and teethBottom down by open x 0.75 (x1.5 for chibi faces)
//   v.oc_wide   0 .5 .75 1       mouth width: X scale 0.75 + wide x 0.25
//   v.oc_closed 0 | 1            1 collapses the teeth to nothing (a closed line)
// The mouth plane itself squashes taller as it opens: Y scale 1 + open x 1.5.
"use strict";

const OPEN_LEVELS = [0, 0.25, 0.5, 0.75, 1];
const WIDE_LEVELS = [0, 0.5, 0.75, 1];
const BLINK = { length: 0.15, lidScaleY: 2.02, delayMin: 0.5, delayMax: 2.5 };
const LIP_TRAVEL = 0.75;       // px each teeth bone moves per unit of openness (adult proportions)
const LIP_TRAVEL_CHIBI = 1.5;  // faces drawn on a small/rounded head open further
const MOUTH_TALL = 1.5;        // extra Y scale of the mouth plane at full open

const V = { open: "v.oc_open", wide: "v.oc_wide", closed: "v.oc_closed", chibi: "v.oc_chibi" };

/** The state of every kit bone for given mouth/blink values. -> { bone: { position?: [x,y,z], scale?: [x,y,z] } } (offsets from rest). */
function faceTransforms({ open = 0, wide = 1, closed = 0, chibi = false, blink = 0, talkOnly = false } = {}) {
    const travel = (chibi ? LIP_TRAVEL_CHIBI : LIP_TRAVEL) * open;
    const widthScale = 0.75 + wide * 0.25;
    const vis = talkOnly ? 1 - closed : 1;
    const t = {
        mouth: { scale: [widthScale * vis, (1 + open * MOUTH_TALL) * vis, 1] },
        teethTop: { position: [0, travel, 0], scale: [widthScale - closed, 1 - closed, 1 - closed] },
        teethBottom: { position: [0, -travel, 0], scale: [widthScale - closed, 1 - closed, 1 - closed] },
    };
    if (blink > 0) {
        t.lidUpper = { scale: [1, 1 + blink * (BLINK.lidScaleY - 1), 1] };
        t.lidLower = { scale: [1, 1 + blink * (BLINK.lidScaleY - 1), 1] };
    }
    return t;
}

const num = n => (Number.isInteger(n) ? String(n) : String(+n.toFixed(4)));

/**
 * The looping mouth animation: bones follow the three variables. (Run it always; the lip-sync tracks just change the variables.)
 * @param {{talkOnly?: boolean}} [opts] talkOnly = the face kit's "talk" mode (painted face): the mouth and teeth vanish when closed
 */
function mouthAnimation({ talkOnly = false } = {}) {
    const vis = talkOnly ? `*(1-${V.closed})` : "";
    const travel = `(${V.chibi}?${num(LIP_TRAVEL_CHIBI)}:${num(LIP_TRAVEL)})*${V.open}`;
    const widthScale = `0.75+${V.wide}*0.25`;
    return {
        loop: true,
        bones: {
            mouth: { scale: [`(${widthScale})${vis}`, `(1+${V.open}*${num(MOUTH_TALL)})${vis}`, 1] },
            teethTop: { position: [0, travel, 0], scale: [`${widthScale}-${V.closed}`, `1-${V.closed}`, `1-${V.closed}`] },
            teethBottom: { position: [0, `-(${travel})`, 0], scale: [`${widthScale}-${V.closed}`, `1-${V.closed}`, `1-${V.closed}`] },
        },
    };
}

/** The blink: lids scale shut for 0.15 s with a random 0.5-2.5 s wait between blinks (overrides other lid animation while it runs). */
function blinkAnimation() {
    const s = num(BLINK.lidScaleY);
    return {
        loop: true,
        animation_length: BLINK.length,
        override_previous_animation: true,
        loop_delay: `Math.random(${num(BLINK.delayMin)},${num(BLINK.delayMax)})`,
        bones: { lidUpper: { scale: [1, s, 1] }, lidLower: { scale: [1, s, 1] } },
    };
}

/** The resting face: the brow plane is hidden until an expression pose shows it. */
function restAnimation() {
    return { loop: true, bones: { brow: { scale: [1, 0, 1] } } };
}

/** Variables a rig must have defined (a pre_animation default keeps the mouth closed and neutral until a track drives it). */
function faceVariableDefaults() {
    return [`${V.open}=${V.open}??0;`, `${V.wide}=${V.wide}??1;`, `${V.closed}=${V.closed}??1;`];
}

module.exports = { OPEN_LEVELS, WIDE_LEVELS, BLINK, LIP_TRAVEL, LIP_TRAVEL_CHIBI, MOUTH_TALL, V, faceTransforms, mouthAnimation, blinkAnimation, restAnimation, faceVariableDefaults };
