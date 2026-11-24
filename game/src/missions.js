// Missions for SOLMAR: a three-job story arc across the city, with a
// waypoint, objective text, timers and cash rewards. After the third job
// the player free-roams as the new name in Solmar.
import { dist } from './rng.js';

export const MISSIONS = [
  {
    id: 1,
    title: 'The Package',
    giver: 'Rosa at the marina bar',
    brief: 'Rosa left a package in Palm Park. Pick it up and bring it back — no cops, no fuss.',
    objective: 'Pick up the package in Palm Park',
    waypoint: { x: 1800, y: 1050 },
    reward: 500,
    hint: 'Walk or drive to the yellow marker, then press E.',
  },
  {
    id: 2,
    title: 'Hot Drop',
    giver: 'Rosa',
    brief: 'The drop was watched. The Solmar police are on you — lose them before they box you in.',
    objective: 'Lose the cops — get your wanted level to zero',
    waypoint: null,
    reward: 800,
    hint: 'Lay low: stay out of sight, stop committing crimes, and the heat fades.',
    startWanted: 3,
    timeLimit: 90,
  },
  {
    id: 3,
    title: 'The Getaway',
    giver: 'Marco',
    brief: 'Marco needs a driver, now. Grab any car and get to the marina before the harbour patrol locks the docks.',
    objective: 'Drive to Solmar Marina within 90 seconds',
    waypoint: { x: 3320, y: 2420 },
    reward: 1500,
    hint: 'Press E near a car to take it, then follow the yellow marker.',
    timeLimit: 90,
    needsCar: true,
  },
];

export function makeMissionState() {
  return {
    index: 0, // 0-based into MISSIONS; 3 means the story is done
    active: false,
    startedAt: 0,
    timeLeft: 0,
    done: false, // story complete
    banner: null, // { text, sub, t } shown briefly
    failReason: null,
  };
}

export function currentMission(state) {
  return state.index < MISSIONS.length ? MISSIONS[state.index] : null;
}

export function missionObjectiveText(state) {
  const m = currentMission(state);
  if (!m) return 'Free roam — Solmar is yours. Earn cash, dodge the law.';
  if (!state.active) return `Next job: ${m.title} — press M to start`;
  let txt = m.objective;
  if (state.timeLeft > 0) txt += `  (${Math.ceil(state.timeLeft)}s)`;
  return txt;
}

// Start the next mission. Returns the mission or null.
export function startMission(state, now, game) {
  const m = currentMission(state);
  if (!m || state.active) return null;
  state.active = true;
  state.startedAt = now;
  state.timeLeft = m.timeLimit || 0;
  state.failReason = null;
  if (m.startWanted) game.setWanted(m.startWanted);
  state.banner = { text: `MISSION: ${m.title}`, sub: m.brief, t: 4.5 };
  return m;
}

// Per-frame mission logic. `game` carries player, wanted, cash, sounds, etc.
export function updateMissions(state, dt, game) {
  const m = currentMission(state);
  if (!m || !state.active) return;
  if (state.timeLeft > 0) {
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      failMission(state, game, 'Out of time.');
      return;
    }
  }
  const p = game.playerPos();
  if (m.waypoint) {
    const d = dist(p.x, p.y, m.waypoint.x, m.waypoint.y);
    const inCar = game.playerInCar();
    if (d < 70 && (!m.needsCar || inCar)) {
      completeMission(state, game);
    }
  } else if (m.id === 2) {
    // Lose the cops: wanted must reach zero.
    if (game.wanted <= 0) completeMission(state, game);
  }
  if (state.banner) {
    state.banner.t -= dt;
    if (state.banner.t <= 0) state.banner = null;
  }
}

export function completeMission(state, game) {
  const m = currentMission(state);
  if (!m) return;
  state.active = false;
  state.index += 1;
  game.addCash(m.reward);
  game.sounds.missionOk();
  if (state.index >= MISSIONS.length) {
    state.done = true;
    state.banner = { text: 'YOU RUN SOLMAR NOW', sub: 'All three jobs done. The city is yours — free roam.', t: 6 };
  } else {
    const next = MISSIONS[state.index];
    state.banner = { text: `JOB DONE — +$${m.reward}`, sub: `Next job: ${next.title} — press M when ready.`, t: 5 };
  }
}

export function failMission(state, game, reason) {
  const m = currentMission(state);
  if (!m) return;
  state.active = false;
  state.failReason = reason;
  game.sounds.missionFail();
  state.banner = { text: 'JOB FAILED', sub: `${reason} Press M to retry ${m.title}.`, t: 5 };
}

// Draw the waypoint marker on the world (pulsing ring + beacon).
export function drawWaypoint(ctx, wp, t, color = '#ffeb3b') {
  const pulse = 1 + Math.sin(t * 4) * 0.12;
  ctx.save();
  ctx.translate(wp.x, wp.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(0, 0, 34 * pulse, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.25;
  ctx.beginPath(); ctx.arc(0, 0, 52 * pulse, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Beacon column so the marker reads from far away.
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = color;
  ctx.fillRect(wp.x - 6, wp.y - 320, 12, 320);
  ctx.restore();
}
