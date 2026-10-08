// Pure math for the RTS fast HUD (see rtsHud.js): screen fractions -> GUI pixels.

export const DEFAULT_HUD_SCREEN = Object.freeze({ w: 640, h: 360 });
export const CURSOR_SIZE = 16;

/** Pure: the HUD values for a given RTS info + screen size. */
export function hudValues(info, screen) {
    if (!info?.screen) return { visible: false, cx: 0, cy: 0, bx: 0, by: 0, bw: 0, bh: 0 };   // before the first tick there is no cursor yet
    const cx = info.screen.u * screen.w - CURSOR_SIZE / 2;
    const cy = info.screen.v * screen.h - CURSOR_SIZE / 2;
    const r = info.rect;
    return {
        visible: true,
        cx, cy,
        bx: r ? r.u0 * screen.w : 0, by: r ? r.v0 * screen.h : 0,
        bw: r ? Math.max(1, (r.u1 - r.u0) * screen.w) : 0,
        bh: r ? Math.max(1, (r.v1 - r.v0) * screen.h) : 0,
        selected: info.selected,
    };
}

