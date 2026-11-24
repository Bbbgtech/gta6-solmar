// People of SOLMAR: the player on foot, pedestrians strolling the
// sidewalks, on-foot police who chase, plus health/ammo pickups and
// the punch-and-shoot combat.
import { clamp, angleTo, angleDiff, dist, pick, range, rangeInt } from './rng.js';
import { collideCircleBuildings, randomSidewalkPoint, isRoad } from './city.js';

export const PED_SHIRTS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#fd79a8'];

export function makePlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, radius: 13,
    health: 100, maxHealth: 100,
    cash: 0, ammo: 12, maxAmmo: 24,
    inCar: null, // the car object when driving
    speed: 0,
    punchCd: 0, shootCd: 0, hurtCd: 0,
    walkPhase: 0,
  };
}

export function makePed(x, y, rng) {
  return {
    x, y, angle: range(rng, 0, Math.PI * 2), radius: 11,
    shirt: pick(rng, PED_SHIRTS),
    speed: range(rng, 34, 62),
    tx: x, ty: y, wait: range(rng, 0, 2),
    panic: 0, // runs away when scared
    dead: false, fallT: 0,
  };
}

export function makeCopOnFoot(x, y) {
  return { x, y, angle: 0, radius: 12, speed: 205, punchCd: 0, dead: false };
}

export function makePickup(x, y, kind) {
  return { x, y, kind, bob: Math.random() * 6 }; // 'health' | 'ammo' | 'cash'
}

// --- Player on foot ---
export function updatePlayerOnFoot(p, input, dt, city, sounds) {
  const speed = 235;
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (mx !== 0 || my !== 0) {
    const len = Math.hypot(mx, my);
    mx /= len; my /= len;
    p.angle = Math.atan2(my, mx);
    p.walkPhase += dt * 11;
    p.speed = speed;
  } else {
    p.speed = 0;
  }
  const nx = p.x + mx * speed * dt;
  const ny = p.y + my * speed * dt;
  const pos = collideCircleBuildings(city, nx, ny, p.radius);
  // Keep the player out of the marina water.
  p.x = clamp(pos.x, 14, 3586);
  p.y = clamp(pos.y, 14, 2586);
  if (p.y > 2330 && p.x > 3050) p.y = 2330;
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.shootCd = Math.max(0, p.shootCd - dt);
  p.hurtCd = Math.max(0, p.hurtCd - dt);
  if (sounds) sounds.setEngine(0);
}

// Punch: short-range arc in front of the player. Returns peds/cops hit.
export function playerPunch(p, targets) {
  if (p.punchCd > 0) return [];
  p.punchCd = 0.38;
  const hit = [];
  for (const t of targets) {
    if (t.dead) continue;
    const d = dist(p.x, p.y, t.x, t.y);
    if (d < 52) {
      const a = angleTo(p.x, p.y, t.x, t.y);
      if (Math.abs(angleDiff(p.angle, a)) < 1.1) hit.push(t);
    }
  }
  return hit;
}

// Shoot toward a world point. Returns true if a shot was fired.
export function playerShoot(p, wx, wy) {
  if (p.shootCd > 0 || p.ammo <= 0) return false;
  p.shootCd = 0.28;
  p.ammo -= 1;
  p.angle = angleTo(p.x, p.y, wx, wy);
  return true;
}

// Bullet travel + hits. Bullets are plain objects {x,y,angle,speed,life,from}.
export function updateBullets(bullets, dt, city, targets, onHit) {
  for (const b of bullets) {
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    if (city && city.buildings && b.x > 0) {
      // Cheap building test: reuse the city's rect list.
      for (const bd of city.buildings) {
        if (b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) { b.dead = true; break; }
      }
      if (b.dead) continue;
    }
    for (const t of targets) {
      if (t.dead) continue;
      if (dist(b.x, b.y, t.x, t.y) < (t.radius || 12) + 4) {
        b.dead = true;
        onHit(t, b);
        break;
      }
    }
  }
  return bullets.filter((b) => !b.dead);
}

// --- Pedestrians: stroll sidewalks, panic and flee from danger ---
export function updatePed(ped, dt, city, rng, danger) {
  if (ped.dead) { ped.fallT += dt; return; }
  if (danger && dist(ped.x, ped.y, danger.x, danger.y) < 170) ped.panic = 2.2;
  if (ped.panic > 0) {
    ped.panic -= dt;
    const a = angleTo(danger.x, danger.y, ped.x, ped.y);
    ped.angle = a;
    const nx = ped.x + Math.cos(a) * 150 * dt;
    const ny = ped.y + Math.sin(a) * 150 * dt;
    const pos = collideCircleBuildings(city, nx, ny, ped.radius);
    ped.x = clamp(pos.x, 14, 3586);
    ped.y = clamp(pos.y, 14, 2586);
    return;
  }
  if (ped.wait > 0) { ped.wait -= dt; return; }
  const d = dist(ped.x, ped.y, ped.tx, ped.ty);
  if (d < 14) {
    const np = randomSidewalkPoint(rng);
    ped.tx = np.x; ped.ty = np.y;
    if (rng() < 0.25) ped.wait = range(rng, 1, 4);
    return;
  }
  ped.angle = angleTo(ped.x, ped.y, ped.tx, ped.ty);
  const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
  const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
  const pos = collideCircleBuildings(city, nx, ny, ped.radius);
  ped.x = clamp(pos.x, 14, 3586);
  ped.y = clamp(pos.y, 14, 2586);
}

// --- On-foot cop: runs at the player and punches on contact ---
export function updateCopFoot(cop, dt, city, player, onCatch) {
  if (cop.dead) return;
  cop.angle = angleTo(cop.x, cop.y, player.x, player.y);
  const nx = cop.x + Math.cos(cop.angle) * cop.speed * dt;
  const ny = cop.y + Math.sin(cop.angle) * cop.speed * dt;
  const pos = collideCircleBuildings(city, nx, ny, cop.radius);
  cop.x = clamp(pos.x, 14, 3586);
  cop.y = clamp(pos.y, 14, 2586);
  cop.punchCd = Math.max(0, cop.punchCd - dt);
  if (dist(cop.x, cop.y, player.x, player.y) < 30 && cop.punchCd <= 0) {
    cop.punchCd = 0.9;
    onCatch();
  }
}

// --- Drawing ---
export function drawPerson(ctx, x, y, angle, shirt, opts = {}) {
  const bob = opts.bob || 0;
  ctx.save();
  ctx.translate(x, y + bob);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, 7, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
  // Body.
  ctx.rotate(angle);
  ctx.fillStyle = shirt;
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
  // Facing nose / cap brim.
  ctx.fillStyle = '#f2c79b';
  ctx.beginPath(); ctx.arc(7, 0, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(9, -3, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(9, 3, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (opts.label) {
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(opts.label, x, y - 18);
  }
}

export function drawPickup(ctx, pk, t) {
  const bob = Math.sin(t * 3 + pk.bob) * 3;
  ctx.save();
  ctx.translate(pk.x, pk.y + bob);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, 10 - bob, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
  if (pk.kind === 'health') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-11, -11, 22, 22);
    ctx.fillStyle = '#e53935';
    ctx.fillRect(-3, -8, 6, 16);
    ctx.fillRect(-8, -3, 16, 6);
  } else if (pk.kind === 'ammo') {
    ctx.fillStyle = '#37474f';
    ctx.fillRect(-9, -11, 18, 22);
    ctx.fillStyle = '#ffb300';
    ctx.fillRect(-5, -8, 4, 16);
    ctx.fillRect(1, -8, 4, 16);
  } else {
    ctx.fillStyle = '#2e7d32';
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', 0, 5);
  }
  ctx.restore();
}
