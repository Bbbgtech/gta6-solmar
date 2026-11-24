// people.js — everyone on foot in Solmar: the player, pedestrians
// strolling the sidewalks, and the on-foot cops who chase a wanted player.
import { makeRng, clamp, dist, angleTo } from './rng.js';
import { ROADS_V, ROADS_H, ROAD_W, WORLD_W, WORLD_H, BEACH_Y, PARK, isRoad, resolveBuildingCollision } from './city.js';

const SKIN = ['#f2c9a0', '#c98d5f', '#8a5a3a', '#f2d7b8', '#a06a42'];
const SHIRTS = ['#d94f3d', '#3d7fd9', '#3da86a', '#f2c230', '#7a4fd9', '#e8e8e8', '#2f2f38', '#d97ab0'];
const PANTS = ['#2f3a5f', '#3a3a3a', '#5f4a2f', '#4a5f3a'];

export class Person {
  constructor(x, y, rng) {
    this.x = x; this.y = y;
    this.angle = rng ? rng.range(0, Math.PI * 2) : 0;
    this.speed = 0;
    this.skin = SKIN[Math.floor(Math.random() * SKIN.length)];
    this.shirt = SHIRTS[Math.floor(Math.random() * SHIRTS.length)];
    this.pants = PANTS[Math.floor(Math.random() * PANTS.length)];
    this.walkPhase = Math.random() * Math.PI * 2;
    this.radius = 11;
  }
  draw(ctx) {
    const bob = Math.sin(this.walkPhase) * 2;
    ctx.save();
    ctx.translate(this.x, this.y);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, 8, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    // Legs.
    ctx.fillStyle = this.pants;
    ctx.fillRect(-6, 2 + bob, 4, 8);
    ctx.fillRect(2, 2 - bob, 4, 8);
    // Body.
    ctx.fillStyle = this.shirt;
    ctx.fillRect(-7, -6, 14, 11);
    // Head.
    ctx.fillStyle = this.skin;
    ctx.beginPath(); ctx.arc(0, -11, 6, 0, Math.PI * 2); ctx.fill();
    // Facing tick (nose).
    ctx.fillStyle = this.skin;
    ctx.beginPath(); ctx.arc(Math.cos(this.angle) * 6, -11 + Math.sin(this.angle) * 6, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// A pedestrian: walks the sidewalks, turns at intersections, flees danger.
export class Pedestrian extends Person {
  constructor(rng) {
    const vertical = rng.chance(0.5);
    const road = vertical ? rng.pick(ROADS_V) : rng.pick(ROADS_H);
    const side = rng.chance(0.5) ? 1 : -1;
    const along = rng.range(140, (vertical ? BEACH_Y : WORLD_W) - 140);
    const x = vertical ? road + (ROAD_W / 2 + 12) * side : along;
    const y = vertical ? along : road + (ROAD_W / 2 + 12) * side;
    super(x, y, rng);
    this.rng = rng;
    this.vertical = vertical;
    this.dir = rng.chance(0.5) ? 1 : -1;
    this.side = side;
    this.road = road;
    this.flee = null; // {x, y} danger to run from
    this.fleeTime = 0;
    this.speed = rng.range(42, 66);
  }
  update(dt, danger) {
    if (danger && dist(this.x, this.y, danger.x, danger.y) < 130) {
      this.flee = { x: danger.x, y: danger.y };
      this.fleeTime = 2.5;
    }
    let tx, ty;
    if (this.flee && this.fleeTime > 0) {
      this.fleeTime -= dt;
      const a = angleTo(this.flee.x, this.flee.y, this.x, this.y);
      tx = this.x + Math.cos(a) * 60;
      ty = this.y + Math.sin(a) * 60;
      this.walkPhase += dt * 16;
    } else {
      this.flee = null;
      const step = this.speed * dt * this.dir;
      if (this.vertical) { tx = this.x; ty = this.y + step; }
      else { tx = this.x + step; ty = this.y; }
      this.walkPhase += dt * 8;
    }
    this.angle = angleTo(this.x, this.y, tx, ty);
    this.x = tx; this.y = ty;
    // Turn at an intersection or the city edge.
    const atV = ROADS_V.find(r => Math.abs(this.x - r) < 24);
    const atH = ROADS_H.find(r => Math.abs(this.y - r) < 24);
    if ((this.vertical && atH !== undefined && this.rng.chance(dt * 0.7)) ||
        (!this.vertical && atV !== undefined && this.rng.chance(dt * 0.7))) {
      this.vertical = !this.vertical;
      this.dir = this.rng.chance(0.5) ? 1 : -1;
      if (this.vertical) {
        this.road = atV !== undefined ? atV : this.road;
        this.x = this.road + (ROAD_W / 2 + 12) * this.side;
      } else {
        this.road = atH !== undefined ? atH : this.road;
        this.y = this.road + (ROAD_W / 2 + 12) * this.side;
      }
    }
    if (this.x < 40 || this.x > WORLD_W - 40 || this.y < 40 || this.y > BEACH_Y - 20) {
      this.dir *= -1;
    }
    // Keep off the road centre and out of buildings.
    if (isRoad(this.x, this.y) && !this.flee) {
      const rx = ROADS_V.reduce((a, b) => Math.abs(this.x - b) < Math.abs(this.x - a) ? b : a);
      this.x = rx + (ROAD_W / 2 + 12) * this.side;
    }
    resolveBuildingCollision(this, this.radius);
    this.x = clamp(this.x, 20, WORLD_W - 20);
    this.y = clamp(this.y, 20, WORLD_H - 20);
  }
}

// An on-foot cop: walks a beat, then chases the player when wanted.
export class Cop extends Person {
  constructor(x, y, rng) {
    super(x, y, rng);
    this.shirt = '#1f4fd9';
    this.pants = '#1a1a22';
    this.rng = rng;
    this.state = 'patrol'; // patrol | chase
    this.patrolTarget = { x, y };
    this.retarget = 0;
  }
  update(dt, player) {
    const wanted = player.wantedStars > 0;
    this.state = wanted ? 'chase' : 'patrol';
    const speed = this.state === 'chase' ? 168 : 60;
    let tx, ty;
    if (this.state === 'chase') {
      tx = player.x; ty = player.y;
    } else {
      this.retarget -= dt;
      if (this.retarget <= 0 || dist(this.x, this.y, this.patrolTarget.x, this.patrolTarget.y) < 30) {
        this.retarget = this.rng.range(4, 9);
        this.patrolTarget = {
          x: clamp(this.x + this.rng.range(-320, 320), 60, WORLD_W - 60),
          y: clamp(this.y + this.rng.range(-320, 320), 60, BEACH_Y - 60),
        };
      }
      tx = this.patrolTarget.x; ty = this.patrolTarget.y;
    }
    const a = angleTo(this.x, this.y, tx, ty);
    this.angle = a;
    this.x += Math.cos(a) * speed * dt;
    this.y += Math.sin(a) * speed * dt;
    this.walkPhase += dt * (this.state === 'chase' ? 15 : 8);
    resolveBuildingCollision(this, this.radius);
    this.x = clamp(this.x, 20, WORLD_W - 20);
    this.y = clamp(this.y, 20, WORLD_H - 20);
  }
  draw(ctx) {
    super.draw(ctx);
    // Police cap.
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = '#16255f';
    ctx.beginPath(); ctx.arc(0, -12, 6, Math.PI, 0); ctx.fill();
    ctx.fillRect(-6, -13, 12, 3);
    ctx.restore();
  }
}

// The player on foot.
export class Player extends Person {
  constructor(x, y) {
    super(x, y, null);
    this.shirt = '#e8b04b';
    this.pants = '#2f3a5f';
    this.skin = '#c98d5f';
    this.health = 100;
    this.cash = 250;
    this.ammo = 12;
    this.wantedStars = 0;
    this.heat = 0;          // 0..100, drives the stars
    this.lastCrime = -99;   // game time of the last crime
    this.inCar = null;      // the Car being driven, or null
    this.punchCooldown = 0;
    this.shootCooldown = 0;
    this.hurtFlash = 0;
    this.speed = 205;
  }
  hurt(amount, time) {
    this.health = Math.max(0, this.health - amount);
    this.hurtFlash = 0.35;
    this.lastHurt = time;
  }
  addCrime(amount, time) {
    this.heat = Math.min(100, this.heat + amount);
    this.lastCrime = time;
    this.wantedStars = Math.ceil(this.heat / 20);
  }
  coolDown(dt, time, policeNear) {
    if (time - this.lastCrime > 6 && !policeNear) {
      this.heat = Math.max(0, this.heat - 2.2 * dt);
      this.wantedStars = Math.ceil(this.heat / 20);
    }
  }
}

export function spawnPedestrians(rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) peds.push(new Pedestrian(rng));
  return peds;
}
export function spawnCops(rng, count) {
  const cops = [];
  for (let i = 0; i < count; i++) {
    const road = rng.pick(ROADS_V);
    cops.push(new Cop(road + 40, rng.range(200, 1800), rng));
  }
  return cops;
}
