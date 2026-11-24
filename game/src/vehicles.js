// vehicles.js — every car in Solmar: the player's ride, parked cars,
// traffic that follows the road grid, and police interceptors that chase.
import { makeRng, clamp, angleDiff, dist } from './rng.js';
import { ROADS_V, ROADS_H, ROAD_W, WORLD_W, WORLD_H, BEACH_Y, isRoad, resolveBuildingCollision } from './city.js';

export const CAR_COLORS = [
  '#d94f3d', '#3d7fd9', '#f2c230', '#e8e8e8', '#2f2f38', '#7a4fd9',
  '#3da86a', '#d97ab0', '#c97a2e', '#5fb8c9', '#8a8a92', '#b8d94f',
];
const POLICE_COLOR = '#1f6fd9';
const TAXI_COLOR = '#f2c230';

let nextId = 1;

export class Car {
  constructor(x, y, angle, opts = {}) {
    this.id = nextId++;
    this.x = x; this.y = y;
    this.angle = angle;
    this.speed = 0;
    this.color = opts.color || CAR_COLORS[0];
    this.kind = opts.kind || 'civil'; // civil | police | taxi | player
    this.parked = !!opts.parked;
    this.driver = opts.driver || null; // a pedestrian, when driven by traffic
    this.maxSpeed = opts.maxSpeed || 330;
    this.w = 44; this.h = 22;
    this.crashed = 0; // seconds of spin-out after a hard hit
    this.siren = 0;
  }
  get radius() { return 20; }

  // Arcade drive model: throttle, steering, handbrake drift.
  drive(dt, throttle, steer, handbrake) {
    if (this.crashed > 0) { this.crashed -= dt; this.speed *= 0.96; }
    const accel = 460;
    if (throttle > 0) this.speed += accel * dt;
    else if (throttle < 0) this.speed -= (this.speed > 10 ? 620 : 260) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 240 * dt);
    if (handbrake) this.speed *= Math.pow(0.25, dt);
    this.speed = clamp(this.speed, -190, this.maxSpeed);
    const grip = handbrake ? 1.7 : 1.0;
    this.angle += steer * clamp(Math.abs(this.speed) / 130, 0, 1.6) * 2.1 * grip * dt * (this.speed < 0 ? -1 : 1);
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
    this.x = clamp(this.x, 30, WORLD_W - 30);
    this.y = clamp(this.y, 30, WORLD_H - 30);
  }

  // Simple pursuit steering toward a point, used by police and by traffic
  // when it turns at an intersection.
  steerToward(tx, ty, dt, topSpeed) {
    const want = Math.atan2(ty - this.y, tx - this.x);
    const turn = clamp(angleDiff(this.angle, want), -1, 1);
    this.drive(dt, 1, turn * 1.4, false);
    this.speed = Math.min(this.speed, topSpeed);
    if (dist(this.x, this.y, tx, ty) < 26) return true;
    return false;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-this.w / 2 + 3, -this.h / 2 + 4, this.w, this.h);
    // Body.
    ctx.fillStyle = this.color;
    roundRect(ctx, -this.w / 2, -this.h / 2, this.w, this.h, 7);
    ctx.fill();
    // Cabin + windshield.
    ctx.fillStyle = 'rgba(30,40,60,0.85)';
    roundRect(ctx, -6, -this.h / 2 + 3, 16, this.h - 6, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,220,255,0.7)';
    ctx.fillRect(8, -this.h / 2 + 4, 3, this.h - 8);
    // Headlights and tail lights.
    ctx.fillStyle = '#fff8c0';
    ctx.fillRect(this.w / 2 - 2, -this.h / 2 + 2, 3, 5);
    ctx.fillRect(this.w / 2 - 2, this.h / 2 - 7, 3, 5);
    ctx.fillStyle = '#d93030';
    ctx.fillRect(-this.w / 2, -this.h / 2 + 2, 3, 5);
    ctx.fillRect(-this.w / 2, this.h / 2 - 7, 3, 5);
    if (this.kind === 'police') {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', 0, 3);
      ctx.textAlign = 'left';
      // Light bar.
      const on = Math.floor(performance.now() / 280) % 2 === 0;
      ctx.fillStyle = on ? '#ff2d2d' : '#2d6bff';
      ctx.fillRect(-4, -this.h / 2 - 2, 8, 4);
      ctx.fillStyle = on ? '#2d6bff' : '#ff2d2d';
      ctx.fillRect(-4, this.h / 2 - 2, 8, 4);
    } else if (this.kind === 'taxi') {
      ctx.fillStyle = '#222';
      ctx.font = 'bold 8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }
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

// ---- traffic -------------------------------------------------------------
// A traffic car drives along one road, turns at intersections, and brakes
// for the car ahead. Lanes run on the right side of the road.
export class TrafficCar extends Car {
  constructor(rng, x, y, angle) {
    super(x, y, angle, { color: rng.pick(CAR_COLORS), maxSpeed: rng.range(220, 300) });
    this.rng = rng;
    this.vertical = Math.abs(Math.cos(angle)) < 0.5;
    this.dir = this.vertical ? (Math.sin(angle) > 0 ? 1 : -1) : (Math.cos(angle) > 0 ? 1 : -1);
    this.road = this.vertical ? nearestRoad(x, ROADS_V) : nearestRoad(y, ROADS_H);
    this.wait = 0;
  }
  update(dt, cars) {
    if (this.wait > 0) { this.wait -= dt; return; }
    // Stay in the right-hand lane of the current road.
    const lane = this.vertical
      ? { x: this.road + 28 * this.dir, y: this.y + 1 * this.dir }
      : { x: this.x + 1 * this.dir, y: this.road + 28 * this.dir };
    const tx = this.vertical ? lane.x : this.x + 60 * this.dir;
    const ty = this.vertical ? this.y + 60 * this.dir : lane.y;
    // Brake for a car ahead.
    let blocked = false;
    for (const c of cars) {
      if (c === this || c.parked) continue;
      const d = dist(this.x, this.y, c.x, c.y);
      if (d < 70) {
        const ahead = Math.cos(this.angle) * (c.x - this.x) + Math.sin(this.angle) * (c.y - this.y);
        if (ahead > 0) { blocked = true; break; }
      }
    }
    if (blocked) {
      this.speed = Math.max(0, this.speed - 500 * dt);
      this.x += Math.cos(this.angle) * this.speed * dt;
      this.y += Math.sin(this.angle) * this.speed * dt;
      return;
    }
    const want = Math.atan2(ty - this.y, tx - this.x);
    const turn = clamp(angleDiff(this.angle, want), -1, 1);
    this.drive(dt, 1, turn * 1.2, false);
    this.speed = Math.min(this.speed, this.maxSpeed);
    // At an intersection, sometimes turn onto the crossing road.
    const nearV = ROADS_V.find(r => Math.abs(this.x - r) < 30);
    const nearH = ROADS_H.find(r => Math.abs(this.y - r) < 30);
    if (this.vertical && nearH !== undefined && this.rng.chance(dt * 0.9)) {
      this.vertical = false; this.road = nearH;
      this.dir = this.rng.chance(0.5) ? 1 : -1;
      this.angle = this.dir > 0 ? 0 : Math.PI;
    } else if (!this.vertical && nearV !== undefined && this.rng.chance(dt * 0.9)) {
      this.vertical = true; this.road = nearV;
      this.dir = this.rng.chance(0.5) ? 1 : -1;
      this.angle = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    // Loop back at the city edge instead of leaving town.
    if (this.x < 60 || this.x > WORLD_W - 60 || this.y < 60 || this.y > BEACH_Y - 40) {
      this.angle += Math.PI;
      this.dir *= -1;
    }
    resolveBuildingCollision(this, this.radius);
  }
}

function nearestRoad(v, roads) {
  let best = roads[0], bd = Infinity;
  for (const r of roads) { const d = Math.abs(v - r); if (d < bd) { bd = d; best = r; } }
  return best;
}

// ---- spawning ------------------------------------------------------------
export function spawnParkedCars(rng, count) {
  const cars = [];
  const spots = [];
  for (const rx of ROADS_V) {
    for (const ry of ROADS_H) {
      spots.push({ x: rx + ROAD_W / 2 + 14, y: ry + 120, a: Math.PI / 2 });
      spots.push({ x: rx - ROAD_W / 2 - 14, y: ry - 120, a: -Math.PI / 2 });
      spots.push({ x: rx + 120, y: ry + ROAD_W / 2 + 14, a: 0 });
      spots.push({ x: rx - 120, y: ry - ROAD_W / 2 - 14, a: Math.PI });
    }
  }
  // Shuffle deterministically and take the first `count` spots.
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  for (let i = 0; i < Math.min(count, spots.length); i++) {
    const s = spots[i];
    const taxi = rng.chance(0.12);
    cars.push(new Car(s.x, s.y, s.a, {
      color: taxi ? TAXI_COLOR : rng.pick(CAR_COLORS),
      kind: taxi ? 'taxi' : 'civil',
      parked: true,
    }));
  }
  return cars;
}

export function spawnTraffic(rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const vertical = rng.chance(0.5);
    const road = vertical ? rng.pick(ROADS_V) : rng.pick(ROADS_H);
    const dir = rng.chance(0.5) ? 1 : -1;
    const along = rng.range(120, vertical ? BEACH_Y - 120 : WORLD_W - 120);
    const x = vertical ? road + 28 * dir : along;
    const y = vertical ? along : road + 28 * dir;
    const angle = vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const car = new TrafficCar(rng, x, y, angle);
    car.speed = rng.range(120, 220);
    cars.push(car);
  }
  return cars;
}

export function spawnPoliceCar(x, y) {
  const car = new Car(x, y, 0, { color: POLICE_COLOR, kind: 'police', maxSpeed: 470 });
  car.siren = 1;
  return car;
}

// Keep cars apart: cheap circle separation so traffic never overlaps.
export function separateCars(cars) {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const min = a.radius + b.radius - 6;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const nx = dx / d, ny = dy / d;
        if (!a.parked) { a.x -= nx * push; a.y -= ny * push; }
        if (!b.parked) { b.x += nx * push; b.y += ny * push; }
      }
    }
  }
}
