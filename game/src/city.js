// city.js — the hand-built map of Solmar, a sun-soaked coastal city.
// One seeded generator lays out roads, blocks, buildings, the park, the
// beach and the marina, so the map is identical on every load.
import { makeRng } from './rng.js';

export const WORLD_W = 3200;
export const WORLD_H = 2400;
export const ROAD_W = 112;
export const ROADS_V = [300, 900, 1500, 2100, 2700];
export const ROADS_H = [300, 850, 1400, 1950];
export const BEACH_Y = 2140;          // sand starts here
export const WATER_Y = 2290;          // the sea
export const PARK = { x: 955, y: 905, w: 490, h: 440 }; // the green block
export const MARINA = { x: 2380, y: 2160, w: 420, h: 120 };

const PALETTE = [
  '#e8b04b', '#d98a4a', '#c96f4a', '#b8574f', '#8f6fb8', '#5f8fbf',
  '#4fa08a', '#a8a06a', '#c9a227', '#7a9a5b', '#946b4a', '#6b7fa8',
];
const DOWNTOWN_LABELS = ['HOTEL MIRADOR', 'CITY HALL', 'SOLMAR MALL', 'TOUR AZUR', 'BANCO SOLMAR', 'CINE PLAZA'];
const BLOCK_LABELS = ['APTS LUNA', 'MERCADO', 'GYM ATLAS', 'CLINIC', 'LIBRARY', 'HOSTEL SOL'];

function buildCity() {
  const rng = makeRng(20261124);
  const buildings = [];
  const trees = [];
  const boats = [];
  const pickups = [];

  // Blocks between the roads, with a margin for sidewalks.
  const xs = [[0, 244], [356, 844], [956, 1444], [1556, 2044], [2156, 2644], [2756, 3200]];
  const ys = [[0, 244], [356, 794], [906, 1344], [1456, 1894], [2006, 2139]];
  let labelIdx = 0;
  for (const [x0, x1] of xs) {
    for (const [y0, y1] of ys) {
      // The park block stays green; the beach strip stays sand.
      if (x0 === 956 && y0 === 906) continue;
      if (y0 === 2006) continue;
      const bw = x1 - x0, bh = y1 - y0;
      const downtown = Math.abs((x0 + x1) / 2 - 1500) < 700 && Math.abs((y0 + y1) / 2 - 1400) < 700;
      const count = downtown ? 1 : rng.int(1, 2);
      for (let i = 0; i < count; i++) {
        const w = downtown ? bw * rng.range(0.55, 0.8) : bw * rng.range(0.4, 0.7);
        const h = downtown ? bh * rng.range(0.55, 0.8) : bh * rng.range(0.4, 0.7);
        const x = x0 + (bw - w) / 2 + rng.range(-20, 20);
        const y = y0 + (bh - h) / 2 + rng.range(-20, 20);
        const floors = downtown ? rng.int(6, 14) : rng.int(2, 5);
        let label = null;
        if (downtown && labelIdx < DOWNTOWN_LABELS.length && rng.chance(0.7)) {
          label = DOWNTOWN_LABELS[labelIdx++];
        } else if (!downtown && rng.chance(0.25)) {
          label = BLOCK_LABELS[rng.int(0, BLOCK_LABELS.length - 1)];
        }
        buildings.push({
          x, y, w, h,
          color: PALETTE[rng.int(0, PALETTE.length - 1)],
          floors, label,
          roof: rng.pick(['#5a4a3a', '#6b5a4a', '#4a5a6b', '#7a6a5a']),
        });
      }
    }
  }

  // Park trees and a pond.
  for (let i = 0; i < 26; i++) {
    trees.push({
      x: PARK.x + 30 + rng.range(0, PARK.w - 60),
      y: PARK.y + 30 + rng.range(0, PARK.h - 60),
      r: rng.range(14, 24),
    });
  }
  // Street trees along the beach promenade.
  for (let x = 120; x < 3100; x += 160) {
    trees.push({ x: x + rng.range(-20, 20), y: BEACH_Y - 40, r: rng.range(13, 18) });
  }
  // Marina boats.
  for (let i = 0; i < 5; i++) {
    boats.push({
      x: MARINA.x + 30 + i * 78,
      y: MARINA.y + 34 + (i % 2) * 44,
      w: 58, h: 20,
      color: rng.pick(['#f2f2f2', '#e8e8d8', '#d8e8f0', '#f0d8d8']),
    });
  }
  // Health / ammo / cash pickups at fixed, memorable spots.
  pickups.push(
    { x: 1500, y: 1200, kind: 'health' },   // park centre
    { x: 620, y: 620, kind: 'ammo' },       // north-west block corner
    { x: 2400, y: 1750, kind: 'health' },   // east side
    { x: 900, y: 1650, kind: 'cash' },      // south-west
    { x: 2700, y: 500, kind: 'ammo' },      // north-east
    { x: 2100, y: 1200, kind: 'cash' },     // downtown east
    { x: 300, y: 2050, kind: 'health' },    // promenade west
  );
  return { buildings, trees, boats, pickups };
}

export const CITY = buildCity();

// Is this point on a road (drivable asphalt)?
export function isRoad(x, y) {
  if (y > BEACH_Y) return false;
  for (const rx of ROADS_V) if (Math.abs(x - rx) < ROAD_W / 2) return true;
  for (const ry of ROADS_H) if (Math.abs(y - ry) < ROAD_W / 2) return true;
  return false;
}
// Is this point on a sidewalk (the pale strip beside a road)?
export function isSidewalk(x, y) {
  if (y > BEACH_Y) return false;
  for (const rx of ROADS_V) if (Math.abs(x - rx) < ROAD_W / 2 + 22 && Math.abs(x - rx) >= ROAD_W / 2) return true;
  for (const ry of ROADS_H) if (Math.abs(y - ry) < ROAD_W / 2 + 22 && Math.abs(y - ry) >= ROAD_W / 2) return true;
  return false;
}

// Push a circle (x, y, r) out of every building it overlaps. Returns true if it hit.
export function resolveBuildingCollision(p, r) {
  let hit = false;
  for (const b of CITY.buildings) {
    const cx = Math.max(b.x, Math.min(p.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(p.y, b.y + b.h));
    const dx = p.x - cx, dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r;
        p.y = cy + (dy / d) * r;
      } else {
        p.y = b.y - r; // dead centre: push up out of the roof
      }
    }
  }
  return hit;
}

export function pointInBuilding(x, y) {
  for (const b of CITY.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

// ---- drawing -------------------------------------------------------------
export function drawCity(ctx, cam, timeSec) {
  const { x: vx, y: vy, w: vw, h: vh } = cam.view;
  // Ground: warm grass-green base.
  ctx.fillStyle = '#7fb069';
  ctx.fillRect(vx, vy, vw, vh);
  // Beach sand and sea.
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(vx, Math.max(vy, BEACH_Y), vw, Math.max(0, vy + vh - BEACH_Y));
  ctx.fillStyle = '#2f7fb8';
  ctx.fillRect(vx, Math.max(vy, WATER_Y), vw, Math.max(0, vy + vh - WATER_Y));
  // Gentle waves.
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const wy = WATER_Y + 18 + i * 22 + Math.sin(timeSec * 1.2 + i * 2) * 3;
    if (wy < vy || wy > vy + vh) continue;
    ctx.beginPath();
    for (let x = Math.max(vx, 0); x < Math.min(vx + vw, WORLD_W); x += 40) {
      const y = wy + Math.sin(x * 0.02 + timeSec + i) * 3;
      if (x === Math.max(vx, 0)) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Marina dock.
  ctx.fillStyle = '#8a6f4d';
  ctx.fillRect(MARINA.x, MARINA.y, MARINA.w, 14);
  for (const b of CITY.boats) {
    if (b.x + b.w < vx || b.x > vx + vw || b.y + b.h < vy || b.y > vy + vh) continue;
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + b.w, b.y);
    ctx.lineTo(b.x + b.w - 10, b.y + b.h);
    ctx.lineTo(b.x + 10, b.y + b.h);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3a6a8a';
    ctx.fillRect(b.x + b.w / 2 - 2, b.y - 12, 4, 12);
  }
  // Park: lawn, pond, paths.
  ctx.fillStyle = '#5da24a';
  ctx.fillRect(PARK.x, PARK.y, PARK.w, PARK.h);
  ctx.fillStyle = '#4a90c2';
  ctx.beginPath();
  ctx.ellipse(PARK.x + PARK.w * 0.68, PARK.y + PARK.h * 0.62, 62, 38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d8c9a0';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(PARK.x, PARK.y + PARK.h / 2); ctx.lineTo(PARK.x + PARK.w, PARK.y + PARK.h / 2);
  ctx.moveTo(PARK.x + PARK.w / 2, PARK.y); ctx.lineTo(PARK.x + PARK.w / 2, PARK.y + PARK.h);
  ctx.stroke();
  // Roads: asphalt with pale sidewalks.
  for (const rx of ROADS_V) {
    ctx.fillStyle = '#c9c2b4';
    ctx.fillRect(rx - ROAD_W / 2 - 22, Math.max(vy, 0), ROAD_W + 44, Math.min(vh, BEACH_Y - vy));
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(rx - ROAD_W / 2, Math.max(vy, 0), ROAD_W, Math.min(vh, BEACH_Y - vy));
  }
  for (const ry of ROADS_H) {
    ctx.fillStyle = '#c9c2b4';
    ctx.fillRect(Math.max(vx, 0), ry - ROAD_W / 2 - 22, Math.min(vw, WORLD_W - vx), ROAD_W + 44);
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(Math.max(vx, 0), ry - ROAD_W / 2, Math.min(vw, WORLD_W - vx), ROAD_W);
  }
  // Lane dashes.
  ctx.strokeStyle = '#f5d76e';
  ctx.lineWidth = 4;
  ctx.setLineDash([26, 30]);
  ctx.beginPath();
  for (const rx of ROADS_V) {
    ctx.moveTo(rx, Math.max(vy, 0)); ctx.lineTo(rx, Math.min(vy + vh, BEACH_Y));
  }
  for (const ry of ROADS_H) {
    ctx.moveTo(Math.max(vx, 0), ry); ctx.lineTo(Math.min(vx + vw, WORLD_W), ry);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // Crosswalks at every intersection.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const rx of ROADS_V) {
    for (const ry of ROADS_H) {
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(rx - 34 + i * 14, ry - ROAD_W / 2 - 6, 8, 12);
        ctx.fillRect(rx - 34 + i * 14, ry + ROAD_W / 2 - 6, 8, 12);
      }
    }
  }
  // Buildings: body, roof, windows, label.
  for (const b of CITY.buildings) {
    if (b.x + b.w < vx || b.x > vx + vw || b.y + b.h < vy || b.y > vy + vh) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    // Windows in a grid, scaled to the footprint.
    const cols = Math.max(2, Math.floor(b.w / 34));
    const rows = Math.max(2, Math.floor(b.h / 34));
    ctx.fillStyle = 'rgba(200,225,255,0.85)';
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        ctx.fillRect(b.x + 12 + c * ((b.w - 24) / cols), b.y + 12 + r * ((b.h - 24) / rows), 12, 14);
      }
    }
    if (b.label && b.w > 90) {
      ctx.fillStyle = 'rgba(20,20,30,0.85)';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 5);
      ctx.textAlign = 'left';
    }
    // Downtown towers get a height shadow edge.
    if (b.floors >= 8) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(b.x, b.y, b.w, 8);
    }
  }
  // Trees.
  for (const t of CITY.trees) {
    if (t.x < vx - 30 || t.x > vx + vw + 30 || t.y < vy - 30 || t.y > vy + vh + 30) continue;
    ctx.fillStyle = '#3e7a34';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#57a047';
    ctx.beginPath(); ctx.arc(t.x - 4, t.y - 4, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
  }
}
