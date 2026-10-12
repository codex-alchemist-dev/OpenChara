// Audio -> mouth track. Pure: takes mono float samples, returns one {open, wide, closed} per animation frame (24 fps by default);
// no IO and no ffmpeg here (tools/lipsync.js does the decoding). The three values are exactly the face kit's mouth variables
// (faceAnimations.js): open 0 .25 .5 .75 1, wide 0 .5 .75 1, closed 0|1.
//   openness  loudness of the frame relative to the clip's own peak (so quiet and loud voices both move the mouth)
//   width     spectral centroid of the frame: low formants (oo, oh) = narrow, high ones (ee, s) = wide
//   closed    silence, held a minimum time so the mouth does not flutter between words
"use strict";

const { OPEN_LEVELS, WIDE_LEVELS, V } = require("./faceAnimations.js");

const DEFAULTS = {
    fps: 24,
    floorDb: -34,        // a frame this far below the clip's peak is silence
    absFloor: 0.002,     // ...and so is anything quieter than this (-54 dBFS), whatever the peak (a silent clip stays closed)
    centroidHz: [650, 1150, 1800],   // upper edges of width levels 0, .5, .75 (above the last = 1)
    minHoldFrames: 2,    // a closed gap shorter than this between two voiced frames is bridged
};

/** In-place radix-2 FFT of real input (length power of 2) -> magnitude array of length n/2. */
function fftMagnitudes(input) {
    const n = input.length;
    const re = Float64Array.from(input), im = new Float64Array(n);
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let cr = 1, ci = 0;
            for (let k = 0; k < len / 2; k++) {
                const a = i + k, b = i + k + len / 2;
                const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
                re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
                const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
            }
        }
    }
    const out = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) out[i] = Math.hypot(re[i], im[i]);
    return out;
}

const nextPow2 = n => { let p = 1; while (p < n) p <<= 1; return p; };
const snap = (v, levels) => levels.reduce((best, l) => (Math.abs(l - v) < Math.abs(best - v) ? l : best), levels[0]);

/** RMS and spectral centroid (Hz) of one analysis window. */
function frameFeatures(samples, start, len, sampleRate) {
    const n = nextPow2(len);
    const win = new Float64Array(n);
    let sum = 0;
    for (let i = 0; i < len; i++) {
        const s = samples[start + i] ?? 0;
        win[i] = s * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, len - 1)));   // Hann
        sum += s * s;
    }
    const rms = Math.sqrt(sum / len);
    const mag = fftMagnitudes(win);
    let num = 0, den = 0;
    for (let k = 1; k < mag.length; k++) { const f = (k * sampleRate) / n; if (f > 80 && f < 5000) { num += f * mag[k]; den += mag[k]; } }
    return { rms, centroid: den > 1e-9 ? num / den : 0 };
}

/**
 * @param {ArrayLike<number>} samples mono PCM in -1..1
 * @param {number} sampleRate
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {{open:number, wide:number, closed:number}[]} one entry per frame
 */
function analyze(samples, sampleRate, options = {}) {
    const o = { ...DEFAULTS, ...options };
    const hop = sampleRate / o.fps;
    const frames = Math.max(1, Math.ceil(samples.length / hop));
    const winLen = Math.min(Math.round(sampleRate * 0.03), Math.round(hop * 1.5));   // ~30 ms centred on the frame
    const feats = [];
    let peak = 1e-9;
    for (let f = 0; f < frames; f++) {
        const centre = Math.round(f * hop + hop / 2);
        const ft = frameFeatures(samples, Math.max(0, centre - (winLen >> 1)), winLen, sampleRate);
        feats.push(ft);
        if (ft.rms > peak) peak = ft.rms;
    }
    const peakDb = 20 * Math.log10(peak);
    let out = feats.map(ft => {
        const db = 20 * Math.log10(Math.max(ft.rms, 1e-9));
        const rel = (db - (peakDb + o.floorDb)) / -o.floorDb;                     // 0 at the floor, 1 at the peak
        if (rel <= 0 || ft.rms < o.absFloor) return { open: 0, wide: 1, closed: 1 };
        const open = snap(Math.min(1, rel), OPEN_LEVELS);
        const wideIdx = o.centroidHz.findIndex(edge => ft.centroid < edge);
        const wide = WIDE_LEVELS[wideIdx === -1 ? WIDE_LEVELS.length - 1 : wideIdx];
        return { open, wide, closed: open === 0 ? 1 : 0 };
    });
    out = bridgeGaps(out, o.minHoldFrames);
    return out;
}

/** A closed run shorter than `minHold` frames with voiced frames on both sides becomes a small opening (no fluttering). */
function bridgeGaps(frames, minHold) {
    const out = frames.map(f => ({ ...f }));
    let i = 0;
    while (i < out.length) {
        if (!out[i].closed) { i++; continue; }
        let j = i;
        while (j < out.length && out[j].closed) j++;
        if (i > 0 && j < out.length && j - i < minHold) for (let k = i; k < j; k++) out[k] = { open: OPEN_LEVELS[1], wide: out[i - 1].wide, closed: 0 };
        i = j;
    }
    return out;
}

const key = t => String(+t.toFixed(4));
const setters = f => [`${V.open}=${f.open};`, `${V.wide}=${f.wide};`, `${V.closed}=${f.closed};`];

/** Bedrock timeline animation for a clip: entries only where the mouth state changes; the last frame closes the mouth. */
function trackAnimation(frames, { fps = DEFAULTS.fps, expression } = {}) {
    const timeline = {};
    let prev = null;
    frames.forEach((f, i) => {
        if (prev && prev.open === f.open && prev.wide === f.wide && prev.closed === f.closed) return;
        const lines = setters(f);
        if (i === 0 && expression !== undefined) lines.unshift(`v.oc_expression=${expression};`);
        timeline[key(i / fps)] = lines;
        prev = f;
    });
    const end = frames.length / fps;
    timeline[key(end)] = setters({ open: 0, wide: 1, closed: 1 });
    return { animation_length: +(end + 1 / fps).toFixed(4), loop: "hold_on_last_frame", timeline };
}

module.exports = { DEFAULTS, fftMagnitudes, frameFeatures, analyze, bridgeGaps, trackAnimation };
