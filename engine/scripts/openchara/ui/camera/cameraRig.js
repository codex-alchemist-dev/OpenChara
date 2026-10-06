// Camera pose math for camera modes, pure functions with no game imports.
//
//   panRts   - top-down RTS camera: WASD pans in world axes (speed grows with height), Jump/Sneak raise/lower,
//              height clamped to the ground below.
//   freeFly  - Build-mode camera: rotation is the player's own facing; WASD moves relative to where that facing
//              points on the ground plane, Jump/Sneak fly up/down (the AC rtsSpike flight, proven in-game).

const RAD = Math.PI / 180;

/**
 * @param {{x:number,y:number,z:number}} cam - mutated in place
 * @param {{x:number,y:number}} mv - inputInfo.getMovementVector(): x strafe right, y forward
 * @param {{up:boolean, down:boolean}} vertical
 * @param {{groundY?:number}} [opts]
 */
export function panRts(cam, mv, vertical, { groundY } = {}) {
    const speed = 0.35 + (cam.y - (groundY ?? cam.y - 20)) * 0.03;
    cam.x += mv.x * speed;
    cam.z += mv.y * speed;
    if (vertical.up) cam.y += 0.6;
    if (vertical.down) cam.y -= 0.6;
    if (groundY !== undefined) cam.y = Math.max(groundY + 6, Math.min(groundY + 60, cam.y));
    return cam;
}

export const FREE_FLY = Object.freeze({ speed: 1.2, vertical: 0.8 });

/**
 * @param {{x:number,y:number,z:number}} cam - mutated in place
 * @param {{x:number,y:number}} rot - the player's rotation (x pitch, y yaw degrees); also the camera rotation
 * @param {{x:number,y:number}} mv - strafe right (x), forward (y), each -1..1
 * @param {{up:boolean, down:boolean}} vertical
 */
export function freeFly(cam, rot, mv, vertical, { speed = FREE_FLY.speed, verticalSpeed = FREE_FLY.vertical } = {}) {
    const yaw = rot.y * RAD;
    const fwd = { x: -Math.sin(yaw), z: Math.cos(yaw) };
    const right = { x: -Math.cos(yaw), z: -Math.sin(yaw) };
    cam.x += (fwd.x * mv.y + right.x * mv.x) * speed;
    cam.z += (fwd.z * mv.y + right.z * mv.x) * speed;
    if (vertical.up) cam.y += verticalSpeed;
    if (vertical.down) cam.y -= verticalSpeed;
    return cam;
}

/** Reads the three movement inputs from a player in a way that tolerates older APIs. */
export function readInputs(player) {
    let mv = { x: 0, y: 0 };
    try { mv = player.inputInfo.getMovementVector(); } catch (e) { /* older API */ }
    const vertical = { up: false, down: false };
    try {
        vertical.up = String(player.inputInfo.getButtonState("Jump")) === "Pressed";
        vertical.down = String(player.inputInfo.getButtonState("Sneak")) === "Pressed";
    } catch (e) { /* older API */ }
    return { mv, vertical };
}
