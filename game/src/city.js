// SOLMAR city map: a hand-built coastal city on a 3600 x 2600 world.
// Roads form a grid, with a park, a beach and a marina. Everything here is
// original: Solmar, its streets and its landmarks are invented for this game.
import { makeRng, pick, range, rangeInt } from './rng.js';

export const WORLD_W = 3600;
export const WORLD_H = 2600;

export const AVENUES = [300, 800, 1300, 1800, 2300]; // horizontal road centres (y)
export const STREETS = [300, 900, 1500, 2100, 2700, 3300]; // vertical road centres (x)
export const ROAD_HALF = 46;
export const LANE = 23;

const ROOF_COLORS = [
  '#c96f4a', '#b5533c', '#d9a441', '#7d8a99', '#5b7d6a',
  '#8a6f9e', '#a35d6e', '#4a7d9e', '#9e8a5d', '#6e5a4e',
  '#3f6d8e', '#b5763f', '#7a4a6e', '#5d7a4a',
];

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const parkingSpots = [];

  // City blocks: the rectangles between neighbouring roads.
  const xs = [0, ...STREETS, WORLD_W];
  const ys = [0, ...AVENUES, WORLD_H];
  const parkBlock = { x0: 1545, y0: 845, x1: 2055, y1: 1255 };

  for (let bi = 0; bi < xs.length - 1; bi++) {
    for (let bj = 0; bj < ys.length - 1; bj++) {
      const x0 = xs[bi] + ROAD_HALF + 14;
      const x1 = xs[bi + 1] - ROAD_HALF - 14;
      const y0 = ys[bj] + ROAD_HALF + 14;
      const y1 = ys[bj + 1] - ROAD_HALF - 14;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      // The beach strip along the south edge is sand, not blocks.
      if (y0 > 2320) continue;
      // The marina occupies the south-east corner.
      if (x0 > 2900 && y0 > 1800) continue;
      // Palm Park: green block, trees and paths instead of buildings.
      if (x0 >= parkBlock.x0 - 5 && x1 <= parkBlock.x1 + 5 && y0 >= parkBlock.y0 - 5 && y1 <= parkBlock.y1 + 5) {
        for (let t = 0; t < 26; t++) {
          trees.push({ x: range(rng, x0 + 20, x1 - 20), y: range(rng, y0 + 20, y1 - 20), r: range(rng, 9, 15) });
        }
        continue;
      }
      const downtown = x0 >= 900 && x1 <= 1500 && y0 >= 1300 && y1 <= 1800;
      const count = downtown ? rangeInt(rng, 2, 3) : rangeInt(rng, 1, 4);
      const cols = count <= 2 ? count : 2;
      const rows = Math.ceil(count / cols);
      const cw = (x1 - x0) / cols;
      const ch = (y1 - y0) / rows;
      for (let i = 0; i < count; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        const w = range(rng, cw * 0.55, cw * 0.82);
        const h = range(rng, ch * 0.55, ch * 0.82);
        const x = x0 + c * cw + (cw - w) / 2 + range(rng, -8, 8);
        const y = y0 + r * ch + (ch - h) / 2 + range(rng, -8, 8);
        buildings.push({
          x, y, w, h,
          color: pick(rng, ROOF_COLORS),
          tall: downtown && rng() < 0.6,
          name: downtown ? 'Tower' : 'Block',
        });
      }
      // A few palm trees along the block edge.
      for (let t = 0; t < 3; t++) {
        trees.push({ x: range(rng, x0, x1), y: y0 + range(rng, 2, 10), r: range(rng, 8, 12) });
      }
    }
  }

  // Beach palms.
  for (let t = 0; t < 22; t++) {
    trees.push({ x: range(rng, 120, WORLD_W - 120), y: range(rng, 2360, 2430), r: range(rng, 9, 14) });
  }

  // Parking spots along the avenues (where parked cars sit).
  for (const ay of AVENUES) {
    for (const sx of STREETS) {
      if (rng() < 0.55) {
        parkingSpots.push({ x: sx + range(rng, 120, 260), y: ay + ROAD_HALF - 12, angle: 0 });
      }
      if (rng() < 0.55) {
        parkingSpots.push({ x: sx + range(rng, -260, -120), y: ay - ROAD_HALF + 12, angle: Math.PI });
      }
    }
  }

  return {
    seed, buildings, trees, parkingSpots,
    park: parkBlock,
    beach: { y0: 2420 },
    marina: { x0: 3050, y0: 2330, x1: WORLD_W, y1: WORLD_H },
    landmarks: [
      { x: 1200, y: 1550, label: 'DOWNTOWN' },
      { x: 1800, y: 1050, label: 'PALM PARK' },
      { x: 1800, y: 2470, label: 'PLAYA SOL' },
      { x: 3320, y: 2420, label: 'SOLMAR MARINA' },
      { x: 600, y: 550, label: 'OLD TOWN' },
      { x: 3000, y: 550, label: 'NORTH HILLS' },
    ],
  };
}

export function isRoad(x, y) {
  if (x < 0 || y < 0 || x > WORLD_W || y > WORLD_H) return false;
  for (const ay of AVENUES) if (Math.abs(y - ay) <= ROAD_HALF) return true;
  for (const sx of STREETS) if (Math.abs(x - sx) <= ROAD_HALF) return true;
  return false;
}

export function isWater(city, x, y) {
  return x >= city.marina.x0 && y >= city.marina.y0;
}

export function isBeach(city, x, y) {
  return y >= city.beach.y0 && !isWater(city, x, y);
}

export function inPark(city, x, y) {
  return x >= city.park.x0 && x <= city.park.x1 && y >= city.park.y0 && y <= city.park.y1;
}

// Point-in-rect test against every building; used by movement + spawning.
export function hitsBuilding(city, x, y, pad = 0) {
  for (const b of city.buildings) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return b;
  }
  return null;
}

// Resolve a circle (x, y, r) out of buildings; returns corrected {x, y}.
export function collideCircleBuildings(city, x, y, r) {
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx, dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 < 0.0001) { y = b.y - r; continue; }
      const d = Math.sqrt(d2);
      x = cx + (dx / d) * r;
      y = cy + (dy / d) * r;
    }
  }
  return { x, y };
}

// A random point on a road, for spawning traffic.
export function randomRoadPoint(rng) {
  if (rng() < 0.5) {
    return { x: range(rng, 120, WORLD_W - 120), y: pick(rng, AVENUES) + (rng() < 0.5 ? -LANE : LANE) };
  }
  return { x: pick(rng, STREETS) + (rng() < 0.5 ? -LANE : LANE), y: range(rng, 120, WORLD_H - 200) };
}

// A random point on a sidewalk (just outside a road edge), for pedestrians.
export function randomSidewalkPoint(rng) {
  const p = randomRoadPoint(rng);
  const onAvenue = AVENUES.some((ay) => Math.abs(p.y - ay) <= ROAD_HALF + 2);
  if (onAvenue) return { x: p.x, y: p.y + (p.y % 2 < 1 ? ROAD_HALF + 12 : -ROAD_HALF - 12) };
  return { x: p.x + ROAD_HALF + 12, y: p.y };
}

const GRASS = '#69a84f';
const GRASS2 = '#5d9c46';

export function drawCity(ctx, city, cam) {
  const { x: cx, y: cy, w: vw, h: vh } = cam;
  // Ground.
  ctx.fillStyle = GRASS;
  ctx.fillRect(cx, cy, vw, vh);
  ctx.fillStyle = GRASS2;
  const gs = 160;
  const gx0 = Math.floor(cx / gs) * gs, gy0 = Math.floor(cy / gs) * gs;
  for (let gx = gx0; gx < cx + vw; gx += gs) {
    for (let gy = gy0; gy < cy + vh; gy += gs) {
      if (((gx + gy) / gs) % 2 === 0) ctx.fillRect(gx, gy, gs, gs);
    }
  }
  // Beach sand.
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(Math.max(cx, 0), Math.max(cy, city.beach.y0), Math.min(vw, WORLD_W - Math.max(cx, 0)), Math.max(0, Math.min(cy + vh, WORLD_H) - Math.max(cy, city.beach.y0)));
  // Marina water.
  ctx.fillStyle = '#2f7fb8';
  ctx.fillRect(Math.max(cx, city.marina.x0), Math.max(cy, city.marina.y0), Math.min(vw, WORLD_W - Math.max(cx, city.marina.x0)), Math.max(0, Math.min(cy + vh, WORLD_H) - Math.max(cy, city.marina.y0)));
  ctx.fillStyle = '#3f96cc';
  for (let i = 0; i < 8; i++) {
    const wy = city.marina.y0 + 30 + i * 28;
    if (wy > cy && wy < cy + vh) { ctx.fillRect(Math.max(cx, city.marina.x0), wy, 420, 3); }
  }
  // Marina docks.
  ctx.fillStyle = '#8a6f4d';
  ctx.fillRect(3120, 2360, 16, 180);
  ctx.fillRect(3300, 2360, 16, 180);
  ctx.fillRect(3480, 2360, 16, 180);

  // Park.
  ctx.fillStyle = '#4c9a3f';
  ctx.fillRect(city.park.x0, city.park.y0, city.park.x1 - city.park.x0, city.park.y1 - city.park.y0);
  ctx.fillStyle = '#d9c58a';
  ctx.fillRect(city.park.x0, (city.park.y0 + city.park.y1) / 2 - 6, city.park.x1 - city.park.x0, 12);
  ctx.fillRect((city.park.x0 + city.park.x1) / 2 - 6, city.park.y0, 12, city.park.y1 - city.park.y0);
  // Park pond.
  ctx.fillStyle = '#2f7fb8';
  ctx.beginPath(); ctx.ellipse(1700, 950, 70, 42, 0, 0, Math.PI * 2); ctx.fill();

  // Roads: asphalt + sidewalks.
  ctx.fillStyle = '#9aa0a6';
  for (const ay of AVENUES) ctx.fillRect(0, ay - ROAD_HALF - 10, WORLD_W, ROAD_HALF * 2 + 20);
  for (const sx of STREETS) ctx.fillRect(sx - ROAD_HALF - 10, 0, ROAD_HALF * 2 + 20, WORLD_H);
  ctx.fillStyle = '#3c3f45';
  for (const ay of AVENUES) ctx.fillRect(0, ay - ROAD_HALF, WORLD_W, ROAD_HALF * 2);
  for (const sx of STREETS) ctx.fillRect(sx - ROAD_HALF, 0, ROAD_HALF * 2, WORLD_H);
  // Lane dashes.
  ctx.fillStyle = '#f5d76e';
  for (const ay of AVENUES) {
    for (let x = 0; x < WORLD_W; x += 90) ctx.fillRect(x + 10, ay - 2, 44, 4);
  }
  for (const sx of STREETS) {
    for (let y = 0; y < WORLD_H; y += 90) ctx.fillRect(sx - 2, y + 10, 4, 44);
  }
  // Crosswalk stripes at intersections.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const ay of AVENUES) {
    for (const sx of STREETS) {
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(sx + i * 13 - 4, ay - ROAD_HALF + 4, 8, 10);
        ctx.fillRect(sx + i * 13 - 4, ay + ROAD_HALF - 14, 8, 10);
      }
    }
  }

  // Buildings: drop shadow + roof + roof detail.
  for (const b of city.buildings) {
    if (b.x > cx + vw || b.x + b.w < cx || b.y > cy + vh || b.y + b.h < cy) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    const cols = Math.max(1, Math.floor(b.w / 34));
    const rows = Math.max(1, Math.floor(b.h / 34));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if ((i + j) % 2 === 0) ctx.fillRect(b.x + 10 + i * 34, b.y + 10 + j * 34, 18, 14);
      }
    }
    if (b.tall) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(b.x + b.w / 2 - 3, b.y + 8, 6, b.h - 16);
    }
  }

  // Trees.
  for (const t of city.trees) {
    if (t.x < cx - 20 || t.x > cx + vw + 20 || t.y < cy - 20 || t.y > cy + vh + 20) continue;
    ctx.fillStyle = '#2f7a33';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#43a047';
    ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
  }

  // Landmark labels.
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const lm of city.landmarks) {
    if (lm.x < cx - 80 || lm.x > cx + vw + 80 || lm.y < cy - 40 || lm.y > cy + vh + 40) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    const w = ctx.measureText(lm.label).width + 18;
    ctx.fillRect(lm.x - w / 2, lm.y - 13, w, 22);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(lm.label, lm.x, lm.y + 3);
  }
}
