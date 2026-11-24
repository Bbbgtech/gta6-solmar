// hud.js — everything the player reads: health, cash, wanted stars,
// the mission objective, the clock, and the live minimap (top-right).
import { WORLD_W, WORLD_H, ROADS_V, ROADS_H, PARK, BEACH_Y, MARINA } from './city.js';

const STAR = '★';
const FONT = 'system-ui, -apple-system, sans-serif';

export function drawHud(ctx, W, H, s) {
  const p = s.player;
  ctx.save();
  // ---- top-left: health, cash, ammo, stars -------------------------------
  ctx.fillStyle = 'rgba(12,14,20,0.62)';
  roundRect(ctx, 12, 12, 250, 96, 10);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px ' + FONT;
  ctx.fillText('LEO MAR', 24, 34);
  // Health bar.
  ctx.fillStyle = '#222';
  ctx.fillRect(24, 44, 180, 14);
  ctx.fillStyle = p.health > 50 ? '#3da86a' : p.health > 25 ? '#f2c230' : '#d94f3d';
  ctx.fillRect(24, 44, 180 * Math.max(0, p.health) / 100, 14);
  ctx.fillStyle = '#fff';
  ctx.font = '12px ' + FONT;
  ctx.fillText(Math.round(p.health) + ' HP', 210, 56);
  // Cash and ammo.
  ctx.fillStyle = '#7de08a';
  ctx.font = 'bold 16px ' + FONT;
  ctx.fillText('$' + p.cash.toLocaleString('en-US'), 24, 80);
  ctx.fillStyle = '#cfd6e4';
  ctx.font = '13px ' + FONT;
  ctx.fillText(p.inCar ? 'IN CAR — E to exit' : 'AMMO ' + p.ammo + '  •  F punch  •  click shoot', 92, 80);
  // Wanted stars.
  ctx.font = 'bold 22px ' + FONT;
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < p.wantedStars ? '#ffd23d' : 'rgba(255,255,255,0.28)';
    const blink = p.wantedStars >= 3 && Math.floor(s.time * 3) % 2 === 0;
    if (i < p.wantedStars && blink) ctx.fillStyle = '#ff5a3d';
    ctx.fillText(STAR, 24 + i * 26, 104);
  }
  // ---- top-centre: clock + mission objective -----------------------------
  const clock = s.clockText();
  ctx.font = 'bold 15px ' + FONT;
  const cw = ctx.measureText(clock).width;
  ctx.fillStyle = 'rgba(12,14,20,0.62)';
  roundRect(ctx, W / 2 - cw / 2 - 14, 12, cw + 28, 30, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(clock, W / 2, 33);
  ctx.textAlign = 'left';
  const obj = s.missions.objectiveText();
  ctx.font = 'bold 14px ' + FONT;
  const ow = ctx.measureText(obj).width;
  ctx.fillStyle = 'rgba(12,14,20,0.62)';
  roundRect(ctx, W / 2 - ow / 2 - 14, 48, ow + 28, 30, 8);
  ctx.fill();
  ctx.fillStyle = '#ffe9a8';
  ctx.textAlign = 'center';
  ctx.fillText(obj, W / 2, 68);
  ctx.textAlign = 'left';
  // ---- mission banner -----------------------------------------------------
  const b = s.missions.banner;
  if (b && s.time < b.until) {
    ctx.globalAlpha = Math.min(1, (b.until - s.time) * 2);
    ctx.font = 'bold 34px ' + FONT;
    const bw = ctx.measureText(b.text).width;
    ctx.fillStyle = 'rgba(12,14,20,0.7)';
    roundRect(ctx, W / 2 - bw / 2 - 24, H * 0.3 - 44, bw + 48, 92, 12);
    ctx.fill();
    ctx.fillStyle = b.text === 'MISSION FAILED' ? '#ff6a5a' : '#ffd23d';
    ctx.textAlign = 'center';
    ctx.fillText(b.text, W / 2, H * 0.3);
    ctx.fillStyle = '#fff';
    ctx.font = '16px ' + FONT;
    ctx.fillText(b.sub, W / 2, H * 0.3 + 28);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }
  // ---- bottom-left: contextual hint ---------------------------------------
  ctx.font = '13px ' + FONT;
  ctx.fillStyle = 'rgba(12,14,20,0.55)';
  const hint = s.hintText();
  const hw = ctx.measureText(hint).width;
  roundRect(ctx, 12, H - 34, hw + 20, 24, 8);
  ctx.fill();
  ctx.fillStyle = '#e8ecf4';
  ctx.fillText(hint, 22, H - 17);
  // ---- damage flash -------------------------------------------------------
  if (p.hurtFlash > 0) {
    ctx.fillStyle = 'rgba(217,47,47,' + (p.hurtFlash * 0.7) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// ---- minimap ---------------------------------------------------------------
export function drawMinimap(ctx, W, H, s) {
  const mw = 210, mh = 158;
  const x0 = W - mw - 14, y0 = 14;
  const sx = mw / WORLD_W, sy = mh / WORLD_H;
  ctx.save();
  ctx.fillStyle = 'rgba(12,14,20,0.72)';
  roundRect(ctx, x0 - 4, y0 - 4, mw + 8, mh + 8, 10);
  ctx.fill();
  // Sea and sand.
  ctx.fillStyle = '#2f7fb8';
  ctx.fillRect(x0, y0 + BEACH_Y * sy, mw, mh - BEACH_Y * sy);
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(x0, y0 + (BEACH_Y - 30) * sy, mw, 30 * sy);
  // Park.
  ctx.fillStyle = '#5da24a';
  ctx.fillRect(x0 + PARK.x * sx, y0 + PARK.y * sy, PARK.w * sx, PARK.h * sy);
  // Roads.
  ctx.fillStyle = '#8a8a92';
  for (const rx of ROADS_V) ctx.fillRect(x0 + (rx - 6) * sx, y0, 12 * sx, mh);
  for (const ry of ROADS_H) ctx.fillRect(x0, y0 + (ry - 6) * sy, mw, 12 * sy);
  // Waypoint.
  const wp = s.missions.waypoint(s.player);
  if (wp) {
    const pulse = 3 + Math.sin(s.time * 5) * 1.5;
    ctx.fillStyle = '#ffd23d';
    ctx.beginPath();
    ctx.arc(x0 + wp.x * sx, y0 + wp.y * sy, pulse + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(x0 + wp.x * sx, y0 + wp.y * sy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cars: white dots, police blue.
  for (const c of s.cars) {
    ctx.fillStyle = c.kind === 'police' ? '#4d9fff' : '#ffffff';
    ctx.fillRect(x0 + c.x * sx - 1.5, y0 + c.y * sy - 1.5, 3, 3);
  }
  // Player: green arrow.
  const px = x0 + s.player.x * sx, py = y0 + s.player.y * sy;
  ctx.fillStyle = '#3dff7a';
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0a5a22';
  ctx.lineWidth = 2;
  ctx.stroke();
  // North label + view rect.
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px ' + FONT;
  ctx.fillText('SOLMAR', x0 + 6, y0 + mh - 8);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    x0 + s.cam.view.x * sx, y0 + s.cam.view.y * sy,
    s.cam.view.w * sx, s.cam.view.h * sy,
  );
  ctx.restore();
}

// ---- screens ---------------------------------------------------------------
export function drawStartScreen(ctx, W, H, s) {
  ctx.save();
  // Sun-soaked gradient sky over a dimmed city.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1d5f8a');
  g.addColorStop(0.55, '#2f7fb8');
  g.addColorStop(1, '#e8b04b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Sun.
  ctx.fillStyle = '#ffd23d';
  ctx.beginPath(); ctx.arc(W * 0.82, H * 0.2, 54, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,210,61,0.25)';
  ctx.beginPath(); ctx.arc(W * 0.82, H * 0.2, 84, 0, Math.PI * 2); ctx.fill();
  // Skyline silhouette.
  ctx.fillStyle = 'rgba(20,30,50,0.55)';
  const sky = [90, 150, 110, 190, 130, 170, 100, 140, 180, 120];
  let bx = 0;
  for (const h of sky) {
    ctx.fillRect(bx, H - 260 - h, 128, 260 + h);
    bx += 128;
  }
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 84px ' + FONT;
  ctx.fillText('SOLMAR', W / 2, H * 0.32);
  ctx.font = 'bold 22px ' + FONT;
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText('STEAL CARS · OUTRUN THE POLICE · RUN THE CITY', W / 2, H * 0.32 + 40);
  ctx.font = '16px ' + FONT;
  ctx.fillStyle = '#e8ecf4';
  ctx.fillText('Leo Mar owes money to the wrong people. One coastal city, three jobs,', W / 2, H * 0.32 + 78);
  ctx.fillText('and every cop in Solmar between you and a clean slate.', W / 2, H * 0.32 + 102);
  // Controls card.
  ctx.fillStyle = 'rgba(12,14,20,0.66)';
  roundRect(ctx, W / 2 - 260, H * 0.32 + 128, 520, 148, 12);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '15px ' + FONT;
  const lines = [
    'WASD / Arrows — walk or drive      E — enter / steal a car',
    'SPACE — handbrake      F — punch      Click — shoot pistol',
    'M — start mission      P / Esc — pause      R — restart',
  ];
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.32 + 160 + i * 30));
  // Buttons.
  s.startButtons = [];
  const bw = 240, bh = 52;
  drawButton(ctx, W / 2 - bw - 12, H * 0.32 + 300, bw, bh, 'START GAME', '#ffd23d', '#222', s, 'start');
  if (s.hasSave) {
    drawButton(ctx, W / 2 + 12, H * 0.32 + 300, bw, bh, 'CONTINUE', '#3da86a', '#fff', s, 'continue');
  }
  ctx.font = '13px ' + FONT;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('An original game — no Rockstar content. Best on desktop Chrome.', W / 2, H * 0.32 + 392);
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawButton(ctx, x, y, w, h, label, bg, fg, s, id) {
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = 'bold 19px ' + FONT;
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + h / 2 + 7);
  ctx.textAlign = 'left';
  s.startButtons.push({ x, y, w, h, id });
}

export function drawPauseScreen(ctx, W, H) {
  ctx.save();
  ctx.fillStyle = 'rgba(10,12,18,0.66)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px ' + FONT;
  ctx.fillText('PAUSED', W / 2, H / 2 - 20);
  ctx.font = '17px ' + FONT;
  ctx.fillStyle = '#cfd6e4';
  ctx.fillText('P / Esc to resume  •  R to restart  •  M for the next mission', W / 2, H / 2 + 20);
  ctx.textAlign = 'left';
  ctx.restore();
}

export function drawGameOverScreen(ctx, W, H, s) {
  ctx.save();
  ctx.fillStyle = 'rgba(20,4,4,0.78)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ff6a5a';
  ctx.textAlign = 'center';
  ctx.font = 'bold 64px ' + FONT;
  ctx.fillText(s.gameOverReason === 'busted' ? 'BUSTED' : 'WASTED', W / 2, H / 2 - 40);
  ctx.fillStyle = '#fff';
  ctx.font = '18px ' + FONT;
  ctx.fillText(
    s.gameOverReason === 'busted'
      ? 'The Solmar police finally caught up with Leo.'
      : 'Leo went down — but Solmar never sleeps.',
    W / 2, H / 2,
  );
  ctx.fillStyle = '#ffd23d';
  ctx.font = 'bold 20px ' + FONT;
  ctx.fillText('Cash kept: $' + s.player.cash.toLocaleString('en-US') + '   •   Missions done: ' + s.missions.completed + ' / 3', W / 2, H / 2 + 40);
  ctx.fillStyle = '#e8ecf4';
  ctx.font = '16px ' + FONT;
  ctx.fillText('Press R or click to try again', W / 2, H / 2 + 84);
  ctx.textAlign = 'left';
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
