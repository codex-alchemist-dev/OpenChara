// Plain-Node tests for the pure camera modules. Run: node test/camera.test.mjs
import assert from "node:assert";
import { lookToScreen, screenToRay, worldToScreen, cameraBasis, rectFromCorners, rectContains, toPixels, DEFAULT_CURSOR_CONFIG as CFG } from "../engine/scripts/openchara/ui/camera/screenCursor.js";
import { panRts, freeFly, readInputs } from "../engine/scripts/openchara/ui/camera/cameraRig.js";
import { hudValues, DEFAULT_HUD_SCREEN, CURSOR_SIZE } from "../engine/scripts/openchara/ui/camera/rtsHudMath.js";
import { createSelection, useSelect, boxQuery, toggleCharacter, pendingRect, resolveMembers, prune, clearSelection, isEmpty } from "../engine/scripts/openchara/ui/camera/rtsSelection.js";

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test("lookToScreen: starts centered horizontally, pitch maps linearly, yaw wraps", () => {
    near(lookToScreen({ x: 0, y: 40 }, 40).u, 0.5);
    near(lookToScreen({ x: 0, y: 40 }, 40).v, 0.5);
    near(lookToScreen({ x: -90, y: 0 }, 0).v, 0);
    near(lookToScreen({ x: 90, y: 0 }, 0).v, 1);
    near(lookToScreen({ x: 0, y: 90 }, 0).u, 0); // +90 deg = half a screen of 180 -> wraps to the left edge
    near(lookToScreen({ x: 0, y: 0 }, 90).u, 0);
    near(lookToScreen({ x: 0, y: 100 }, 0).u, 0.0555555556);
    near(lookToScreen({ x: 0, y: -100 }, 0).u, 0.9444444444);
});

test("lookToScreen: yaw -180..180 wrap-around of the game's rotation does not jump the cursor", () => {
    const a = lookToScreen({ x: 0, y: -179 }, 170), b = lookToScreen({ x: 0, y: 181 }, 170);
    near(a.u, b.u);
    near(lookToScreen({ x: 0, y: 179 }, 179).u, 0.5);
    near(lookToScreen({ x: 0, y: -179 }, 179).u, 0.5 + 2 / 180); // two degrees right across the seam
});

test("cameraBasis: yaw 0 pitch 0 faces +z with +x on the left, y up", () => {
    const b = cameraBasis({ pitch: 0, yaw: 0 });
    near(b.forward.z, 1); near(b.right.x, -1); near(b.up.y, 1);
    const down = cameraBasis({ pitch: 90, yaw: 0 });
    near(down.forward.y, -1);
});

test("screenToRay: the screen center is the forward vector; right edge tilts toward the camera right", () => {
    const pose = { pitch: 55, yaw: 0 };
    const c = screenToRay(0.5, 0.5, pose);
    const f = cameraBasis(pose).forward;
    near(c.x, f.x); near(c.y, f.y); near(c.z, f.z);
    const r = screenToRay(1, 0.5, { pitch: 0, yaw: 0 });
    assert.ok(r.x < 0, "camera right is -x at yaw 0");
    const top = screenToRay(0.5, 0, { pitch: 0, yaw: 0 });
    assert.ok(top.y > 0);
});

test("worldToScreen is the inverse of screenToRay (round trip) and rejects points behind the camera", () => {
    const cam = { x: 10, y: 80, z: -4 }, pose = { pitch: 55, yaw: 20 };
    for (const [u, v] of [[0.5, 0.5], [0.1, 0.9], [0.9, 0.2], [0.33, 0.66]]) {
        const ray = screenToRay(u, v, pose);
        const p = { x: cam.x + ray.x * 37, y: cam.y + ray.y * 37, z: cam.z + ray.z * 37 };
        const s = worldToScreen(p, cam, pose);
        near(s.u, u, 1e-9); near(s.v, v, 1e-9);
    }
    assert.strictEqual(worldToScreen({ x: 10, y: 80, z: -50 }, cam, { pitch: 0, yaw: 0 }), null);
});

test("worldToScreen: a point straight ahead is centered; off-screen points report inside=false", () => {
    const cam = { x: 0, y: 0, z: 0 }, pose = { pitch: 0, yaw: 0 };
    const mid = worldToScreen({ x: 0, y: 0, z: 10 }, cam, pose);
    near(mid.u, 0.5); near(mid.v, 0.5); assert.ok(mid.inside);
    assert.ok(!worldToScreen({ x: -100, y: 0, z: 10 }, cam, pose).inside);
});

test("rect helpers", () => {
    const r = rectFromCorners({ u: 0.8, v: 0.2 }, { u: 0.3, v: 0.6 });
    assert.deepStrictEqual(r, { u0: 0.3, v0: 0.2, u1: 0.8, v1: 0.6 });
    assert.ok(rectContains(r, { u: 0.5, v: 0.4 }) && !rectContains(r, { u: 0.9, v: 0.4 }));
    assert.strictEqual(toPixels(0.5, 427), 214); assert.strictEqual(toPixels(2, 100), 100); assert.strictEqual(toPixels(-1, 100), 0);
});

test("panRts: pans in world axes, raises/lowers, clamps to ground band", () => {
    const cam = { x: 0, y: 30, z: 0 };
    panRts(cam, { x: 1, y: -1 }, { up: false, down: false }, { groundY: 10 });
    assert.ok(cam.x > 0 && cam.z < 0);
    for (let i = 0; i < 200; i++) panRts(cam, { x: 0, y: 0 }, { up: true, down: false }, { groundY: 10 });
    near(cam.y, 70);
    for (let i = 0; i < 500; i++) panRts(cam, { x: 0, y: 0 }, { up: false, down: true }, { groundY: 10 });
    near(cam.y, 16);
});

test("freeFly: forward follows facing, strafe is perpendicular, vertical is independent of pitch", () => {
    const cam = { x: 0, y: 0, z: 0 };
    freeFly(cam, { x: 40, y: 0 }, { x: 0, y: 1 }, { up: false, down: false }, { speed: 1 });
    near(cam.z, 1); near(cam.x, 0); near(cam.y, 0); // looking down 40 deg still moves along the ground plane
    const c2 = { x: 0, y: 0, z: 0 };
    freeFly(c2, { x: 0, y: 90 }, { x: 0, y: 1 }, { up: false, down: false }, { speed: 1 });
    near(c2.x, -1); near(c2.z, 0, 1e-9); // yaw 90 faces -x
    const c3 = { x: 0, y: 0, z: 0 };
    freeFly(c3, { x: 0, y: 0 }, { x: 1, y: 0 }, { up: true, down: false }, { speed: 1, verticalSpeed: 2 });
    near(c3.x, -1); near(c3.y, 2);
});

test("readInputs tolerates a missing API", () => {
    assert.deepStrictEqual(readInputs({}), { mv: { x: 0, y: 0 }, vertical: { up: false, down: false } });
    const r = readInputs({ inputInfo: { getMovementVector: () => ({ x: 1, y: 0 }), getButtonState: b => (b === "Jump" ? "Pressed" : "Released") } });
    assert.deepStrictEqual(r.vertical, { up: true, down: false });
});

const waifus = [
    { characterId: "a", squadId: "s1", u: 0.2, v: 0.2 },
    { characterId: "b", squadId: "s1", u: 0.3, v: 0.25 },
    { characterId: "c", squadId: "s2", u: 0.25, v: 0.3 },
    { characterId: "d", squadId: "s2", u: 0.9, v: 0.9 },
    { characterId: "e", squadId: null, u: 0.28, v: 0.22 },
];

test("boxQuery: finds waifus inside, touched squads and squads fully inside", () => {
    const q = boxQuery({ u0: 0.1, v0: 0.1, u1: 0.4, v1: 0.4 }, waifus);
    assert.deepStrictEqual(q.charIds.sort(), ["a", "b", "c", "e"]);
    assert.deepStrictEqual(q.squadsTouched.sort(), ["s1", "s2"]);
    assert.deepStrictEqual(q.squadsFullyInside, ["s1"]);
});

test("useSelect: first use drops corner A, second commits a box additively", () => {
    const sel = createSelection();
    assert.deepStrictEqual(useSelect(sel, { u: 0.4, v: 0.4 }, waifus), { kind: "corner" });
    assert.deepStrictEqual(pendingRect(sel, { u: 0.1, v: 0.1 }), { u0: 0.1, v0: 0.1, u1: 0.4, v1: 0.4 });
    const r = useSelect(sel, { u: 0.1, v: 0.1 }, waifus);
    assert.strictEqual(r.kind, "box");
    assert.deepStrictEqual([...sel.charIds].sort(), ["a", "b", "c", "e"]);
    assert.deepStrictEqual([...sel.squadIds], ["s1"]);
    assert.strictEqual(sel.cornerA, null);
    // a second box adds, never replaces
    useSelect(sel, { u: 0.8, v: 0.8 }, waifus); useSelect(sel, { u: 1, v: 1 }, waifus);
    assert.ok(sel.charIds.has("d") && sel.charIds.has("a"));
});

test("useSelect non-additive replaces; toggle, clear, resolveMembers, prune", () => {
    const sel = createSelection();
    useSelect(sel, { u: 0, v: 0 }, waifus); useSelect(sel, { u: 0.4, v: 0.4 }, waifus);
    useSelect(sel, { u: 0.8, v: 0.8 }, waifus, { additive: false }); useSelect(sel, { u: 1, v: 1 }, waifus, { additive: false });
    assert.deepStrictEqual([...sel.charIds], ["d"]);
    assert.strictEqual(toggleCharacter(sel, "x"), true);
    assert.strictEqual(toggleCharacter(sel, "x"), false);
    sel.squadIds.add("s1");
    const members = resolveMembers(sel, q => (q === "s1" ? ["a", "b", "d"] : []));
    assert.deepStrictEqual(members.sort(), ["a", "b", "d"]);
    prune(sel, { hasCharacter: id => id !== "d", hasSquad: () => true });
    assert.ok(!sel.charIds.has("d"));
    clearSelection(sel);
    assert.ok(isEmpty(sel) && sel.cornerA === null);
});

test("hudValues: cursor centered on the screen point, box from the pending rect, hidden box is zero", () => {
    const v = hudValues({ screen: { u: 0.5, v: 0.5 }, rect: null, selected: 3 }, DEFAULT_HUD_SCREEN);
    near(v.cx, 320 - CURSOR_SIZE / 2); near(v.cy, 180 - CURSOR_SIZE / 2);
    assert.deepStrictEqual([v.bw, v.bh], [0, 0]);
    const w = hudValues({ screen: { u: 0, v: 0 }, rect: { u0: 0.25, v0: 0.5, u1: 0.5, v1: 1 }, selected: 0 }, { w: 400, h: 200 });
    assert.deepStrictEqual([w.bx, w.by, w.bw, w.bh], [100, 100, 100, 100]);
});

console.log(`\n${passed} passed${process.exitCode ? ", with failures" : ""}`);
