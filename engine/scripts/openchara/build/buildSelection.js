// Build-mode selection shapes (pure). A selection is a Set of "x,y,z" cell keys (same keys as schematicModel).
//
//   rectCells(a, b)                   every cell in the axis-aligned box between two corners (inclusive)
//   circleCells(center, radius, axis) a filled disc in the plane perpendicular to `axis` ("y" = horizontal floor)
//   sphereCells(center, radius)       a filled sphere
//   extendSelection(cells, dir, n)    extrude the selection n cells along a unit axis direction (+/-)
//   dominantAxis(vec)                 the grid direction closest to a view vector (for "extend where I'm looking")
//
// All shapes are capped (MAX_SELECTION) so a stray radius can never freeze the server.

import { keyOf, parseKey } from "./schematicModel.js";

export const MAX_SELECTION = 40000;

const cap = n => { if (n > MAX_SELECTION) throw new Error(`selection too large (${n} cells, max ${MAX_SELECTION})`); };

export function rectCells(a, b) {
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    const z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
    cap((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1));
    const out = new Set();
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) out.add(keyOf(x, y, z));
    return out;
}

export function circleCells(center, radius, axis = "y") {
    const r = Math.max(0, Math.floor(radius));
    cap((2 * r + 1) ** 2);
    const out = new Set();
    for (let i = -r; i <= r; i++) {
        for (let j = -r; j <= r; j++) {
            if (i * i + j * j > r * r + r * 0.8) continue; // slightly generous so small circles look round
            const p = axis === "y" ? [center.x + i, center.y, center.z + j]
                : axis === "x" ? [center.x, center.y + i, center.z + j]
                    : [center.x + i, center.y + j, center.z];
            out.add(keyOf(p[0], p[1], p[2]));
        }
    }
    return out;
}

export function sphereCells(center, radius) {
    const r = Math.max(0, Math.floor(radius));
    cap((2 * r + 1) ** 3);
    const out = new Set();
    for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) for (let z = -r; z <= r; z++) {
        if (x * x + y * y + z * z <= r * r + r * 0.8) out.add(keyOf(center.x + x, center.y + y, center.z + z));
    }
    return out;
}

/** Extrudes (n > 0) or trims (n < 0) the selection along a grid direction {x,y,z} with exactly one non-zero component of +-1. */
export function extendSelection(cells, dir, n) {
    const out = new Set(cells);
    if (n === 0 || cells.size === 0) return out;
    if (n > 0) {
        for (const k of cells) {
            const { x, y, z } = parseKey(k);
            for (let i = 1; i <= n; i++) out.add(keyOf(x + dir.x * i, y + dir.y * i, z + dir.z * i));
        }
        cap(out.size);
        return out;
    }
    // Trim: drop the |n| outermost layers on the +dir side.
    const axis = dir.x ? "x" : dir.y ? "y" : "z";
    const sign = dir[axis];
    const extent = Math.max(...[...cells].map(k => parseKey(k)[axis] * sign));
    const keep = new Set();
    for (const k of cells) if (parseKey(k)[axis] * sign <= extent + n) keep.add(k);
    return keep;
}

export function dominantAxis(v) {
    const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
    if (ax >= ay && ax >= az) return { x: Math.sign(v.x) || 1, y: 0, z: 0 };
    if (ay >= az) return { x: 0, y: Math.sign(v.y) || 1, z: 0 };
    return { x: 0, y: 0, z: Math.sign(v.z) || 1 };
}

export const cellFromBlock = loc => ({ x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) });
