// Screen-space cursor math for camera modes, pure functions with no game imports.
//
// The player's body stays put and their head still turns freely. Where they look is mapped to a point on the
// screen (u, v in 0..1, origin top-left): pitch -90..90 maps linearly onto the screen height, yaw (relative to the
// yaw they had on entry) maps onto the screen width and WRAPS - turning past one screen width continues from the
// other side. A fixed camera then turns that screen point into a world ray (screenToRay) and projects world
// points back to the screen (worldToScreen) for selection boxes and markers.
//
// Bedrock scripts can't read the client's FOV or aspect ratio, so both are config (`fovV`, `aspect`); the camera
// FOV is set explicitly where the API allows and `calibration` nudges the rest.

export const DEFAULT_CURSOR_CONFIG = Object.freeze({
    degreesPerScreen: 180, // yaw turn that moves the cursor across the full screen width
    fovV: 70,              // vertical field of view of the camera, degrees
    aspect: 16 / 9,        // width / height of the game view
});

const RAD = Math.PI / 180;
const wrap01 = x => ((x % 1) + 1) % 1;
const clamp01 = x => Math.max(0, Math.min(1, x));

/**
 * @param {{x:number,y:number}} rot - player rotation: x = pitch (+ looks down), y = yaw degrees
 * @param {number} yaw0 - the player's yaw when the mode was entered (the cursor starts horizontally centered at turn 0)
 * @returns {{u:number, v:number}}
 */
export function lookToScreen(rot, yaw0, cfg = DEFAULT_CURSOR_CONFIG) {
    // The game reports yaw in -180..180; take the shortest signed turn so the +-180 seam never jumps the cursor
    // (pick a degreesPerScreen that divides 360 - 180, 120, 90 - so the seam is also invisible after wrapping).
    const turn = ((((rot.y - yaw0) % 360) + 540) % 360) - 180;
    return {
        u: wrap01(0.5 + turn / cfg.degreesPerScreen),
        v: clamp01((rot.x + 90) / 180),
    };
}

/** Camera basis for a pose (pitch + looks down, yaw as Minecraft: yaw 0 faces +z). */
export function cameraBasis(pose) {
    const p = pose.pitch * RAD, y = pose.yaw * RAD;
    const forward = { x: -Math.sin(y) * Math.cos(p), y: -Math.sin(p), z: Math.cos(y) * Math.cos(p) };
    const right = { x: -Math.cos(y), y: 0, z: -Math.sin(y) };
    const up = {
        x: right.y * forward.z - right.z * forward.y,
        y: right.z * forward.x - right.x * forward.z,
        z: right.x * forward.y - right.y * forward.x,
    };
    return { forward, right, up };
}

const norm = v => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };

/** World-space ray direction (unit) through screen point (u, v) for a camera with the given pose. */
export function screenToRay(u, v, pose, cfg = DEFAULT_CURSOR_CONFIG) {
    const { forward, right, up } = cameraBasis(pose);
    const t = Math.tan(cfg.fovV * RAD / 2);
    const nx = (u - 0.5) * 2 * t * cfg.aspect;
    const ny = (0.5 - v) * 2 * t;
    return norm({
        x: forward.x + right.x * nx + up.x * ny,
        y: forward.y + right.y * nx + up.y * ny,
        z: forward.z + right.z * nx + up.z * ny,
    });
}

/**
 * Projects a world point to screen coordinates. Returns null for points behind the camera.
 * `inside` is true when the point is on screen.
 */
export function worldToScreen(point, camPos, pose, cfg = DEFAULT_CURSOR_CONFIG) {
    const { forward, right, up } = cameraBasis(pose);
    const d = { x: point.x - camPos.x, y: point.y - camPos.y, z: point.z - camPos.z };
    const depth = d.x * forward.x + d.y * forward.y + d.z * forward.z;
    if (depth <= 0.01) return null;
    const t = Math.tan(cfg.fovV * RAD / 2);
    const nx = (d.x * right.x + d.y * right.y + d.z * right.z) / depth / (t * cfg.aspect);
    const ny = (d.x * up.x + d.y * up.y + d.z * up.z) / depth / t;
    const u = 0.5 + nx / 2, v = 0.5 - ny / 2;
    return { u, v, depth, inside: u >= 0 && u <= 1 && v >= 0 && v <= 1 };
}

/** Normalized rectangle (u0 <= u1, v0 <= v1) from two screen corners. */
export function rectFromCorners(a, b) {
    return { u0: Math.min(a.u, b.u), v0: Math.min(a.v, b.v), u1: Math.max(a.u, b.u), v1: Math.max(a.v, b.v) };
}

export function rectContains(rect, p) {
    return p.u >= rect.u0 && p.u <= rect.u1 && p.v >= rect.v0 && p.v <= rect.v1;
}

/** Whole-pixel packing for HUD transport: a 0..1 value as an integer 0..max. */
export function toPixels(x, max) { return Math.max(0, Math.min(max, Math.round(x * max))); }
