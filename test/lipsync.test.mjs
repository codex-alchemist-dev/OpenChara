// Tests for the lip-sync analysis and tool (src/anim/lipsync.js, tools/lipsync.js). Run: node test/lipsync.test.mjs
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ls = require("../src/anim/lipsync.js");
const fa = require("../src/anim/faceAnimations.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); } catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

const SR = 16000;
const sine = (hz, secs, amp = 0.5) => Float32Array.from({ length: Math.round(SR * secs) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));
const silence = secs => new Float32Array(Math.round(SR * secs));
const concat = (...parts) => { const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

test("fft finds the frequency of a sine", () => {
    const n = 512, hz = 1000;
    const mag = ls.fftMagnitudes(Float64Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * hz * i) / SR)));
    const peak = mag.indexOf(Math.max(...mag));
    assert.ok(Math.abs((peak * SR) / n - hz) <= SR / n, `peak at ${(peak * SR) / n} Hz`);
});

test("silence keeps the mouth closed in every frame", () => {
    const f = ls.analyze(silence(1), SR);
    assert.strictEqual(f.length, 24);
    assert.ok(f.every(x => x.closed === 1 && x.open === 0));
});

test("a steady voiced tone opens the mouth; a low tone is narrow and a high tone is wide", () => {
    const low = ls.analyze(sine(300, 1), SR), high = ls.analyze(sine(2800, 1), SR);
    assert.ok(low.slice(2, 22).every(x => x.closed === 0 && x.open >= 0.75), "loud steady tone is open");
    assert.ok(low.slice(2, 22).every(x => x.wide <= 0.5), "300 Hz is a narrow mouth");
    assert.ok(high.slice(2, 22).every(x => x.wide === 1), "2800 Hz is a wide mouth");
});

test("openness follows loudness relative to the clip's own peak", () => {
    const f = ls.analyze(concat(sine(400, 0.5, 0.05), sine(400, 0.5, 0.8)), SR);
    const quiet = f.slice(2, 10).reduce((a, x) => a + x.open, 0) / 8, loud = f.slice(14, 22).reduce((a, x) => a + x.open, 0) / 8;
    assert.ok(loud > quiet, `quiet ${quiet} loud ${loud}`);
});

test("every value is one of the face kit's levels", () => {
    const f = ls.analyze(concat(sine(300, 0.4, 0.2), silence(0.2), sine(2200, 0.4, 0.7)), SR);
    for (const x of f) {
        assert.ok(fa.OPEN_LEVELS.includes(x.open) && fa.WIDE_LEVELS.includes(x.wide) && (x.closed === 0 || x.closed === 1));
        assert.strictEqual(x.closed, x.open === 0 ? 1 : 0);
    }
});

test("a one-frame gap between voiced frames is bridged, a long gap stays closed", () => {
    const o = { open: 1, wide: 1, closed: 0 }, c = { open: 0, wide: 1, closed: 1 };
    const short = ls.bridgeGaps([o, o, c, o, o], 2);
    assert.strictEqual(short[2].closed, 0);
    const long = ls.bridgeGaps([o, c, c, c, o], 2);
    assert.ok(long.slice(1, 4).every(x => x.closed === 1));
    assert.strictEqual(ls.bridgeGaps([c, c, o], 2)[0].closed, 1, "leading silence is kept");
});

test("trackAnimation emits only changes, closes the mouth at the end and uses the face kit variables", () => {
    const o = { open: 1, wide: 1, closed: 0 }, c = { open: 0, wide: 1, closed: 1 };
    const anim = ls.trackAnimation([c, o, o, o, c], { fps: 24, expression: 2 });
    const keys = Object.keys(anim.timeline).map(Number);
    assert.deepStrictEqual(keys, [...keys].sort((a, b) => a - b), "keys increase");
    assert.strictEqual(Object.keys(anim.timeline).length, 4, "frames 0, 1, 4 and the final close");
    assert.deepStrictEqual(anim.timeline["0"], ["v.oc_expression=2;", "v.oc_open=0;", "v.oc_wide=1;", "v.oc_closed=1;"]);
    assert.ok(anim.timeline["0.0417"].includes("v.oc_open=1;"));
    const last = anim.timeline[keys[keys.length - 1]];
    assert.deepStrictEqual(last, ["v.oc_open=0;", "v.oc_wide=1;", "v.oc_closed=1;"]);
    assert.strictEqual(anim.loop, "hold_on_last_frame");
    assert.ok(anim.animation_length > keys[keys.length - 1]);
    assert.ok(Object.values(anim.timeline).flat().every(l => [fa.V.open, fa.V.wide, fa.V.closed, "v.oc_expression"].some(v => l.startsWith(v + "="))));
});

test("the tool decodes real audio through ffmpeg and writes an animation file (skipped without ffmpeg)", () => {
    const ffmpeg = process.env.FFMPEG || "ffmpeg";
    if (spawnSync(ffmpeg, ["-version"]).error) { console.log("  (ffmpeg not found: skipped)"); return; }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lipsync-"));
    const wav = path.join(dir, "Hello World!.wav");
    const gen = spawnSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.5", "-af", "apad=whole_dur=0.9", "-ar", "16000", "-ac", "1", wav]);
    assert.strictEqual(gen.status, 0, String(gen.stderr));
    const out = path.join(dir, "lip.json");
    const run = spawnSync(process.execPath, [path.join(import.meta.dirname, "../tools/lipsync.js"), dir, "--out", out]);
    assert.strictEqual(run.status, 0, String(run.stderr));
    const j = JSON.parse(fs.readFileSync(out, "utf8"));
    assert.deepStrictEqual(Object.keys(j.animations), ["animation.oc.lip.hello_world"]);
    const tl = j.animations["animation.oc.lip.hello_world"].timeline;
    assert.ok(Object.values(tl)[0].includes("v.oc_closed=0;") || Object.keys(tl).length > 2, "the tone opens the mouth");
    fs.rmSync(dir, { recursive: true, force: true });
});

console.log(`\n${passed} passed`);
