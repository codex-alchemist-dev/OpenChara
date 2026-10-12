// Lip-sync tool: audio clips -> Bedrock timeline animations that drive the face kit's mouth.
//
//   node tools/lipsync.js <audio file | folder> [...more] --out lip.animation.json [--fps 24] [--prefix animation.oc.lip.] [--expression 3]
//
// Any format ffmpeg reads works (set FFMPEG=path if it is not on PATH). One animation per clip, named <prefix><file name without
// extension, lowercased, non-alphanumerics -> _>. The server plays the one for the voice line with entity.playAnimation(<id>)
// while the sound plays. Analysis lives in src/anim/lipsync.js (pure, tested); this file is only IO.
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { analyze, trackAnimation, DEFAULTS } = require("../src/anim/lipsync.js");

const SAMPLE_RATE = 16000;
const AUDIO = /\.(wav|mp3|ogg|oga|opus|flac|m4a|aac|wma|webm)$/i;

function decode(file) {
    const ffmpeg = process.env.FFMPEG || "ffmpeg";
    const r = spawnSync(ffmpeg, ["-v", "error", "-i", file, "-f", "f32le", "-ac", "1", "-ar", String(SAMPLE_RATE), "-"], { maxBuffer: 1 << 30 });
    if (r.error) throw new Error(`cannot run ${ffmpeg}: ${r.error.message} (install ffmpeg or set FFMPEG)`);
    if (r.status !== 0) throw new Error(`ffmpeg failed on ${file}: ${String(r.stderr).trim()}`);
    const buf = r.stdout;
    return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}

function collect(inputs) {
    const files = [];
    for (const i of inputs) {
        const st = fs.statSync(i);
        if (st.isDirectory()) for (const f of fs.readdirSync(i).sort()) { if (AUDIO.test(f)) files.push(path.join(i, f)); }
        else files.push(i);
    }
    return files;
}

const clipId = file => path.basename(file, path.extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function parseArgs(argv) {
    const o = { inputs: [], out: "lip.animation.json", fps: DEFAULTS.fps, prefix: "animation.oc.lip.", expression: undefined };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--out") o.out = argv[++i];
        else if (a === "--fps") o.fps = Number(argv[++i]);
        else if (a === "--prefix") o.prefix = argv[++i];
        else if (a === "--expression") o.expression = Number(argv[++i]);
        else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
        else o.inputs.push(a);
    }
    if (!o.inputs.length) throw new Error("usage: node tools/lipsync.js <audio file | folder> [...] --out lip.animation.json [--fps 24] [--prefix animation.oc.lip.] [--expression N]");
    return o;
}

function main() {
    const o = parseArgs(process.argv.slice(2));
    const animations = {};
    for (const file of collect(o.inputs)) {
        const frames = analyze(decode(file), SAMPLE_RATE, { fps: o.fps });
        const id = o.prefix + clipId(file);
        animations[id] = trackAnimation(frames, { fps: o.fps, expression: o.expression });
        const speaking = frames.filter(f => !f.closed).length;
        console.log(`${id}: ${(frames.length / o.fps).toFixed(2)} s, ${Object.keys(animations[id].timeline).length} keys, mouth moving ${Math.round((100 * speaking) / frames.length)}%`);
    }
    fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true });
    fs.writeFileSync(o.out, JSON.stringify({ format_version: "1.8.0", animations }, null, 2) + "\n");
    console.log(`wrote ${o.out}`);
}

if (require.main === module) {
    try { main(); } catch (e) { console.error(e.message); process.exit(1); }
}
module.exports = { decode, collect, clipId };
