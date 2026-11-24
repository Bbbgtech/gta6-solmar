// SOLMAR — main game: state machine, input, camera, wanted level,
// police response, car stealing, combat wiring, save/load and the
// deterministic ?shot= staging used for the entry's screenshots.
import { buildCity, drawCity, WORLD_W, WORLD_H, AVENUES, STREETS, isRoad, randomRoadPoint, randomSidewalkPoint, hitsBuilding } from './city.js';
import { makeRng, clamp, dist, angleTo, pick, range } from './rng.js';
import { SoundBank } from './audio.js';
import { makeCar, drivePlayerCar, updateTraffic, updateCopCar, spawnCopCar, drawCar, CAR_COLORS } from './vehicles.js';
import { makePlayer, makePed, makeCopOnFoot, makePickup, updatePlayerOnFoot, playerPunch, playerShoot, updateBullets, updatePed, updateCopFoot, drawPerson, drawPickup } from './people.js';
import { MISSIONS, makeMissionState, currentMission, startMission, updateMissions, drawWaypoint } from './missions.js';
import { drawHUD, drawStartScreen, drawPauseScreen, drawGameOverScreen } from './hud.js';

const SAVE_KEY = 'solmar-save-v1';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') || 1);
const SHOT = params.get('shot') || '';
const rng = makeRng(SEED * 7919 + 13);

const sounds = new SoundBank();

const game = {
  state: 'start', // 'start' | 'play' | 'pause' | 'gameover'
  time: 0,
  clockMin: 9 * 60 + 24, // in-game clock starts 09:24
  wanted: 0,
  lastCrimeAt: -999,
  wantedDecayAt: 0,
  copSpawnAt: 0,
  speedCrimeAt: -999,
  crashCd: 0,
  city: null,
  cityAvenues: AVENUES,
  cityStreets: STREETS,
  player: null,
  cars: [],
  peds: [],
  copsFoot: [],
  pickups: [],
  bullets: [],
  missions: makeMissionState(),
  cam: { x: 0, y: 0, w: 1280, h: 720, zoom: 1 },
  mouse: { x: 0, y: 0, down: false },
  keys: {},
  save: null,
  buttons: [],
  shotMode: SHOT !== '',
  frame: 0,
};

function fitCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// ---------- Save / load ----------
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s.cash !== 'number') return null;
    return s;
  } catch (e) { return null; }
}
function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: game.player.cash,
      missionIndex: game.missions.index,
      savedAt: Date.now(),
    }));
  } catch (e) { /* storage is best-effort */ }
}

// ---------- World setup ----------
function spawnTraffic(n) {
  for (let i = 0; i < n; i++) {
    const p = randomRoadPoint(rng);
    const horizontal = AVENUES.some((ay) => Math.abs(p.y - ay) <= 50);
    const dir = horizontal ? (rng() < 0.5 ? 0 : 2) : (rng() < 0.5 ? 1 : 3);
    const c = makeCar(p.x, p.y, [0, Math.PI / 2, Math.PI, -Math.PI / 2][dir], pick(rng, CAR_COLORS), { kind: 'traffic', dir });
    c.speed = 100;
    game.cars.push(c);
  }
}

function spawnParked(n) {
  const spots = [...game.city.parkingSpots];
  for (let i = 0; i < n && spots.length; i++) {
    const s = spots.splice(Math.floor(rng() * spots.length), 1)[0];
    game.cars.push(makeCar(s.x, s.y, s.angle, pick(rng, CAR_COLORS), { kind: 'parked' }));
  }
}

function spawnPeds(n) {
  for (let i = 0; i < n; i++) {
    const p = randomSidewalkPoint(rng);
    game.peds.push(makePed(p.x, p.y, rng));
  }
}

function placePickups() {
  const spots = [
    { x: 1800, y: 1150, kind: 'health' },
    { x: 1200, y: 1450, kind: 'health' },
    { x: 3000, y: 2100, kind: 'health' },
    { x: 900, y: 800, kind: 'ammo' },
    { x: 2700, y: 1300, kind: 'ammo' },
    { x: 2100, y: 1800, kind: 'cash' },
    { x: 600, y: 1800, kind: 'cash' },
  ];
  for (const s of spots) game.pickups.push({ ...makePickup(s.x, s.y, s.kind), takenAt: -999 });
}

function newWorld() {
  game.city = buildCity(SEED);
  game.player = makePlayer(1200, 1420);
  game.cars = [];
  game.peds = [];
  game.copsFoot = [];
  game.pickups = [];
  game.bullets = [];
  game.missions = makeMissionState();
  game.wanted = 0;
  game.lastCrimeAt = -999;
  game.clockMin = 9 * 60 + 24;
  spawnTraffic(16);
  spawnParked(10);
  spawnPeds(22);
  placePickups();
}

// ---------- Wanted level ----------
function addWanted(n, reason) {
  const before = game.wanted;
  game.wanted = clamp(game.wanted + n, 0, 5);
  game.lastCrimeAt = game.time;
  if (game.wanted > before) sounds.wantedUp();
}

function updateWanted(dt) {
  // Cool down: no crime for a while, then one star fades at a time.
  if (game.wanted > 0 && game.time - game.lastCrimeAt > 16) {
    game.wantedDecayAt += dt;
    if (game.wantedDecayAt > 7) {
      game.wantedDecayAt = 0;
      game.wanted = Math.max(0, game.wanted - 1);
    }
  } else {
    game.wantedDecayAt = 0;
  }
  // Police response: cop cars up to the wanted level, foot cops when on foot.
  const wantCars = game.player.inCar ? game.wanted : Math.min(game.wanted, 2);
  const cops = game.cars.filter((c) => c.kind === 'cop' && !c.dead);
  if (cops.length < wantCars && game.time > game.copSpawnAt) {
    game.copSpawnAt = game.time + 1.6;
    game.cars.push(spawnCopCar(game.city, rng, game.player.x, game.player.y));
  }
  if (cops.length > wantCars) {
    // Extra cops give up and drive off when the heat dies.
    const extra = cops[cops.length - 1];
    extra.dead = true;
  }
  if (game.wanted === 0) {
    for (const c of game.cars) if (c.kind === 'cop') c.dead = true;
    game.copsFoot = [];
  }
  const wantFoot = game.player.inCar ? 0 : Math.min(game.wanted, 3);
  while (game.copsFoot.length < wantFoot) {
    const a = range(rng, 0, Math.PI * 2);
    game.copsFoot.push(makeCopOnFoot(
      clamp(game.player.x + Math.cos(a) * 500, 40, 3560),
      clamp(game.player.y + Math.sin(a) * 500, 40, 2500),
    ));
  }
  while (game.copsFoot.length > wantFoot) game.copsFoot.pop();
  sounds.setSiren(game.wanted > 0);
}

// ---------- Helpers the HUD / missions call ----------
game.playerPos = () => ({ x: game.player.x, y: game.player.y });
game.playerInCar = () => !!game.player.inCar;
game.missionWaypoint = () => {
  const m = currentMission(game.missions);
  return m && m.waypoint ? m.waypoint : null;
};
game.addCash = (n) => { game.player.cash += n; sounds.cash(); writeSave(); };
game.setWanted = (n) => { game.wanted = clamp(n, 0, 5); game.lastCrimeAt = game.time; };
game.clockText = () => {
  const h = Math.floor(game.clockMin / 60) % 24;
  const m = Math.floor(game.clockMin % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}  SOLMAR`;
};
game.contextHint = () => {
  const p = game.player;
  if (p.inCar) return 'E exit car · Space handbrake';
  const near = nearestCar(75);
  if (near) return near.kind === 'cop' ? 'E — steal police car (!!)' : 'E — steal car';
  const m = currentMission(game.missions);
  if (game.missions.active && m && m.waypoint && dist(p.x, p.y, m.waypoint.x, m.waypoint.y) < 80) return 'E — interact';
  if (!game.missions.active && m) return 'M — start job: ' + m.title;
  return 'WASD move · E steal car · F punch';
};

// ---------- Interaction ----------
function nearestCar(maxD) {
  let best = null, bestD = maxD;
  for (const c of game.cars) {
    if (c.dead || c === game.player.inCar) continue;
    const d = dist(game.player.x, game.player.y, c.x, c.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function enterCar(car) {
  const p = game.player;
  if (car.kind === 'cop') addWanted(2, 'stole police car');
  else addWanted(1, 'stole car');
  // The driver gets out and panics.
  if (car.kind === 'traffic') {
    const d = makePed(car.x + 30, car.y + 30, rng);
    d.panic = 3;
    game.peds.push(d);
  }
  car.kind = 'player';
  car.parked = false;
  car.driver = 'player';
  p.inCar = car;
  p.x = car.x; p.y = car.y;
  sounds.door();
}

function exitCar() {
  const p = game.player;
  const car = p.inCar;
  if (!car) return;
  car.kind = 'parked';
  car.driver = null;
  car.speed = 0;
  p.inCar = null;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  const pos = { x: p.x, y: p.y };
  p.x = clamp(pos.x, 14, 3586);
  p.y = clamp(pos.y, 14, 2586);
  sounds.door();
}

function hurtPlayer(n) {
  const p = game.player;
  if (p.hurtCd > 0 || game.state !== 'play') return;
  p.health -= n;
  p.hurtCd = 0.5;
  sounds.hurt();
  if (p.health <= 0) {
    p.health = 0;
    game.state = 'gameover';
    writeSave();
  }
}

// ---------- Input ----------
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'handbrake',
};
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  const k = KEYMAP[e.code];
  if (k) game.keys[k] = true;
  if (e.repeat) return;
  sounds.ensure();
  if (e.code === 'KeyM') {
    if (game.state === 'play' && !game.missions.active) startMission(game.missions, game.time, game);
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (game.state === 'play') game.state = 'pause';
    else if (game.state === 'pause') game.state = 'play';
  }
  if (e.code === 'KeyR') {
    if (game.state === 'gameover' || game.state === 'pause') startGame(false);
  }
  if (e.code === 'Enter') {
    if (game.state === 'start') startGame(false);
  }
  if (e.code === 'KeyE') tryInteract();
  if (e.code === 'KeyF') tryPunch();
});
window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) game.keys[k] = false;
});
canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  game.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
  game.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
});
canvas.addEventListener('mousedown', (e) => {
  sounds.ensure();
  const r = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (canvas.width / r.width);
  const my = (e.clientY - r.top) * (canvas.height / r.height);
  if (game.state === 'start') {
    for (const b of game.buttons) {
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        if (b.label.startsWith('CONTINUE')) startGame(true);
        else startGame(false);
        return;
      }
    }
    return;
  }
  if (game.state !== 'play') return;
  // Shoot toward the mouse.
  const wx = game.cam.x + mx / game.cam.zoom;
  const wy = game.cam.y + my / game.cam.zoom;
  if (!game.player.inCar && playerShoot(game.player, wx, wy)) {
    sounds.shoot();
    game.bullets.push({
      x: game.player.x + Math.cos(game.player.angle) * 20,
      y: game.player.y + Math.sin(game.player.angle) * 20,
      angle: game.player.angle, speed: 900, life: 0.9, from: 'player',
    });
  }
});

function tryInteract() {
  if (game.state !== 'play') return;
  const p = game.player;
  if (p.inCar) { exitCar(); return; }
  const car = nearestCar(75);
  if (car) { enterCar(car); return; }
  const m = currentMission(game.missions);
  if (game.missions.active && m && m.waypoint && dist(p.x, p.y, m.waypoint.x, m.waypoint.y) < 80) {
    // Picking up the package is the mission's own completion trigger.
    sounds.pickup();
  }
}

function tryPunch() {
  if (game.state !== 'play' || game.player.inCar) return;
  const p = game.player;
  const targets = [...game.peds, ...game.copsFoot];
  const hit = playerPunch(p, targets);
  if (hit.length) {
    sounds.punch();
    for (const t of hit) {
      if (t.shirt) { // pedestrian: knocked down, and that is a crime
        t.dead = true; t.fallT = 0;
        addWanted(1, 'assault');
      } else { // cop on foot: knocked down, big heat
        t.dead = true;
        addWanted(2, 'assaulted police');
      }
    }
  }
}

// ---------- Game flow ----------
function startGame(continueSave) {
  newWorld();
  if (continueSave && game.save) {
    game.player.cash = game.save.cash || 0;
    game.missions.index = Math.min(game.save.missionIndex || 0, MISSIONS.length);
  }
  game.state = 'play';
  sounds.ensure();
}

function gameOverReset() { startGame(false); }

// ---------- Update ----------
function update(dt) {
  game.time += dt;
  game.clockMin += dt * 0.6; // a game minute every ~1.7 real seconds
  const p = game.player;
  game.crashCd = Math.max(0, game.crashCd - dt);

  if (game.state === 'start') {
    // Slow cinematic pan over downtown behind the title.
    const t = game.time * 0.05;
    game.cam.x = 1200 + Math.cos(t) * 500 - game.cam.w / 2;
    game.cam.y = 1500 + Math.sin(t * 0.7) * 300 - game.cam.h / 2;
    return;
  }
  if (game.state !== 'play') return;

  // Player movement.
  if (p.inCar) {
    const car = p.inCar;
    const offroad = drivePlayerCar(car, game.keys, dt, game.city, sounds);
    p.x = car.x; p.y = car.y; p.angle = car.angle;
    // Speeding past the police is a crime.
    if (Math.abs(car.speed) > 430) {
      const nearCop = game.cars.some((c) => c.kind === 'cop' && dist(c.x, c.y, p.x, p.y) < 320);
      if (nearCop && game.time - game.speedCrimeAt > 10) {
        game.speedCrimeAt = game.time;
        addWanted(1, 'speeding');
      }
    }
    // Running over pedestrians is a crime.
    for (const ped of game.peds) {
      if (ped.dead) continue;
      if (dist(car.x, car.y, ped.x, ped.y) < 30 && Math.abs(car.speed) > 60) {
        ped.dead = true; ped.fallT = 0;
        addWanted(1, 'hit pedestrian');
        sounds.crash();
      }
    }
    // Crash into a building at speed hurts.
    if (Math.abs(car.speed) > 380 && hitsBuilding(game.city, car.x, car.y, 16) && game.crashCd <= 0) {
      game.crashCd = 1;
      hurtPlayer(6);
      sounds.crash();
    }
  } else {
    updatePlayerOnFoot(p, game.keys, dt, game.city, sounds);
  }

  // Traffic + police cars.
  for (const c of game.cars) {
    if (c.dead) continue;
    if (c.kind === 'traffic') updateTraffic(c, dt, game.city, game.cars, rng);
    else if (c.kind === 'cop') {
      const d = updateCopCar(c, dt, game.city, p, game.cars, sounds);
      // Ramming the player hurts.
      if (d < 46) {
        if (p.inCar) { hurtPlayer(5); }
        else hurtPlayer(8);
        c.speed *= 0.4;
        sounds.crash();
      }
    }
  }
  // Car-vs-car bumps: slow both, small crash sound for the player.
  for (const c of game.cars) {
    if (c.dead || c.kind === 'parked') continue;
    for (const o of game.cars) {
      if (o === c || o.dead) continue;
      if (dist(c.x, c.y, o.x, o.y) < 46) {
        const push = (46 - dist(c.x, c.y, o.x, o.y)) / 2;
        const a = angleTo(o.x, o.y, c.x, c.y);
        c.x += Math.cos(a) * push; c.y += Math.sin(a) * push;
        if ((c.kind === 'player' || o.kind === 'player') && Math.abs(c.speed) > 120 && game.crashCd <= 0) {
          game.crashCd = 0.8;
          sounds.crash();
        }
        c.speed *= 0.96; o.speed *= 0.96;
      }
    }
  }
  game.cars = game.cars.filter((c) => !c.dead);

  // Pedestrians + foot cops.
  const danger = p.inCar ? { x: p.x, y: p.y } : null;
  for (const ped of game.peds) {
    if (!ped.dead) updatePed(ped, dt, game.city, rng, danger && Math.abs(p.inCar.speed) > 200 ? danger : null);
  }
  // Fallen peds get up after a while (they were only knocked down).
  for (const ped of game.peds) {
    if (ped.dead && ped.fallT > 6) { ped.dead = false; ped.panic = 2; }
  }
  for (const cop of game.copsFoot) {
    updateCopFoot(cop, dt, game.city, p, () => hurtPlayer(10));
  }

  // Bullets.
  game.bullets = updateBullets(game.bullets, dt, game.city, [...game.peds, ...game.copsFoot], (t) => {
    t.dead = true; t.fallT = 0;
    addWanted(t.shirt ? 1 : 2, 'shooting');
  });

  // Pickups.
  for (const pk of game.pickups) {
    if (game.time - pk.takenAt < 45) continue; // respawning
    if (dist(p.x, p.y, pk.x, pk.y) < 30) {
      pk.takenAt = game.time;
      sounds.pickup();
      if (pk.kind === 'health') p.health = Math.min(p.maxHealth, p.health + 40);
      else if (pk.kind === 'ammo') p.ammo = Math.min(p.maxAmmo, p.ammo + 12);
      else { p.cash += 50; sounds.cash(); }
    }
  }

  // Slow health regen when clean.
  if (game.wanted === 0 && p.health > 0) p.health = Math.min(p.maxHealth, p.health + 1.2 * dt);

  updateWanted(dt);
  updateMissions(game.missions, dt, game);

  // Camera follows the player.
  const vw = canvas.width / game.cam.zoom;
  const vh = canvas.height / game.cam.zoom;
  game.cam.w = vw; game.cam.h = vh;
  game.cam.x = clamp(p.x - vw / 2, 0, WORLD_W - vw);
  game.cam.y = clamp(p.y - vh / 2, 0, WORLD_H - vh);

  // Autosave every 5 seconds while playing.
  if (game.time - (game.lastSaveAt || 0) > 5) {
    game.lastSaveAt = game.time;
    writeSave();
  }
}

// ---------- Draw ----------
function draw() {
  const vw = canvas.width, vh = canvas.height;
  ctx.clearRect(0, 0, vw, vh);
  const zoom = game.cam.zoom;
  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(-game.cam.x, -game.cam.y);
  drawCity(ctx, game.city, game.cam);
  // Waypoint.
  const m = currentMission(game.missions);
  if (game.state === 'play' && game.missions.active && m && m.waypoint) {
    drawWaypoint(ctx, m.waypoint, game.time);
  }
  // Pickups.
  for (const pk of game.pickups) {
    if (game.time - pk.takenAt < 45) continue;
    drawPickup(ctx, pk, game.time);
  }
  // Cars: parked/traffic first, then cops, then the player's car on top.
  for (const c of game.cars) if (!c.dead && c.kind !== 'cop' && c.kind !== 'player') drawCar(ctx, c, game.time);
  for (const c of game.cars) if (!c.dead && c.kind === 'cop') drawCar(ctx, c, game.time);
  for (const c of game.cars) if (!c.dead && c.kind === 'player') drawCar(ctx, c, game.time);
  // Pedestrians.
  for (const ped of game.peds) {
    if (ped.dead) {
      // Knocked down: lying flat.
      ctx.save();
      ctx.translate(ped.x, ped.y);
      ctx.fillStyle = ped.shirt;
      ctx.beginPath(); ctx.ellipse(0, 0, 13, 7, ped.angle, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      continue;
    }
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.shirt);
  }
  // Foot cops.
  for (const cop of game.copsFoot) {
    drawPerson(ctx, cop.x, cop.y, cop.angle, '#1c2733', { label: 'POLICE' });
  }
  // Player on foot.
  const p = game.player;
  if (!p.inCar && game.state !== 'gameover') {
    const bob = p.speed > 0 ? Math.sin(p.walkPhase) * 2 : 0;
    drawPerson(ctx, p.x, p.y, p.angle, '#ffcf3f', { bob, label: 'YOU' });
  }
  // Bullets.
  ctx.fillStyle = '#ffe082';
  for (const b of game.bullets) {
    ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // HUD + screens (screen space, unscaled).
  if (game.state === 'play' || game.state === 'pause') {
    drawHUD(ctx, game, vw, vh);
  }
  if (game.state === 'start') {
    game.buttons = drawStartScreen(ctx, game, vw, vh, game.save);
  } else if (game.state === 'pause') {
    drawPauseScreen(ctx, vw, vh);
  } else if (game.state === 'gameover') {
    drawGameOverScreen(ctx, vw, vh, game);
  }
}

// ---------- Shot staging (deterministic scenes for screenshots) ----------
function stageShot() {
  if (!SHOT) return;
  if (SHOT === 'start') {
    game.state = 'start';
    return;
  }
  game.state = 'play';
  if (SHOT === 'chase') {
    // Player mid-getaway in a stolen car, 3 stars, cops closing in.
    const car = makeCar(1500, 1300, 0, '#d94f3d', { kind: 'player', driver: 'player' });
    car.speed = 340;
    game.cars.push(car);
    game.player.inCar = car;
    game.player.x = car.x; game.player.y = car.y;
    game.wanted = 3;
    game.lastCrimeAt = game.time;
    game.missions.active = true;
    game.missions.index = 2;
    game.missions.timeLeft = 62;
    game.player.cash = 1300;
    game.player.ammo = 8;
    game.keys.up = true;
    for (let i = 0; i < 3; i++) {
      const c = spawnCopCar(game.city, rng, game.player.x - 430 - i * 170, game.player.y + (i - 1) * 100);
      game.cars.push(c);
    }
    // Extra traffic ahead so the street reads busy.
    for (let i = 0; i < 4; i++) {
      const c = makeCar(1900 + i * 160, 1300 + (i % 2 ? -23 : 23), i % 2 ? Math.PI : 0, pick(rng, CAR_COLORS), { kind: 'traffic', dir: i % 2 ? 2 : 0 });
      c.speed = 110;
      game.cars.push(c);
    }
  } else if (SHOT === 'mission') {
    // On foot in Palm Park, package waypoint ahead, one star, peds around.
    game.player.x = 1720; game.player.y = 1180;
    game.player.angle = -Math.PI / 2.4;
    game.missions.active = true;
    game.missions.index = 0;
    game.wanted = 1;
    game.lastCrimeAt = game.time;
    game.player.cash = 250;
    for (let i = 0; i < 6; i++) {
      const pp = randomSidewalkPoint(rng);
      game.peds.push(makePed(1650 + (i % 3) * 90, 950 + Math.floor(i / 3) * 120, rng));
      void pp;
    }
  } else if (SHOT === 'city') {
    // Zoomed-out downtown overview: busy streets, player on foot.
    game.cam.zoom = 0.45;
    game.player.x = 1200; game.player.y = 1500;
    game.player.cash = 800;
    game.missions.index = 1;
  }
  // Let the world settle for ~1.5 simulated seconds so traffic, cops
  // and the camera sit naturally before the first rendered frame.
  for (let i = 0; i < 90; i++) update(1 / 60);
  game.keys.up = false;
}

// ---------- Boot + loop ----------
game.save = loadSave();
newWorld();
stageShot();

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, Math.max(0.001, (now - last) / 1000));
  last = now;
  game.frame += 1;
  update(dt);
  draw();
  if (game.frame === 3) {
    window.__solmarReady = true;
    document.title = 'SOLMAR — ready';
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Exposed for play-testing (no network, no secrets).
window.__solmar = game;
