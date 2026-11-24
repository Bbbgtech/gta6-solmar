// missions.js — Solmar's three story missions, a small arc for Leo Mar,
// a courier who owes money to the wrong people and has to earn it back.
// Each mission is a tiny state machine: objective text, a waypoint, a
// reward, and a fail condition. The game chains them in order.
export const MISSIONS = [
  {
    id: 'package',
    title: '1 — The Package',
    brief: 'Marco left a package at the marina. Pick it up and bring it to the Hotel Mirador downtown.',
    reward: 500,
    pickup: { x: 2590, y: 2190, label: 'PACKAGE' },
    dropoff: { x: 1500, y: 1330, label: 'HOTEL MIRADOR' },
    timeLimit: 0, // no timer
  },
  {
    id: 'lose-the-cops',
    title: '2 — Lose the Heat',
    brief: 'You were spotted. Three stars on your head — break line of sight and stay clean until the heat dies down.',
    reward: 800,
    startWanted: 3,
    timeLimit: 0,
  },
  {
    id: 'getaway',
    title: '3 — The Getaway',
    brief: 'The crew is waiting at the North Gate. Grab a car and get there in 75 seconds — cops included, free of charge.',
    reward: 1500,
    target: { x: 300, y: 300, label: 'NORTH GATE' },
    timeLimit: 75,
  },
];

export class MissionRunner {
  constructor() {
    this.index = 0;          // next mission to start
    this.active = null;      // {def, stage, timer, message}
    this.completed = 0;
    this.banner = null;      // {text, sub, until}
  }
  get currentDef() { return MISSIONS[this.index] || null; }
  get done() { return this.index >= MISSIONS.length; }

  start(time) {
    const def = this.currentDef;
    if (!def || this.active) return null;
    this.active = { def, stage: 'go', timer: def.timeLimit || 0, startedAt: time };
    this.banner = { text: def.title, sub: def.brief, until: time + 5 };
    return this.active;
  }

  // Waypoint the HUD and minimap should point at right now.
  waypoint(player) {
    if (!this.active) return null;
    const def = this.active.def;
    if (def.id === 'package') {
      return this.active.stage === 'pickup' || this.active.stage === 'go'
        ? { x: def.pickup.x, y: def.pickup.y, label: def.pickup.label }
        : { x: def.dropoff.x, y: def.dropoff.y, label: def.dropoff.label };
    }
    if (def.id === 'getaway') return { x: def.target.x, y: def.target.y, label: def.target.label };
    return null;
  }

  objectiveText() {
    if (!this.active) {
      if (this.done) return 'All missions complete — Solmar is yours, Leo.';
      return 'Press M to start the next mission: ' + (this.currentDef ? this.currentDef.title : '');
    }
    const def = this.active.def;
    if (def.id === 'package') {
      return this.active.stage === 'deliver'
        ? 'Deliver the package to the Hotel Mirador'
        : 'Pick up the package at the marina';
    }
    if (def.id === 'lose-the-cops') return 'Lose the cops — stay clean until the stars fade';
    if (def.id === 'getaway') return 'Reach the North Gate in ' + Math.ceil(this.active.timer) + 's';
    return def.title;
  }

  // Called every tick while a mission is active. Returns 'complete' | 'fail' | null.
  update(dt, time, player) {
    if (!this.active) return null;
    const m = this.active;
    const def = m.def;
    if (def.timeLimit) {
      m.timer -= dt;
      if (m.timer <= 0) return this.fail(time, 'Too slow — the crew left without you.');
    }
    if (def.id === 'package') {
      if (m.stage === 'go' || m.stage === 'pickup') {
        if (dist2(player.x, player.y, def.pickup.x, def.pickup.y) < 50 * 50) {
          m.stage = 'deliver';
          this.banner = { text: 'Package secured', sub: 'Now deliver it to the Hotel Mirador', until: time + 3 };
        }
      } else if (m.stage === 'deliver') {
        if (dist2(player.x, player.y, def.dropoff.x, def.dropoff.y) < 60 * 60) {
          return this.complete(time);
        }
      }
    }
    if (def.id === 'lose-the-cops') {
      if (player.wantedStars === 0 && time - m.startedAt > 4) return this.complete(time);
    }
    if (def.id === 'getaway') {
      if (dist2(player.x, player.y, def.target.x, def.target.y) < 70 * 70) {
        return this.complete(time);
      }
    }
    return null;
  }

  complete(time) {
    const def = this.active.def;
    this.completed++;
    this.index++;
    this.active = null;
    this.banner = {
      text: 'MISSION COMPLETE',
      sub: def.title + ' — +$' + def.reward,
      until: time + 4,
    };
    return 'complete';
  }
  fail(time, reason) {
    this.active = null;
    this.banner = { text: 'MISSION FAILED', sub: reason + ' Press M to retry.', until: time + 4 };
    return 'fail';
  }
}

function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
