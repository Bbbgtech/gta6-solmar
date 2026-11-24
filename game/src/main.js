// main.js — SOLMAR: the game loop, input, camera, wanted system, combat,
// pickups and saving. Wires the city, vehicles, people, missions, audio
// and HUD modules into one playable top-down open-world crime game.
import { makeRng, clamp, dist, angleDiff, angleTo } from './rng.js';
import { WORLD_W, WORLD_H, BEACH_Y, CITY, isRoad, resolveBuildingCollision, drawCity } from './city.js';
import { Car, TrafficCar, spawnParkedCars, spawnTraffic, spawnPoliceCar, separateCars } from './vehicles.js';
import { Player, Pedestrian, Cop, spawnPedestrians, spawnCops } from './people.js';
import { MissionRunner } from './missions.js';
import { SoundBank } from './audio.js';
import { drawHud, drawMinimap, drawStartScreen, drawPauseScreen, drawGameOverScreen } from './hud.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const SAVE_KEY = 'solmar-save-v1';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || null; // start | chase | mission | city

const s = {
  mode: 'start', // start | playing | paused | over
  time: 0,
  player: new Player(1500, 1650),
  cars: [],
  peds: [],
  cops: [],
  bullets: [],
  particles: [],
  missions: new MissionRunner(),
  sound: new SoundBank(),
  keys: {},
  mouse: { x: 0, y: 0, down: false },
  cam: { x: 1500, y: 1650, zoom: 1, view: { x: 0, y: 0, w: 1280, h: 720 } },
  gameOverReason: null,
  hasSave: false,
  startButtons: [],
  bustedTimer: 0,
  crashCooldown: 0,
  pedRespawn: 0,
  policeSpawnCooldown: 0,
  lastHurtAt: -99,
  autoDrive: false,
};

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ---- world setup -----------------------------------------------------------
function buildWorld() {
  const rng = makeRng(20261124);
  s.cars = [];
  s.cars.push(...spawnParkedCars(rng, 16));
  s.cars.push(...spawnTraffic(rng, 16));
  s.peds = spawnPedestrians(rng, 18);
  s.cops = spawnCops(rng, 4);
  s.bullets = [];
  s.particles = [];
  s.pickups = CITY.pickups.map(p => ({ ...p, taken: false, respawn: 0 }));
}
buildWorld();

// ---- save / load -----------------------------------------------------------
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}
function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: s.player.cash,
      missionIndex: s.missions.index,
      completed: s.missions.completed,
    }));
  } catch (e) {}
}
function applySave(save) {
  s.player.cash = save.cash || 250;
  s.missions.index = save.missionIndex || 0;
  s.missions.completed = save.completed || 0;
}
s.hasSave = !!loadSave();

// ---- helpers ----------------------------------------------------------------
s.clockText = function () {
  const mins = 8 * 60 + Math.floor(s.time);
  const hh = String(Math.floor(mins / 60) % 24).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return hh + ':' + mm + '  SOLMAR';
};
s.hintText = function () {
  if (s.mode !== 'playing') return '';
  if (s.player.inCar) return 'WASD drive  •  SPACE handbrake  •  E exit car  •  P pause';
  const near = nearestCar(s.player.x, s.player.y, 60);
  if (near) return 'Press E to ' + (near.parked ? 'take the car' : 'steal the car');
  if (s.missions.active) return s.missions.objectiveText();
  return 'M — start mission  •  E — steal a car  •  F — punch  •  Click — shoot';
};
function nearestCar(x, y, maxD) {
  let best = null, bd = maxD;
  for (const c of s.cars) {
    const d = dist(x, y, c.x, c.y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function screenToWorld(sx, sy) {
  return {
    x: s.cam.view.x + sx / s.cam.zoom,
    y: s.cam.view.y + sy / s.cam.zoom,
  };
}
function burst(x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    s.particles.push({
      x, y,
      vx: Math.cos(a) * speed * (0.4 + Math.random() * 0.6),
      vy: Math.sin(a) * speed * (0.4 + Math.random() * 0.6),
      life: 0.5 + Math.random() * 0.4, max: 0.9,
      color, size: 2 + Math.random() * 3,
    });
  }
}

// ---- combat -----------------------------------------------------------------
function punch() {
  const p = s.player;
  if (p.punchCooldown > 0 || p.inCar) return;
  p.punchCooldown = 0.4;
  s.sound.punch();
  const fx = p.x + Math.cos(p.angle) * 26;
  const fy = p.y + Math.sin(p.angle) * 26;
  burst(fx, fy, '#ffe9a8', 6, 120);
  for (const ped of s.peds) {
    if (dist(fx, fy, ped.x, ped.y) < 34) {
      ped.flee = { x: p.x, y: p.y };
      ped.fleeTime = 3;
      p.addCrime(15, s.time);
      burst(ped.x, ped.y, '#ffd23d', 8, 160);
    }
  }
  for (const cop of s.cops) {
    if (dist(fx, fy, cop.x, cop.y) < 34) {
      cop.x += Math.cos(p.angle) * 46;
      cop.y += Math.sin(p.angle) * 46;
      p.addCrime(20, s.time);
      burst(cop.x, cop.y, '#ff6a5a', 8, 160);
    }
  }
}
function shoot() {
  const p = s.player;
  if (p.shootCooldown > 0 || p.ammo <= 0 || p.inCar) return;
  p.ammo--;
  p.shootCooldown = 0.28;
  s.sound.shoot();
  const w = screenToWorld(s.mouse.x, s.mouse.y);
  const a = angleTo(p.x, p.y, w.x, w.y);
  p.angle = a;
  s.bullets.push({
    x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16,
    vx: Math.cos(a) * 760, vy: Math.sin(a) * 760,
    life: 0.6,
  });
  p.addCrime(10, s.time);
}

// ---- cars: enter / exit / steal ---------------------------------------------
function tryEnterCar() {
  const p = s.player;
  if (p.inCar) {
    // Exit: step out beside the car.
    const car = p.inCar;
    car.parked = true;
    car.speed = 0;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    p.angle = car.angle;
    p.inCar = null;
    resolveBuildingCollision(p, p.radius);
    return;
  }
  const car = nearestCar(p.x, p.y, 62);
  if (!car) return;
  if (car.kind === 'police') {
    // Stealing a police cruiser is the boldest crime in the book.
    p.addCrime(35, s.time);
  } else if (car.parked) {
    p.addCrime(20, s.time);
  } else {
    // A driven car: the driver gets out and runs.
    p.addCrime(25, s.time);
    const driver = new Pedestrian(makeRng((Math.random() * 1e9) | 0));
    driver.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
    driver.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
    driver.flee = { x: p.x, y: p.y };
    driver.fleeTime = 4;
    s.peds.push(driver);
    if (car.driver) car.driver = null;
  }
  car.parked = false;
  car.kind = car.kind === 'police' ? 'police' : 'player';
  p.inCar = car;
  p.x = car.x; p.y = car.y;
  s.sound.horn();
}

// ---- police ------------------------------------------------------------------
function policeTargetCount() {
  return Math.min(s.player.wantedStars, 3);
}
function updatePolice(dt) {
  const p = s.player;
  const policeCars = s.cars.filter(c => c.kind === 'police');
  // Spawn more interceptors while wanted.
  if (policeCars.length < policeTargetCount()) {
    s.policeSpawnCooldown -= dt;
    if (s.policeSpawnCooldown <= 0) {
      s.policeSpawnCooldown = 3;
      const a = Math.random() * Math.PI * 2;
      const d = 520;
      const x = clamp(p.x + Math.cos(a) * d, 80, WORLD_W - 80);
      const y = clamp(p.y + Math.sin(a) * d, 80, BEACH_Y - 80);
      const car = spawnPoliceCar(x, y);
      s.cars.push(car);
    }
  }
  // Each police car chases and rams.
  for (const car of policeCars) {
    const d = dist(car.x, car.y, p.x, p.y);
    if (p.wantedStars === 0 && d > 900) {
      s.cars.splice(s.cars.indexOf(car), 1); // heat gone: they give up and leave
      continue;
    }
    const top = 420 + p.wantedStars * 18;
    car.steerToward(p.x, p.y, dt, top);
    if (resolveBuildingCollision(car, car.radius)) car.speed *= 0.6;
    if (d < 44) {
      // Ram!
      if (s.crashCooldown <= 0) {
        s.crashCooldown = 0.9;
        s.sound.crash();
        burst(car.x, car.y, '#ffd23d', 12, 200);
        if (p.inCar) {
          p.hurt(6, s.time);
          p.inCar.speed *= 0.55;
          p.inCar.crashed = 0.5;
          car.speed *= 0.5;
        } else {
          s.bustedTimer += dt;
          if (s.bustedTimer > 0.7) gameOver('busted');
        }
      }
    }
    // Speeding past a police car is a crime too.
    if (p.inCar && Math.abs(p.inCar.speed) > 380 && d < 380) {
      p.addCrime(3 * dt, s.time);
    }
  }
  // On-foot cops grab the player.
  for (const cop of s.cops) {
    if (p.wantedStars > 0 && !p.inCar && dist(cop.x, cop.y, p.x, p.y) < 28) {
      s.bustedTimer += dt;
      if (s.bustedTimer > 0.7) gameOver('busted');
    }
  }
  if (p.wantedStars === 0) s.bustedTimer = 0;
  // Siren when a police car is near.
  const near = policeCars.some(c => dist(c.x, c.y, p.x, p.y) < 700);
  s.sound.siren(near && p.wantedStars > 0);
}

// ---- missions ------------------------------------------------------------------
function startMission() {
  if (s.missions.active || s.missions.done) return;
  const m = s.missions.start(s.time);
  if (!m) return;
  if (m.def.id === 'lose-the-cops') {
    s.player.heat = 60;
    s.player.wantedStars = 3;
    s.player.lastCrime = s.time;
  }
  s.sound.pickup();
}

// ---- game over / restart -------------------------------------------------------
function gameOver(reason) {
  if (s.mode !== 'playing') return;
  s.mode = 'over';
  s.gameOverReason = reason;
  s.sound.siren(false);
  s.sound.fail();
  writeSave();
}
function restart(continueSave) {
  const save = continueSave ? loadSave() : null;
  buildWorld();
  s.player = new Player(1500, 1650);
  s.missions = new MissionRunner();
  s.time = 0;
  s.gameOverReason = null;
  s.bustedTimer = 0;
  s.cam.zoom = 1;
  if (save) applySave(save);
  s.mode = 'playing';
  s.sound.ensure();
}

// ---- update ---------------------------------------------------------------------
function update(dt) {
  s.time += dt;
  const p = s.player;
  p.punchCooldown = Math.max(0, p.punchCooldown - dt);
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);
  p.hurtFlash = Math.max(0, p.hurtFlash - dt);
  s.crashCooldown = Math.max(0, s.crashCooldown - dt);

  // ---- input ---------------------------------------------------------------
  const k = s.keys;
  const up = k['KeyW'] || k['ArrowUp'];
  const down = k['KeyS'] || k['ArrowDown'];
  const left = k['KeyA'] || k['ArrowLeft'];
  const right = k['KeyD'] || k['ArrowRight'];
  const brake = k['Space'];
  if (s.autoDrive) { /* scripted throttle for staged shots */ }

  if (p.inCar) {
    const car = p.inCar;
    const throttle = (up ? 1 : 0) + (down ? -1 : 0) + (s.autoDrive ? 1 : 0);
    const steer = (left ? -1 : 0) + (right ? 1 : 0);
    car.drive(dt, throttle, steer, !!brake);
    if (resolveBuildingCollision(car, car.radius)) {
      if (Math.abs(car.speed) > 260 && s.crashCooldown <= 0) {
        s.crashCooldown = 0.8;
        s.sound.crash();
        p.hurt(4, s.time);
        burst(car.x, car.y, '#ffd23d', 10, 180);
      }
      car.speed *= 0.55;
    }
    p.x = car.x; p.y = car.y; p.angle = car.angle;
    s.sound.setEngine(car.speed, car.maxSpeed);
    // Running over pedestrians is a crime.
    for (let i = s.peds.length - 1; i >= 0; i--) {
      const ped = s.peds[i];
      if (Math.abs(car.speed) > 60 && dist(car.x, car.y, ped.x, ped.y) < 26) {
        s.peds.splice(i, 1);
        p.addCrime(30, s.time);
        burst(ped.x, ped.y, '#ff6a5a', 14, 200);
        s.sound.crash();
        car.speed *= 0.8;
      }
    }
  } else {
    let mx = (right ? 1 : 0) - (left ? 1 : 0);
    let my = (down ? 1 : 0) - (up ? 1 : 0);
    if (mx || my) {
      const len = Math.hypot(mx, my);
      mx /= len; my /= len;
      p.x += mx * p.speed * dt;
      p.y += my * p.speed * dt;
      p.angle = Math.atan2(my, mx);
      p.walkPhase += dt * 11;
    }
    resolveBuildingCollision(p, p.radius);
    p.x = clamp(p.x, 20, WORLD_W - 20);
    p.y = clamp(p.y, 20, WORLD_H - 20);
    s.sound.setEngine(0, 1);
  }

  // ---- traffic, peds, cops ---------------------------------------------------
  const danger = p.inCar ? { x: p.inCar.x, y: p.inCar.y } : null;
  for (const car of s.cars) {
    if (car instanceof TrafficCar) car.update(dt, s.cars);
  }
  separateCars(s.cars);
  for (const ped of s.peds) ped.update(dt, danger);
  for (const cop of s.cops) cop.update(dt, p);

  // Traffic cars hitting the player's car: a shunt, not a pile-up.
  if (p.inCar) {
    for (const car of s.cars) {
      if (car === p.inCar || car.kind === 'police') continue;
      if (dist(car.x, car.y, p.inCar.x, p.inCar.y) < 38) {
        if (Math.abs(p.inCar.speed) > 200 && s.crashCooldown <= 0) {
          s.crashCooldown = 0.8;
          s.sound.crash();
          p.hurt(3, s.time);
          burst(p.inCar.x, p.inCar.y, '#ffd23d', 10, 180);
        }
        p.inCar.speed *= 0.92;
        car.speed = Math.max(0, car.speed - 120 * dt);
      }
    }
  }

  // ---- bullets -----------------------------------------------------------------
  for (let i = s.bullets.length - 1; i >= 0; i--) {
    const b = s.bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0;
    for (let j = s.peds.length - 1; j >= 0; j--) {
      if (dist(b.x, b.y, s.peds[j].x, s.peds[j].y) < 15) {
        burst(s.peds[j].x, s.peds[j].y, '#ff6a5a', 10, 170);
        s.peds.splice(j, 1);
        p.addCrime(25, s.time);
        dead = true;
        break;
      }
    }
    if (!dead) {
      for (const cop of s.cops) {
        if (dist(b.x, b.y, cop.x, cop.y) < 15) {
          cop.x += b.vx * 0.03; cop.y += b.vy * 0.03;
          p.addCrime(25, s.time);
          burst(cop.x, cop.y, '#ff6a5a', 10, 170);
          dead = true;
          break;
        }
      }
    }
    if (dead) s.bullets.splice(i, 1);
  }

  // ---- pickups -------------------------------------------------------------------
  for (const pk of s.pickups) {
    if (pk.taken) {
      pk.respawn -= dt;
      if (pk.respawn <= 0) pk.taken = false;
      continue;
    }
    if (dist(p.x, p.y, pk.x, pk.y) < 34) {
      pk.taken = true;
      pk.respawn = 30;
      if (pk.kind === 'health') { p.health = Math.min(100, p.health + 40); s.sound.pickup(); }
      if (pk.kind === 'ammo') { p.ammo += 12; s.sound.pickup(); }
      if (pk.kind === 'cash') { p.cash += 100; s.sound.cash(); }
      burst(pk.x, pk.y, '#7de08a', 12, 140);
    }
  }

  // ---- wanted, health, missions -----------------------------------------------------
  const policeNear = s.cars.some(c => c.kind === 'police' && dist(c.x, c.y, p.x, p.y) < 420);
  p.coolDown(dt, s.time, policeNear);
  if (s.time - s.lastHurtAt > 10 && p.health > 0 && p.health < 100) {
    p.health = Math.min(100, p.health + 1.5 * dt);
  }
  updatePolice(dt);
  const result = s.missions.update(dt, s.time, p);
  if (result === 'complete') {
    const def = s.missions.lastCompletedDef;
    if (def) p.cash += def.reward;
    s.sound.jingle();
    writeSave();
  } else if (result === 'fail') {
    s.sound.fail();
  }

  // ---- pedestrians respawn ------------------------------------------------------------
  s.pedRespawn -= dt;
  if (s.peds.length < 16 && s.pedRespawn <= 0) {
    s.pedRespawn = 2;
    s.peds.push(new Pedestrian(makeRng((Math.random() * 1e9) | 0)));
  }

  // ---- particles ------------------------------------------------------------------------
  for (let i = s.particles.length - 1; i >= 0; i--) {
    const pt = s.particles[i];
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vx *= 0.94; pt.vy *= 0.94;
    pt.life -= dt;
    if (pt.life <= 0) s.particles.splice(i, 1);
  }

  // ---- death -------------------------------------------------------------------------------
  if (p.health <= 0) gameOver('wasted');

  // ---- camera ----------------------------------------------------------------------------------
  const targetX = p.x, targetY = p.y;
  s.cam.x += (targetX - s.cam.x) * Math.min(1, dt * 6);
  s.cam.y += (targetY - s.cam.y) * Math.min(1, dt * 6);
  const vw = canvas.width / s.cam.zoom, vh = canvas.height / s.cam.zoom;
  s.cam.view = {
    x: clamp(s.cam.x - vw / 2, 0, WORLD_W - vw),
    y: clamp(s.cam.y - vh / 2, 0, WORLD_H - vh),
    w: vw, h: vh,
  };
}

// ---- render --------------------------------------------------------------------------------------
function drawWaypoint(ctx) {
  const wp = s.missions.waypoint(s.player);
  if (!wp) return;
  const pulse = 1 + Math.sin(s.time * 5) * 0.18;
  ctx.save();
  ctx.translate(wp.x, wp.y);
  // Beam.
  ctx.fillStyle = 'rgba(255,210,61,0.16)';
  ctx.fillRect(-14, -220, 28, 220);
  // Diamond marker.
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#ffd23d';
  ctx.strokeStyle = '#7a5a00';
  ctx.lineWidth = 2;
  const r = 16 * pulse;
  ctx.fillRect(-r / 2, -r / 2, r, r);
  ctx.strokeRect(-r / 2, -r / 2, r, r);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = '#222';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(wp.label, 0, 44);
  ctx.textAlign = 'left';
  ctx.restore();
}

function render() {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (s.mode === 'start') {
    drawStartScreen(ctx, W, H, s);
    return;
  }
  const v = s.cam.view;
  ctx.save();
  ctx.scale(s.cam.zoom, s.cam.zoom);
  ctx.translate(-v.x, -v.y);
  drawCity(ctx, s.cam, s.time);
  // Pickups.
  for (const pk of s.pickups) {
    if (pk.taken) continue;
    ctx.save();
    ctx.translate(pk.x, pk.y);
    const bob = Math.sin(s.time * 3 + pk.x) * 3;
    ctx.fillStyle = pk.kind === 'health' ? '#2fae4e' : pk.kind === 'ammo' ? '#e8a13d' : '#7de08a';
    ctx.beginPath(); ctx.arc(0, bob, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pk.kind === 'health' ? '+' : pk.kind === 'ammo' ? 'A' : '$', 0, bob + 5);
    ctx.textAlign = 'left';
    ctx.restore();
  }
  drawWaypoint(ctx);
  // Cars, sorted so lower ones draw over higher ones.
  const carsSorted = [...s.cars].sort((a, b) => a.y - b.y);
  for (const car of carsSorted) car.draw(ctx);
  for (const ped of s.peds) ped.draw(ctx);
  for (const cop of s.cops) cop.draw(ctx);
  if (!s.player.inCar) s.player.draw(ctx);
  // Bullets.
  ctx.strokeStyle = '#ffe94d';
  ctx.lineWidth = 3;
  for (const b of s.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Particles.
  for (const pt of s.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // Screen-space HUD.
  drawHud(ctx, W, H, s);
  drawMinimap(ctx, W, H, s);
  if (s.mode === 'paused') drawPauseScreen(ctx, W, H);
  if (s.mode === 'over') drawGameOverScreen(ctx, W, H, s);
}

// ---- main loop -----------------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (s.mode === 'playing') update(dt);
  render();
  if (!window.__solmarReady) {
    s._frames = (s._frames || 0) + 1;
    if (s._frames >= 3) window.__solmarReady = true;
  }
  if (window.__solmarReady) {
    window.__solmar = {
      mode: s.mode,
      wanted: s.player.wantedStars,
      cash: s.player.cash,
      cars: s.cars.length,
      peds: s.peds.length,
      px: Math.round(s.player.x),
      py: Math.round(s.player.y),
      inCar: !!s.player.inCar,
      mission: s.missions.active ? s.missions.active.def.id : null,
    };
  }
  requestAnimationFrame(frame);
}

// ---- input --------------------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  s.sound.ensure();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  s.keys[e.code] = true;
  if (e.code === 'Enter' && s.mode === 'start') restart(false);
  if (e.code === 'KeyM' && s.mode === 'playing') startMission();
  if (e.code === 'KeyE' && s.mode === 'playing') tryEnterCar();
  if (e.code === 'KeyF' && s.mode === 'playing') punch();
  if ((e.code === 'KeyP' || e.code === 'Escape') && (s.mode === 'playing' || s.mode === 'paused')) {
    s.mode = s.mode === 'playing' ? 'paused' : 'playing';
  }
  if (e.code === 'KeyR' && (s.mode === 'over' || s.mode === 'paused' || s.mode === 'playing')) restart(false);
});
window.addEventListener('keyup', (e) => { s.keys[e.code] = false; });
canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  s.mouse.x = e.clientX - r.left;
  s.mouse.y = e.clientY - r.top;
});
canvas.addEventListener('mousedown', (e) => {
  s.sound.ensure();
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  s.mouse.x = x; s.mouse.y = y;
  if (s.mode === 'start') {
    for (const b of s.startButtons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        restart(b.id === 'continue');
        return;
      }
    }
    return;
  }
  if (s.mode === 'over') { restart(false); return; }
  if (s.mode === 'playing') {
    if (s.player.inCar) s.sound.horn();
    else shoot();
  }
});

// ---- staged screenshots ---------------------------------------------------------------------------
// ?shot= stages a deterministic scene so screenshots show the real game:
// start = title screen; chase = wanted-3 car chase; mission = on-foot
// pickup; city = zoomed-out downtown. Each pre-steps the world a fixed
// number of ticks so the streets are already busy.
function stageShot() {
  if (!SHOT) return;
  const rng = makeRng(777);
  if (SHOT === 'start') {
    s.mode = 'start';
    return;
  }
  s.mode = 'playing';
  const step = (n) => { for (let i = 0; i < n; i++) update(1 / 60); };
  if (SHOT === 'chase') {
    const car = new Car(1500, 1150, -Math.PI / 2, { color: '#d94f3d', kind: 'player', maxSpeed: 520 });
    car.speed = 300;
    s.cars.push(car);
    s.player.inCar = car;
    s.player.x = car.x; s.player.y = car.y;
    s.player.heat = 60; s.player.wantedStars = 3; s.player.lastCrime = 0;
    s.cars.push(spawnPoliceCar(1500, 1500));
    s.cars.push(spawnPoliceCar(1440, 1560));
    s.missions.index = 1; // "Lose the Heat" — the wanted chase
    s.missions.start(0);
    s.missions.banner = null; // keep the staged frame clean for the photo
    s.autoDrive = true;
    s.cam.x = 1500; s.cam.y = 1150;
    step(150);
  } else if (SHOT === 'mission') {
    s.player.x = 2470; s.player.y = 2040;
    s.player.angle = Math.PI / 2;
    s.missions.start(0);
    s.missions.banner = null; // keep the staged frame clean for the photo
    s.cam.x = 2470; s.cam.y = 2040;
    step(90);
  } else if (SHOT === 'city') {
    const car = new Car(1500, 1400, 0, { color: '#3d7fd9', kind: 'player', maxSpeed: 520 });
    car.speed = 260;
    s.cars.push(car);
    s.player.inCar = car;
    s.player.x = car.x; s.player.y = car.y;
    s.cam.zoom = 0.42;
    s.autoDrive = true;
    s.cam.x = 1500; s.cam.y = 1400;
    step(120);
  }
  s.autoDrive = false;
}
stageShot();
requestAnimationFrame(frame);
