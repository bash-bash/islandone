import type { CollisionWorld } from "./collision";

// Path finding around the camp: the collision world rasterised into a walk grid (obstacles grown
// by the character radius, deep water and steps too high blocked), A* over it with 8 neighbours,
// then the path pulled tight so the figure walks straight lines between corners instead of
// zig-zagging along cells. The world is static, so the grid is built once per collision world.

export interface WalkRules {
  radius: number;
  maxStep: number;
  deepestWade: number;
  /** Ground height the figure stands on (terrain or deck). */
  ground(x: number, z: number): number;
}

export interface Point {
  x: number;
  z: number;
}

const CELL = 0.2; // m
const HALF_EXTENT = 20; // m around the origin: the ~30 m test beach and its exit points
const CLEARANCE = 0.06; // m kept free beyond the character radius so it doesn't scrape along walls
const SEARCH_LIMIT = 60_000; // expanded cells before giving up

export interface WalkGrid {
  cols: number;
  rows: number;
  x0: number;
  z0: number;
  blocked: Uint8Array;
  height: Float32Array;
  maxStep: number;
}

export function buildWalkGrid(world: CollisionWorld, rules: WalkRules): WalkGrid {
  const cols = Math.round((2 * HALF_EXTENT) / CELL);
  const rows = cols;
  const x0 = -HALF_EXTENT;
  const z0 = -HALF_EXTENT;
  const blocked = new Uint8Array(cols * rows);
  const height = new Float32Array(cols * rows);
  const cx = (i: number) => x0 + (i + 0.5) * CELL;
  const cz = (j: number) => z0 + (j + 0.5) * CELL;

  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const y = rules.ground(cx(i), cz(j));
      height[j * cols + i] = y;
      if (y <= rules.deepestWade) blocked[j * cols + i] = 1;
    }

  const grow = rules.radius + CLEARANCE;
  // Only visit the cells under each obstacle's grown bounds.
  const mark = (minX: number, minZ: number, maxX: number, maxZ: number, hit: (x: number, z: number) => boolean) => {
    const i0 = Math.max(0, Math.floor((minX - grow - x0) / CELL));
    const i1 = Math.min(cols - 1, Math.floor((maxX + grow - x0) / CELL));
    const j0 = Math.max(0, Math.floor((minZ - grow - z0) / CELL));
    const j1 = Math.min(rows - 1, Math.floor((maxZ + grow - z0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (hit(cx(i), cz(j))) blocked[j * cols + i] = 1;
  };
  for (const c of world.circles) {
    const r = c.r + grow;
    mark(c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r, (x, z) => (x - c.x) ** 2 + (z - c.z) ** 2 < r * r);
  }
  for (const b of world.boxes) {
    mark(b.x0, b.z0, b.x1, b.z1, (x, z) => {
      const dx = x - Math.max(b.x0, Math.min(x, b.x1));
      const dz = z - Math.max(b.z0, Math.min(z, b.z1));
      return dx * dx + dz * dz < grow * grow;
    });
  }
  return { cols, rows, x0, z0, blocked, height, maxStep: rules.maxStep };
}

/**
 * Waypoints from `from` to `to` (excluding `from`) that keep clear of obstacles, or null when
 * the goal can't be reached or lies off the grid (the caller then walks straight and slides).
 * A goal inside an obstacle is moved to the nearest free spot.
 */
export function findPath(grid: WalkGrid, from: Point, to: Point): Point[] | null {
  const start = nearestFree(grid, cellOf(grid, from));
  const goalCell = cellOf(grid, to);
  const goal = nearestFree(grid, goalCell);
  if (start < 0 || goal < 0) return null;
  const end = goal === goalCell ? to : centre(grid, goal);
  if (start === goal || clearLine(grid, from, end)) return [end];

  const cells = astar(grid, start, goal);
  if (!cells) return null;
  const points = cells.map((c) => centre(grid, c));
  points[points.length - 1] = end;
  // String pulling: from each corner, jump to the farthest point still in plain sight.
  const out: Point[] = [];
  let at: Point = from;
  let k = 0;
  while (k < points.length) {
    let far = k;
    for (let n = points.length - 1; n > k; n--)
      if (clearLine(grid, at, points[n]!)) {
        far = n;
        break;
      }
    at = points[far]!;
    out.push(at);
    k = far + 1;
  }
  return out;
}

function cellOf(grid: WalkGrid, p: Point): number {
  const i = Math.floor((p.x - grid.x0) / CELL);
  const j = Math.floor((p.z - grid.z0) / CELL);
  if (i < 0 || j < 0 || i >= grid.cols || j >= grid.rows) return -1;
  return j * grid.cols + i;
}

function centre(grid: WalkGrid, c: number): Point {
  return { x: grid.x0 + ((c % grid.cols) + 0.5) * CELL, z: grid.z0 + (Math.floor(c / grid.cols) + 0.5) * CELL };
}

/** The free cell closest to `c` (itself when free), searching rings up to ~2 m out. */
function nearestFree(grid: WalkGrid, c: number): number {
  if (c < 0) return -1;
  if (!grid.blocked[c]) return c;
  const ci = c % grid.cols;
  const cj = Math.floor(c / grid.cols);
  for (let r = 1; r <= 10; r++) {
    let best = -1;
    let bestD = Infinity;
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= grid.cols || j >= grid.rows) continue;
        const n = j * grid.cols + i;
        const d = di * di + dj * dj;
        if (!grid.blocked[n] && d < bestD) {
          best = n;
          bestD = d;
        }
      }
    if (best >= 0) return best;
  }
  return -1;
}

function stepOk(grid: WalkGrid, a: number, b: number): boolean {
  return !grid.blocked[b] && Math.abs(grid.height[a]! - grid.height[b]!) <= grid.maxStep;
}

/** Whether a straight walk from a to b crosses only free cells (sampled at a quarter cell). */
function clearLine(grid: WalkGrid, a: Point, b: Point): boolean {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / (CELL / 4)));
  let prev = cellOf(grid, a);
  if (prev < 0) return false;
  for (let s = 1; s <= n; s++) {
    const t = s / n;
    const c = cellOf(grid, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    if (c < 0) return false;
    if (c !== prev && !stepOk(grid, prev, c)) return false;
    prev = c;
  }
  return true;
}

function astar(grid: WalkGrid, start: number, goal: number): number[] | null {
  const { cols, rows } = grid;
  const g = new Float32Array(cols * rows).fill(Infinity);
  const came = new Int32Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);
  const gi = goal % cols;
  const gj = Math.floor(goal / cols);
  const h = (c: number) => {
    const dx = Math.abs((c % cols) - gi);
    const dz = Math.abs(Math.floor(c / cols) - gj);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz); // octile distance
  };
  const open = new Heap();
  g[start] = 0;
  open.push(start, h(start));
  let expanded = 0;
  while (open.size > 0) {
    const c = open.pop();
    if (c === goal) {
      const path = [c];
      for (let p = came[c]!; p >= 0; p = came[p]!) path.push(p);
      path.pop(); // the start cell
      return path.reverse();
    }
    if (closed[c]) continue;
    closed[c] = 1;
    if (++expanded > SEARCH_LIMIT) return null;
    const ci = c % cols;
    const cj = Math.floor(c / cols);
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= cols || j >= rows) continue;
        const n = j * cols + i;
        if (closed[n] || !stepOk(grid, c, n)) continue;
        // No cutting corners diagonally past a blocked cell.
        if (di && dj && (grid.blocked[cj * cols + i] || grid.blocked[j * cols + ci])) continue;
        const cost = g[c]! + (di && dj ? Math.SQRT2 : 1);
        if (cost >= g[n]!) continue;
        g[n] = cost;
        came[n] = c;
        open.push(n, cost + h(n));
      }
  }
  return null;
}

/** Binary min-heap of cell indices by priority. */
class Heap {
  private items: number[] = [];
  private prio: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, p: number) {
    const { items, prio } = this;
    let k = items.length;
    items.push(item);
    prio.push(p);
    while (k > 0) {
      const up = (k - 1) >> 1;
      if (prio[up]! <= p) break;
      items[k] = items[up]!;
      prio[k] = prio[up]!;
      k = up;
    }
    items[k] = item;
    prio[k] = p;
  }
  pop(): number {
    const { items, prio } = this;
    const top = items[0]!;
    const lastItem = items.pop()!;
    const lastP = prio.pop()!;
    const n = items.length;
    if (n > 0) {
      let k = 0;
      for (;;) {
        let child = 2 * k + 1;
        if (child >= n) break;
        if (child + 1 < n && prio[child + 1]! < prio[child]!) child++;
        if (prio[child]! >= lastP) break;
        items[k] = items[child]!;
        prio[k] = prio[child]!;
        k = child;
      }
      items[k] = lastItem;
      prio[k] = lastP;
    }
    return top;
  }
}
