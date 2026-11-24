// HUD for SOLMAR: health, cash, wanted stars, mission objective, clock,
// and the minimap — plus the start, pause and game-over screens.
// Everything is drawn on the same canvas, in system fonts only.
import { WORLD_W, WORLD_H } from './city.js';
import { missionObjectiveText } from './missions.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export function drawHUD(ctx, g, vw, vh) {
  const p = g.player;
  // --- Top-left: health bar + cash ---
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRectPath(ctx, 14, 12, 250, 88, 10); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillText('SOLMAR', 26, 32);
  // Health bar.
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(26, 42, 150, 12);
  const hp = Math.max(0, p.health / p.maxHealth);
  ctx.fillStyle = hp > 0.5 ? '#4caf50' : hp > 0.25 ? '#ff9800' : '#e53935';
  ctx.fillRect(26, 42, 150 * hp, 12);
  ctx.fillStyle = '#fff';
  ctx.font = `12px ${FONT}`;
  ctx.fillText(`${Math.ceil(p.health)}`, 182, 52);
  // Cash.
  ctx.fillStyle = '#8be28b';
  ctx.font = `bold 15px ${FONT}`;
  ctx.fillText(`$${p.cash.toLocaleString('en-US')}`, 26, 70);
  // Ammo + weapon.
  ctx.fillStyle = '#fff';
  ctx.font = `12px ${FONT}`;
  ctx.fillText(`Ammo ${p.ammo}  ·  F punch  ·  click shoot`, 26, 90);

  // --- Top-centre: wanted stars ---
  const stars = g.wanted;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRectPath(ctx, vw / 2 - 110, 12, 220, 40, 10); ctx.fill();
  for (let i = 0; i < 5; i++) {
    ctx.font = '22px ' + FONT;
    ctx.fillStyle = i < stars ? '#ffd54f' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', vw / 2 - 80 + i * 40, 40);
  }
  if (stars > 0) {
    ctx.fillStyle = '#ff8a80';
    ctx.font = `bold 11px ${FONT}`;
    ctx.fillText(stars >= 3 ? 'THE LAW IS ON YOU' : 'WANTED', vw / 2, 66);
  }

  // --- Top-right: clock + minimap ---
  const mm = drawMinimap(ctx, g, vw - 214, 12, 200, 132);
  ctx.fillStyle = '#fff';
  ctx.font = `bold 14px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(g.clockText(), vw - 16, 168);

  // --- Bottom-left: mission objective ---
  ctx.textAlign = 'left';
  const obj = missionObjectiveText(g.missions);
  ctx.font = `bold 14px ${FONT}`;
  const w = ctx.measureText(obj).width + 28;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRectPath(ctx, 14, vh - 52, w, 36, 10); ctx.fill();
  ctx.fillStyle = '#ffeb3b';
  ctx.fillText('◆ ' + obj, 28, vh - 29);

  // --- Bottom-right: context hint ---
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `12px ${FONT}`;
  ctx.fillText(g.contextHint(), vw - 16, vh - 16);

  // --- Mission banner ---
  const b = g.missions.banner;
  if (b) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    const bw = Math.max(ctx.measureText(b.text).width, ctx.measureText(b.sub).width) + 60;
    roundRectPath(ctx, vw / 2 - bw / 2, 92, bw, 64, 10); ctx.fill();
    ctx.fillStyle = '#ffeb3b';
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillText(b.text, vw / 2, 118);
    ctx.fillStyle = '#fff';
    ctx.font = `13px ${FONT}`;
    ctx.fillText(b.sub, vw / 2, 142);
  }

  // --- Damage flash / low-health vignette ---
  if (p.hurtCd > 0) {
    ctx.fillStyle = `rgba(229,57,53,${0.22 * p.hurtCd})`;
    ctx.fillRect(0, 0, vw, vh);
  }
  if (p.health <= 25 && g.state === 'play') {
    const a = 0.12 + 0.08 * Math.sin(g.time * 4);
    ctx.strokeStyle = `rgba(229,57,53,${a})`;
    ctx.lineWidth = 26;
    ctx.strokeRect(0, 0, vw, vh);
  }
  return mm;
}

export function drawMinimap(ctx, g, x, y, w, h) {
  const sx = w / WORLD_W, sy = h / WORLD_H;
  ctx.save();
  ctx.fillStyle = 'rgba(24,38,28,0.88)';
  roundRectPath(ctx, x, y, w, h, 8); ctx.fill();
  ctx.beginPath(); roundRectPath(ctx, x, y, w, h, 8); ctx.clip();
  // Roads.
  ctx.fillStyle = '#8b939e';
  for (const ay of g.cityAvenues) ctx.fillRect(x, y + ay * sy - 2, w, 4);
  for (const sx2 of g.cityStreets) ctx.fillRect(x + sx2 * sx - 2, y, 4, h);
  // Water + beach.
  ctx.fillStyle = '#2f7fb8';
  ctx.fillRect(x + 3050 * sx, y + 2330 * sy, w - 3050 * sx, h - 2330 * sy);
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(x, y + 2420 * sy, w, h - 2420 * sy);
  // Park.
  ctx.fillStyle = '#3f8f36';
  ctx.fillRect(x + 1545 * sx, y + 845 * sy, (2055 - 1545) * sx, (1255 - 845) * sy);
  // Waypoint.
  const m = g.missions.active && g.missionWaypoint();
  if (m) {
    const pulse = 5 + Math.sin(g.time * 5) * 2;
    ctx.fillStyle = '#ffeb3b';
    ctx.beginPath(); ctx.arc(x + m.x * sx, y + m.y * sy, pulse, 0, Math.PI * 2); ctx.fill();
  }
  // Cars (traffic grey, cops blue/red).
  for (const c of g.cars) {
    if (c.dead) continue;
    ctx.fillStyle = c.kind === 'cop' ? '#3d8bff' : 'rgba(255,255,255,0.75)';
    ctx.fillRect(x + c.x * sx - 2, y + c.y * sy - 2, 4, 4);
  }
  // Player: white dot with dark ring.
  const p = g.playerPos();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x + p.x * sx, y + p.y * sy, 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x + p.x * sx, y + p.y * sy, 5, 0, Math.PI * 2); ctx.stroke();
  // View rectangle.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + g.cam.x * sx, y + g.cam.y * sy, g.cam.w * sx, g.cam.h * sy);
  ctx.restore();
  // Border + label.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  roundRectPath(ctx, x, y, w, h, 8); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = `bold 10px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('SOLMAR', x + 8, y + h - 8);
  return { x, y, w, h };
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// --- Screens ---

export function drawStartScreen(ctx, g, vw, vh, save) {
  // Sun-soaked title card over a dimmed city view.
  const grad = ctx.createLinearGradient(0, 0, 0, vh);
  grad.addColorStop(0, 'rgba(8,20,32,0.55)');
  grad.addColorStop(1, 'rgba(8,20,32,0.82)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, vw, vh);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffcf3f';
  ctx.font = `900 92px ${FONT}`;
  ctx.fillText('SOLMAR', vw / 2, 168);
  ctx.fillStyle = '#fff';
  ctx.font = `bold 22px ${FONT}`;
  ctx.fillText('A 2D OPEN-WORLD CRIME GAME', vw / 2, 208);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `15px ${FONT}`;
  ctx.fillText('Rosa needs a driver. The Solmar police need a target. The city needs a name.', vw / 2, 244);
  ctx.fillText('Steal cars, lose the cops, run three jobs — and make Solmar yours.', vw / 2, 268);

  // Controls card.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRectPath(ctx, vw / 2 - 330, 300, 660, 150, 12); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `15px ${FONT}`;
  const lines = [
    'WASD / Arrows — move on foot, drive in a car',
    'E — steal / enter a car, exit a car, pick up, interact',
    'F — punch    ·    Mouse click — shoot    ·    Space — handbrake',
    'M — start the next job    ·    P / Esc — pause',
  ];
  lines.forEach((l, i) => ctx.fillText(l, vw / 2, 332 + i * 30));

  // Buttons.
  const buttons = [];
  const by = 486;
  buttons.push(drawButton(ctx, vw / 2 - 230, by, 220, 54, 'START GAME', '#ffcf3f', '#111'));
  if (save) {
    buttons.push(drawButton(ctx, vw / 2 + 10, by, 220, 54, `CONTINUE — $${save.cash}`, '#2e9e5b', '#fff'));
  } else {
    buttons.push(drawButton(ctx, vw / 2 + 10, by, 220, 54, 'FREE ROAM', '#2e7fb8', '#fff'));
  }
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `12px ${FONT}`;
  ctx.fillText('An original game. No real city, no real gangsters — just Solmar.', vw / 2, by + 92);
  ctx.fillText('Progress saves to this browser automatically.', vw / 2, by + 112);
  return buttons;
}

export function drawPauseScreen(ctx, vw, vh) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, vw, vh);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = `900 54px ${FONT}`;
  ctx.fillText('PAUSED', vw / 2, vh / 2 - 30);
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('P / Esc to resume · R to restart · progress is saved', vw / 2, vh / 2 + 8);
}

export function drawGameOverScreen(ctx, vw, vh, g) {
  ctx.fillStyle = 'rgba(20,0,0,0.72)';
  ctx.fillRect(0, 0, vw, vh);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff5252';
  ctx.font = `900 64px ${FONT}`;
  ctx.fillText('BUSTED OUT', vw / 2, vh / 2 - 60);
  ctx.fillStyle = '#fff';
  ctx.font = `20px ${FONT}`;
  ctx.fillText('Solmar chewed you up. The cops took your car and your pride.', vw / 2, vh / 2 - 16);
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(`Cash kept: $${g.player.cash.toLocaleString('en-US')}  ·  Jobs done: ${g.missions.index} / 3`, vw / 2, vh / 2 + 22);
  ctx.fillStyle = '#ffcf3f';
  ctx.font = `bold 18px ${FONT}`;
  ctx.fillText('Press R to start again', vw / 2, vh / 2 + 62);
}

function drawButton(ctx, x, y, w, h, label, bg, fg) {
  ctx.fillStyle = bg;
  roundRectPath(ctx, x, y, w, h, 10); ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = `bold 17px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + h / 2 + 6);
  return { x, y, w, h, label };
}
