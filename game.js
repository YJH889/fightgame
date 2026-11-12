/* =========================================================
   NEON CLASH —— 横板 2D 格斗
   纯 Canvas 2D，无依赖
   ========================================================= */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */
  const W = 1280, H = 720;
  const GROUND = 610;
  const GRAVITY = 0.92;
  const WALK = 4.8, BACK = 3.9, AIR = 3.6, JUMP_V = -18.4;
  const STAGE_L = 100, STAGE_R = W - 100;
  const MAX_HP = 1000, ROUND_TIME = 60, SPECIAL_COST = 50;

  const TORSO = 74, UARM = 32, FARM = 30, THIGH = 42, SHIN = 44, HEAD_R = 19;

  const FN = 'Impact, "Arial Black", system-ui, sans-serif';
  const FZ = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif';

  /* ---------------- 工具 ---------------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rndi = (a, b) => Math.floor(rnd(a, b + 1));
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const sign = v => (v < 0 ? -1 : 1);

  function hit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /* ---------------- 画布 ---------------- */
  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d', { alpha: false });
  let DPR = 1;

  function fitCanvas() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    cvs.width = Math.round(W * DPR);
    cvs.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  fitCanvas();
  window.addEventListener('resize', () => { fitCanvas(); });

  /* ---------------- 音效 ---------------- */
  const Sound = {
    on: true,
    ac: null,
    unlock() {
      if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ac = new AC();
      } catch (e) { this.ac = null; }
    },
    tone(freq, dur, type, vol, slideTo) {
      if (!this.on || !this.ac) return;
      const ac = this.ac, t = ac.currentTime;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.18, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol, freq) {
      if (!this.on || !this.ac) return;
      const ac = this.ac, t = ac.currentTime;
      const len = Math.floor(ac.sampleRate * dur);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource(); src.buffer = buf;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.value = freq || 1200; bp.Q.value = 1.1;
      const g = ac.createGain(); g.gain.value = vol || 0.2;
      src.connect(bp); bp.connect(g); g.connect(ac.destination);
      src.start(t);
    },
    play(name) {
      if (!this.on) return;
      switch (name) {
        case 'swing': this.noise(0.10, 0.10, 2400); break;
        case 'hit':
          this.tone(150, 0.13, 'sine', 0.30, 60);
          this.noise(0.09, 0.24, 900);
          break;
        case 'heavy':
          this.tone(105, 0.22, 'sine', 0.34, 45);
          this.noise(0.14, 0.30, 620);
          break;
        case 'block':
          this.noise(0.07, 0.18, 3400);
          this.tone(880, 0.06, 'square', 0.09, 520);
          break;
        case 'jump': this.tone(320, 0.10, 'triangle', 0.10, 620); break;
        case 'charge': this.tone(220, 0.34, 'sawtooth', 0.10, 900); break;
        case 'fire': this.tone(760, 0.26, 'square', 0.11, 180); break;
        case 'bell': this.tone(880, 0.5, 'sine', 0.16); this.tone(1320, 0.45, 'sine', 0.07); break;
        case 'ko': this.tone(420, 0.7, 'sawtooth', 0.16, 60); break;
        case 'ui': this.tone(660, 0.07, 'square', 0.07, 880); break;
      }
    }
  };

  /* ---------------- 输入 ---------------- */
  const keys = Object.create(null);
  const KEYMAP = {
    p1: { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', punch: 'KeyJ', kick: 'KeyK', special: 'KeyL' },
    p2: { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', punch: 'Comma', kick: 'Period', special: 'Slash' }
  };
  const BLOCK = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Comma', 'Period', 'Slash']);

  window.addEventListener('keydown', e => {
    if (BLOCK.has(e.code)) e.preventDefault();
    Sound.unlock();
    if (!keys[e.code]) onKeyPress(e.code);
    keys[e.code] = true;
  }, { passive: false });

  window.addEventListener('keyup', e => {
    keys[e.code] = false;
  });

  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  function onKeyPress(code) {
    if (code === 'Enter') {
      if (game.state === 'title') startMatch();
      else if (game.state === 'matchEnd') backToTitle();
    }
    if (code === 'KeyR' && game.state !== 'title') startMatch();
    if (code === 'Escape' && (game.state === 'fight' || game.state === 'countdown')) {
      game.paused = !game.paused;
    }
    if (game.state === 'title') {
      if (code === 'ArrowUp' || code === 'KeyW') { game.mode = (game.mode + 1) % 2; Sound.play('ui'); }
      if (code === 'ArrowDown' || code === 'KeyS') { game.mode = (game.mode + 1) % 2; Sound.play('ui'); }
      if (code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowRight' || code === 'KeyD') {
        game.mode = (game.mode + 1) % 2; Sound.play('ui');
      }
    }
  }

  function readInput(who) {
    const m = KEYMAP[who];
    return {
      left: !!keys[m.left], right: !!keys[m.right], up: !!keys[m.up], down: !!keys[m.down],
      punch: !!keys[m.punch], kick: !!keys[m.kick], special: !!keys[m.special]
    };
  }
  const EMPTY = { left: 0, right: 0, up: 0, down: 0, punch: 0, kick: 0, special: 0 };

  /* 触屏按键 */
  document.querySelectorAll('[data-key]').forEach(el => {
    const code = el.dataset.key;
    const down = e => { e.preventDefault(); Sound.unlock(); keys[code] = true; el.classList.add('active'); };
    const up = e => { e.preventDefault(); keys[code] = false; el.classList.remove('active'); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('contextmenu', e => e.preventDefault());
  });

  /* ---------------- 招式数据 ---------------- */
  const MOVES = {
    punch: { startup: 5, active: 4, recovery: 9, dmg: 38, cx: 30, reach: 116, y0: -122, y1: -72, knock: 5.2, hitstun: 14, blockstun: 8, heavy: false },
    kick: { startup: 10, active: 5, recovery: 19, dmg: 74, cx: 22, reach: 162, y0: -108, y1: -38, knock: 10.5, hitstun: 23, blockstun: 13, heavy: true },
    air: { startup: 5, active: 9, recovery: 12, dmg: 58, cx: 16, reach: 130, y0: -100, y1: -22, knock: 7.4, hitstun: 18, blockstun: 10, heavy: false, air: true },
    special: { startup: 18, active: 3, recovery: 30, projectile: true }
  };

  function attackBox(f, m) {
    const x1 = f.x + f.facing * m.cx;
    const x2 = f.x + f.facing * m.reach;
    return { x: Math.min(x1, x2), y: f.y + m.y0, w: Math.abs(x2 - x1), h: m.y1 - m.y0 };
  }

  /* ---------------- 特效 ---------------- */
  const parts = [];
  const texts = [];
  const projectiles = [];

  function spark(x, y, big, dir, blocked) {
    const n = blocked ? 9 : big ? 20 : 13;
    const base = blocked ? '#9fd8ff' : big ? '#ffd166' : '#fff2b8';
    for (let i = 0; i < n; i++) {
      const a = rnd(-Math.PI, Math.PI);
      const sp = rnd(big ? 4 : 2, big ? 13 : 8);
      parts.push({
        x, y, vx: Math.cos(a) * sp + dir * rnd(0, 3), vy: Math.sin(a) * sp - rnd(0, 2),
        life: rnd(12, 24), max: 24, r: rnd(1.6, big ? 4.6 : 3.4),
        c: blocked ? base : (Math.random() < 0.5 ? base : '#ff7a59'), type: 'spark'
      });
    }
    parts.push({ x, y, vx: 0, vy: 0, life: 10, max: 10, r: big ? 54 : 34, c: blocked ? '#7dd3fc' : '#ffe9a8', type: 'ring' });
  }

  function dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      parts.push({
        x: x + rnd(-20, 20), y: y - rnd(0, 6),
        vx: rnd(-2.6, 2.6), vy: rnd(-2.4, -0.3),
        life: rnd(16, 30), max: 30, r: rnd(2, 5.5), c: '#9fb3d9', type: 'dust'
      });
    }
  }

  function floatText(x, y, str, color, size) {
    texts.push({ x, y, str, color, size: size || 26, life: 46, max: 46, vy: -1.5 });
  }

  function updateVfx() {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life--;
      if (p.type === 'ring') { p.r *= 0.92; }
      else {
        p.x += p.vx; p.y += p.vy;
        p.vy += p.type === 'dust' ? 0.08 : 0.42;
        p.vx *= 0.96;
      }
      if (p.life <= 0) parts.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.life--; t.y += t.vy; t.vy *= 0.94;
      if (t.life <= 0) texts.splice(i, 1);
    }
    if (parts.length > 420) parts.splice(0, parts.length - 420);
  }

  function drawVfx() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      const a = p.life / p.max;
      if (p.type === 'ring') {
        ctx.globalAlpha = a * 0.55;
        ctx.strokeStyle = p.c;
        ctx.lineWidth = 3 * a + 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.globalAlpha = a * (p.type === 'dust' ? 0.4 : 0.9);
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (p.type === 'dust' ? 1 : a + 0.25), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();

    for (const t of texts) {
      const a = clamp(t.life / t.max * 1.6, 0, 1);
      const s = 1 + (1 - t.life / t.max) * 0.22;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(t.x, t.y);
      ctx.scale(s, s);
      ctx.font = `${t.size}px ${FN}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(8,4,18,.85)';
      ctx.strokeText(t.str, 0, 0);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, 0, 0);
      ctx.restore();
    }
  }

  /* ---------------- 战士 ---------------- */
  let UID = 0;

  class Fighter {
    constructor(cfg) {
      this.id = ++UID;
      this.name = cfg.name;
      this.colors = cfg.colors;
      this.maxHp = MAX_HP;
      this.isAI = !!cfg.isAI;
      this.reset(cfg.x, cfg.facing);
    }

    reset(x, facing) {
      this.x = x; this.y = GROUND;
      this.vx = 0; this.vy = 0;
      this.facing = facing;
      this.hp = MAX_HP; this.hpShown = MAX_HP;
      this.meter = 0;
      this.state = 'idle'; this.t = 0; this.anim = rndi(0, 60);
      this.onGround = true;
      this.hitstun = 0; this.blockstun = 0;
      this.move = null; this.hasHit = false;
      this.combo = 0; this.comboTimer = 0;
      this.flash = 0;
      this.airAttackUsed = false;
      this.prev = { punch: 0, kick: 0, special: 0, up: 0 };
      this.ai = { cd: 0, action: 'approach', blockFor: 0 };
      this.koT = 0;
    }

    bodyBox() {
      const h = this.state === 'block' ? 96 : (this.state === 'ko' ? 48 : 112);
      return { x: this.x - 30, y: this.y - h, w: 60, h: h };
    }

    jump() {
      this.vy = JUMP_V; this.onGround = false; this.state = 'jump';
      this.airAttackUsed = false;
      dust(this.x, GROUND, 6);
      Sound.play('jump');
    }

    startMove(name) {
      const m = MOVES[name];
      if (!m) return;
      if (name === 'special') {
        if (this.meter < SPECIAL_COST) return;
        this.meter -= SPECIAL_COST;
        Sound.play('charge');
      } else {
        Sound.play('swing');
      }
      this.state = 'attack';
      this.move = name;
      this.t = 0;
      this.hasHit = false;
    }

    step(inp, opp) {
      this.anim++;
      if (this.comboTimer > 0) { this.comboTimer--; if (this.comboTimer === 0) this.combo = 0; }
      if (this.flash > 0) this.flash--;

      if (this.state !== 'ko' && this.state !== 'win' && this.hitstun <= 0 && this.state !== 'attack') {
        this.facing = opp.x >= this.x ? 1 : -1;
      }

      if (this.state === 'ko') {
        this.koT++;
        this.state = 'ko';
      } else if (this.state === 'win') {
        // 保持胜利姿态
      } else if (this.hitstun > 0) {
        this.hitstun--;
        this.state = 'hurt';
        if (this.hitstun === 0 && this.onGround) { this.state = 'idle'; }
      } else if (this.state === 'attack') {
        this.stepAttack(opp);
      } else {
        if (this.blockstun > 0) this.blockstun--;
        if (this.blockstun > 0) {
          this.state = 'block';
        } else {
          this.handleInput(inp, opp);
        }
      }

      this.physics();
      this.prev = { punch: inp.punch, kick: inp.kick, special: inp.special, up: inp.up };
      this.hpShown += (this.hp - this.hpShown) * 0.07;
      if (Math.abs(this.hp - this.hpShown) < 0.6) this.hpShown = this.hp;
    }

    handleInput(inp, opp) {
      if (this.onGround) {
        if (inp.down) { this.state = 'block'; this.vx *= 0.4; return; }

        if (inp.punch && !this.prev.punch) { this.startMove('punch'); return; }
        if (inp.kick && !this.prev.kick) { this.startMove('kick'); return; }
        if (inp.special && !this.prev.special && this.meter >= SPECIAL_COST) { this.startMove('special'); return; }
        if (inp.up && !this.prev.up) { this.jump(); return; }

        const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        if (dir !== 0) {
          const sp = dir === this.facing ? WALK : BACK;
          this.x += dir * sp;
          this.state = 'walk';
        } else {
          this.state = 'idle';
        }
      } else {
        this.state = 'jump';
        const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        if (dir !== 0) this.x += dir * AIR;
        if (!this.airAttackUsed && (inp.punch || inp.kick)) {
          this.airAttackUsed = true;
          this.startMove('air');
        }
      }
    }

    stepAttack(opp) {
      const m = MOVES[this.move];
      if (!m) { this.state = 'idle'; return; }
      this.t++;

      if (m.projectile) {
        if (this.t === m.startup) fireProjectile(this);
        if (this.t >= m.startup + m.active + m.recovery) { this.state = 'idle'; this.move = null; this.t = 0; }
        return;
      }

      const a0 = m.startup, a1 = m.startup + m.active;
      if (this.t >= a0 && this.t < a1 && !this.hasHit) {
        const box = attackBox(this, m);
        if (hit(box, opp.bodyBox())) {
          this.hasHit = true;
          resolveHit(this, opp, m, box);
        }
      }
      if (this.t >= a0 + m.active + m.recovery) {
        this.state = this.onGround ? 'idle' : 'jump';
        this.move = null; this.t = 0;
      }
    }

    physics() {
      this.vy += GRAVITY;
      this.x += this.vx;
      this.y += this.vy;

      if (this.y >= GROUND) {
        if (!this.onGround && this.vy > 6) dust(this.x, GROUND, 7);
        this.y = GROUND;
        this.vy = 0;
        const wasAir = !this.onGround;
        this.onGround = true;
        this.airAttackUsed = false;
        if (wasAir && this.state === 'attack' && this.move === 'air') {
          this.state = 'idle'; this.move = null; this.t = 0;
        } else if (wasAir && (this.state === 'hurt' || this.state === 'jump') && this.hitstun <= 0) {
          this.state = 'idle'; this.t = 0;
        }
      } else {
        this.onGround = false;
      }

      this.vx *= this.onGround ? 0.80 : 0.985;
      if (Math.abs(this.vx) < 0.06) this.vx = 0;
      this.x = clamp(this.x, STAGE_L, STAGE_R);
    }
  }

  /* ---------------- 命中结算 ---------------- */
  function resolveHit(a, d, m, box) {
    const dir = a.facing;
    const hx = clamp(d.x - dir * 18, box.x, box.x + box.w);
    const hy = box.y + box.h * 0.5;

    // 连段递减
    const scale = Math.max(0.45, 1 - 0.11 * Math.max(0, a.combo));

    if (d.state === 'block') {
      const dmg = Math.round(10 + m.dmg * 0.06);
      d.hp = Math.max(0, d.hp - dmg);
      d.blockstun = m.blockstun;
      d.vx = dir * (m.heavy ? 3.4 : 2.0);
      d.meter = Math.min(100, d.meter + 5);
      a.meter = Math.min(100, a.meter + 3);
      spark(hx, hy, false, dir, true);
      Sound.play('block');
      game.shake = Math.max(game.shake, m.heavy ? 5 : 3);
      floatText(hx, hy - 20, 'GUARD', '#9fd8ff', 18);
      return;
    }

    const dmg = Math.round(m.dmg * scale);
    d.hp = Math.max(0, d.hp - dmg);
    d.hitstun = m.hitstun;
    d.state = 'hurt';
    d.flash = 7;
    d.move = null;
    d.vx = dir * m.knock;
    if (m.heavy) d.vy = Math.min(d.vy, -3.2);

    a.combo++;
    a.comboTimer = 100;
    a.meter = Math.min(100, a.meter + 9);
    d.meter = Math.min(100, d.meter + 6);

    spark(hx, hy, m.heavy, dir, false);
    Sound.play(m.heavy ? 'heavy' : 'hit');
    game.shake = Math.max(game.shake, m.heavy ? 13 : 7);
    game.hitStop = Math.max(game.hitStop, m.heavy ? 6 : 3);
    floatText(hx, hy - 26, '-' + dmg, m.heavy ? '#ffd166' : '#ffffff', m.heavy ? 30 : 24);

    if (a.combo >= 2) {
      floatText(a.x + dir * 60, a.y - 190, a.combo + ' HIT!', '#7dd3fc', 26);
    }
    if (d.hp <= 0) knockOut(d);
  }

  function knockOut(f) {
    f.state = 'ko';
    f.koT = 0;
    f.vx = f.facing * -6;
    f.vy = -8;
    Sound.play('ko');
    game.shake = 22;
    game.hitStop = 10;
  }

  /* ---------------- 弹幕 ---------------- */
  function fireProjectile(f) {
    projectiles.push({
      x: f.x + f.facing * 46, y: f.y - 120,
      vx: f.facing * 11.5, owner: f, r: 21, life: 150, t: 0,
      dmg: 96, knock: 12, hitstun: 26
    });
    Sound.play('fire');
    game.shake = Math.max(game.shake, 4);
  }

  function updateProjectiles() {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += p.vx; p.t++; p.life--;
      const box = { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 };
      const target = p.owner === game.p1 ? game.p2 : game.p1;
      let dead = p.life <= 0 || p.x < -60 || p.x > W + 60;

      if (!dead && target.state !== 'ko' && hit(box, target.bodyBox())) {
        dead = true;
        const d = target;
        if (d.state === 'block') {
          d.hp = Math.max(0, d.hp - 14);
          d.blockstun = 16;
          d.vx = sign(p.vx) * 3;
          spark(p.x, p.y, false, sign(p.vx), true);
          Sound.play('block');
        } else {
          d.hp = Math.max(0, d.hp - p.dmg);
          d.hitstun = p.hitstun;
          d.state = 'hurt';
          d.flash = 9;
          d.move = null;
          d.vx = sign(p.vx) * p.knock;
          d.vy = -5;
          spark(p.x, p.y, true, sign(p.vx), false);
          Sound.play('heavy');
          game.shake = 16;
          game.hitStop = 7;
          floatText(p.x, p.y - 30, '-' + p.dmg, '#ffd166', 30);
          if (d.hp <= 0) knockOut(d);
        }
      }

      if (dead) {
        spark(p.x, p.y, true, sign(p.vx), false);
        projectiles.splice(i, 1);
      } else if (p.t % 3 === 0) {
        parts.push({
          x: p.x + rnd(-8, 8), y: p.y + rnd(-10, 10), vx: -p.vx * 0.12, vy: rnd(-1, 1),
          life: 14, max: 14, r: rnd(2, 6), c: '#7dd3fc', type: 'spark'
        });
      }
    }
  }

  function drawProjectiles() {
    for (const p of projectiles) {
      const pulse = 1 + Math.sin(p.t * 0.5) * 0.1;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r * 2.4 * pulse);
      g.addColorStop(0, 'rgba(255,255,255,.95)');
      g.addColorStop(0.35, 'rgba(125,211,252,.85)');
      g.addColorStop(1, 'rgba(56,110,253,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.4 * pulse, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = 'rgba(230,250,255,.95)';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.55 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  /* ---------------- 姿态 ---------------- */
  function limb(o, a1, l1, a2, l2) {
    const p1 = { x: o.x + Math.sin(a1) * l1, y: o.y + Math.cos(a1) * l1 };
    const p2 = { x: p1.x + Math.sin(a1 + a2) * l2, y: p1.y + Math.cos(a1 + a2) * l2 };
    return [p1, p2];
  }

  function poseFor(f) {
    const s = f.state;
    const t = f.anim;
    const P = {
      hipY: -86, lean: -0.05, ox: 0, oy: 0,
      armF: [0.55, 1.75], armB: [0.35, 1.55],
      legF: [0.12, -0.22], legB: [-0.16, -0.02]
    };

    if (s === 'idle') {
      const b = Math.sin(t * 0.07);
      P.hipY = -86 + b * 1.5;
      P.lean = -0.05 + b * 0.02;
      P.armF[0] += b * 0.06;
      P.armB[0] -= b * 0.05;
      P.armF[1] += b * 0.05;
    } else if (s === 'walk') {
      const ph = Math.sin(t * 0.26);
      P.hipY = -86 + Math.abs(ph) * 2.6;
      P.legF = [ph * 0.62, -0.30 - Math.max(0, ph) * 0.24];
      P.legB = [-ph * 0.62, -0.12 - Math.max(0, -ph) * 0.34];
      P.armF = [0.55 - ph * 0.34, 1.72];
      P.armB = [0.35 + ph * 0.44, 1.5];
      P.lean = 0.03;
    } else if (s === 'block') {
      P.hipY = -72; P.lean = -0.18;
      P.armF = [1.15, 1.8]; P.armB = [0.95, 1.9];
      P.legF = [0.32, -0.62]; P.legB = [-0.38, -0.5];
    } else if (s === 'jump') {
      P.hipY = -84; P.lean = -0.08;
      P.legF = [0.95, -1.15]; P.legB = [0.15, -1.7];
      P.armF = [1.0, 1.5]; P.armB = [-0.5, 1.2];
    } else if (s === 'hurt') {
      P.hipY = -84; P.lean = -0.46;
      P.armF = [-0.42, 1.3]; P.armB = [-0.72, 1.1];
      P.legF = [0.46, -0.42]; P.legB = [-0.3, -0.2];
      P.ox = -4;
    } else if (s === 'win') {
      const b = Math.sin(t * 0.12);
      P.hipY = -86 + b * 3;
      P.armF = [2.95, 0.3]; P.armB = [2.7, 0.45];
      P.legF = [0.16, -0.2]; P.legB = [-0.2, -0.05];
      P.lean = 0.04;
    } else if (s === 'attack') {
      const m = MOVES[f.move] || MOVES.punch;
      const tt = f.t;

      if (f.move === 'punch') {
        if (tt < m.startup) {
          const k = tt / m.startup;
          P.armF = [lerp(0.55, 0.15, k), lerp(1.75, 2.0, k)];
          P.armB = [lerp(0.35, 0.7, k), 1.5];
          P.lean = lerp(-0.05, -0.2, k);
          P.legF = [0.2, -0.32]; P.legB = [-0.26, -0.04];
        } else {
          const e = easeOut(clamp((tt - m.startup) / 7, 0, 1));
          P.armF = [lerp(0.15, 1.6, e), lerp(2.0, 0.02, e)];
          P.armB = [lerp(0.7, -0.3, e), lerp(1.5, 1.05, e)];
          P.lean = lerp(-0.2, 0.15, e);
          P.legF = [0.26, -0.26]; P.legB = [-0.3, -0.02];
          P.ox = e * 9;
        }
      } else if (f.move === 'kick') {
        if (tt < m.startup) {
          const k = tt / m.startup;
          P.lean = lerp(-0.05, -0.22, k);
          P.legB = [lerp(-0.16, -0.4, k), lerp(-0.02, -1.0, k)];
          P.hipY = lerp(-86, -80, k);
          P.armF = [lerp(0.55, 0.95, k), 1.5];
          P.armB = [lerp(0.35, -0.55, k), 1.15];
        } else {
          const e = easeOut(clamp((tt - m.startup) / 8, 0, 1));
          P.lean = lerp(-0.22, -0.48, e);
          P.legB = [lerp(-0.4, 1.88, e), lerp(-1.0, 0.14, e)];
          P.legF = [0.14, -0.16];
          P.hipY = -86 + e * 5;
          P.armF = [lerp(0.95, 1.35, e), 1.2];
          P.armB = [lerp(-0.55, -1.15, e), 0.95];
          P.ox = e * 6;
        }
      } else if (f.move === 'air') {
        if (tt < m.startup) {
          P.legF = [0.6, -1.1]; P.legB = [0.1, -1.5];
          P.armF = [0.9, 1.5]; P.armB = [-0.4, 1.2];
          P.lean = -0.2;
        } else {
          const e = easeOut(clamp((tt - m.startup) / 6, 0, 1));
          P.legF = [lerp(0.6, 1.42, e), lerp(-1.1, 0.06, e)];
          P.legB = [lerp(0.1, -0.35, e), lerp(-1.5, -1.1, e)];
          P.armF = [1.3, 1.0]; P.armB = [-0.8, 0.9];
          P.lean = lerp(-0.2, 0.12, e);
        }
      } else if (f.move === 'special') {
        if (tt < m.startup) {
          const k = tt / m.startup;
          P.lean = lerp(-0.05, -0.26, k);
          P.armF = [lerp(0.55, -0.5, k), lerp(1.75, 1.35, k)];
          P.armB = [lerp(0.35, -0.75, k), lerp(1.55, 1.25, k)];
          P.hipY = -86 + Math.sin(tt * 0.9) * 1.6;
          P.legF = [0.3, -0.5]; P.legB = [-0.34, -0.36];
        } else {
          const e = easeOut(clamp((tt - m.startup) / 6, 0, 1));
          P.lean = lerp(-0.26, 0.08, e);
          P.armF = [lerp(-0.5, 1.68, e), lerp(1.35, 0.03, e)];
          P.armB = [lerp(-0.75, 1.5, e), lerp(1.25, 0.25, e)];
          P.legF = [0.34, -0.42]; P.legB = [-0.4, -0.3];
        }
      }
    }
    return P;
  }

  /* ---------------- 绘制战士 ---------------- */
  function seg(a, b, w, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function bone(a, b, w, col, edge) {
    seg(a, b, w + 5, edge);
    seg(a, b, w, col);
  }

  function drawFighter(f) {
    const c = f.colors;
    const airT = clamp((GROUND - f.y) / 260, 0, 1);

    // 影子
    ctx.save();
    ctx.globalAlpha = 0.34 * (1 - airT * 0.75);
    ctx.fillStyle = '#05020d';
    ctx.beginPath();
    ctx.ellipse(f.x, GROUND + 6, 48 * (1 - airT * 0.4), 13 * (1 - airT * 0.4), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const P = poseFor(f);
    const flash = f.flash > 0 && f.flash % 4 < 2;
    const main = flash ? '#ffffff' : c.main;
    const dark = flash ? '#dfe9ff' : c.dark;
    const accent = flash ? '#ffffff' : c.accent;

    ctx.save();
    ctx.translate(f.x + P.ox, f.y + P.oy);
    ctx.scale(f.facing, 1);

    if (f.state === 'ko') {
      const p = easeOut(clamp(f.koT / 26, 0, 1));
      ctx.rotate(-p * 1.5);
      ctx.translate(0, -p * 8);
    }

    const hip = { x: 0, y: P.hipY };
    const sho = { x: Math.sin(P.lean) * TORSO, y: hip.y - Math.cos(P.lean) * TORSO };
    const neck = { x: sho.x + Math.sin(P.lean) * 13, y: sho.y - Math.cos(P.lean) * 13 };
    const head = { x: neck.x + Math.sin(P.lean) * HEAD_R * 0.75, y: neck.y - HEAD_R * 0.85 };
    const px = Math.cos(P.lean), py = Math.sin(P.lean);

    const [elbB, handB] = limb(sho, P.armB[0], UARM, P.armB[1], FARM);
    const [kneeB, footB] = limb(hip, P.legB[0], THIGH, P.legB[1], SHIN);
    const [elbF, handF] = limb(sho, P.armF[0], UARM, P.armF[1], FARM);
    const [kneeF, footF] = limb(hip, P.legF[0], THIGH, P.legF[1], SHIN);

    // 飘带（身后）
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = accent;
    ctx.lineCap = 'round';
    const wav = Math.sin(f.anim * 0.11);
    const wav2 = Math.sin(f.anim * 0.11 + 1.1);
    const sx0 = sho.x - 4, sy0 = sho.y + 8;
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(sx0, sy0);
    ctx.quadraticCurveTo(sx0 - 26, sy0 + 12 + wav * 7, sx0 - 50, sy0 + 34 + wav2 * 11);
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.32;
    ctx.beginPath();
    ctx.moveTo(sx0, sy0 + 3);
    ctx.quadraticCurveTo(sx0 - 22, sy0 + 22 + wav2 * 6, sx0 - 42, sy0 + 46 + wav * 9);
    ctx.stroke();
    ctx.restore();

    // 后腿 / 后臂
    bone(hip, kneeB, 15, dark, 'rgba(4,2,12,.55)');
    bone(kneeB, footB, 12, dark, 'rgba(4,2,12,.55)');
    drawBoot(footB, kneeB, dark, accent);

    bone(sho, elbB, 12, dark, 'rgba(4,2,12,.55)');
    bone(elbB, handB, 10, dark, 'rgba(4,2,12,.55)');
    drawGlove(handB, dark, accent);

    // 躯干
    const wS = 27, wH = 16;
    const mid = { x: (sho.x + hip.x) / 2, y: (sho.y + hip.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(sho.x + px * wS, sho.y + py * wS);
    ctx.quadraticCurveTo(mid.x + px * (wS + 4), mid.y + py * (wS + 4), hip.x + px * wH, hip.y + py * wH);
    ctx.lineTo(hip.x - px * wH, hip.y - py * wH);
    ctx.quadraticCurveTo(mid.x - px * (wS + 4), mid.y - py * (wS + 4), sho.x - px * wS, sho.y - py * wS);
    ctx.closePath();
    const tg = ctx.createLinearGradient(sho.x + px * wS, sho.y, sho.x - px * wS, sho.y);
    tg.addColorStop(0, main);
    tg.addColorStop(0.55, main);
    tg.addColorStop(1, dark);
    ctx.fillStyle = tg;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(4,2,12,.5)';
    ctx.stroke();

    // 胸口标识
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    const chX = mid.x + px * 12, chY = mid.y + py * 6;
    ctx.beginPath();
    ctx.moveTo(chX + 8, chY - 10);
    ctx.lineTo(chX - 4, chY);
    ctx.lineTo(chX + 6, chY + 10);
    ctx.stroke();
    ctx.restore();

    // 前腿 / 前臂
    bone(hip, kneeF, 16, main, 'rgba(4,2,12,.55)');
    bone(kneeF, footF, 13, main, 'rgba(4,2,12,.55)');
    drawBoot(footF, kneeF, main, accent);

    bone(sho, elbF, 13, main, 'rgba(4,2,12,.55)');
    bone(elbF, handF, 11, main, 'rgba(4,2,12,.55)');
    drawGlove(handF, main, accent);

    // 头
    ctx.save();
    // 颈
    seg({ x: sho.x + px * 4, y: sho.y - 2 }, { x: head.x, y: head.y + HEAD_R * 0.5 }, 12, dark);
    // 头骨
    const hg = ctx.createLinearGradient(head.x - HEAD_R, head.y - HEAD_R, head.x + HEAD_R, head.y + HEAD_R);
    hg.addColorStop(0, main);
    hg.addColorStop(1, dark);
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.ellipse(head.x, head.y, HEAD_R, HEAD_R * 1.06, P.lean, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(4,2,12,.5)';
    ctx.stroke();

    // 面罩
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(head.x + 7, head.y + 1, HEAD_R * 0.55, HEAD_R * 0.34, P.lean + 0.15, 0, Math.PI * 2);
    ctx.fill();

    // 头顶尖角
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(head.x - HEAD_R * 0.5, head.y - HEAD_R * 0.82);
    ctx.lineTo(head.x - HEAD_R * 0.05, head.y - HEAD_R * 1.5);
    ctx.lineTo(head.x + HEAD_R * 0.35, head.y - HEAD_R * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();

    // 蓄力光环
    if (f.state === 'attack' && f.move === 'special' && f.t < MOVES.special.startup) {
      const k = f.t / MOVES.special.startup;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 + Math.sin(f.t * 0.8) * 0.25;
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.x, f.y - 110, 40 * (1.2 - k * 0.4), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 必杀可用提示
    if (f.meter >= SPECIAL_COST && f.state !== 'ko') {
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(f.anim * 0.14) * 0.2;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = f.colors.accent;
      ctx.beginPath();
      ctx.ellipse(f.x, f.y + 8, 44, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawGlove(p, col, accent) {
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(4,2,12,.45)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(p.x - 2, p.y - 2, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawBoot(foot, knee, col, accent) {
    const ang = Math.atan2(foot.x - knee.x, foot.y - knee.y);
    ctx.save();
    ctx.translate(foot.x, foot.y);
    ctx.rotate(-ang * 0.85);
    ctx.fillStyle = col;
    ctx.strokeStyle = 'rgba(4,2,12,.5)';
    ctx.lineWidth = 3;
    roundRect(-9, -6, 26, 15, 7);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.85;
    roundRect(2, -3, 12, 4.5, 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------------- 背景 ---------------- */
  let bgCanvas = null;

  function buildBackground() {
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = W; bgCanvas.height = H;
    const b = bgCanvas.getContext('2d');

    // 夜空
    const sky = b.createLinearGradient(0, 0, 0, GROUND + 20);
    sky.addColorStop(0, '#0a0618');
    sky.addColorStop(0.34, '#1a0f34');
    sky.addColorStop(0.62, '#38184c');
    sky.addColorStop(0.86, '#7b2a52');
    sky.addColorStop(1, '#c9603f');
    b.fillStyle = sky;
    b.fillRect(0, 0, W, GROUND + 20);

    // 星星
    for (let i = 0; i < 130; i++) {
      const x = rnd(0, W), y = rnd(0, 380);
      const a = rnd(0.08, 0.45) * (1 - y / 460);
      b.fillStyle = `rgba(200,225,255,${a})`;
      b.fillRect(x, y, rnd(1, 2.2), rnd(1, 2.2));
    }

    // 月亮
    const mx = 1010, my = 132;
    const mg = b.createRadialGradient(mx, my, 10, mx, my, 210);
    mg.addColorStop(0, 'rgba(255,220,170,.45)');
    mg.addColorStop(0.35, 'rgba(255,170,120,.12)');
    mg.addColorStop(1, 'rgba(255,150,110,0)');
    b.fillStyle = mg;
    b.fillRect(mx - 220, my - 220, 440, 440);
    b.fillStyle = 'rgba(255,238,214,.95)';
    b.beginPath(); b.arc(mx, my, 46, 0, Math.PI * 2); b.fill();
    b.fillStyle = 'rgba(255,205,160,.35)';
    b.beginPath(); b.arc(mx - 12, my - 10, 12, 0, Math.PI * 2); b.fill();
    b.beginPath(); b.arc(mx + 14, my + 14, 8, 0, Math.PI * 2); b.fill();

    // 远景楼群
    let x = -60;
    while (x < W + 80) {
      const w = rnd(58, 130), h = rnd(150, 360);
      b.fillStyle = '#180e2c';
      b.fillRect(x, GROUND - h, w, h);
      b.fillStyle = 'rgba(255,255,255,.03)';
      b.fillRect(x, GROUND - h, w, 3);
      // 天线
      if (Math.random() < 0.3) {
        b.fillStyle = '#180e2c';
        b.fillRect(x + w / 2, GROUND - h - rnd(20, 55), 3, 60);
        b.fillStyle = 'rgba(255,90,90,.7)';
        b.beginPath(); b.arc(x + w / 2 + 1.5, GROUND - h - 26, 2.6, 0, Math.PI * 2); b.fill();
      }
      x += w + rnd(4, 18);
    }

    // 中景楼群（带窗）
    x = -40;
    while (x < W + 60) {
      const w = rnd(80, 160), h = rnd(190, 400);
      const top = GROUND - h;
      b.fillStyle = '#0f0a1e';
      b.fillRect(x, top, w, h);
      b.fillStyle = 'rgba(120,170,255,.10)';
      b.fillRect(x, top, w, 2);

      for (let wy = top + 14; wy < GROUND - 16; wy += 22) {
        for (let wx = x + 10; wx < x + w - 12; wx += 18) {
          if (Math.random() < 0.35) {
            const warm = Math.random() < 0.75;
            b.fillStyle = warm ? `rgba(255,205,120,${rnd(0.25, 0.75)})` : `rgba(140,210,255,${rnd(0.2, 0.6)})`;
            b.fillRect(wx, wy, 7, 10);
          }
        }
      }

      // 霓虹招牌
      if (Math.random() < 0.55) {
        const sw = rnd(28, 60), sh = rnd(60, 130);
        const sx = x + rnd(6, Math.max(8, w - sw - 6));
        const sy = top + rnd(20, Math.max(24, h * 0.5));
        const col = ['#ff3d81', '#39e0ff', '#ffd166', '#a855f7'][rndi(0, 3)];
        b.save();
        b.shadowColor = col;
        b.shadowBlur = 22;
        b.strokeStyle = col;
        b.lineWidth = 2.5;
        b.globalAlpha = 0.85;
        b.strokeRect(sx, sy, sw, sh);
        b.globalAlpha = 0.65;
        for (let i = 0; i < 4; i++) {
          b.fillStyle = col;
          b.fillRect(sx + 8, sy + 10 + i * (sh / 5), sw - 16, 4);
        }
        b.restore();
      }
      x += w + rnd(6, 26);
    }

    // 雾
    const fog = b.createLinearGradient(0, GROUND - 220, 0, GROUND);
    fog.addColorStop(0, 'rgba(255,120,90,0)');
    fog.addColorStop(0.55, 'rgba(255,110,110,.10)');
    fog.addColorStop(1, 'rgba(180,90,140,.28)');
    b.fillStyle = fog;
    b.fillRect(0, GROUND - 240, W, 240);

    // 地面
    const gg = b.createLinearGradient(0, GROUND, 0, H);
    gg.addColorStop(0, '#241738');
    gg.addColorStop(0.25, '#150d24');
    gg.addColorStop(1, '#08040f');
    b.fillStyle = gg;
    b.fillRect(0, GROUND, W, H - GROUND);

    // 地面边缘霓虹
    b.save();
    b.shadowColor = 'rgba(120,200,255,.9)';
    b.shadowBlur = 18;
    b.fillStyle = 'rgba(150,215,255,.85)';
    b.fillRect(0, GROUND - 2, W, 2.5);
    b.restore();

    // 透视网格
    b.save();
    b.strokeStyle = 'rgba(125,211,252,.16)';
    b.lineWidth = 1.4;
    for (let i = -9; i <= 9; i++) {
      b.beginPath();
      b.moveTo(W / 2 + i * 118, GROUND);
      b.lineTo(W / 2 + i * 340, H + 40);
      b.stroke();
    }
    for (let i = 1; i < 7; i++) {
      const y = GROUND + Math.pow(i / 7, 2.1) * (H - GROUND);
      b.globalAlpha = 1 - i / 9;
      b.beginPath();
      b.moveTo(0, y); b.lineTo(W, y);
      b.stroke();
    }
    b.restore();

    // 地面上方光晕
    const glow = b.createLinearGradient(0, GROUND - 90, 0, GROUND);
    glow.addColorStop(0, 'rgba(125,211,252,0)');
    glow.addColorStop(1, 'rgba(125,211,252,.12)');
    b.fillStyle = glow;
    b.fillRect(0, GROUND - 90, W, 90);
  }
  buildBackground();

  /* ---------------- 游戏状态 ---------------- */
  const game = {
    state: 'title',
    mode: 0,            // 0 = 1P, 1 = 2P
    time: 0,
    timer: ROUND_TIME * 60,
    round: 1,
    wins: [0, 0],
    stateT: 0,
    announce: '',
    announceSub: '',
    announceT: 0,
    announceDur: 0,
    announceAge: 0,
    hitStop: 0,
    shake: 0,
    paused: false,
    flash: 0,
    p1: null,
    p2: null,
    get fighters() { return [this.p1, this.p2]; }
  };

  game.p1 = new Fighter({
    name: 'P1', x: 440, facing: 1,
    colors: { main: '#2f6bff', dark: '#16307a', accent: '#5ff0ff', hp1: '#4fd1ff', hp2: '#2563eb' }
  });
  game.p2 = new Fighter({
    name: 'P2', x: 840, facing: -1,
    colors: { main: '#ff3f63', dark: '#8e0f2b', accent: '#ffd166', hp1: '#ffb03a', hp2: '#f43f5e' }
  });

  function announce(main, sub, dur) {
    game.announce = main;
    game.announceSub = sub || '';
    game.announceDur = dur || 40;
    game.announceT = game.announceDur;
    game.announceAge = 0;
  }

  function startMatch() {
    Sound.unlock();
    game.p2.isAI = game.mode === 0;
    game.round = 1;
    game.wins = [0, 0];
    game.paused = false;
    projectiles.length = 0;
    parts.length = 0;
    texts.length = 0;
    startRound();
  }

  function startRound() {
    game.p1.reset(440, 1);
    game.p2.reset(840, -1);
    game.p2.isAI = game.mode === 0;
    game.timer = ROUND_TIME * 60;
    game.state = 'countdown';
    game.stateT = 0;
    game.hitStop = 0;
    game.shake = 0;
    projectiles.length = 0;
    announce('ROUND ' + game.round, '', 999);
    Sound.play('bell');
  }

  function backToTitle() {
    game.state = 'title';
    game.stateT = 0;
    game.p1.reset(440, 1);
    game.p2.reset(840, -1);
    projectiles.length = 0;
    parts.length = 0;
    texts.length = 0;
  }

  /* ---------------- AI ---------------- */
  function aiInput(me, opp) {
    const inp = { left: 0, right: 0, up: 0, down: 0, punch: 0, kick: 0, special: 0 };
    const A = me.ai;
    const dx = opp.x - me.x;
    const ad = Math.abs(dx);
    const dirTo = dx >= 0 ? 1 : -1;

    A.cd--;
    if (A.blockFor > 0) { A.blockFor--; inp.down = 1; return inp; }

    // 应对对方出招
    if (opp.state === 'attack') {
      const m = MOVES[opp.move];
      if (m && !m.projectile) {
        const threat = opp.t <= m.startup + 3 && ad < m.reach + 50;
        if (threat && Math.random() < 0.13) { A.blockFor = rndi(14, 24); inp.down = 1; return inp; }
      }
    }
    // 躲弹幕
    for (const p of projectiles) {
      if (p.owner !== me && Math.abs(p.x - me.x) < 200 && sign(p.vx) === sign(me.x - p.x) * -1) {
        if (Math.random() < 0.06) { A.blockFor = 10; inp.down = 1; return inp; }
      }
    }

    if (A.cd <= 0) {
      A.cd = rndi(5, 13);
      if (me.meter >= SPECIAL_COST && ad > 230 && ad < 520 && Math.random() < 0.55) A.action = 'special';
      else if (ad > 260) A.action = Math.random() < 0.86 ? 'approach' : 'jump';
      else if (ad > 165) A.action = Math.random() < 0.55 ? 'approach' : 'kick';
      else if (ad > 112) A.action = Math.random() < 0.45 ? 'approach' : (Math.random() < 0.6 ? 'kick' : 'punch');
      else A.action = Math.random() < 0.62 ? 'punch' : (Math.random() < 0.7 ? 'kick' : 'back');
      if (!me.onGround) A.action = 'approach';
    }

    switch (A.action) {
      case 'approach':
        if (dirTo > 0) inp.right = 1; else inp.left = 1;
        if (ad < 130 && Math.random() < 0.1) inp.up = 1;
        break;
      case 'back':
        if (dirTo > 0) inp.left = 1; else inp.right = 1;
        break;
      case 'punch':
        if (ad < 118) inp.punch = 1;
        else if (dirTo > 0) inp.right = 1; else inp.left = 1;
        break;
      case 'kick':
        if (ad < 168) inp.kick = 1;
        else if (dirTo > 0) inp.right = 1; else inp.left = 1;
        break;
      case 'special':
        if (me.meter >= SPECIAL_COST) inp.special = 1;
        break;
      case 'jump':
        inp.up = 1;
        break;
    }
    return inp;
  }

  /* ---------------- 逻辑更新 ---------------- */
  function separate(a, b) {
    const min = 72;
    const d = b.x - a.x;
    const ad = Math.abs(d);
    if (ad < min) {
      const s = d >= 0 ? 1 : -1;
      const push = (min - ad) / 2;
      a.x -= s * push;
      b.x += s * push;
    }
    a.x = clamp(a.x, STAGE_L, STAGE_R);
    b.x = clamp(b.x, STAGE_L, STAGE_R);
  }

  function update() {
    if (game.paused) return;
    if (game.hitStop > 0) { game.hitStop--; updateVfx(); return; }

    game.time++;
    game.shake *= 0.88;
    if (game.shake < 0.4) game.shake = 0;
    if (game.flash > 0) game.flash--;
    if (game.announceT > 0) { game.announceT--; game.announceAge++; }

    const a = game.p1, b = game.p2;

    switch (game.state) {
      case 'title': {
        a.step(EMPTY, b); b.step(EMPTY, a);
        updateVfx();
        break;
      }
      case 'countdown': {
        game.stateT++;
        a.step(EMPTY, b); b.step(EMPTY, a);
        updateVfx();
        if (game.stateT === 62) { announce('FIGHT!', '', 46); Sound.play('bell'); }
        if (game.stateT === 100) { game.state = 'fight'; game.announceT = 40; }
        break;
      }
      case 'fight': {
        const inA = readInput('p1');
        const inB = b.isAI ? aiInput(b, a) : readInput('p2');
        a.step(inA, b);
        b.step(inB, a);
        separate(a, b);
        updateProjectiles();
        updateVfx();

        game.timer--;
        if (a.hp <= 0 || b.hp <= 0) endRound('ko');
        else if (game.timer <= 0) { game.timer = 0; endRound('time'); }
        break;
      }
      case 'roundEnd': {
        game.stateT++;
        a.step(EMPTY, b); b.step(EMPTY, a);
        separate(a, b);
        updateVfx();
        if (game.stateT > 170) {
          if (game.wins[0] >= 2 || game.wins[1] >= 2) {
            game.state = 'matchEnd';
            game.stateT = 0;
            const w = game.wins[0] >= 2 ? 0 : 1;
            announce((w === 0 ? 'P1' : 'P2') + ' WINS!', '比分  ' + game.wins[0] + ' : ' + game.wins[1], 900);
          } else {
            game.round++;
            startRound();
          }
        }
        break;
      }
      case 'matchEnd': {
        game.stateT++;
        a.step(EMPTY, b); b.step(EMPTY, a);
        updateVfx();
        break;
      }
    }
  }

  function endRound(reason) {
    const a = game.p1, b = game.p2;
    let winner = -1;

    if (reason === 'ko') {
      if (a.hp <= 0 && b.hp <= 0) winner = -1;
      else winner = a.hp <= 0 ? 1 : 0;
    } else {
      if (a.hp === b.hp) winner = -1;
      else winner = a.hp > b.hp ? 0 : 1;
    }

    if (winner === 0) { game.wins[0]++; a.state = 'win'; a.t = 0; }
    else if (winner === 1) { game.wins[1]++; b.state = 'win'; b.t = 0; }
    else { a.state = a.hp > 0 ? 'idle' : 'ko'; b.state = b.hp > 0 ? 'idle' : 'ko'; }

    game.state = 'roundEnd';
    game.stateT = 0;

    if (reason === 'ko') {
      announce('K.O.', winner === 0 ? 'P1 拿下本回合' : winner === 1 ? 'P2 拿下本回合' : '双方同归于尽', 150);
      game.flash = 8;
      game.shake = 20;
    } else {
      announce('TIME UP', winner === 0 ? 'P1 判定胜' : winner === 1 ? 'P2 判定胜' : '平局', 150);
      Sound.play('bell');
    }
  }

  /* ---------------- HUD ---------------- */
  function paraPath(x, y, w, h, sk) {
    ctx.beginPath();
    ctx.moveTo(x + sk, y);
    ctx.lineTo(x + w + sk, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  }

  function healthBar(x, y, w, h, f, flip) {
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    const sk = 14;

    // 外框
    ctx.fillStyle = 'rgba(6,4,14,.78)';
    paraPath(0, 0, w, h, sk);
    ctx.fill();

    ctx.save();
    paraPath(3, 3, w - 6, h - 6, sk);
    ctx.clip();

    // 掉血残影
    ctx.fillStyle = 'rgba(255,255,255,.42)';
    ctx.fillRect(-20, 0, (w - 6) * clamp(f.hpShown / f.maxHp, 0, 1) + 6, h);

    // 血量
    const pct = clamp(f.hp / f.maxHp, 0, 1);
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, f.colors.hp1);
    g.addColorStop(1, f.colors.hp2);
    ctx.fillStyle = g;
    ctx.fillRect(-20, 0, (w - 6) * pct + 6, h);

    // 高光
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillRect(-20, 3, (w - 6) * pct + 6, h * 0.32);

    // 分段刻线
    ctx.strokeStyle = 'rgba(6,4,14,.28)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 10; i++) {
      const gx = (w - 6) * (i / 10);
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
    }
    ctx.restore();

    // 边框
    paraPath(0, 0, w, h, sk);
    ctx.strokeStyle = 'rgba(160,200,255,.55)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  function meterBar(x, y, w, h, f, flip) {
    const pct = clamp(f.meter / 100, 0, 1);
    const full = f.meter >= SPECIAL_COST;
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);

    ctx.fillStyle = 'rgba(8,6,20,.85)';
    paraPath(0, 0, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,160,220,.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    paraPath(2, 2, w - 4, h - 4, 8);
    ctx.clip();
    const g = ctx.createLinearGradient(0, 0, w, 0);
    if (full) {
      g.addColorStop(0, '#7dd3fc');
      g.addColorStop(1, '#a855f7');
    } else {
      g.addColorStop(0, '#3b5bdb');
      g.addColorStop(1, '#6d8bff');
    }
    ctx.fillStyle = g;
    ctx.fillRect(-10, 0, (w - 4) * pct + 10, h);
    if (full) {
      ctx.globalAlpha = 0.35 + Math.sin(game.time * 0.2) * 0.25;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-10, 0, (w - 4) * pct + 10, h);
    }
    ctx.restore();

    // 半格标记
    ctx.strokeStyle = 'rgba(255,255,255,.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const mx = (w - 4) * (SPECIAL_COST / 100) + 2;
    ctx.moveTo(mx, 1); ctx.lineTo(mx, h - 1);
    ctx.stroke();

    paraPath(0, 0, w, h, 8);
    ctx.strokeStyle = full ? 'rgba(180,220,255,.9)' : 'rgba(120,150,200,.45)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }

  function drawHUD() {
    const a = game.p1, b = game.p2;
    const BW = 452, BH = 30;

    healthBar(56, 44, BW, BH, a, false);
    healthBar(W - 56, 44, BW, BH, b, true);

    // 名字
    ctx.save();
    ctx.font = `bold 17px ${FN}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#dbeafe';
    ctx.textAlign = 'left';
    ctx.fillText(a.name, 58, 92);
    ctx.textAlign = 'right';
    ctx.fillText(b.name, W - 58, 92);
    ctx.restore();

    // 回合胜利标记
    for (let i = 0; i < 2; i++) {
      // P1
      ctx.save();
      ctx.translate(96 + i * 22, 92);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = game.wins[0] > i ? '#4fd1ff' : 'rgba(255,255,255,.16)';
      ctx.fillRect(-6, -6, 12, 12);
      ctx.strokeStyle = 'rgba(160,200,255,.5)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-6, -6, 12, 12);
      ctx.restore();

      // P2
      ctx.save();
      ctx.translate(W - 96 - i * 22, 92);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = game.wins[1] > i ? '#ff8a5c' : 'rgba(255,255,255,.16)';
      ctx.fillRect(-6, -6, 12, 12);
      ctx.strokeStyle = 'rgba(255,180,150,.5)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-6, -6, 12, 12);
      ctx.restore();
    }

    // 计时器
    const cx = W / 2, cy = 62;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 44, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,5,18,.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,200,255,.55)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 计时环
    const tp = clamp(game.timer / (ROUND_TIME * 60), 0, 1);
    ctx.beginPath();
    ctx.arc(cx, cy, 38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * tp);
    ctx.strokeStyle = tp > 0.25 ? 'rgba(125,211,252,.85)' : 'rgba(255,90,90,.95)';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.stroke();

    const secs = Math.ceil(game.timer / 60);
    ctx.font = `34px ${FN}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.strokeText(secs, cx, cy + 2);
    ctx.fillStyle = secs <= 10 ? '#ff6b6b' : '#eaf4ff';
    ctx.fillText(secs, cx, cy + 2);
    ctx.restore();

    // 能量条
    meterBar(56, H - 56, 300, 14, a, false);
    meterBar(W - 56, H - 56, 300, 14, b, true);

    ctx.save();
    ctx.font = `bold 12px ${FZ}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = a.meter >= SPECIAL_COST ? '#7dd3fc' : 'rgba(190,210,240,.6)';
    ctx.textAlign = 'left';
    ctx.fillText(a.meter >= SPECIAL_COST ? '必杀就绪' : '能量', 58, H - 68);
    ctx.textAlign = 'right';
    ctx.fillStyle = b.meter >= SPECIAL_COST ? '#ffd166' : 'rgba(190,210,240,.6)';
    ctx.fillText(b.meter >= SPECIAL_COST ? '必杀就绪' : '能量', W - 58, H - 68);
    ctx.restore();
  }

  function drawAnnounce() {
    if (!game.announce || game.announceT <= 0) return;
    const pop = clamp(game.announceAge / 7, 0, 1);
    const fadeIn = clamp(game.announceAge / 4, 0, 1);
    const fadeOut = game.announceT < 8 ? game.announceT / 8 : 1;
    const scale = lerp(1.5, 1, easeOut(pop));
    const alpha = fadeIn * fadeOut;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, H * 0.34);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const size = game.announce.length > 8 ? 62 : 86;
    ctx.font = `${size}px ${FN}`;
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(6,3,14,.9)';
    ctx.strokeText(game.announce, 0, 0);

    const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#ffe9a8');
    g.addColorStop(1, '#ff9f43');
    ctx.fillStyle = g;
    ctx.fillText(game.announce, 0, 0);

    if (game.announceSub) {
      ctx.font = `bold 22px ${FZ}`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(6,3,14,.85)';
      ctx.strokeText(game.announceSub, 0, size * 0.78);
      ctx.fillStyle = '#cfe4ff';
      ctx.fillText(game.announceSub, 0, size * 0.78);
    }
    ctx.restore();
  }

  /* ---------------- 标题 / 结算 ---------------- */
  function drawTitle() {
    ctx.save();
    ctx.fillStyle = 'rgba(7,4,16,.72)';
    ctx.fillRect(0, 0, W, H);

    // 标题
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.save();
    ctx.translate(W / 2, 236);
    const bob = Math.sin(game.time * 0.04) * 4;
    ctx.translate(0, bob);
    ctx.font = `132px ${FN}`;
    ctx.lineWidth = 16;
    ctx.strokeStyle = 'rgba(5,2,12,.95)';
    ctx.strokeText('NEON CLASH', 0, 0);

    const g = ctx.createLinearGradient(0, -70, 0, 70);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.42, '#8ee9ff');
    g.addColorStop(0.72, '#3b82f6');
    g.addColorStop(1, '#a855f7');
    ctx.fillStyle = g;
    ctx.fillText('NEON CLASH', 0, 0);

    ctx.globalAlpha = 0.85;
    ctx.font = `bold 26px ${FZ}`;
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(5,2,12,.9)';
    ctx.strokeText('霓 虹 街 头 · 格 斗', 0, 88);
    ctx.fillStyle = '#cfe4ff';
    ctx.fillText('霓 虹 街 头 · 格 斗', 0, 88);
    ctx.restore();

    // 模式选择
    const opts = ['1P  ·  挑战电脑', '2P  ·  双人对战'];
    for (let i = 0; i < 2; i++) {
      const y = 452 + i * 62;
      const on = game.mode === i;
      const w = 400, h = 46;
      ctx.save();
      ctx.translate(W / 2, y);
      if (on) {
        ctx.fillStyle = 'rgba(60,130,255,.18)';
        roundRect(-w / 2, -h / 2, w, h, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(125,211,252,.85)';
        ctx.lineWidth = 2;
        roundRect(-w / 2, -h / 2, w, h, 10);
        ctx.stroke();

        // 左右箭头
        ctx.fillStyle = 'rgba(125,211,252,.9)';
        const ax = -w / 2 - 26 + Math.sin(game.time * 0.12) * 4;
        ctx.beginPath();
        ctx.moveTo(ax, y * 0 + 0); ctx.lineTo(ax + 12, -8); ctx.lineTo(ax + 12, 8);
        ctx.closePath(); ctx.fill();
        const bx = w / 2 + 26 - Math.sin(game.time * 0.12) * 4;
        ctx.beginPath();
        ctx.moveTo(bx, 0); ctx.lineTo(bx - 12, -8); ctx.lineTo(bx - 12, 8);
        ctx.closePath(); ctx.fill();
      }
      ctx.font = `${on ? 'bold ' : ''}22px ${FZ}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = on ? '#ffffff' : 'rgba(200,218,245,.72)';
      ctx.fillText(opts[i], 0, 1);
      ctx.restore();
    }

    // 开始提示
    ctx.save();
    const pulse = 0.6 + Math.sin(game.time * 0.1) * 0.4;
    ctx.globalAlpha = pulse;
    ctx.font = `bold 20px ${FZ}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText('按 ENTER 开始战斗', W / 2, 606);
    ctx.restore();

    ctx.restore();
  }

  function drawPause() {
    ctx.save();
    ctx.fillStyle = 'rgba(6,4,16,.66)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `68px ${FN}`;
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.strokeText('PAUSED', W / 2, H / 2 - 10);
    ctx.fillStyle = '#e8f2ff';
    ctx.fillText('PAUSED', W / 2, H / 2 - 10);
    ctx.font = `bold 20px ${FZ}`;
    ctx.fillStyle = '#9fb3d9';
    ctx.fillText('按 ESC 继续 · 按 R 重新开始', W / 2, H / 2 + 62);
    ctx.restore();
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // 抖动
    const sx = (Math.random() - 0.5) * game.shake;
    const sy = (Math.random() - 0.5) * game.shake;
    ctx.save();
    ctx.translate(sx, sy);

    ctx.drawImage(bgCanvas, 0, 0);

    // 环境光脉动
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.05 + Math.sin(game.time * 0.02) * 0.02;
    const rg = ctx.createRadialGradient(W / 2, GROUND - 40, 60, W / 2, GROUND - 40, 620);
    rg.addColorStop(0, `rgba(125,211,252,${pulse})`);
    rg.addColorStop(1, 'rgba(125,211,252,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // 战士（靠后的先画）
    const [a, b] = [game.p1, game.p2];
    if (a.y <= b.y) { drawFighter(a); drawFighter(b); }
    else { drawFighter(b); drawFighter(a); }

    drawProjectiles();
    drawVfx();

    ctx.restore();

    drawHUD();

    if (game.state === 'title') drawTitle();
    else drawAnnounce();

    if (game.state === 'matchEnd') {
      // 暗化以突出公告
      ctx.save();
      ctx.fillStyle = 'rgba(6,4,16,.35)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      drawAnnounce();
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `bold 20px ${FZ}`;
      ctx.globalAlpha = 0.55 + Math.sin(game.time * 0.1) * 0.35;
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText('按 ENTER 返回标题 · 按 R 再战', W / 2, H * 0.56);
      ctx.restore();
    }

    if (game.paused) drawPause();

    // 白闪
    if (game.flash > 0) {
      ctx.save();
      ctx.globalAlpha = game.flash / 12;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // 扫描线
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#000';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    ctx.restore();
  }

  /* ---------------- 主循环 ---------------- */
  const STEP = 1000 / 60;
  let acc = 0, last = performance.now();

  function loop(now) {
    const dt = Math.min(now - last, 120);
    last = now;
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard < 5) { update(); acc -= STEP; guard++; }
    if (acc > STEP * 5) acc = 0;
    render();
    requestAnimationFrame(loop);
  }

  /* ---------------- 顶栏按钮 ---------------- */
  const btnSound = document.getElementById('btnSound');
  btnSound.addEventListener('click', () => {
    Sound.on = !Sound.on;
    Sound.unlock();
    btnSound.classList.toggle('off', !Sound.on);
    btnSound.textContent = Sound.on ? '🔊 音效' : '🔇 静音';
  });

  const btnFull = document.getElementById('btnFull');
  btnFull.addEventListener('click', () => {
    const stage = document.getElementById('stage');
    if (!document.fullscreenElement) {
      if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  });

  // 点击画布也能开始
  cvs.addEventListener('pointerdown', () => {
    Sound.unlock();
    if (game.state === 'title') startMatch();
  });

  requestAnimationFrame(loop);
})();
