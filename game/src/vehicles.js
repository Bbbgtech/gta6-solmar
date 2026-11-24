// Cars for SOLMAR: player driving physics, parked cars to steal, traffic
// that follows the road grid, and police interceptors that chase the player.
import { clamp, angleDiff, angleTo, dist, pick, range } from './rng.js';
import { AVENUES, STREETS, ROAD_HALF, LANE, isRoad, collideCircleBuildings, hitsBuilding } from './city.js';

export const CAR_COLORS = [
  '#d94f3d', '#3d7dd9', '#e8b73a', '#e8e8e8', '#222831',
  '#4caf50', '#9c27b0', '#ff7f2a', '#18b5a6', '#b0bec5',
];

const TOP_SPEED = 520;      // px/s, player car
const TRAFFIC_SPEED = 120;  // px/s
const COP_SPEED = 470;

export function makeCar(x, y, angle, color, opts = {}) {
  return {
    kind: opts.kind || 'traffic', // 'traffic' | 'parked' | 'cop' | 'player'
    x, y, angle, color,
    speed: 0,
    steer: 0,
    w: 48, h: 24,
    driver: opts.driver ?? null, // 'ped' | 'cop' | null (parked, empty)
    parked: opts.kind === 'parked',
    dir: opts.dir ?? 0, // traffic heading: 0 E, 1 S, 2 W, 3 N
    cruise: opts.cruise ?? 1, // traffic speed factor, 0.85..1.15
    turnAt: 0,
    honk: 0,
    dead: false,
  };
}

// --- Player car physics (arcade: accelerate, steer, drift, handbrake) ---
export function drivePlayerCar(car, input, dt, city, sounds) {
  const accel = 420;
  const brake = 620;
  const maxReverse = 180;
  if (input.up) car.speed += accel * dt;
  else if (input.down) car.speed -= (car.speed > 0 ? brake : accel * 0.7) * dt;
  else car.speed -= Math.sign(car.speed) * 140 * dt;
  if (input.handbrake) car.speed -= Math.sign(car.speed) * 520 * dt;
  car.speed = clamp(car.speed, -maxReverse, TOP_SPEED);
  if (Math.abs(car.speed) < 4 && !input.up && !input.down) car.speed = 0;

  const grip = input.handbrake ? 1.5 : 3.4;
  const steerTarget = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 10);
  const turnRate = grip * (car.speed / TOP_SPEED) * (car.speed >= 0 ? 1 : -1);
  car.angle += car.steer * turnRate * dt * (input.handbrake ? 1.35 : 1);

  moveCar(car, dt, city);
  const offroad = !isRoad(car.x, car.y);
  if (offroad) car.speed *= Math.max(0, 1 - 1.6 * dt);
  if (sounds) sounds.setEngine(Math.abs(car.speed) / TOP_SPEED);
  return offroad;
}

function moveCar(car, dt, city) {
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  // Building collision: slide along the wall instead of stopping dead.
  const hitX = hitsBuilding(city, nx, car.y, 14);
  const hitY = hitsBuilding(city, car.x, ny, 14);
  if (!hitX) car.x = nx; else car.speed *= 0.55;
  if (!hitY) car.y = ny; else car.speed *= 0.55;
  car.x = clamp(car.x, 24, 3576);
  car.y = clamp(car.y, 24, 2576);
}

// --- Traffic: follow the road grid, turn at intersections, avoid pile-ups ---
export function updateTraffic(car, dt, city, cars, rng) {
  if (car.kind !== 'traffic') return;
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const [dx, dy] = dirs[car.dir];
  // Stay in the correct lane: offset from the road centre.
  const laneSign = car.dir === 0 || car.dir === 3 ? 1 : -1;
  // Find the road we are on and snap gently toward its lane.
  let targetX = car.x, targetY = car.y;
  if (car.dir === 0 || car.dir === 2) {
    let best = null;
    for (const ay of AVENUES) if (best === null || Math.abs(ay - car.y) < Math.abs(best - car.y)) best = ay;
    targetY = best + LANE * laneSign;
  } else {
    let best = null;
    for (const sx of STREETS) if (best === null || Math.abs(sx - car.x) < Math.abs(best - car.x)) best = sx;
    targetX = best + LANE * laneSign;
  }
  car.x += (targetX - car.x) * Math.min(1, dt * 2.2);
  car.y += (targetY - car.y) * Math.min(1, dt * 2.2);

  // Car ahead? Slow down instead of rear-ending it.
  let blocked = false;
  for (const o of cars) {
    if (o === car || o.dead) continue;
    const d = dist(car.x, car.y, o.x, o.y);
    if (d < 64) {
      const a = angleTo(car.x, car.y, o.x, o.y);
      if (Math.abs(angleDiff(car.angle, a)) < 0.7) { blocked = true; break; }
    }
  }
  const target = blocked ? 0 : TRAFFIC_SPEED * (0.85 + car.cruise * 0.3);
  car.speed += (target - car.speed) * Math.min(1, dt * 1.6);

  car.angle = Math.atan2(dy, dx);
  car.x += dx * car.speed * dt;
  car.y += dy * car.speed * dt;

  // At an intersection, sometimes turn onto the crossing road.
  const nearX = STREETS.some((sx) => Math.abs(car.x - sx) < 26);
  const nearY = AVENUES.some((ay) => Math.abs(car.y - ay) < 26);
  if ((car.dir === 0 || car.dir === 2) && nearX && nearY && rng() < dt * 1.4) {
    car.dir = rng() < 0.5 ? 1 : 3;
    if (rng() < 0.3) car.dir = (car.dir + 2) % 4; // u-turn, rare
  } else if ((car.dir === 1 || car.dir === 3) && nearX && nearY && rng() < dt * 1.4) {
    car.dir = rng() < 0.5 ? 0 : 2;
    if (rng() < 0.3) car.dir = (car.dir + 2) % 4;
  }
  // Wrap around the map edges so traffic never runs out.
  if (car.x < 40) { car.x = 40; car.dir = 0; }
  if (car.x > 3560) { car.x = 3560; car.dir = 2; }
  if (car.y < 40) { car.y = 40; car.dir = 1; }
  if (car.y > 2400 && car.y > 2560) { car.y = 2560; car.dir = 3; }
  if (car.y > 2560) { car.y = 2560; car.dir = 3; }
}

// --- Police interceptor: steer straight at the player, ram on contact ---
export function updateCopCar(car, dt, city, target, cars, sounds) {
  const desired = angleTo(car.x, car.y, target.x, target.y);
  const diff = angleDiff(car.angle, desired);
  car.angle += clamp(diff, -2.6 * dt, 2.6 * dt);
  const d = dist(car.x, car.y, target.x, target.y);
  const want = d > 90 ? COP_SPEED : COP_SPEED * 0.7;
  car.speed += (want - car.speed) * Math.min(1, dt * 1.2);
  moveCar(car, dt, city);
  // Cop cars push traffic aside; they never stack on each other.
  for (const o of cars) {
    if (o === car || o.kind !== 'cop' || o.dead) continue;
    const dd = dist(car.x, car.y, o.x, o.y);
    if (dd < 56 && dd > 0.01) {
      const push = (56 - dd) / 2;
      car.x += ((car.x - o.x) / dd) * push;
      car.y += ((car.y - o.y) / dd) * push;
    }
  }
  return d;
}

export function spawnCopCar(city, rng, px, py) {
  // Spawn on a road near the player, but off-screen if possible.
  for (let tries = 0; tries < 12; tries++) {
    const x = clamp(px + range(rng, -900, 900), 100, 3500);
    const y = clamp(py + range(rng, -700, 700), 100, 2400);
    if (isRoad(x, y) && dist(x, y, px, py) > 420 && !hitsBuilding(city, x, y, 20)) {
      const c = makeCar(x, y, angleTo(x, y, px, py), '#1c2733', { kind: 'cop', driver: 'cop' });
      c.speed = 200;
      return c;
    }
  }
  return makeCar(px + 500, py, 0, '#1c2733', { kind: 'cop', driver: 'cop' });
}

export function drawCar(ctx, car, t) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(-22, -10 + 4, 48, 24);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -24, -12, 48, 24, 7);
  ctx.fill();
  // Hood + trunk shading.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(-24, -12, 12, 24);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(14, -12, 10, 24);
  // Windshield + rear window.
  ctx.fillStyle = '#bfe3f0';
  ctx.fillRect(-4, -10, 8, 20);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(8, -10, 2, 20);
  // Headlights.
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(22, -10, 3, 5);
  ctx.fillRect(22, 5, 3, 5);
  // Tail lights.
  ctx.fillStyle = '#ff2d2d';
  ctx.fillRect(-25, -10, 3, 5);
  ctx.fillRect(-25, 5, 3, 5);
  if (car.kind === 'cop') {
    // Light bar, flashing red/blue.
    const phase = Math.floor(t * 6) % 2 === 0;
    ctx.fillStyle = phase ? '#ff2222' : '#2266ff';
    ctx.fillRect(-8, -12, 7, 4);
    ctx.fillStyle = phase ? '#2266ff' : '#ff2222';
    ctx.fillRect(1, -12, 7, 4);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POLICE', 0, 4);
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
