(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const startBtn = document.getElementById('startBtn');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const statusEl = document.getElementById('status');
  const W = canvas.width;
  const H = canvas.height;
  const TILE = 40;
  const MAP_W = 24;
  const MAP_H = 16;
  const keys = new Set();
  const pressedOnce = new Set();

  const COLORS = {
    grass1: '#214f32', grass2: '#2d6b3e', grass3: '#1d422e',
    path: '#83663e', path2: '#9b7b4d', water: '#236a89', water2: '#2e93b9',
    tree: '#12351f', tree2: '#1f6a36', trunk: '#684326', stone: '#8d95a3',
    ui: 'rgba(3, 12, 15, .82)', white: '#f2fff7', gold: '#ffd05f', teal: '#6df5c4'
  };

  const rawMap = [
    'TTTTTTTTTTTTTTTTTTTTTTTT',
    'T..g....ww....T....g...T',
    'T..g....ww....T........T',
    'T....PPPwwPPPPPPPPP....T',
    'T.TT.P..ww....T...P.TT.T',
    'T....P........T...P....T',
    'T....P..TT........P....T',
    'T.PPPP......K.....PPPP.T',
    'T.P..T.............T.P.T',
    'T.P..T..wwwwwww....T.P.T',
    'T.PPPPPPww...wwPPPPPPP.T',
    'T......Pww...wwP.......T',
    'T.TT...P.......P...TT..T',
    'T......PPPPDPPPP.......T',
    'T......T...S...T.......T',
    'TTTTTTTTTTTTTTTTTTTTTTTT'
  ];

  const solid = new Set(['T', 'w']);
  const hero = { x: 88, y: 92, w: 24, h: 30, hp: 5, maxHp: 5, dir: 'down', inv: 0, attack: 0, hasKey: false, won: false, dead: false, step: 0 };
  let gateOpen = false;
  let message = 'Press Enter to begin. Find the moon key and reach the shrine.';
  let started = false;
  let shake = 0;
  const particles = [];

  const enemies = [
    { type: 'slime', x: 330, y: 128, w: 26, h: 22, hp: 2, baseX: 330, baseY: 128, phase: .1, alive: true },
    { type: 'slime', x: 620, y: 246, w: 26, h: 22, hp: 2, baseX: 620, baseY: 246, phase: 1.7, alive: true },
    { type: 'bat', x: 725, y: 430, w: 26, h: 20, hp: 1, baseX: 725, baseY: 430, phase: 2.4, alive: true },
    { type: 'slime', x: 200, y: 474, w: 26, h: 22, hp: 2, baseX: 200, baseY: 474, phase: 3.8, alive: true }
  ];

  function tileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return 'T';
    return rawMap[ty][tx];
  }
  function findTile(ch) {
    for (let y = 0; y < MAP_H; y++) {
      const x = rawMap[y].indexOf(ch);
      if (x !== -1) return { tx: x, ty: y, x: x * TILE, y: y * TILE };
    }
    throw new Error(`Missing map marker: ${ch}`);
  }
  const keySpot = findTile('K');
  const gateSpot = findTile('D');
  const shrineSpot = findTile('S');
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function isBlocked(x, y, w, h) {
    const left = Math.floor(x / TILE), right = Math.floor((x + w - 1) / TILE);
    const top = Math.floor(y / TILE), bottom = Math.floor((y + h - 1) / TILE);
    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        const t = tileAt(tx, ty);
        if (solid.has(t)) return true;
        if (t === 'D' && !gateOpen) return true;
      }
    }
    return false;
  }
  function tryMove(obj, dx, dy) {
    if (!isBlocked(obj.x + dx, obj.y, obj.w, obj.h)) obj.x += dx;
    if (!isBlocked(obj.x, obj.y + dy, obj.w, obj.h)) obj.y += dy;
  }
  function center(obj) { return { x: obj.x + obj.w / 2, y: obj.y + obj.h / 2 }; }
  function addBurst(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) particles.push({ x, y, vx: (Math.random() - .5) * 3.2, vy: (Math.random() - .8) * 3.2, life: 28 + Math.random() * 12, color });
  }
  function reset() {
    Object.assign(hero, { x: 88, y: 92, hp: 5, dir: 'down', inv: 0, attack: 0, hasKey: false, won: false, dead: false, step: 0 });
    gateOpen = false;
    started = true;
    message = 'Find the golden moon key.';
    enemies.forEach((e, i) => Object.assign(e, { hp: e.type === 'bat' ? 1 : 2, alive: true, x: e.baseX, y: e.baseY, phase: e.phase + i }));
    particles.length = 0;
  }
  function attackRect() {
    const range = 30;
    if (hero.dir === 'left') return { x: hero.x - range, y: hero.y + 2, w: range, h: hero.h - 4 };
    if (hero.dir === 'right') return { x: hero.x + hero.w, y: hero.y + 2, w: range, h: hero.h - 4 };
    if (hero.dir === 'up') return { x: hero.x + 1, y: hero.y - range, w: hero.w - 2, h: range };
    return { x: hero.x + 1, y: hero.y + hero.h, w: hero.w - 2, h: range };
  }
  function doAttack() {
    if (!started || hero.dead || hero.won || hero.attack > 0) return;
    hero.attack = 14;
    const ar = attackRect();
    let hit = false;
    for (const e of enemies) {
      if (e.alive && rectsOverlap(ar, e)) {
        e.hp -= 1; hit = true; shake = 5;
        addBurst(e.x + e.w / 2, e.y + e.h / 2, e.type === 'bat' ? '#d77cff' : '#9cff74', 9);
        if (e.hp <= 0) { e.alive = false; message = e.type === 'bat' ? 'The night bat dissolves into sparks.' : 'A moss slime pops!'; }
      }
    }
    if (!hit) addBurst(ar.x + ar.w / 2, ar.y + ar.h / 2, '#bfffea', 3);
  }

  function update() {
    if (pressedOnce.has('Enter')) {
      if (!started || hero.dead || hero.won) reset();
    }
    if (!started || hero.dead || hero.won) { pressedOnce.clear(); return; }

    let dx = 0, dy = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) dx -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) dx += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) dy -= 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) dy += 1;
    if (pressedOnce.has('Space') || pressedOnce.has('KeyJ')) doAttack();
    if (dx || dy) {
      const len = Math.hypot(dx, dy) || 1;
      dx = dx / len * 3.05; dy = dy / len * 3.05;
      if (Math.abs(dx) > Math.abs(dy)) hero.dir = dx < 0 ? 'left' : 'right'; else hero.dir = dy < 0 ? 'up' : 'down';
      hero.step += .18;
      tryMove(hero, dx, dy);
    }
    if (hero.attack > 0) hero.attack--;
    if (hero.inv > 0) hero.inv--;
    if (shake > 0) shake--;

    const hc = center(hero);
    const keyRect = { x: keySpot.x + 10, y: keySpot.y + 6, w: 20, h: 26 };
    if (!hero.hasKey && rectsOverlap(hero, keyRect)) {
      hero.hasKey = true;
      message = 'You found the moon key. The northern gate can open now.';
      addBurst(keyRect.x + 10, keyRect.y + 12, COLORS.gold, 18);
    }
    const gateRect = { x: gateSpot.x, y: gateSpot.y, w: TILE, h: TILE };
    if (!gateOpen && hero.hasKey && rectsOverlap(hero, { x: gateRect.x - 14, y: gateRect.y - 14, w: gateRect.w + 28, h: gateRect.h + 28 })) {
      gateOpen = true;
      message = 'The old gate opens with a warm click.';
      addBurst(gateRect.x + 20, gateRect.y + 20, COLORS.teal, 20);
    }
    const shrine = { x: shrineSpot.x - 18, y: shrineSpot.y + 2, w: 76, h: 36 };
    if (gateOpen && rectsOverlap(hero, shrine)) {
      hero.won = true;
      message = 'Shrine awakened! Press Enter to play again.';
      addBurst(hc.x, hc.y, COLORS.teal, 40);
    }

    for (const e of enemies) {
      if (!e.alive) continue;
      e.phase += .035;
      const ec = center(e);
      const dist = Math.hypot(hc.x - ec.x, hc.y - ec.y);
      let vx = Math.sin(e.phase) * .8, vy = Math.cos(e.phase * .8) * .55;
      if (dist < 190) { vx += (hc.x - ec.x) / dist * (e.type === 'bat' ? 1.15 : .72); vy += (hc.y - ec.y) / dist * (e.type === 'bat' ? 1.15 : .72); }
      tryMove(e, vx, vy);
      if (rectsOverlap(hero, e) && hero.inv <= 0) {
        hero.hp -= 1; hero.inv = 55; shake = 8;
        message = hero.hp > 0 ? 'Ouch! Keep moving and strike back.' : 'You fainted in the grove. Press Enter to retry.';
        addBurst(hc.x, hc.y, '#ff6f7d', 16);
        if (hero.hp <= 0) hero.dead = true;
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.x += p.vx; p.y += p.vy; p.vy += .05; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
    pressedOnce.clear();
  }

  function drawTile(tx, ty, t) {
    const x = tx * TILE, y = ty * TILE;
    ctx.fillStyle = (tx + ty) % 2 ? COLORS.grass1 : COLORS.grass2; ctx.fillRect(x, y, TILE, TILE);
    if (t === 'P') { ctx.fillStyle = COLORS.path; ctx.fillRect(x, y, TILE, TILE); ctx.fillStyle = COLORS.path2; for (let i = 0; i < 5; i++) ctx.fillRect(x + ((tx*17+i*9)%34), y + ((ty*13+i*7)%34), 3, 3); }
    if (t === 'w') { ctx.fillStyle = COLORS.water; ctx.fillRect(x, y, TILE, TILE); ctx.fillStyle = COLORS.water2; ctx.fillRect(x + 4, y + 12 + Math.sin(performance.now()/320 + tx) * 3, 30, 4); }
    if (t === 'T') { ctx.fillStyle = COLORS.grass3; ctx.fillRect(x, y, TILE, TILE); ctx.fillStyle = COLORS.trunk; ctx.fillRect(x + 16, y + 20, 8, 16); ctx.fillStyle = COLORS.tree; ctx.beginPath(); ctx.arc(x + 20, y + 17, 18, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = COLORS.tree2; ctx.beginPath(); ctx.arc(x + 14, y + 14, 8, 0, Math.PI*2); ctx.fill(); }
    if (t === 'g') { ctx.fillStyle = '#97e17c'; ctx.fillRect(x + 8, y + 28, 3, 6); ctx.fillRect(x + 22, y + 25, 3, 8); }
    if (t === 'D' && !gateOpen) { ctx.fillStyle = '#6b4328'; ctx.fillRect(x + 2, y + 2, 36, 36); ctx.fillStyle = '#3f271c'; ctx.fillRect(x + 17, y + 6, 6, 26); ctx.fillStyle = hero.hasKey ? COLORS.gold : '#1b1511'; ctx.fillRect(x + 25, y + 18, 5, 7); }
    if (t === 'K') { ctx.fillStyle = (tx + ty) % 2 ? COLORS.grass1 : COLORS.grass2; ctx.fillRect(x, y, TILE, TILE); }
    if (t === 'S') drawShrine(x, y);
  }
  function drawShrine(x, y) {
    ctx.fillStyle = COLORS.stone; ctx.fillRect(x - 14, y + 18, 68, 18); ctx.fillStyle = '#66717d'; ctx.fillRect(x - 8, y + 9, 56, 14);
    ctx.fillStyle = COLORS.teal; ctx.beginPath(); ctx.moveTo(x + 20, y - 14); ctx.lineTo(x + 36, y + 14); ctx.lineTo(x + 20, y + 28); ctx.lineTo(x + 4, y + 14); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(109,245,196,.65)'; ctx.lineWidth = 3; ctx.stroke();
  }
  function drawHero() {
    if (hero.inv > 0 && Math.floor(hero.inv / 5) % 2) return;
    const x = hero.x, y = hero.y;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x + 12, y + 29, 13, 5, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#09231d'; ctx.lineWidth = 3; ctx.strokeRect(x + 3, y + 9, 18, 20); ctx.fillStyle = '#2dd7b5'; ctx.fillRect(x + 4, y + 10, 16, 18);
    ctx.fillStyle = '#ffe0ad'; ctx.fillRect(x + 6, y + 3, 13, 12);
    ctx.fillStyle = '#d9844a'; ctx.beginPath(); ctx.moveTo(x + 5, y + 4); ctx.lineTo(x + 1, y - 5); ctx.lineTo(x + 11, y + 2); ctx.moveTo(x + 18, y + 4); ctx.lineTo(x + 24, y - 5); ctx.lineTo(x + 14, y + 2); ctx.fill();
    ctx.fillStyle = '#10251d';
    if (hero.dir !== 'up') { ctx.fillRect(x + 8, y + 8, 2, 2); ctx.fillRect(x + 15, y + 8, 2, 2); }
    ctx.fillStyle = '#bdfbea'; ctx.fillRect(x + 1, y + 14 + Math.sin(hero.step)*2, 5, 11); ctx.fillRect(x + 19, y + 14 - Math.sin(hero.step)*2, 5, 11);
    if (hero.attack > 0) { const ar = attackRect(); ctx.strokeStyle = '#eaffff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(ar.x + ar.w/2, ar.y + ar.h/2, 18, -.7, Math.PI+.7); ctx.stroke(); }
  }
  function drawEnemy(e) {
    if (!e.alive) return;
    const bob = Math.sin(e.phase * 5) * 3;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(e.x + e.w/2, e.y + e.h, e.w/2, 5, 0, 0, Math.PI*2); ctx.fill();
    if (e.type === 'bat') {
      ctx.strokeStyle = '#241038'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(e.x + 13, e.y + 4 + bob); ctx.lineTo(e.x - 6, e.y + 2); ctx.lineTo(e.x + 5, e.y + 18); ctx.lineTo(e.x + 13, e.y + 12); ctx.lineTo(e.x + 21, e.y + 18); ctx.lineTo(e.x + 32, e.y + 2); ctx.closePath(); ctx.stroke(); ctx.fillStyle = '#a45cff'; ctx.beginPath(); ctx.moveTo(e.x + 13, e.y + 4 + bob); ctx.lineTo(e.x - 6, e.y + 2); ctx.lineTo(e.x + 5, e.y + 18); ctx.lineTo(e.x + 13, e.y + 12); ctx.lineTo(e.x + 21, e.y + 18); ctx.lineTo(e.x + 32, e.y + 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f7efff'; ctx.fillRect(e.x + 10, e.y + 8 + bob, 7, 5);
    } else {
      ctx.strokeStyle = '#0b2b18'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(e.x + 13, e.y + 12 + bob, 15, 12, 0, 0, Math.PI*2); ctx.stroke(); ctx.fillStyle = '#9cff74'; ctx.beginPath(); ctx.ellipse(e.x + 13, e.y + 12 + bob, 14, 11, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#dbffd8'; ctx.fillRect(e.x + 8, e.y + 9 + bob, 4, 4); ctx.fillRect(e.x + 17, e.y + 9 + bob, 4, 4);
    }
  }
  function drawKey() {
    if (hero.hasKey) return;
    const x = keySpot.x + 20, y = keySpot.y + 18 + Math.sin(performance.now()/250)*3;
    ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI*2); ctx.moveTo(x + 7, y); ctx.lineTo(x + 22, y); ctx.moveTo(x + 17, y); ctx.lineTo(x + 17, y + 7); ctx.stroke();
  }
  function drawUI() {
    ctx.fillStyle = COLORS.ui; ctx.fillRect(14, 12, 430, 62); ctx.strokeStyle = 'rgba(109,245,196,.35)'; ctx.lineWidth = 2; ctx.strokeRect(14, 12, 430, 62);
    for (let i = 0; i < hero.maxHp; i++) { ctx.fillStyle = i < hero.hp ? '#ff5570' : '#4b2731'; drawHeart(38 + i*34, 43, 12); }
    ctx.fillStyle = hero.hasKey ? COLORS.gold : '#59635f'; ctx.font = 'bold 24px system-ui'; ctx.fillText('⚿', 230, 50);
    ctx.fillStyle = COLORS.white; ctx.font = 'bold 18px system-ui'; ctx.fillText(gateOpen ? 'Gate open' : (hero.hasKey ? 'Open the gate' : 'Find key'), 268, 48);
    ctx.fillStyle = 'rgba(3, 12, 15, .72)'; ctx.fillRect(14, H - 54, W - 28, 40); ctx.fillStyle = COLORS.white; ctx.font = 'bold 18px system-ui'; ctx.fillText(message, 32, H - 28);
    statusEl.textContent = `${message} HP ${hero.hp}/${hero.maxHp}${hero.hasKey ? ' / key' : ''}${gateOpen ? ' / gate open' : ''}`;
  }
  function drawHeart(x, y, s) { ctx.beginPath(); ctx.moveTo(x, y + s); ctx.bezierCurveTo(x - s*1.6, y - s*.3, x - s*.7, y - s*1.4, x, y - s*.4); ctx.bezierCurveTo(x + s*.7, y - s*1.4, x + s*1.6, y - s*.3, x, y + s); ctx.fill(); }
  function drawOverlay() {
    if (started && !hero.dead && !hero.won) return;
    ctx.fillStyle = 'rgba(2, 8, 10, .62)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = COLORS.white; ctx.textAlign = 'center'; ctx.font = '900 54px system-ui';
    ctx.fillText(hero.won ? 'Shrine Awakened!' : hero.dead ? 'Try Again?' : 'Moon Grove Quest', W/2, H/2 - 45);
    ctx.fillStyle = COLORS.teal; ctx.font = 'bold 22px system-ui'; ctx.fillText('Press Enter to start • WASD/Arrows to move • Space/J to attack', W/2, H/2 + 6);
    ctx.fillStyle = COLORS.gold; ctx.font = 'bold 18px system-ui'; ctx.fillText('Original mini adventure — collect key, open gate, reach shrine', W/2, H/2 + 42);
    ctx.textAlign = 'left';
  }
  function render() {
    ctx.save();
    const sx = (!reduceMotion && shake) ? (Math.random() - .5) * shake : 0, sy = (!reduceMotion && shake) ? (Math.random() - .5) * shake : 0;
    ctx.translate(sx, sy);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) drawTile(x, y, tileAt(x, y));
    drawKey();
    enemies.slice().sort((a,b)=>a.y-b.y).forEach(drawEnemy);
    drawHero();
    for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life / 35); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 4, 4); ctx.globalAlpha = 1; }
    drawUI();
    ctx.restore();
    drawOverlay();
  }
  function loop() { update(); render(); requestAnimationFrame(loop); }

  window.addEventListener('keydown', (e) => {
    const code = e.code === 'Enter' ? 'Enter' : e.code;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyA','KeyS','KeyD','KeyJ','Enter'].includes(code)) e.preventDefault();
    if (!keys.has(code)) pressedOnce.add(code);
    keys.add(code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code === 'Enter' ? 'Enter' : e.code));
  window.addEventListener('blur', () => { keys.clear(); pressedOnce.clear(); });
  canvas.addEventListener('pointerdown', () => { canvas.focus(); if (!started || hero.dead || hero.won) reset(); });
  canvas.addEventListener('click', () => canvas.focus());
  startBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); canvas.focus(); reset(); });
  document.querySelectorAll('.touch-controls button[data-key]').forEach(btn => {
    const key = btn.dataset.key;
    const down = (e) => { e.preventDefault(); if (!keys.has(key)) pressedOnce.add(key); keys.add(key); };
    const up = (e) => { e.preventDefault(); keys.delete(key); };
    btn.addEventListener('pointerdown', down); btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('pointerleave', up);
  });

  // Test hook, intentionally small and read-only for smoke tests.
  window.__moonGrove = { hero, enemies, get started() { return started; }, reset, version: '1.1.0' };
  statusEl.textContent = message;
  render();
  requestAnimationFrame(loop);
})();
