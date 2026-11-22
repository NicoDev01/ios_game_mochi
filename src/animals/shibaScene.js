import * as THREE from 'three';

export function mountShibaScene(container, hooks = {}) {
  const emitHaptic = (kind) => hooks.onHaptic?.(kind);
  const emitCare = (kind) => hooks.onCareEvent?.(kind);
  const emitMood = (info) => hooks.onMoodChange?.(info);
  let focusMode = false;
  let paused = false;

const COAT_LIST = [
  {
    id: 'Aka',
    bodyLit: '#D48A45', bodyShadow: '#A9642A',
    creamLit: '#F5EFE2', creamShadow: '#D5CBB7',
    innerEarLit: '#F5EFE2', innerEarShadow: '#D7CCB8',
    browLit: '#F6F0E3', showBrows: true, blush: '#EE958D',
  },
  {
    id: 'Kuro',
    bodyLit: '#2E2C30', bodyShadow: '#1D1B1F',
    creamLit: '#DCA262', creamShadow: '#B4793D',
    innerEarLit: '#DCA262', innerEarShadow: '#B4793D',
    browLit: '#E2A866', showBrows: true, blush: '#D98078',
  },
  {
    id: 'Shiro',
    bodyLit: '#F7F3E9', bodyShadow: '#DDD5C4',
    creamLit: '#FBF8F1', creamShadow: '#E3DAC9',
    innerEarLit: '#F2DDD5', innerEarShadow: '#D8BEB5',
    browLit: '#FBF8F1', showBrows: false, blush: '#F29A9B',
  },
  {
    id: 'Goma',
    bodyLit: '#8E8377', bodyShadow: '#695F55',
    creamLit: '#E2DACB', creamShadow: '#BFB6A5',
    innerEarLit: '#E2DACB', innerEarShadow: '#BFB6A5',
    browLit: '#E6DED1', showBrows: true, blush: '#E59690',
  },
];

const SHARED = {
  ink: '#181514', eyeWhite: '#F9F8F4', tongue: '#E87478',
  heart: '#DF4E4A', tear: '#88D4F5', sparkle: '#F5D054',
  bg: '#D4D3CC', floorLit: '#CAC8BE', floorEdge: '#B4B2A7', floorTrim: '#ABA99C', groundShad: '#9A9386',
  ballLit: '#CEDB6A', ballShadow: '#9CAD45',
  bowlLit: '#C8664B', bowlShadow: '#9A4732', bowlInner: '#F2EBE0',
  kibbleLit: '#7A4E31', kibbleShadow: '#55331E',
  cushionLit: '#748E76', cushionShadow: '#536A56', cushionButton: '#EFE8D8',
};

const TREAT_SPECS = {
  bone:    { name: 'Kauknochen', lit: '#F4EDE0', shadow: '#D1C4AD', crumb: '#E7DAC2', moodGain: 0.34, fullGain: 0.14, bites: 4, hearts: 5 },
  biscuit: { name: 'Honigkeks',  lit: '#E2A55B', shadow: '#B57936', crumb: '#D49449', moodGain: 0.24, fullGain: 0.24, bites: 3, hearts: 3 },
};

const deg = THREE.MathUtils.degToRad;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smoothstepJS = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// =============================================================================
// Prozedurales Cozy-Audio (Warmth-Filter, Noise-Crunch, iOS-Unlock & Fokus-Regen)
// =============================================================================
const sfx = (() => {
  let ctx = null, master = null, enabled = true, lastSquish = 0, lastPant = 0;
  let noiseBuf = null, rainNodes = null, wantRain = false;

  const ensure = () => {
    if (!enabled) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 4200;
      lp.Q.value = 0.5;
      const gain = ctx.createGain();
      gain.gain.value = 0.92;
      lp.connect(gain).connect(ctx.destination);
      master = lp;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };

  const getNoise = (c) => {
    if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
    const len = Math.floor(c.sampleRate * 2.5);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029;
      b1 = 0.985 * b1 + w * 0.032;
      b2 = 0.950 * b2 + w * 0.048;
      data[i] = clamp((b0 + b1 + b2 + w * 0.18) * 1.45, -1, 1);
    }
    noiseBuf = buf;
    return buf;
  };

  const tone = (f0, f1, dur, vol, type = 'sine', delay = 0) => {
    const c = ensure(); if (!c || !master) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.012, dur * 0.22));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.025);
  };

  const noiseBurst = (freq, q, dur, vol, delay = 0) => {
    const c = ensure(); if (!c || !master) return;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = getNoise(c);
    const flt = c.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(freq, t);
    flt.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(master);
    src.start(t, Math.random() * 1.4, dur + 0.03);
  };

  const syncRain = () => {
    const shouldPlay = enabled && wantRain && !paused;
    if (!shouldPlay) {
      if (rainNodes && ctx) {
        const { src, gain } = rainNodes;
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setTargetAtTime(0.0001, t, 0.18);
        window.setTimeout(() => { try { src.stop(); } catch {} }, 650);
        rainNodes = null;
      }
      return;
    }
    if (rainNodes) return;
    const c = ensure(); if (!c || !master) return;
    const src = c.createBufferSource();
    src.buffer = getNoise(c);
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 950;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 180;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, c.currentTime);
    gain.gain.setTargetAtTime(0.055, c.currentTime, 0.45);
    src.connect(hp).connect(lp).connect(gain).connect(master);
    src.start();
    rainNodes = { src, gain };
  };

  return {
    unlock() {
      const c = ensure(); if (!c) return;
      try {
        const b = c.createBuffer(1, 1, c.sampleRate);
        const s = c.createBufferSource();
        s.buffer = b; s.connect(c.destination); s.start(0);
      } catch {}
      syncRain();
    },
    set enabled(v) { enabled = v; syncRain(); },
    get enabled() { return enabled; },
    setAmbientRain(on) { wantRain = Boolean(on); syncRain(); },
    syncAmbient() { syncRain(); },
    dispose() {
      wantRain = false;
      syncRain();
      if (ctx) { ctx.close().catch(() => {}); ctx = null; master = null; }
    },
    uiTap() {
      tone(520, 620, 0.045, 0.032, 'sine');
    },
    unlockChord() {
      tone(523.25, 523.25, 0.22, 0.055, 'sine', 0);
      tone(659.25, 659.25, 0.26, 0.052, 'sine', 0.07);
      tone(783.99, 783.99, 0.32, 0.055, 'triangle', 0.14);
      tone(1046.5, 1046.5, 0.40, 0.048, 'sine', 0.21);
    },
    focusDoneChord() {
      const notes = [440, 554.37, 659.25, 880, 987.77];
      notes.forEach((f, i) => tone(f, f * 1.005, 0.42, 0.052, 'sine', i * 0.085));
    },
    bounce(speed) {
      const k = clamp((speed - 1.4) / 14, 0, 1); if (k <= 0.03) return;
      tone(112 + k * 38, 195 + k * 110, 0.12 + k * 0.06, 0.055 + k * 0.085, 'sine');
      if (k > 0.38) tone(86, 48, 0.08, 0.065 * k, 'triangle');
    },
    ballHit(speed) {
      const k = clamp((speed - 0.7) / 11, 0, 1); if (k <= 0.03) return;
      tone(295 + k * 85, 425 + k * 130, 0.08, 0.042 + k * 0.07, 'sine');
      noiseBurst(1200, 2.2, 0.035, 0.025 * k);
    },
    yip() {
      tone(350, 575, 0.085, 0.068, 'triangle');
      tone(540, 405, 0.075, 0.048, 'sine', 0.05);
    },
    proud() {
      tone(440, 659, 0.095, 0.06, 'sine');
      tone(587, 880, 0.14, 0.062, 'sine', 0.085);
    },
    pet(happy) {
      if (happy) {
        const now = performance.now(); if (now - lastPant < 290) return; lastPant = now;
        tone(392, 523, 0.11, 0.038, 'sine');
        tone(587, 659, 0.09, 0.022, 'sine', 0.055);
      } else {
        tone(205, 145, 0.12, 0.055, 'triangle');
      }
    },
    crunch(n) {
      const base = 320 + (n % 3) * 52;
      noiseBurst(1550 + (n % 3) * 260, 1.4, 0.055, 0.075);
      tone(base, base * 1.38, 0.055, 0.045, 'triangle');
    },
    pourKibble() {
      for (let i = 0; i < 6; i++) {
        tone(490 + Math.random() * 240, 270 + Math.random() * 110, 0.045, 0.034, 'triangle', i * 0.042);
        noiseBurst(1900 + Math.random() * 500, 2.4, 0.03, 0.024, i * 0.042);
      }
    },
    huff() {
      noiseBurst(680, 1.2, 0.14, 0.065);
      tone(190, 118, 0.14, 0.055, 'triangle');
    },
    sigh() {
      noiseBurst(520, 1.5, 0.20, 0.03);
      tone(315, 185, 0.24, 0.042, 'sine');
    },
    whistle() {
      tone(698, 932, 0.09, 0.042, 'sine');
      tone(880, 1175, 0.12, 0.046, 'sine', 0.092);
    },
    sniff() {
      noiseBurst(1600, 2.5, 0.04, 0.03);
      noiseBurst(1750, 2.5, 0.04, 0.028, 0.08);
    },
    whine() {
      tone(485, 685, 0.14, 0.038, 'sine');
      tone(655, 495, 0.16, 0.034, 'sine', 0.12);
    },
    yawn() {
      tone(310, 440, 0.18, 0.036, 'sine');
      tone(430, 210, 0.34, 0.034, 'sine', 0.16);
    },
    plop() {
      tone(162, 92, 0.13, 0.048, 'sine');
    },
    nudge() {
      tone(315, 465, 0.075, 0.044, 'triangle');
    },
    hop() { tone(245, 370, 0.075, 0.042, 'sine'); },
    grab() { tone(260, 390, 0.065, 0.046, 'sine'); },
    squish(amount) {
      const now = performance.now(); if (now - lastSquish < 210 || amount < 0.22) return; lastSquish = now;
      tone(172, 118, 0.095, 0.036 * clamp(amount, 0, 1), 'sine');
      noiseBurst(520, 1.8, 0.07, 0.022 * clamp(amount, 0, 1));
    },
  };
})();

// =============================================================================
// Quad-Mesh & Catmull-Clark-Subdivision
// =============================================================================
function makeCubeQuadMesh() {
  const verts = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  const quads = [[4,5,6,7],[1,0,3,2],[5,1,2,6],[0,4,7,3],[7,6,2,3],[0,1,5,4]];
  return { verts, quads };
}
function planarSubdivide(mesh, levels = 1) {
  let { verts, quads } = mesh;
  for (let lv = 0; lv < levels; lv++) {
    const nv = verts.map(v => [...v]), em = new Map();
    const mid = (a, b) => {
      const k = a < b ? `${a}_${b}` : `${b}_${a}`; let i = em.get(k);
      if (i === undefined) { const A = verts[a], B = verts[b]; i = nv.length; nv.push([(A[0]+B[0])/2,(A[1]+B[1])/2,(A[2]+B[2])/2]); em.set(k, i); }
      return i;
    };
    const nq = [];
    for (const [a,b,c,d] of quads) {
      const ab = mid(a,b), bc = mid(b,c), cd = mid(c,d), da = mid(d,a);
      const A = verts[a], B = verts[b], C = verts[c], D = verts[d], f = nv.length;
      nv.push([(A[0]+B[0]+C[0]+D[0])/4,(A[1]+B[1]+C[1]+D[1])/4,(A[2]+B[2]+C[2]+D[2])/4]);
      nq.push([a,ab,f,da],[b,bc,f,ab],[c,cd,f,bc],[d,da,f,cd]);
    }
    verts = nv; quads = nq;
  }
  return { verts, quads };
}
function catmullClark(mesh, levels = 1) {
  let { verts, quads } = mesh;
  for (let lv = 0; lv < levels; lv++) {
    const nV = verts.length;
    const facePts = quads.map(([a,b,c,d]) => { const A=verts[a],B=verts[b],C=verts[c],D=verts[d];
      return [(A[0]+B[0]+C[0]+D[0])/4,(A[1]+B[1]+C[1]+D[1])/4,(A[2]+B[2]+C[2]+D[2])/4]; });
    const edges = new Map(), vFaces = Array.from({length:nV},()=>[]), vEdges = Array.from({length:nV},()=>[]);
    const reg = (u, v, f) => { const a = Math.min(u,v), b = Math.max(u,v), key = a*1000003+b; let e = edges.get(key);
      if (!e) { e = {a,b,faces:[],idx:-1}; edges.set(key,e); vEdges[a].push(e); vEdges[b].push(e); } e.faces.push(f); };
    quads.forEach((q, f) => { for (let i = 0; i < 4; i++) { vFaces[q[i]].push(f); reg(q[i], q[(i+1)&3], f); } });
    const nvs = new Array(nV);
    for (let v = 0; v < nV; v++) {
      const n = vFaces[v].length; if (n < 3) { nvs[v] = [...verts[v]]; continue; }
      let fx=0,fy=0,fz=0; for (const fi of vFaces[v]) { const p = facePts[fi]; fx+=p[0]; fy+=p[1]; fz+=p[2]; } fx/=n; fy/=n; fz/=n;
      let rx=0,ry=0,rz=0; const ne = vEdges[v].length;
      for (const e of vEdges[v]) { const A=verts[e.a],B=verts[e.b]; rx+=(A[0]+B[0])/2; ry+=(A[1]+B[1])/2; rz+=(A[2]+B[2])/2; } rx/=ne; ry/=ne; rz/=ne;
      const p = verts[v]; nvs[v] = [(fx+2*rx+(n-3)*p[0])/n,(fy+2*ry+(n-3)*p[1])/n,(fz+2*rz+(n-3)*p[2])/n];
    }
    const fo = nvs.length; for (const p of facePts) nvs.push(p);
    for (const e of edges.values()) { const A = verts[e.a], B = verts[e.b]; e.idx = nvs.length;
      if (e.faces.length === 2) { const F0 = facePts[e.faces[0]], F1 = facePts[e.faces[1]];
        nvs.push([(A[0]+B[0]+F0[0]+F1[0])/4,(A[1]+B[1]+F0[1]+F1[1])/4,(A[2]+B[2]+F0[2]+F1[2])/4]); }
      else nvs.push([(A[0]+B[0])/2,(A[1]+B[1])/2,(A[2]+B[2])/2]); }
    const eI = (u, v) => edges.get(Math.min(u,v)*1000003+Math.max(u,v)).idx;
    const nq = [];
    quads.forEach(([a,b,c,d], f) => { const F = fo+f, ab=eI(a,b), bc=eI(b,c), cd=eI(c,d), da=eI(d,a);
      nq.push([a,ab,F,da],[b,bc,F,ab],[c,cd,F,bc],[d,da,F,cd]); });
    verts = nvs; quads = nq;
  }
  return { verts, quads };
}
function quadMeshToGeometry(mesh, weightFn = () => 1) {
  const { verts, quads } = mesh;
  const pos = new Float32Array(verts.length * 3), rest = new Float32Array(verts.length * 3), w = new Float32Array(verts.length);
  verts.forEach((v, i) => { pos.set(v, i*3); rest.set(v, i*3); w[i] = weightFn(v); });
  const idx = new Uint32Array(quads.length * 6); let k = 0;
  for (const [a,b,c,d] of quads) { idx[k++]=a; idx[k++]=b; idx[k++]=c; idx[k++]=a; idx[k++]=c; idx[k++]=d; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRestPos', new THREE.BufferAttribute(rest, 3));
  g.setAttribute('aOutlineWeight', new THREE.BufferAttribute(w, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
  return g;
}

// Shiba-Körper (kugeliges Mochi-Kissen + 4 Stummelpfötchen exakt auf Y = 0.0)
function buildShibaBodyQuadMesh() {
  const m = planarSubdivide(makeCubeQuadMesh(), 3);
  for (const v of m.verts) {
    const len = Math.hypot(...v) || 1;
    let x = v[0]/len*0.66, y = v[1]/len*0.55, z = v[2]/len*0.62;
    const t = clamp((0.55 - y) / 1.10, 0, 1), w = 1 + 0.14 * Math.pow(t, 1.55);
    x *= w; z *= w;
    if (y < -0.39) y = -0.39 + (y + 0.39) * 0.48;
    v[0] = x; v[1] = y; v[2] = z;
  }
  let yMin = Infinity; for (const v of m.verts) yMin = Math.min(yMin, v[1]);
  const chosen = [];
  for (const [tx, ty, tz] of [[-0.32,yMin,0.24],[0.32,yMin,0.24],[-0.32,yMin,-0.24],[0.32,yMin,-0.24]]) {
    let best = -1, bd = Infinity;
    m.quads.forEach(([a,b,c,d], f) => {
      if (chosen.includes(f)) return;
      const A=m.verts[a],B=m.verts[b],C=m.verts[c],D=m.verts[d];
      const ux=B[0]-A[0], uz=B[2]-A[2], wx=C[0]-A[0], wz=C[2]-A[2];
      if (uz*wx - ux*wz > -0.0005) return;
      const cx=(A[0]+B[0]+C[0]+D[0])/4, cy=(A[1]+B[1]+C[1]+D[1])/4, cz=(A[2]+B[2]+C[2]+D[2])/4;
      const dd = Math.hypot(cx-tx, (cy-ty)*0.6, cz-tz); if (dd < bd) { bd = dd; best = f; }
    });
    chosen.push(best);
  }
  const extrude = (fi, dy, s) => {
    const ids = m.quads[fi]; let cx = 0, cz = 0; for (const i of ids) { cx += m.verts[i][0]; cz += m.verts[i][2]; } cx/=4; cz/=4;
    const nids = ids.map(i => { const p = m.verts[i]; m.verts.push([cx+(p[0]-cx)*s, p[1]-dy, cz+(p[2]-cz)*s]); return m.verts.length-1; });
    const [a,b,c,d] = ids, [a2,b2,c2,d2] = nids; m.quads[fi] = [a2,b2,c2,d2];
    m.quads.push([a,b,b2,a2],[b,c,c2,b2],[c,d,d2,c2],[d,a,a2,d2]);
  };
  for (const f of chosen) { extrude(f, 0.046, 0.72); extrude(f, 0.032, 0.56); }
  const s = catmullClark(m, 2);
  let minY = Infinity; for (const v of s.verts) minY = Math.min(minY, v[1]); for (const v of s.verts) v[1] -= minY;
  return s;
}

function buildShibaEarQuadMesh() {
  const m = planarSubdivide(makeCubeQuadMesh(), 2);
  for (const v of m.verts) {
    const len = Math.hypot(...v) || 1;
    let x = v[0]/len*0.126, y = v[1]/len*0.146, z = v[2]/len*0.070;
    if (y > 0) { const u = clamp(y/0.146,0,1); x *= 1 - 0.64*Math.pow(u,0.92); z *= 1 - 0.34*Math.pow(u,1.1); }
    else { const u = clamp(-y/0.146,0,1); x *= 1 + 0.14*u; }
    if (z > 0) { const nx = x/0.092, ny = (y-0.005)/0.088, r2 = nx*nx+ny*ny; if (r2 < 1) z -= 0.022*Math.pow(1-r2,1.5); }
    v[0] = x; v[1] = y; v[2] = z;
  }
  return catmullClark(m, 2);
}

// Geringelter Shiba-Kringelschwanz (Maki-o)
function buildShibaTailQuadMesh() {
  const samples = [
    { p: [0, -0.004, 0.055], r: 0.048 },
    { p: [0, -0.002, 0.005], r: 0.058 },
  ];
  const N = 16, cy = 0.132, cz = -0.155;
  for (let i = 0; i <= N; i++) {
    const t = i / N, phi = t * Math.PI * 2.08, ang = -Math.PI * 0.34 - phi;
    const R = 0.172 * (1 - 0.68 * Math.pow(t, 0.92));
    const x = 0.036 * Math.sin(t * Math.PI * 0.95) + 0.018 * t * t;
    let r = 0.062 + 0.020 * Math.sin(Math.min(1, t * 1.15) * Math.PI);
    if (t > 0.78) { const k = (t - 0.78) / 0.22; r *= 1 - 0.52 * k * k; }
    samples.push({ p: [x, cy + Math.sin(ang) * R, cz + Math.cos(ang) * R], r });
  }
  const sub = (a,b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const norm = v => { const l = Math.hypot(...v) || 1; return [v[0]/l, v[1]/l, v[2]/l]; };
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const tangents = samples.map((_, i) => norm(sub(samples[Math.min(samples.length-1,i+1)].p, samples[Math.max(0,i-1)].p)));
  const normals = [norm(sub([1,0,0], tangents[0].map(c => c * tangents[0][0])))];
  const binormals = [norm(cross(tangents[0], normals[0]))];
  for (let i = 1; i < samples.length; i++) {
    const tP = tangents[i-1], tC = tangents[i], ax = cross(tP, tC), al = Math.hypot(...ax);
    let nN = normals[i-1];
    if (al > 1e-6) {
      const k = ax.map(c => c/al), cA = clamp(dot(tP,tC),-1,1), sA = Math.sqrt(Math.max(0,1-cA*cA)), kn = cross(k,nN), kd = dot(k,nN);
      nN = norm([nN[0]*cA+kn[0]*sA+k[0]*kd*(1-cA), nN[1]*cA+kn[1]*sA+k[1]*kd*(1-cA), nN[2]*cA+kn[2]*sA+k[2]*kd*(1-cA)]);
    }
    normals.push(nN); binormals.push(norm(cross(tC, nN)));
  }
  const segs = 8, verts = [], quads = [];
  samples.forEach(({ p, r }, ri) => {
    const Nv = normals[ri], Bv = binormals[ri];
    for (let s = 0; s < segs; s++) {
      const a = s/segs*Math.PI*2 + Math.PI/8, ca = Math.cos(a)*r, sa = Math.sin(a)*r;
      verts.push([p[0]+Nv[0]*ca+Bv[0]*sa, p[1]+Nv[1]*ca+Bv[1]*sa, p[2]+Nv[2]*ca+Bv[2]*sa]);
    }
  });
  for (let ri = 0; ri < samples.length-1; ri++) for (let s = 0; s < segs; s++) {
    const r0 = ri*segs, r1 = (ri+1)*segs, sn = (s+1)%segs; quads.push([r0+s, r0+sn, r1+sn, r1+s]);
  }
  const rc = verts.length, p0 = samples[0].p, t0 = tangents[0];
  verts.push([p0[0]-t0[0]*0.015, p0[1]-t0[1]*0.015, p0[2]-t0[2]*0.015]);
  for (let s = 0; s < segs; s += 2) quads.push([rc, (s+2)%segs, (s+1)%segs, s]);
  const li = samples.length-1, lb = li*segs, tc = verts.length, pE = samples[li].p, tE = tangents[li];
  verts.push([pE[0]+tE[0]*0.022, pE[1]+tE[1]*0.022, pE[2]+tE[2]*0.022]);
  for (let s = 0; s < segs; s += 2) quads.push([tc, lb+s, lb+(s+1)%segs, lb+(s+2)%segs]);
  return catmullClark({ verts, quads }, 2);
}

// =============================================================================
// Shader: 2D+3D Anime-Cel-Shading & Tusche-Outlines (exakt wie mochi_shiba.html)
// =============================================================================
function createShibaBodyMaterial(coat, lightDir) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uLitColor:         { value: new THREE.Color(coat.bodyLit) },
      uShadowColor:      { value: new THREE.Color(coat.bodyShadow) },
      uCreamLitColor:    { value: new THREE.Color(coat.creamLit) },
      uCreamShadowColor: { value: new THREE.Color(coat.creamShadow) },
      uLightDir:         { value: lightDir.clone().normalize() },
      uThreshold:        { value: 0.20 },
    },
    vertexShader: /* glsl */`
      attribute vec3 aRestPos;
      varying vec3 vWorldNormal; varying vec3 vRestPos;
      void main() {
        vRestPos = aRestPos;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLitColor, uShadowColor, uCreamLitColor, uCreamShadowColor, uLightDir;
      uniform float uThreshold;
      varying vec3 vWorldNormal; varying vec3 vRestPos;
      float sdEll(vec3 p, vec3 c, vec3 r) { return length((p - c) / r) - 1.0; }
      float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0); return mix(b,a,h) - k*h*(1.0-h); }
      float shibaUrajiroSDF(vec3 p) {
        vec3 s = vec3(abs(p.x), p.y, p.z);
        float dCheek  = sdEll(s, vec3(0.26, 0.370, 0.36), vec3(0.37, 0.252, 0.38));
        float dMuzzle = sdEll(p, vec3(0.00, 0.368, 0.44), vec3(0.36, 0.246, 0.34));
        float dBelly  = sdEll(p, vec3(0.00, 0.165, 0.10), vec3(0.32, 0.215, 0.42));
        float dButt   = sdEll(p, vec3(0.00, 0.155, -0.56), vec3(0.180, 0.125, 0.17));
        return smin(smin(smin(dCheek, dMuzzle, 0.14), dBelly, 0.16), dButt, 0.06);
      }
      void main() {
        float ndl = dot(normalize(vWorldNormal), normalize(uLightDir));
        float aa = max(fwidth(ndl) * 0.85, 0.007);
        float litMask = smoothstep(uThreshold - aa, uThreshold + aa, ndl);
        float dU = shibaUrajiroSDF(vRestPos);
        float aaU = max(fwidth(dU) * 1.15, 0.006);
        float cream = 1.0 - smoothstep(-aaU, aaU, dU);
        vec3 litC = mix(uLitColor, uCreamLitColor, cream);
        vec3 shdC = mix(uShadowColor, uCreamShadowColor, cream);
        gl_FragColor = vec4(mix(shdC, litC, litMask), 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

function createCelMaterial({ litHex, shadowHex, innerLitHex = null, innerShadowHex = null, stripeHex = null, lightDir, threshold = 0.20, mode = 'plain' }) {
  const modeId = { plain: 0, ear: 1, tail: 2, stripe: 3 }[mode] ?? 0;
  return new THREE.ShaderMaterial({
    uniforms: {
      uLitColor:         { value: new THREE.Color(litHex) },
      uShadowColor:      { value: new THREE.Color(shadowHex) },
      uInnerLitColor:    { value: new THREE.Color(innerLitHex || stripeHex || litHex) },
      uInnerShadowColor: { value: new THREE.Color(innerShadowHex || shadowHex) },
      uLightDir:         { value: lightDir.clone().normalize() },
      uThreshold:        { value: threshold },
      uMode:             { value: modeId },
    },
    vertexShader: /* glsl */`
      attribute vec3 aRestPos;
      varying vec3 vWorldNormal; varying vec3 vLocalPos; varying vec3 vLocalNormal;
      void main() {
        vLocalPos = aRestPos; vLocalNormal = normalize(normal);
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLitColor, uShadowColor, uInnerLitColor, uInnerShadowColor, uLightDir;
      uniform float uThreshold, uMode;
      varying vec3 vWorldNormal; varying vec3 vLocalPos; varying vec3 vLocalNormal;
      float sdInnerEar(vec2 p) {
        vec2 a = vec2(0.0, 0.072), b = vec2(-0.056, -0.052), c = vec2(0.056, -0.052);
        vec2 e0 = b-a, e1 = c-b, e2 = a-c, v0 = p-a, v1 = p-b, v2 = p-c;
        vec2 pq0 = v0 - e0*clamp(dot(v0,e0)/dot(e0,e0),0.0,1.0);
        vec2 pq1 = v1 - e1*clamp(dot(v1,e1)/dot(e1,e1),0.0,1.0);
        vec2 pq2 = v2 - e2*clamp(dot(v2,e2)/dot(e2,e2),0.0,1.0);
        float s = sign(e0.x*e2.y - e0.y*e2.x);
        vec2 d = min(min(vec2(dot(pq0,pq0), s*(v0.x*e0.y-v0.y*e0.x)),
                         vec2(dot(pq1,pq1), s*(v1.x*e1.y-v1.y*e1.x))),
                         vec2(dot(pq2,pq2), s*(v2.x*e2.y-v2.y*e2.x)));
        return -sqrt(d.x)*sign(d.y) - 0.014;
      }
      void main() {
        float ndl = dot(normalize(vWorldNormal), normalize(uLightDir));
        float aa = max(fwidth(ndl) * 0.85, 0.007);
        float litMask = smoothstep(uThreshold - aa, uThreshold + aa, ndl);
        vec3 litC = uLitColor, shdC = uShadowColor;
        if (uMode > 0.5 && uMode < 1.5) {
          float m = smoothstep(0.24, 0.55, vLocalNormal.z) * (1.0 - smoothstep(-0.010, 0.012, sdInnerEar(vLocalPos.xy)));
          litC = mix(litC, uInnerLitColor, m); shdC = mix(shdC, uInnerShadowColor, m);
        } else if (uMode > 1.5 && uMode < 2.5) {
          vec2 cYZ = vec2(0.132, -0.155);
          float inw = dot(normalize(vLocalNormal.yz + vec2(1e-5)), normalize(cYZ - vLocalPos.yz + vec2(1e-5)));
          float tip = smoothstep(0.118, 0.068, length(vLocalPos.yz - cYZ));
          float inn = smoothstep(-0.10, 0.25, inw) * smoothstep(-0.02, -0.09, vLocalPos.z);
          float cm = clamp(max(tip, inn * 0.92), 0.0, 1.0);
          float aaT = max(fwidth(cm) * 0.9, 0.03);
          cm = smoothstep(0.45 - aaT, 0.45 + aaT, cm);
          litC = mix(litC, uInnerLitColor, cm); shdC = mix(shdC, uInnerShadowColor, cm);
        } else if (uMode > 2.5) {
          float d = abs(vLocalPos.x - 0.045 * sin(vLocalPos.y * 14.0));
          float saa = max(fwidth(d) * 1.1, 0.004);
          float sm = 1.0 - smoothstep(0.018 - saa, 0.018 + saa, d);
          litC = mix(litC, uInnerLitColor, sm);
          shdC = mix(shdC, uInnerLitColor * 0.80, sm);
        }
        gl_FragColor = vec4(mix(shdC, litC, litMask), 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

function createOutlineMaterial({ inkHex, thicknessPx = 6.0, depthBias = 0.0004 }) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uInkColor: { value: new THREE.Color(inkHex) },
      uThicknessPx: { value: thicknessPx },
      uResolution: { value: new THREE.Vector2(innerWidth, innerHeight) },
      uDepthBias: { value: depthBias },
    },
    vertexShader: /* glsl */`
      attribute float aOutlineWeight;
      uniform float uThicknessPx; uniform vec2 uResolution; uniform float uDepthBias;
      void main() {
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vec4 clipPos = projectionMatrix * mvPos;
        vec3 viewN = normalize(normalMatrix * normal);
        vec2 clipN = (projectionMatrix * vec4(viewN, 0.0)).xy;
        float len = length(clipN);
        if (len > 1e-5) clipN /= len;
        vec2 offset = clipN * (uThicknessPx * aOutlineWeight) * (2.0 / max(uResolution, vec2(1.0))) * clipPos.w;
        clipPos.xy += offset;
        clipPos.z += uDepthBias * clipPos.w;
        gl_Position = clipPos;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uInkColor;
      void main() {
        gl_FragColor = vec4(uInkColor, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

function createBlushMaterial(blushHex, opacity = 0) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: {
      uColor:   { value: new THREE.Color(blushHex) },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float r = length(vUv);
        if (r > 1.0) discard;
        float soft = pow(1.0 - smoothstep(0.18, 1.0, r), 1.2);
        gl_FragColor = vec4(uColor, soft * uOpacity);
        #include <colorspace_fragment>
      }`,
  });
}

// =============================================================================
// Oberflächen-Patches & gekrümmte 2D-Gesichtselemente (inkl. 512px Canvas-Patches)
// =============================================================================
function sampleBodySurface(bodyGeo, x, y, zSign = 1) {
  const pos = bodyGeo.attributes.position, nrm = bodyGeo.attributes.normal; let bi = 0, bs = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const pz = pos.getZ(i);
    if (zSign > 0 ? pz < 0 : pz > 0) continue;
    const s = (pos.getX(i) - x) ** 2 + (pos.getY(i) - y) ** 2;
    if (s < bs) { bs = s; bi = i; }
  }
  return {
    point: new THREE.Vector3().fromBufferAttribute(pos, bi),
    normal: new THREE.Vector3().fromBufferAttribute(nrm, bi).normalize(),
  };
}
function buildSurfacePatch(bodyGeo, targetPos, count = 10) {
  const pos = bodyGeo.attributes.position, dists = [];
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i)-targetPos.x, dy = pos.getY(i)-targetPos.y, dz = pos.getZ(i)-targetPos.z;
    dists.push([dx*dx + dy*dy + dz*dz, i]);
  }
  dists.sort((a, b) => a[0] - b[0]);
  const top = dists.slice(0, count), sigma2 = Math.max(top[top.length - 1][0], 1e-5);
  let wSum = 0; const indices = [], weights = [];
  for (const [d2, idx] of top) { const w = Math.exp(-d2 / (2 * sigma2)); indices.push(idx); weights.push(w); wSum += w; }
  for (let i = 0; i < weights.length; i++) weights[i] /= wSum;
  return { indices, weights };
}
function evalSurfacePatch(bodyGeo, patch, outPos, outNrm) {
  const pos = bodyGeo.attributes.position, nrm = bodyGeo.attributes.normal;
  outPos.set(0, 0, 0); outNrm.set(0, 0, 0);
  for (let i = 0; i < patch.indices.length; i++) {
    const idx = patch.indices[i], w = patch.weights[i];
    outPos.x += pos.getX(idx) * w; outPos.y += pos.getY(idx) * w; outPos.z += pos.getZ(idx) * w;
    outNrm.x += nrm.getX(idx) * w; outNrm.y += nrm.getY(idx) * w; outNrm.z += nrm.getZ(idx) * w;
  }
  if (outNrm.lengthSq() > 1e-8) outNrm.normalize(); else outNrm.set(0, 0, 1);
}

function makeCurvedEyePatch(w, h, drawFn, zOffset = 0.004, cX = 0.72, cY = 0.72) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 512;
  const ctx = cv.getContext('2d');
  ctx.save(); ctx.translate(256, 256); ctx.scale(512 / w, -512 / h);
  drawFn(ctx);
  ctx.restore();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const geo = new THREE.PlaneGeometry(w, h, 14, 14);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, zOffset - (x * x * cX + y * y * cY));
  }
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = 13;
  return m;
}
function curvedGridOval(rx, ry, zOff = 0, cX = 0.68, cY = 0.68, segs = 36, rings = 4, cx = 0, cy = 0) {
  const P = [cx, cy, zOff - (cx*cx*cX + cy*cy*cY)], U = [0, 0], I = [];
  for (let r = 1; r <= rings; r++) {
    const fr = r / rings;
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const x = cx + Math.cos(a) * rx * fr, y = cy + Math.sin(a) * ry * fr;
      P.push(x, y, zOff - (x * x * cX + y * y * cY));
      U.push(Math.cos(a) * fr, Math.sin(a) * fr);
    }
  }
  for (let s = 0; s < segs; s++) I.push(0, 1 + s, 1 + ((s + 1) % segs));
  for (let r = 1; r < rings; r++) {
    const r0 = 1 + (r - 1) * segs, r1 = 1 + r * segs;
    for (let s = 0; s < segs; s++) { const sn = (s + 1) % segs; I.push(r0+s, r1+s, r1+sn, r0+s, r1+sn, r0+sn); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  return g;
}
function curvedStroke(pts, hws, zOff = 0, cX = 0.68, cY = 0.68) {
  const n = pts.length, P = [], I = [], hw = i => Array.isArray(hws) ? hws[i] : hws;
  const z = (x, y) => zOff - (x * x * cX + y * y * cY);
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[i], pv = pts[Math.max(0, i - 1)], nx_ = pts[Math.min(n - 1, i + 1)];
    let tx = nx_[0] - pv[0], ty = nx_[1] - pv[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const lx = x - ty * hw(i), ly = y + tx * hw(i), rx = x + ty * hw(i), ry = y - tx * hw(i);
    P.push(lx, ly, z(lx, ly), rx, ry, z(rx, ry));
    if (i < n - 1) { const b = i * 2; I.push(b, b+1, b+2, b+1, b+3, b+2); }
  }
  for (const end of [0, n - 1]) {
    const [cx, cy] = pts[end], o = pts[end === 0 ? 1 : n - 2]; const h = hw(end); if (h < 0.001) continue;
    const ba = Math.atan2(cy - o[1], cx - o[0]), c0 = P.length / 3; P.push(cx, cy, z(cx, cy));
    for (let s = 0; s <= 8; s++) {
      const a = ba - Math.PI / 2 + (s / 8) * Math.PI, px = cx + Math.cos(a) * h, py = cy + Math.sin(a) * h;
      P.push(px, py, z(px, py)); if (s > 0) I.push(c0, c0+s, c0+s+1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I);
  return g;
}
function makeKawaiiHeartPath(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.72);
  ctx.bezierCurveTo( s * 0.40, -s * 0.66,  s * 1.18, -s * 0.05,  s * 1.06,  s * 0.54);
  ctx.bezierCurveTo( s * 0.96,  s * 0.96,  s * 0.28,  s * 0.98,  0,         s * 0.48);
  ctx.bezierCurveTo(-s * 0.28,  s * 0.98, -s * 0.96,  s * 0.96, -s * 1.06,  s * 0.54);
  ctx.bezierCurveTo(-s * 1.18, -s * 0.05, -s * 0.40, -s * 0.66,  0,        -s * 0.72);
  ctx.closePath();
}
function makeCurvedNoseGeo(w = 0.028, h = 0.014, zOff = 0.004) {
  const sh = new THREE.Shape();
  sh.moveTo(-w*0.72, h*0.55); sh.quadraticCurveTo(0, h*0.92, w*0.72, h*0.55);
  sh.quadraticCurveTo(w*1.05, h*0.15, w*0.45, -h*0.50); sh.quadraticCurveTo(0, -h*1.05, -w*0.45, -h*0.50);
  sh.quadraticCurveTo(-w*1.05, h*0.15, -w*0.72, h*0.55);
  const g = new THREE.ShapeGeometry(sh, 14), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, zOff - (x*x*0.68 + y*y*0.68)); }
  return g;
}

// =============================================================================
// 3D-Rounded-Box-SDF (glitchfreie Raumwand-Abflachung)
// =============================================================================
const _sdfOut = { pen: 0, nx: 0, ny: 0, nz: 0, corner: 0 };
function evalInsideRoundedBox(wx, wy, wz, box) {
  const dx = Math.abs(wx - box.cx) - box.hx, dy = Math.abs(wy - box.cy) - box.hy, dz = Math.abs(wz - box.cz) - box.hz;
  const ox = Math.max(dx, 0), oy = Math.max(dy, 0), oz = Math.max(dz, 0);
  const outLen = Math.hypot(ox, oy, oz);
  const distOutside = outLen > 1e-6 ? (outLen - box.r) : (Math.max(dx, dy, dz) - box.r);
  _sdfOut.pen = distOutside;
  if (distOutside <= -box.knee) { _sdfOut.nx = _sdfOut.ny = _sdfOut.nz = _sdfOut.corner = 0; return _sdfOut; }
  const sx = wx >= box.cx ? -1 : 1, sy = wy >= box.cy ? -1 : 1, sz = wz >= box.cz ? -1 : 1;
  if (outLen > 1e-5) {
    _sdfOut.nx = sx*(ox/outLen); _sdfOut.ny = sy*(oy/outLen); _sdfOut.nz = sz*(oz/outLen);
    const active = (ox>0.005?1:0)+(oy>0.005?1:0)+(oz>0.005?1:0);
    _sdfOut.corner = active >= 2 ? clamp(Math.min(ox||1, oy||1, oz||1)/box.r + 0.45, 0, 1) : 0;
  } else {
    if (dx >= dy && dx >= dz) { _sdfOut.nx = sx; _sdfOut.ny = 0; _sdfOut.nz = 0; }
    else if (dy >= dz)        { _sdfOut.nx = 0; _sdfOut.ny = sy; _sdfOut.nz = 0; }
    else                      { _sdfOut.nx = 0; _sdfOut.ny = 0; _sdfOut.nz = sz; }
    _sdfOut.corner = 0;
  }
  return _sdfOut;
}

// =============================================================================
// Mochi-Shiba bauen (Softbody, 4 Fellfarben, echte Flugzeugohren, 11 Mimiken)
// =============================================================================
function buildShiba(coat, lightDir) {
  const matBody = createShibaBodyMaterial(coat, lightDir);
  const matEar = createCelMaterial({
    litHex: coat.bodyLit, shadowHex: coat.bodyShadow,
    innerLitHex: coat.innerEarLit, innerShadowHex: coat.innerEarShadow,
    lightDir, mode: 'ear',
  });
  const matTail = createCelMaterial({
    litHex: coat.bodyLit, shadowHex: coat.bodyShadow,
    innerLitHex: coat.creamLit, innerShadowHex: coat.creamShadow,
    lightDir, mode: 'tail',
  });
  const outBody = createOutlineMaterial({ inkHex: SHARED.ink, thicknessPx: 4.0, depthBias: 0.0005 });
  const outPart = createOutlineMaterial({ inkHex: SHARED.ink, thicknessPx: 3.6, depthBias: 0.0007 });

  const mkFaceMat = (color, extra = {}) => new THREE.MeshBasicMaterial({
    color, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...extra,
  });
  const matInk = mkFaceMat(SHARED.ink);
  const matWhite = mkFaceMat(SHARED.eyeWhite);
  const matTongue = mkFaceMat(SHARED.tongue);
  const matBrow = mkFaceMat(coat.browLit);
  const matBlush = createBlushMaterial(coat.blush, 0.28);

  const root = new THREE.Group(); root.name = 'Mochi_Shiba';
  const meshCol = new THREE.Group(), faceCol = new THREE.Group();
  root.add(meshCol, faceCol);

  const bodyGeo = quadMeshToGeometry(buildShibaBodyQuadMesh());
  const bodyRest = new Float32Array(bodyGeo.attributes.position.array);
  const body = new THREE.Mesh(bodyGeo, matBody);
  body.add(new THREE.Mesh(bodyGeo, outBody)); meshCol.add(body);

  let maxY = 0; for (let i = 1; i < bodyRest.length; i += 3) maxY = Math.max(maxY, bodyRest[i]);
  const centerY = maxY / 2;

  // Ohren mit ZYX-Basis-Gelenk (Flugzeugohren ohne sichtbares Weiß!)
  const earQM = buildShibaEarQuadMesh();
  const makeEar = side => {
    const geo = quadMeshToGeometry(earQM, ([, vy]) => { const t = clamp((vy + 0.09) / 0.085, 0, 1); return t * t * (3 - 2 * t); });
    const g = new THREE.Group();
    const s = sampleBodySurface(bodyGeo, side * 0.30, 0.87, 1);
    const patch = buildSurfacePatch(bodyGeo, s.point, 10);
    const baseRot = new THREE.Euler(deg(12), deg(side * 14), deg(-side * 24));
    const pivot = new THREE.Group();
    pivot.rotation.order = 'ZYX';
    g.add(pivot);
    const m = new THREE.Mesh(geo, matEar); m.position.y = 0.074;
    m.add(new THREE.Mesh(geo, outPart)); pivot.add(m); meshCol.add(g);
    const ear = {
      group: g, pivot, geo, rest: new Float32Array(geo.attributes.position.array), side,
      patch, offset: -0.010, baseQuat: new THREE.Quaternion().setFromEuler(baseRot),
      restNrm: new THREE.Vector3(), lastTwitch: -999, lastPlane: -999,
    };
    const initP = new THREE.Vector3();
    evalSurfacePatch(bodyGeo, patch, initP, ear.restNrm);
    g.position.copy(initP).addScaledVector(ear.restNrm, ear.offset);
    g.quaternion.copy(ear.baseQuat);
    return ear;
  };
  const earL = makeEar(-1), earR = makeEar(1);

  // Kringelschwanz (Maki-o)
  const tailGeo = quadMeshToGeometry(buildShibaTailQuadMesh(), ([, , vz]) => { const t = clamp((-vz - 0.005) / 0.075, 0, 1); return t * t * (3 - 2 * t); });
  const tailRest = new Float32Array(tailGeo.attributes.position.array);
  const tailGroup = new THREE.Group();
  const ts = sampleBodySurface(bodyGeo, 0, 0.375, -1);
  const tailPatch = buildSurfacePatch(bodyGeo, ts.point, 8);
  tailGroup.position.set(0, 0.375, ts.point.z + 0.036);
  tailGroup.rotation.set(deg(-6), deg(30), deg(-6));
  const tailPivot = new THREE.Group(); tailGroup.add(tailPivot);
  const tailMesh = new THREE.Mesh(tailGeo, matTail); tailMesh.add(new THREE.Mesh(tailGeo, outPart)); tailPivot.add(tailMesh);
  meshCol.add(tailGroup);

  const faceAttachments = [];
  const attachFacePart = (obj, x, y, zSign, clearance, lookStrength) => {
    const s = sampleBodySurface(bodyGeo, x, y, zSign);
    const patch = buildSurfacePatch(bodyGeo, s.point, 10);
    faceCol.add(obj);
    faceAttachments.push({ obj, patch, clearance, lookStrength, zSign });
  };

  // Augen-Rig (100% glitchfreie Canvas2D-Patches + Vektor-Augen!)
  const traceClippedSclera = (ctx, rx, ry, topY) => {
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = Math.PI + (i / 48) * Math.PI * 2;
      const px = Math.cos(a) * rx, py = Math.min(topY, Math.sin(a) * ry);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };

  const makeEye = side => {
    const eroot = new THREE.Group();
    attachFacePart(eroot, side * 0.155, 0.605, 1, 0.015, 0.78);
    const content = new THREE.Group(); eroot.add(content);
    const states = {};

    // 1. Zufrieden / Glücklich / Stolz (⌒ ⌒)
    const hPts = [];
    for (let i = 0; i <= 14; i++) { const u = i/14*2-1; hPts.push([u * 0.056, 0.022 * (1 - u*u) - 0.006]); }
    const mHappy = new THREE.Mesh(curvedStroke(hPts, 0.0074, 0.004), matInk); mHappy.renderOrder = 13;
    states.Happy = mHappy;

    // 2. Wache Knopfaugen (• •) mit kleinem Glanzlicht (folgen dem Cursor!)
    const btnGrp = new THREE.Group();
    const mBtn = new THREE.Mesh(curvedGridOval(0.038, 0.040, 0.004), matInk); mBtn.renderOrder = 13;
    const mBtnG = new THREE.Mesh(curvedGridOval(0.011, 0.011, 0.006, 0.68, 0.68, 16, 2, -0.011, 0.012), matWhite); mBtnG.renderOrder = 14;
    btnGrp.add(mBtn, mBtnG);
    states.Button = btnGrp;

    // 3. Neugierig (● ●) — glänzende große Mochi-Augen mit weißem Ring + Glanzpunkt
    const big = new THREE.Group();
    const mBigO = new THREE.Mesh(curvedGridOval(0.088, 0.086, 0.000), matInk); mBigO.renderOrder = 10;
    const mBigW = new THREE.Mesh(curvedGridOval(0.080, 0.078, 0.003), matWhite); mBigW.renderOrder = 11;
    const mBigP = new THREE.Group();
    const mBigPM = new THREE.Mesh(curvedGridOval(0.066, 0.064, 0.006), matInk); mBigPM.renderOrder = 12;
    const mBigG  = new THREE.Mesh(curvedGridOval(0.016, 0.015, 0.008, 0.68, 0.68, 16, 2, -0.018, 0.020), matWhite); mBigG.renderOrder = 13;
    mBigP.add(mBigPM, mBigG);
    big.add(mBigO, mBigW, mBigP);
    states.BigCute = big;

    // 4. Schmollend (😠) — 512px Canvas-Patch (0 Weißblitzer!)
    states.Pout = makeCurvedEyePatch(0.19, 0.16, ctx => {
      ctx.rotate(deg(side * 20));
      traceClippedSclera(ctx, 0.056, 0.032, 0.008);
      ctx.fillStyle = SHARED.eyeWhite; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.beginPath(); ctx.ellipse(-side * 0.017, -0.004, 0.042, 0.040, 0, 0, Math.PI * 2);
      ctx.fillStyle = SHARED.ink; ctx.fill(); ctx.restore();
      traceClippedSclera(ctx, 0.056, 0.032, 0.008);
      ctx.lineWidth = 0.011; ctx.lineJoin = 'round'; ctx.strokeStyle = SHARED.ink; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.068, 0.008); ctx.lineTo(0.068, 0.008);
      ctx.lineWidth = 0.0145; ctx.lineCap = 'round'; ctx.stroke();
    });

    // 5. Skeptisch (😒) — 512px Canvas-Patch (0 Weißblitzer!)
    states.Skeptic = makeCurvedEyePatch(0.20, 0.14, ctx => {
      ctx.beginPath(); ctx.ellipse(0, 0, 0.063, 0.024, 0, 0, Math.PI * 2);
      ctx.fillStyle = SHARED.eyeWhite; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.beginPath(); ctx.ellipse(0.025, 0, 0.033, 0.030, 0, 0, Math.PI * 2);
      ctx.fillStyle = SHARED.ink; ctx.fill(); ctx.restore();
      ctx.beginPath(); ctx.ellipse(0, 0, 0.063, 0.024, 0, 0, Math.PI * 2);
      ctx.lineWidth = 0.0105; ctx.strokeStyle = SHARED.ink; ctx.stroke();
      if (side > 0) {
        ctx.beginPath(); ctx.moveTo(-0.044, -0.034); ctx.lineTo(-0.012, -0.038);
        ctx.lineWidth = 0.0068; ctx.lineCap = 'round'; ctx.stroke();
      }
    });

    // 6. Seitenblick (¬ ¬) — 512px Canvas-Patch (0 Weißblitzer!)
    states.SideEye = makeCurvedEyePatch(0.20, 0.16, ctx => {
      ctx.rotate(deg(side * 7));
      traceClippedSclera(ctx, 0.056, 0.041, 0.010);
      ctx.fillStyle = SHARED.eyeWhite; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.beginPath(); ctx.ellipse(0.018, -0.004, 0.044, 0.044, 0, 0, Math.PI * 2);
      ctx.fillStyle = SHARED.ink; ctx.fill(); ctx.restore();
      traceClippedSclera(ctx, 0.056, 0.041, 0.010);
      ctx.lineWidth = 0.011; ctx.lineJoin = 'round'; ctx.strokeStyle = SHARED.ink; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.068, 0.010); ctx.lineTo(0.068, 0.010);
      ctx.lineWidth = 0.0145; ctx.lineCap = 'round'; ctx.stroke();
    });

    // 7. Traurig / Bettelnd (🥺) — 512px Canvas-Patch (glitzernde Augen + Träne!)
    states.SadPuppy = makeCurvedEyePatch(0.20, 0.18, ctx => {
      ctx.rotate(deg(-side * 12));
      ctx.beginPath(); ctx.ellipse(0, 0, 0.056, 0.048, 0, 0, Math.PI * 2);
      ctx.fillStyle = SHARED.ink; ctx.fill();
      ctx.fillStyle = SHARED.eyeWhite;
      ctx.beginPath(); ctx.ellipse(-0.016,  0.014, 0.017, 0.015, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse( 0.018, -0.010, 0.010, 0.009, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-0.020, -0.014, 0.006, 0.006, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(side * 0.022, -0.044, 0.032, 0.015, 0, 0, Math.PI*2);
      ctx.fillStyle = SHARED.tear; ctx.fill();
      ctx.lineWidth = 0.008; ctx.strokeStyle = SHARED.ink; ctx.stroke();
    });

    // 8. Verliebt (♥ ♥) — Kawaii-Mochi-Herz
    states.Heart = makeCurvedEyePatch(0.16, 0.15, ctx => {
      ctx.rotate(deg(side * 6));
      makeKawaiiHeartPath(ctx, 0.044);
      ctx.fillStyle = SHARED.heart; ctx.fill();
      ctx.lineWidth = 0.010; ctx.lineJoin = 'round'; ctx.strokeStyle = SHARED.ink; ctx.stroke();
    });

    // 9. Eingeschnappt (︶ ︶)
    const hfPts = [];
    for (let i = 0; i <= 14; i++) { const u = i/14*2-1; hfPts.push([u * 0.054, -0.016*(1-u*u) - side*u*0.009 + 0.004]); }
    const mHuffy = new THREE.Mesh(curvedStroke(hfPts, 0.0072, 0.004), matInk); mHuffy.renderOrder = 13;
    states.Huffy = mHuffy;

    // 10. Geschlossen / Müde (—)
    const cPts = [];
    for (let i = 0; i <= 14; i++) { const u = i/14*2-1; cPts.push([u * 0.058, -0.004*(1-u*u) + side*u*0.003]); }
    const mClosed = new THREE.Mesh(curvedStroke(cPts, 0.0068, 0.004), matInk); mClosed.renderOrder = 13;
    states.Closed = mClosed;

    // 11. Wütend (> <)
    const wince = new THREE.Group(); const sg = -side;
    const wT = new THREE.Mesh(curvedStroke([[-sg*0.048, 0.032], [sg*0.042, 0]], 0.0076, 0.004), matInk);
    const wB = new THREE.Mesh(curvedStroke([[-sg*0.048,-0.032], [sg*0.042, 0]], 0.0076, 0.004), matInk);
    wT.renderOrder = 13; wB.renderOrder = 13; wince.add(wT, wB);
    states.Wince = wince;

    // 12. Schockiert (⊙)
    const sh = new THREE.Group();
    const shO = new THREE.Mesh(curvedGridOval(0.080, 0.076, 0.000), matInk); shO.renderOrder = 10;
    const shW = new THREE.Mesh(curvedGridOval(0.070, 0.066, 0.003), matWhite); shW.renderOrder = 11;
    const shP = new THREE.Mesh(curvedGridOval(0.030, 0.030, 0.006), matInk); shP.renderOrder = 12;
    sh.add(shO, shW, shP);
    states.Shocked = sh;

    for (const k in states) content.add(states[k]);
    return { root: eroot, content, side, states, pupilBig: mBigP, pupilShock: shP };
  };
  const eyeL = makeEye(-1), eyeR = makeEye(1);

  // Maro-Augenbrauen + Stirn-Zornesfalten „||“
  const makeBrow = side => {
    const g = new THREE.Group();
    attachFacePart(g, side * 0.115, 0.710, 1, 0.013, 0.86);
    const inner = new THREE.Group(); g.add(inner);
    const m = new THREE.Mesh(curvedGridOval(0.031, 0.017, 0.002, 0.72, 0.72, 24, 2), matBrow);
    m.renderOrder = 11; inner.add(m);
    return { group: g, inner, side };
  };
  const browL = makeBrow(-1), browR = makeBrow(1);

  const frownLines = new THREE.Group();
  attachFacePart(frownLines, 0, 0.678, 1, 0.014, 0.86);
  const fL = new THREE.Mesh(curvedStroke([[-0.017, 0.014], [-0.011, -0.014]], 0.0038, 0.003), matInk); fL.renderOrder = 13;
  const fR = new THREE.Mesh(curvedStroke([[ 0.017, 0.014], [ 0.011, -0.014]], 0.0038, 0.003), matInk); fR.renderOrder = 13;
  frownLines.add(fL, fR); frownLines.visible = false;

  // Wangenröte
  for (const side of [-1, 1]) {
    const bg = new THREE.Group();
    attachFacePart(bg, side * 0.275, 0.525, 1, 0.012, 0.78);
    const bm = new THREE.Mesh(curvedGridOval(0.062, 0.036, 0.001, 0.68, 0.68, 24, 2), matBlush);
    bm.renderOrder = 9; bg.add(bm);
  }

  // Manga-Wut-Ader (💢) sauber gekrümmt mit offener Mitte
  const angerGroup = new THREE.Group();
  attachFacePart(angerGroup, 0.25, 0.76, 1, 0.016, 0.88);
  const angerPatch = makeCurvedEyePatch(0.16, 0.16, ctx => {
    const quads = [[1,1],[-1,1],[-1,-1],[1,-1]];
    for (const [sx, sy] of quads) {
      ctx.beginPath();
      ctx.moveTo(sx*0.056, sy*0.016); ctx.quadraticCurveTo(sx*0.018, sy*0.018, sx*0.016, sy*0.056);
      ctx.lineCap = 'round';
      ctx.lineWidth = 0.018; ctx.strokeStyle = SHARED.ink; ctx.stroke();
      ctx.lineWidth = 0.009; ctx.strokeStyle = SHARED.heart; ctx.stroke();
    }
  });
  angerGroup.add(angerPatch); angerGroup.visible = false;

  // Einzelne Schweißperle (💧) links an der Schläfe nah am Gesicht
  const sweatGroup = new THREE.Group();
  attachFacePart(sweatGroup, -0.31, 0.69, 1, 0.016, 0.80);
  const sweatPatch = makeCurvedEyePatch(0.14, 0.18, ctx => {
    ctx.beginPath();
    ctx.moveTo(0, 0.062);
    ctx.bezierCurveTo( 0.030, 0.008,  0.038, -0.028, 0, -0.058);
    ctx.bezierCurveTo(-0.038, -0.028, -0.030, 0.008, 0,  0.062);
    ctx.closePath();
    ctx.fillStyle = SHARED.tear; ctx.fill();
    ctx.lineWidth = 0.010; ctx.lineJoin = 'round'; ctx.strokeStyle = SHARED.ink; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-0.009, -0.012, 0.007, 0.014, 0.15, 0, Math.PI*2);
    ctx.fillStyle = SHARED.eyeWhite; ctx.fill();
  });
  sweatGroup.add(sweatPatch); sweatGroup.visible = false;

  // Mund + Shiba-Nase + optionale Zunge + Hmpf-Backe
  const mouth = new THREE.Group();
  attachFacePart(mouth, 0, 0.545, 1, 0.015, 0.84);
  const noseM = new THREE.Mesh(makeCurvedNoseGeo(), matInk); noseM.position.y = 0.017; noseM.renderOrder = 14;
  mouth.add(noseM);

  const mouthStates = {};
  const addSt = (grp, pts, hw) => { const m = new THREE.Mesh(curvedStroke(pts, hw, 0.003), matInk); m.renderOrder = 13; grp.add(m); };
  const stem = [[0, 0.009], [0, -0.004]];

  // A: Breites sanftes Shiba-Lächeln „ω“ (ohne Zunge als Standard!)
  const mHappy = new THREE.Group();
  const wL = [], wR = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14, x = t * 0.066, y = -0.004 - Math.sin(t * Math.PI) * 0.013 + Math.pow(t, 1.65) * 0.009;
    wL.push([-x, y]); wR.push([x, y]);
  }
  addSt(mHappy, stem, 0.0042); addSt(mHappy, wL, 0.0044); addSt(mHappy, wR, 0.0044);
  mouthStates.happy = mHappy;

  // B: Klassisches Shiba-„人“
  const mNorm = new THREE.Group();
  addSt(mNorm, stem, 0.0046);
  addSt(mNorm, [[0,-0.004],[-0.012,-0.014],[-0.022,-0.024]], 0.0046);
  addSt(mNorm, [[0,-0.004],[ 0.012,-0.014],[ 0.022,-0.024]], 0.0046);
  mouthStates.normal = mNorm;

  // C: Trockener flacher Strich „—“ (Skeptisch)
  const mFlat = new THREE.Group();
  addSt(mFlat, [[-0.028, -0.016], [0.028, -0.016]], 0.0052);
  mouthStates.flat = mFlat;

  // D: Zickzack-Knurren „〰“ (Wütend)
  const mGrowl = new THREE.Group();
  addSt(mGrowl, [[-0.048,-0.017],[-0.024,-0.005],[0,-0.016],[0.024,-0.005],[0.048,-0.017]], 0.0048);
  mouthStates.growl = mGrowl;

  // E: Einseitig aufgeblasene Hmpf-Backe (keine Doppelkerben!)
  const mHmpf = new THREE.Group();
  const hArc = [];
  for (let i = 0; i <= 12; i++) { const u = i/12*2-1; hArc.push([-0.034 + (1-u*u)*0.016, -0.011 - u*0.022]); }
  addSt(mHmpf, hArc, 0.0046);
  addSt(mHmpf, [[-0.018,-0.011],[0.002,-0.013],[0.020,-0.022]], 0.0046);
  mouthStates.hmpf = mHmpf;

  // F: Offener Kau- / Schock-Mund
  const mOpen = new THREE.Group();
  const mOpenO = new THREE.Mesh(curvedGridOval(0.028, 0.036, 0.002, 0.68, 0.68, 24, 2, 0, -0.032), matInk); mOpenO.renderOrder = 12;
  const mOpenI = new THREE.Mesh(curvedGridOval(0.020, 0.027, 0.0045, 0.68, 0.68, 24, 2, 0, -0.032), matTongue); mOpenI.renderOrder = 13;
  mOpen.add(mOpenO, mOpenI);
  mouthStates.open = mOpen;

  for (const k in mouthStates) mouth.add(mouthStates[k]);

  // Optionale kleine rosa Zunge (z. B. beim fröhlichen Hecheln / nach dem Apportieren!)
  const tongueGrp = new THREE.Group();
  const tO = new THREE.Mesh(curvedGridOval(0.019, 0.021, 0.001, 0.68, 0.68, 20, 2, 0, -0.021), matInk); tO.renderOrder = 11;
  const tI = new THREE.Mesh(curvedGridOval(0.013, 0.015, 0.003, 0.68, 0.68, 20, 2, 0, -0.022), matTongue); tI.renderOrder = 12;
  tongueGrp.add(tO, tI); tongueGrp.visible = false;
  mouth.add(tongueGrp);

  // Niedliches Popo-„×“ auf der Rückseite
  const buttX = new THREE.Group();
  attachFacePart(buttX, 0, 0.155, -1, 0.012, 0.88);
  const bx1 = new THREE.Mesh(curvedStroke([[-0.016,-0.016],[0.016,0.016]], 0.0046, 0.002), matInk); bx1.renderOrder = 12;
  const bx2 = new THREE.Mesh(curvedStroke([[-0.016, 0.016],[0.016,-0.016]], 0.0046, 0.002), matInk); bx2.renderOrder = 12;
  buttX.add(bx1, bx2);

  // =========================================================================
  // 3D-Accessoires (Softbody-verankert mit passendem Cel-Shading & Outlines!)
  // =========================================================================
  const prepAcc = (geo) => {
    const n = geo.attributes.position.count;
    geo.setAttribute('aRestPos', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.array), 3));
    geo.setAttribute('aOutlineWeight', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
    return geo;
  };
  const makeCelPiece = (geo, litHex, shadowHex) => {
    const g = prepAcc(geo);
    const mat = createCelMaterial({ litHex, shadowHex, lightDir });
    const mesh = new THREE.Mesh(g, mat);
    mesh.add(new THREE.Mesh(g, outPart));
    return mesh;
  };

  // Kopf-Anker oben zwischen den Ohren (Matcha-Blatt, Café-Mütze, Mochi-Krone)
  const headTopSample = sampleBodySurface(bodyGeo, 0, 0.96, 1);
  const headTopPatch = buildSurfacePatch(bodyGeo, headTopSample.point, 10);
  const headTopRestNrm = headTopSample.normal.clone();
  const headTopAnchor = new THREE.Group();
  meshCol.add(headTopAnchor);

  const accGroups = {};

  // 1. Matcha-Blatt (wie im App-Icon!)
  const leafGrp = new THREE.Group();
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.quadraticCurveTo(0.11, 0.04, 0.14, 0.17);
  leafShape.quadraticCurveTo(0.03, 0.20, -0.04, 0.11);
  leafShape.quadraticCurveTo(-0.07, 0.04, 0, 0);
  const leafGeo = new THREE.ExtrudeGeometry(leafShape, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3 });
  leafGeo.center();
  const leafMesh = makeCelPiece(leafGeo, '#7CB05A', '#4D7938');
  leafMesh.position.set(0.01, 0.07, 0.01);
  leafMesh.rotation.set(deg(55), deg(-18), deg(-18));
  const stemGeo = new THREE.CylinderGeometry(0.011, 0.015, 0.08, 8);
  const stemMesh = makeCelPiece(stemGeo, '#5D8A42', '#3D5E2A');
  stemMesh.position.set(0.055, 0.095, -0.025);
  stemMesh.rotation.set(deg(-15), 0, deg(-28));
  leafGrp.add(leafMesh, stemMesh);
  leafGrp.visible = false;
  headTopAnchor.add(leafGrp);
  accGroups.leaf = leafGrp;

  // 2. Gemütliche Café-Baskenmütze (Beret)
  const beretGrp = new THREE.Group();
  const beretCap = new THREE.SphereGeometry(0.24, 24, 16);
  beretCap.scale(1.18, 0.42, 1.12);
  const beretMesh = makeCelPiece(beretCap, '#8D6146', '#613E29');
  beretMesh.position.set(-0.02, 0.055, -0.01);
  beretMesh.rotation.set(deg(-8), 0, deg(10));
  const beretNub = makeCelPiece(new THREE.CylinderGeometry(0.016, 0.022, 0.06, 10), '#613E29', '#42281A');
  beretNub.position.set(-0.04, 0.16, -0.02);
  beretNub.rotation.z = deg(16);
  beretGrp.add(beretMesh, beretNub);
  beretGrp.visible = false;
  headTopAnchor.add(beretGrp);
  accGroups.beret = beretGrp;

  // 3. Goldene Mochi-Krone
  const crownGrp = new THREE.Group();
  const crownBase = makeCelPiece(new THREE.CylinderGeometry(0.155, 0.135, 0.09, 16), '#F2C94C', '#C79222');
  crownBase.position.y = 0.055;
  crownGrp.add(crownBase);
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    const spike = makeCelPiece(new THREE.ConeGeometry(0.046, 0.095, 8), '#F7D76A', '#C79222');
    spike.position.set(Math.sin(ang) * 0.135, 0.135, Math.cos(ang) * 0.135);
    const gem = makeCelPiece(new THREE.SphereGeometry(0.022, 10, 8), '#E55A52', '#A8322C');
    gem.position.set(Math.sin(ang) * 0.145, 0.055, Math.cos(ang) * 0.145);
    crownGrp.add(spike, gem);
  }
  crownGrp.visible = false;
  headTopAnchor.add(crownGrp);
  accGroups.crown = crownGrp;

  // 4. Coole runde Sonnenbrille (auf dem Gesicht verankert!)
  const shadesGrp = new THREE.Group();
  attachFacePart(shadesGrp, 0, 0.56, 1, 0.032, 0.85);
  const matLens = mkFaceMat('#232026');
  const matFrame = mkFaceMat('#181514');
  const matGlint = mkFaceMat('#FFFFFF', { transparent: true, opacity: 0.72 });
  for (const s of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.068, 0.084, 24), matFrame);
    rim.position.set(s * 0.135, 0.005, 0.004); rim.renderOrder = 16;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.070, 24), matLens);
    lens.position.set(s * 0.135, 0.005, 0.002); lens.renderOrder = 15;
    const glint = new THREE.Mesh(new THREE.PlaneGeometry(0.024, 0.055), matGlint);
    glint.position.set(s * 0.135 - 0.022, 0.015, 0.006); glint.rotation.z = deg(-24); glint.renderOrder = 17;
    shadesGrp.add(lens, rim, glint);
  }
  const bridge = new THREE.Mesh(new THREE.PlaneGeometry(0.115, 0.018), matFrame);
  bridge.position.set(0, 0.014, 0.004); bridge.renderOrder = 16;
  shadesGrp.add(bridge);
  shadesGrp.visible = false;
  accGroups.shades = shadesGrp;

  // 5. Gemütliches Terrakotta-Halstuch (Bandana)
  const bandanaGrp = new THREE.Group();
  attachFacePart(bandanaGrp, 0, 0.24, 1, 0.024, 0.74);
  const bandShape = new THREE.Shape();
  bandShape.moveTo(-0.22, 0.055);
  bandShape.quadraticCurveTo(0, 0.02, 0.22, 0.055);
  bandShape.quadraticCurveTo(0.13, -0.07, 0, -0.155);
  bandShape.quadraticCurveTo(-0.13, -0.07, -0.22, 0.055);
  const bandGeo = new THREE.ExtrudeGeometry(bandShape, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 });
  bandGeo.center();
  const bandMesh = makeCelPiece(bandGeo, '#D26B52', '#9D432E');
  bandMesh.position.set(0, -0.02, 0.015);
  bandMesh.rotation.x = deg(16);
  const bandKnot = makeCelPiece(new THREE.SphereGeometry(0.038, 12, 10), '#EFE8D8', '#C9BFA9');
  bandKnot.position.set(0, 0.028, 0.025);
  bandanaGrp.add(bandMesh, bandKnot);
  bandanaGrp.visible = false;
  accGroups.bandana = bandanaGrp;

  function setAccessory(id) {
    for (const k in accGroups) accGroups[k].visible = (k === id);
  }

  // Fellfarbe live umschalten
  function setCoat(c) {
    matBody.uniforms.uLitColor.value.set(c.bodyLit);
    matBody.uniforms.uShadowColor.value.set(c.bodyShadow);
    matBody.uniforms.uCreamLitColor.value.set(c.creamLit);
    matBody.uniforms.uCreamShadowColor.value.set(c.creamShadow);
    matEar.uniforms.uLitColor.value.set(c.bodyLit);
    matEar.uniforms.uShadowColor.value.set(c.bodyShadow);
    matEar.uniforms.uInnerLitColor.value.set(c.innerEarLit);
    matEar.uniforms.uInnerShadowColor.value.set(c.innerEarShadow);
    matTail.uniforms.uLitColor.value.set(c.bodyLit);
    matTail.uniforms.uShadowColor.value.set(c.bodyShadow);
    matTail.uniforms.uInnerLitColor.value.set(c.creamLit);
    matTail.uniforms.uInnerShadowColor.value.set(c.creamShadow);
    matBrow.color.set(c.browLit);
    matBlush.uniforms.uColor.value.set(c.blush);
    browL.group.visible = c.showBrows;
    browR.group.visible = c.showBrows;
  }

  // =========================================================================
  // 3D-Softbody-Deformation (inkl. Hmpf-Backe & sattem Kugelbauch!)
  // =========================================================================
  const tmpP = new THREE.Vector3(), tmpN = new THREE.Vector3();
  const zFwd = new THREE.Vector3(0, 0, 1), zBack = new THREE.Vector3(0, 0, -1);
  const tmpBlend = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

  function deformBody(def, baseMat, invBaseMat, roundBox, ballObj) {
    const pos = bodyGeo.attributes.position;
    const mB = baseMat.elements, mI = invBaseMat.elements;

    const fullBulge = def.fullnessBulge || 0;
    const bodyStretch = def.bodyStretch || 0;
    const headPitch = def.headPitch || 0;
    const headRoll = def.headRoll || 0;
    const sx = clamp((1 + def.jx) * (1 + fullBulge * 0.13) * (1 - bodyStretch * 0.10), 0.64, 1.54);
    const sy = clamp((1 + def.jy) * (1 - fullBulge * 0.08) * (1 - bodyStretch * 0.18), 0.50, 1.46);
    const sz = clamp((1 / Math.sqrt(sx * sy)) * (1 + fullBulge * 0.10) * (1 + bodyStretch * 0.34), 0.72, 1.56);
    const breath = def.breath;
    const bXZ = 1 + 0.14 * breath, bY = 1 - 0.19 * breath;

    const shearX = def.shearX, shearZ = def.shearZ, bendX = def.bendX, bendY = def.bendY;
    const stAmt = def.stretch, stX = def.stLocalX, stY = def.stLocalY, stZ = def.stLocalZ;
    const pullActive = def.pullActive, gx = def.grabX, gy = def.grabY, gz = def.grabZ;
    const px = def.pullX, py = def.pullY, pz = def.pullZ;
    const cheekPuff = def.cheekPuff || 0;

    const hasBall = ballObj && ballObj.enabled && !ballObj.carried;
    const bxW = hasBall ? ballObj.x : 0, byW = hasBall ? ballObj.y : 0, bzW = hasBall ? ballObj.z : 0;
    const bR = hasBall ? ballObj.r + 0.018 : 0;
    const dentAmp = def.dentAmp, dentX = def.dentX, dentY = def.dentY, dentZ = def.dentZ;

    let maxWallPen = 0;

    for (let i = 0; i < pos.count; i++) {
      let rx0 = bodyRest[i*3], ry0 = bodyRest[i*3+1], rz0 = bodyRest[i*3+2];

      // Einseitig aufgeblasene linke Hmpf-Backe!
      if (cheekPuff > 0.01 && rx0 < 0.04 && rz0 > 0.10) {
        const dx = (rx0 + 0.24) / 0.24, dy = (ry0 - 0.50) / 0.21, dz = (rz0 - 0.55) / 0.26;
        const r2 = dx*dx + dy*dy + dz*dz;
        if (r2 < 2.4) {
          const g = Math.exp(-r2 * 1.45) * cheekPuff;
          rx0 -= 0.040 * g; rz0 += 0.044 * g;
        }
      }

      let x = rx0, y = ry0 - centerY, z = rz0;
      const uY = clamp(ry0 / maxY, 0, 1);
      const bWave = 1 + 0.045 * breath * Math.sin(uY * Math.PI);
      x *= bXZ * bWave; z *= bXZ * bWave;
      y = (Math.pow(uY, 1 + 0.16 * breath) * maxY * bY) - centerY;
      x *= sx; y *= sy; z *= sz;

      if (stAmt > 0.002) {
        const dot = x*stX + y*stY + z*stZ, along = dot * stAmt, shrink = 1 - stAmt * 0.36;
        x = x*shrink + stX*(dot*(1-shrink)+along);
        y = y*shrink + stY*(dot*(1-shrink)+along);
        z = z*shrink + stZ*(dot*(1-shrink)+along);
      }

      const yn = y / centerY, xn = x / 0.70;
      x += shearX * yn * 0.36; z += shearZ * yn * 0.36;
      y += bendX * (xn*xn - 0.35) * 0.28; x += bendY * (yn*yn - 0.35) * 0.28;

      // Sanfte organische Kopf-Neigung (Neugier-Tilt, Schnüffel-Nicken, Napf-Beugen)
      if (Math.abs(headPitch) > 0.002 || Math.abs(headRoll) > 0.002) {
        const frontW = smoothstepJS(-0.22, 0.55, z) * smoothstepJS(-0.25, 0.35, y);
        if (frontW > 0.001) {
          if (Math.abs(headPitch) > 0.002) {
            const a = headPitch * frontW, ca = Math.cos(a), sa = Math.sin(a);
            const ny2 = y * ca - z * sa, nz2 = y * sa + z * ca;
            y = ny2; z = nz2;
          }
          if (Math.abs(headRoll) > 0.002) {
            const a = headRoll * frontW, ca = Math.cos(a), sa = Math.sin(a);
            const nx2 = x * ca - y * sa, ny2 = x * sa + y * ca;
            x = nx2; y = ny2;
          }
        }
      }

      if (Math.abs(dentAmp) > 0.002) {
        const ddx = x-dentX, ddy = y-dentY, ddz = z-dentZ;
        const wD = Math.exp(-(ddx*ddx+ddy*ddy+ddz*ddz)/0.22), dl = Math.hypot(dentX,dentY,dentZ)||1;
        x -= (dentX/dl)*dentAmp*wD; y -= (dentY/dl)*dentAmp*wD; z -= (dentZ/dl)*dentAmp*wD;
      }
      if (pullActive) {
        const ddx = x-gx, ddy = y-gy, ddz = z-gz, wP = Math.exp(-(ddx*ddx+ddy*ddy+ddz*ddz)/0.42);
        x += px*wP; y += py*wP; z += pz*wP;
      }

      const lx = x, ly = y + centerY, lz = z;
      let wx = mB[0]*lx + mB[4]*ly + mB[8]*lz + mB[12];
      let wy = mB[1]*lx + mB[5]*ly + mB[9]*lz + mB[13];
      let wz = mB[2]*lx + mB[6]*ly + mB[10]*lz + mB[14];

      const sdf = evalInsideRoundedBox(wx, wy, wz, roundBox);
      if (sdf.pen > -roundBox.knee) {
        let push = 0;
        if (sdf.pen >= roundBox.knee) push = sdf.pen;
        else { const t = (sdf.pen + roundBox.knee)/(2*roundBox.knee); push = roundBox.knee*0.5*t*t; }
        if (push > 0) {
          wx += sdf.nx*push; wy += sdf.ny*push; wz += sdf.nz*push;
          maxWallPen = Math.max(maxWallPen, push);
          const ba = Math.min(push, 0.20) * 0.50 * (1 - sdf.corner * 0.85);
          if (ba > 0.001) {
            const rx = wx-def.bodyX, ry = wy-def.bodyY, rz = wz-def.bodyZ;
            const rN = rx*sdf.nx + ry*sdf.ny + rz*sdf.nz;
            wx += clamp(rx-sdf.nx*rN,-0.65,0.65)*ba; wy += clamp(ry-sdf.ny*rN,-0.55,0.55)*ba; wz += clamp(rz-sdf.nz*rN,-0.55,0.55)*ba;
            const s2 = evalInsideRoundedBox(wx, wy, wz, roundBox);
            if (s2.pen > 0) { wx += s2.nx*s2.pen; wy += s2.ny*s2.pen; wz += s2.nz*s2.pen; }
          }
        }
      }

      if (hasBall) {
        const dx = wx-bxW, dy = wy-byW, dz = wz-bzW, dist = Math.hypot(dx,dy,dz), penB = bR - dist;
        if (penB > 0 && dist > 1e-4) {
          const push = Math.min(penB * 0.88, 0.20);
          wx += (dx/dist)*push; wy += (dy/dist)*push; wz += (dz/dist)*push;
          maxWallPen = Math.max(maxWallPen, push);
        }
      }

      pos.setXYZ(i,
        mI[0]*wx + mI[4]*wy + mI[8]*wz + mI[12],
        mI[1]*wx + mI[5]*wy + mI[9]*wz + mI[13],
        mI[2]*wx + mI[6]*wy + mI[10]*wz + mI[14],
      );
    }

    pos.needsUpdate = true; bodyGeo.computeVertexNormals();

    for (const ear of [earL, earR]) {
      evalSurfacePatch(bodyGeo, ear.patch, tmpP, tmpN);
      ear.group.position.copy(tmpP).addScaledVector(tmpN, ear.offset);
      tmpQ.setFromUnitVectors(ear.restNrm, tmpN);
      ear.group.quaternion.copy(tmpQ).multiply(ear.baseQuat);
    }
    evalSurfacePatch(bodyGeo, tailPatch, tmpP, tmpN);
    tailGroup.position.copy(tmpP).addScaledVector(tmpN, -0.036);

    evalSurfacePatch(bodyGeo, headTopPatch, tmpP, tmpN);
    headTopAnchor.position.copy(tmpP).addScaledVector(tmpN, 0.008);
    headTopAnchor.quaternion.setFromUnitVectors(headTopRestNrm, tmpN);

    for (const fa of faceAttachments) {
      evalSurfacePatch(bodyGeo, fa.patch, tmpP, tmpN);
      fa.obj.position.copy(tmpP).addScaledVector(tmpN, fa.clearance);
      const baseD = fa.zSign > 0 ? zFwd : zBack;
      tmpBlend.copy(baseD).lerp(tmpN, fa.lookStrength).normalize();
      fa.obj.quaternion.setFromUnitVectors(zFwd, tmpBlend);
    }
    return maxWallPen;
  }

  let lastTailW = -999, lastTailL = -999;
  const applyTail = (wag, lift) => {
    if (Math.abs(lastTailW - wag) < 0.005 && Math.abs(lastTailL - lift) < 0.005) return;
    lastTailW = wag; lastTailL = lift;
    tailPivot.rotation.set(deg(-14) * lift, deg(26) * wag, deg(-10) * wag);
    const pos = tailGeo.attributes.position, fw = deg(16) * wag, fl = deg(14) * lift;
    for (let i = 0; i < pos.count; i++) {
      const x = tailRest[i*3], y = tailRest[i*3+1], z = tailRest[i*3+2], b = clamp(-z/0.30, 0, 1) ** 2;
      const ca = fl*b, y1 = y*Math.cos(ca) - z*Math.sin(ca), z1 = y*Math.sin(ca) + z*Math.cos(ca);
      const wa = fw*b;
      pos.setXYZ(i, x*Math.cos(wa) + z1*Math.sin(wa), y1, -x*Math.sin(wa) + z1*Math.cos(wa));
    }
    pos.needsUpdate = true; tailGeo.computeVertexNormals();
  };

  // Echte Flugzeugohren (ZYX -> dreht Weiß komplett nach unten weg!) + federndes Zucken
  const applyEar = (ear, twitch, planeAmt) => {
    const tw = clamp(twitch, -0.45, 1.1);
    const pl = clamp(planeAmt, 0, 1);
    if (Math.abs(ear.lastTwitch - tw) < 0.003 && Math.abs(ear.lastPlane - pl) < 0.003) return;
    ear.lastTwitch = tw; ear.lastPlane = pl;
    const f = pl * pl * (3 - 2 * pl);
    ear.pivot.rotation.set(deg(-8) * f, deg(ear.side * 110) * f, deg(-ear.side * 68) * f);
    ear.pivot.scale.set(1 + 0.04*f, 1 + 0.45*f, 1 - 0.26*f);
    ear.pivot.position.set(ear.side * 0.075 * f, -0.018 * f, 0.008 * f);

    const pos = ear.geo.attributes.position, mx = deg(22) * tw * (1 - f * 0.55);
    for (let i = 0; i < pos.count; i++) {
      const x = ear.rest[i*3], y = ear.rest[i*3+1], z = ear.rest[i*3+2];
      const u = clamp((y + 0.08) / 0.25, 0, 1), a = -ear.side * mx * u * u, dy = y + 0.08;
      pos.setXYZ(i, x*Math.cos(a) - dy*Math.sin(a), x*Math.sin(a) + dy*Math.cos(a) - 0.08, z + 0.028*f*u*u);
    }
    pos.needsUpdate = true; ear.geo.computeVertexNormals();
  };

  let lastFaceKey = '';
  const applyFace = (cfg) => {
    matBlush.uniforms.uOpacity.value = clamp(cfg.blush * 0.72, 0, 0.72);
    angerGroup.visible = cfg.angerMark > 0.15;
    if (angerGroup.visible) {
      const p = 1 + Math.sin(performance.now() * 0.011) * 0.08;
      angerPatch.scale.set(p, p, 1);
    }
    sweatGroup.visible = cfg.sweat > 0.25;
    frownLines.visible = cfg.frown;

    for (const k in mouthStates) mouthStates[k].visible = (k === cfg.mouthMode);
    if (cfg.mouthMode === 'open') {
      const chew = cfg.chewPhase > 0 ? (0.45 + 0.65 * Math.abs(Math.sin(cfg.chewPhase * 17))) : 1;
      mOpen.scale.set(1, chew, 1);
    }
    tongueGrp.visible = Boolean(cfg.tongue) && cfg.mouthMode !== 'open';

    const lx = clamp(cfg.lookX, -1, 1), ly = clamp(cfg.lookY, -1, 1);
    const key = `${cfg.eyeMode}|${lx.toFixed(2)}|${ly.toFixed(2)}|${cfg.eyeSX.toFixed(2)}|${cfg.eyeSY.toFixed(2)}|${cfg.browMode}`;
    if (key === lastFaceKey) return;
    lastFaceKey = key;

    for (const e of [eyeL, eyeR]) {
      for (const k in e.states) e.states[k].visible = (k === cfg.eyeMode);
      const trackScale = (cfg.eyeMode === 'Closed' || cfg.eyeMode === 'Wince') ? 0.35 : 1.0;
      e.content.position.set(lx * 0.024 * trackScale, ly * 0.016 * trackScale, 0);
      e.content.scale.set(cfg.eyeSX, cfg.eyeSY, 1);
      if (cfg.eyeMode === 'BigCute') e.pupilBig.position.set(lx * 0.012, ly * 0.009, 0);
      if (cfg.eyeMode === 'Shocked') e.pupilShock.position.set(lx * 0.020, ly * 0.014, 0);
    }
    for (const b of [browL, browR]) {
      let tiltDeg = -14, dy = 0;
      if (cfg.browMode === 'angry') { tiltDeg = 14; dy = -0.010; }
      else if (cfg.browMode === 'sad') { tiltDeg = -34; dy = -0.012; }
      else if (cfg.browMode === 'skeptic') { tiltDeg = -10; dy = b.side > 0 ? 0.016 : -0.004; }
      else if (cfg.browMode === 'shock') { tiltDeg = -18; dy = 0.015; }
      b.inner.rotation.z = deg(b.side * tiltDeg);
      b.inner.position.y = dy;
    }
  };

  const getMouthWorldPos = (out, forwardOff = 0.16) => {
    out.set(0, 0, forwardOff); mouth.localToWorld(out); return out;
  };

  return {
    root, bodyMesh: body, mouth, centerY, maxY, earL, earR,
    deformBody, applyTail, applyEar, applyFace, setCoat, setAccessory, getMouthWorldPos,
    setResolution: (w, h) => { outBody.uniforms.uResolution.value.set(w, h); outPart.uniforms.uResolution.value.set(w, h); },
  };
}

// =============================================================================
// 3D-Props: Tennisball, Keramik-Futternapf mit 3D-Futter, Kauknochen & Honigkeks
// =============================================================================
function prepCelGeo(geo) {
  const n = geo.attributes.position.count;
  geo.setAttribute('aRestPos', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.array), 3));
  geo.setAttribute('aOutlineWeight', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  return geo;
}

function buildToyBall(lightDir) {
  const r = 0.20;
  const geo = quadMeshToGeometry(catmullClark(planarSubdivide(makeCubeQuadMesh(), 1), 2));
  const pos = geo.attributes.position, rest = geo.attributes.aRestPos;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), l = Math.hypot(x,y,z) || 1;
    pos.setXYZ(i, x/l*r, y/l*r, z/l*r); rest.setXYZ(i, x/l*r, y/l*r, z/l*r);
  }
  geo.computeVertexNormals();
  const mat = createCelMaterial({ litHex: SHARED.ballLit, shadowHex: SHARED.ballShadow, stripeHex: SHARED.eyeWhite, lightDir, threshold: 0.18, mode: 'stripe' });
  const out = createOutlineMaterial({ inkHex: SHARED.ink, thicknessPx: 3.6, depthBias: 0.0006 });
  const mesh = new THREE.Mesh(geo, mat); mesh.add(new THREE.Mesh(geo, out));
  return { mesh, out, r };
}

function buildFoodBowl(lightDir) {
  const root = new THREE.Group(); root.name = 'Shiba_Food_Bowl';
  const outMat = createOutlineMaterial({ inkHex: SHARED.ink, thicknessPx: 3.6, depthBias: 0.0006 });
  const wrap = (geo, lit, shadow) => {
    const m = new THREE.Mesh(prepCelGeo(geo), createCelMaterial({ litHex: lit, shadowHex: shadow, lightDir, threshold: 0.16 }));
    m.add(new THREE.Mesh(geo, outMat)); return m;
  };

  // Konischer Keramik-Napf (steht plan auf Y = 0.000 m!)
  const bowlPts = [
    new THREE.Vector2(0.001, 0.000),
    new THREE.Vector2(0.37,  0.000),
    new THREE.Vector2(0.32,  0.220),
    new THREE.Vector2(0.285, 0.228),
    new THREE.Vector2(0.265, 0.205),
    new THREE.Vector2(0.255, 0.055),
    new THREE.Vector2(0.001, 0.055),
  ];
  const bowlGeo = new THREE.LatheGeometry(bowlPts, 32);
  root.add(wrap(bowlGeo, SHARED.bowlLit, SHARED.bowlShadow));

  // Helle Innen-Schale
  const innerGeo = new THREE.CylinderGeometry(0.268, 0.252, 0.025, 28);
  const innerM = new THREE.Mesh(prepCelGeo(innerGeo), createCelMaterial({ litHex: SHARED.bowlInner, shadowHex: '#D8CEBF', lightDir }));
  innerM.position.y = 0.095;
  root.add(innerM);

  // Gemaltes Shiba-Pfoten-Emblem vorne am Keramik-Napf
  const pawCv = document.createElement('canvas'); pawCv.width = pawCv.height = 128;
  const pc = pawCv.getContext('2d');
  pc.fillStyle = SHARED.eyeWhite; pc.strokeStyle = SHARED.ink; pc.lineWidth = 7; pc.lineJoin = 'round';
  const drawPad = (x, y, rx, ry, rot = 0) => {
    pc.save(); pc.translate(x, y); pc.rotate(rot);
    pc.beginPath(); pc.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); pc.fill(); pc.stroke(); pc.restore();
  };
  drawPad(64, 80, 24, 19);
  drawPad(34, 48, 11, 14, -0.35);
  drawPad(54, 34, 11, 14, -0.10);
  drawPad(74, 34, 11, 14,  0.10);
  drawPad(94, 48, 11, 14,  0.35);
  const pawTex = new THREE.CanvasTexture(pawCv); pawTex.colorSpace = THREE.SRGBColorSpace;
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.125, 0.125),
    new THREE.MeshBasicMaterial({ map: pawTex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  );
  badge.position.set(0, 0.115, 0.349); badge.rotation.x = -0.22;
  root.add(badge);

  // 3D-Futter-Hügel + knusprige Kroketten (schrumpfen beim Fressen!)
  const foodGroup = new THREE.Group();
  const moundGeo = new THREE.SphereGeometry(0.252, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52);
  moundGeo.scale(1, 0.52, 1);
  const mound = wrap(moundGeo, SHARED.kibbleLit, SHARED.kibbleShadow);
  mound.position.y = 0.085;
  foodGroup.add(mound);

  const kMat = createCelMaterial({ litHex: '#8C5B3A', shadowHex: '#5C3820', lightDir });
  const kibbles = [];
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39996, rad = 0.045 + (i % 5) * 0.038;
    const kg = prepCelGeo(new THREE.DodecahedronGeometry(0.032, 0));
    const km = new THREE.Mesh(kg, kMat);
    km.position.set(Math.cos(a) * rad, 0.195 - rad * 0.25, Math.sin(a) * rad);
    km.rotation.set(i, i * 1.7, 0);
    foodGroup.add(km);
    kibbles.push(km);
  }
  foodGroup.visible = false;
  root.add(foodGroup);

  const updateFood = amt => {
    foodGroup.visible = amt > 0.03;
    if (!foodGroup.visible) return;
    mound.scale.set(1, 0.25 + 0.75 * amt, 1);
    const keep = Math.ceil(amt * kibbles.length);
    for (let i = 0; i < kibbles.length; i++) {
      kibbles[i].visible = i < keep;
      kibbles[i].position.y = 0.11 + (0.085 - (i % 5) * 0.009) * amt;
    }
  };

  return { root, foodGroup, outMat, r: 0.37, updateFood };
}

function buildCushion(lightDir) {
  const root = new THREE.Group(); root.name = 'Shiba_Zabuton_Cushion';
  const outMat = createOutlineMaterial({ inkHex: SHARED.ink, thicknessPx: 3.6, depthBias: 0.0006 });

  // Gemütliches rundlich-quadratisches Matcha-Zabuton-Kissen (Catmull-Clark, steht plan auf Y = 0!)
  const geo = quadMeshToGeometry(catmullClark(planarSubdivide(makeCubeQuadMesh(), 1), 2));
  const pos = geo.attributes.position, rest = geo.attributes.aRestPos;
  let minY = Infinity;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const rXZ = Math.hypot(x, z);
    // Kissen-Form mit leicht gerundeten Ecken, weicher Fülle und zentraler Stepp-Mulde
    const dimple = y > 0 ? Math.exp(-rXZ * rXZ * 6.2) * 0.34 : 0;
    const flare = 1 + 0.10 * (1 - y * y);
    x *= 0.72 * flare;
    z *= 0.66 * flare;
    y = (y > 0 ? y * 0.135 * (1 - dimple) : y * 0.052);
    if (y < minY) minY = y;
    pos.setXYZ(i, x, y, z);
  }
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) - minY;
    pos.setY(i, y);
    rest.setXYZ(i, pos.getX(i), y, pos.getZ(i));
  }
  geo.computeVertexNormals();

  const mat = createCelMaterial({ litHex: SHARED.cushionLit, shadowHex: SHARED.cushionShadow, lightDir, threshold: 0.28 });
  const pillow = new THREE.Mesh(geo, mat);
  const pillowOut = new THREE.Mesh(geo, outMat);
  pillow.renderOrder = -14; pillowOut.renderOrder = -14;
  pillow.add(pillowOut);
  root.add(pillow);

  // Kleiner cremefarbener Stepp-Knopf in der Kissenmitte
  const btnGeo = prepCelGeo(new THREE.SphereGeometry(0.062, 16, 10));
  btnGeo.scale(1, 0.48, 1);
  const btn = new THREE.Mesh(btnGeo, createCelMaterial({ litHex: SHARED.cushionButton, shadowHex: '#D5CBB7', lightDir }));
  const btnOut = new THREE.Mesh(btnGeo, outMat);
  btn.renderOrder = -13; btnOut.renderOrder = -13;
  btn.add(btnOut);
  btn.position.y = 0.132;
  root.add(btn);

  const setSquish = amt => {
    const s = clamp(amt, 0, 1);
    pillow.scale.set(1 + s * 0.09, 1 - s * 0.38, 1 + s * 0.09);
    btn.position.y = 0.132 * (1 - s * 0.38);
  };

  return { root, outMat, rx: 0.72, rz: 0.66, height: 0.138, setSquish };
}

function buildTreatMeshes(lightDir) {
  const outMat = createOutlineMaterial({ inkHex: SHARED.ink, thicknessPx: 3.4, depthBias: 0.0006 });
  const wrap = (geo, lit, shadow) => {
    const m = new THREE.Mesh(prepCelGeo(geo), createCelMaterial({ litHex: lit, shadowHex: shadow, lightDir, threshold: 0.16 }));
    m.add(new THREE.Mesh(geo, outMat)); return m;
  };

  // 1. Klassischer 3D-Kauknochen (Knochen-Stab + 4 abgerundete Gelenk-Kugeln!)
  const bone = new THREE.Group();
  const shaft = new THREE.CylinderGeometry(0.044, 0.044, 0.24, 14);
  shaft.rotateZ(Math.PI / 2);
  bone.add(wrap(shaft, TREAT_SPECS.bone.lit, TREAT_SPECS.bone.shadow));
  for (const sx of [-0.125, 0.125]) {
    for (const sy of [-0.042, 0.042]) {
      const k = new THREE.SphereGeometry(0.056, 14, 10);
      k.translate(sx, sy, 0);
      bone.add(wrap(k, TREAT_SPECS.bone.lit, TREAT_SPECS.bone.shadow));
    }
  }

  // 2. Knuspriger Honig-Knochenkeks
  const biscuit = new THREE.Group();
  const sh = new THREE.Shape();
  sh.moveTo(-0.08, 0.045); sh.absarc(-0.10, 0.042, 0.045, 0.3, Math.PI * 1.4, false);
  sh.absarc(-0.10, -0.042, 0.045, Math.PI * 0.6, Math.PI * 1.85, false);
  sh.lineTo(0.08, -0.045); sh.absarc(0.10, -0.042, 0.045, -Math.PI * 0.85, Math.PI * 0.4, false);
  sh.absarc(0.10, 0.042, 0.045, -Math.PI * 0.4, Math.PI * 0.7, false);
  sh.closePath();
  const bGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.016, bevelSize: 0.015, bevelSegments: 2 });
  bGeo.center();
  biscuit.add(wrap(bGeo, TREAT_SPECS.biscuit.lit, TREAT_SPECS.biscuit.shadow));

  const root = new THREE.Group();
  const meshes = { bone, biscuit };
  for (const k in meshes) { meshes[k].visible = false; root.add(meshes[k]); }
  root.visible = false;
  return { root, meshes, outMat };
}

// =============================================================================
// 2D-Anime-Partikel (Aufprall, Herzen, Krümel, Glitzer ✦, Schnauben 💨, Zzz)
// =============================================================================
function createFXSystem(scene, camera) {
  const items = [];
  const inkMat = new THREE.MeshBasicMaterial({ color: SHARED.ink, side: THREE.DoubleSide, transparent: true, depthTest: false });
  const tickGeo = new THREE.PlaneGeometry(0.11, 0.020);
  const crumbGeo = new THREE.CircleGeometry(0.028, 8);

  const mkTex = (size, draw) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const c = cv.getContext('2d'); draw(c, size);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const heartTex = mkTex(128, (c, s) => {
    c.save(); c.translate(s/2, s/2); c.scale(s*0.42, -s*0.42);
    makeKawaiiHeartPath(c, 0.82);
    c.fillStyle = SHARED.heart; c.fill();
    c.lineWidth = 0.16; c.lineJoin = 'round'; c.strokeStyle = SHARED.ink; c.stroke();
    c.restore();
  });
  const sparkleTex = mkTex(128, (c, s) => {
    c.save(); c.translate(s/2, s/2);
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i/8*Math.PI*2, r = i%2===0 ? 48 : 14;
      if (i===0) c.moveTo(Math.cos(a)*r, Math.sin(a)*r); else c.lineTo(Math.cos(a)*r, Math.sin(a)*r);
    }
    c.closePath(); c.fillStyle = SHARED.sparkle; c.fill();
    c.lineWidth = 7; c.lineJoin = 'round'; c.strokeStyle = SHARED.ink; c.stroke();
    c.restore();
  });
  const puffTex = mkTex(128, (c, s) => {
    c.save(); c.translate(s/2, s/2);
    const pts = [[-16,0,22],[14,10,20],[18,-12,18],[-2,-16,17]];
    c.fillStyle = SHARED.ink;
    for (const [x,y,r] of pts) { c.beginPath(); c.arc(x,y,r+6,0,Math.PI*2); c.fill(); }
    c.fillStyle = SHARED.eyeWhite;
    for (const [x,y,r] of pts) { c.beginPath(); c.arc(x,y,r,0,Math.PI*2); c.fill(); }
    c.restore();
  });
  const zTex = mkTex(64, (c, s) => {
    c.fillStyle = SHARED.ink; c.font = '800 44px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Z', s/2, s/2 + 2);
  });
  const qTex = mkTex(96, (c, s) => {
    c.font = '900 66px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 10; c.lineJoin = 'round'; c.strokeStyle = SHARED.ink; c.strokeText('?', s/2, s/2 + 3);
    c.fillStyle = SHARED.sparkle; c.fillText('?', s/2, s/2 + 3);
  });
  const noteTex = mkTex(96, (c, s) => {
    c.font = '900 62px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 9; c.lineJoin = 'round'; c.strokeStyle = SHARED.ink; c.strokeText('♪', s/2, s/2 + 3);
    c.fillStyle = '#E8954A'; c.fillText('♪', s/2, s/2 + 3);
  });
  const hungryTex = mkTex(128, (c, s) => {
    c.save(); c.translate(s/2, s/2 - 4);
    c.fillStyle = SHARED.eyeWhite; c.strokeStyle = SHARED.ink; c.lineWidth = 7; c.lineJoin = 'round';
    c.beginPath(); c.ellipse(0, 0, 48, 36, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-14, 30); c.lineTo(-26, 48); c.lineTo(4, 34); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#E2A55B'; c.lineWidth = 5;
    c.beginPath(); c.roundRect(-20, -6, 40, 12, 4); c.fill(); c.stroke();
    for (const [bx, by] of [[-21,-7],[-21,7],[21,-7],[21,7]]) {
      c.beginPath(); c.arc(bx, by, 8, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    c.restore();
  });
  const dustTex = mkTex(64, (c, s) => {
    c.fillStyle = 'rgba(246, 242, 232, 0.92)';
    c.beginPath(); c.arc(s/2, s/2, 24, 0, Math.PI * 2); c.fill();
  });
  const ringGeo = new THREE.RingGeometry(0.18, 0.23, 36); ringGeo.rotateX(-Math.PI / 2);

  const spawnSprite = (tex, x, y, z, vx, vy, vz, scale, life, kind) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.95, depthTest: false }));
    sp.position.set(x, y, z); sp.scale.setScalar(scale); sp.renderOrder = 30; scene.add(sp);
    items.push({ m: sp, vx, vy, vz, life, maxLife: life, kind, baseScale: scale, phase: Math.random() * 6 });
  };

  const spawnImpact = (x, y, z, nx, ny, power) => {
    const count = Math.min(7, 3 + Math.floor(power * 0.35)), baseAng = Math.atan2(ny, nx);
    for (let i = 0; i < count; i++) {
      const a = baseAng + (i/(count-1||1) - 0.5) * 2.1;
      const m = new THREE.Mesh(tickGeo, inkMat.clone());
      m.position.set(x + Math.cos(a)*0.08, y + Math.sin(a)*0.08, z); m.renderOrder = 30; scene.add(m);
      const spd = 1.5 + Math.random()*1.4 + power*0.08;
      items.push({ m, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd, vz: 0, life: 0.22, maxLife: 0.22, kind: 'tick', rotZ: a });
    }
  };
  const spawnCrumbs = (x, y, z, colorHex, count = 5) => {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(crumbGeo, new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true }));
      m.position.set(x+(Math.random()-0.5)*0.12, y+(Math.random()-0.5)*0.08, z+(Math.random()-0.5)*0.12);
      m.scale.setScalar(0.6 + Math.random()*0.7); m.renderOrder = 28; scene.add(m);
      items.push({ m, vx: (Math.random()-0.5)*1.8, vy: 0.9+Math.random()*1.4, vz: (Math.random()-0.5)*1.8, life: 0.50, maxLife: 0.55, kind: 'crumb' });
    }
  };
  const spawnHearts = (x, y, z, count = 3) => {
    for (let i = 0; i < count; i++) {
      spawnSprite(heartTex, x+(Math.random()-0.5)*0.6, y+0.48+Math.random()*0.22, z+(Math.random()-0.5)*0.3,
        (Math.random()-0.5)*0.35, 0.90+Math.random()*0.38, 0, 0.22+Math.random()*0.10, 0.95, 'float');
    }
  };
  const spawnSparkles = (x, y, z, count = 4) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      spawnSprite(sparkleTex, x+Math.cos(a)*0.62, y+0.45+Math.random()*0.32, z+Math.sin(a)*0.35,
        Math.cos(a)*0.25, 0.55+Math.random()*0.35, 0, 0.24+Math.random()*0.08, 1.05, 'sparkle');
    }
  };
  const spawnPuff = (x, y, z, dirX, dirZ) => {
    spawnSprite(puffTex, x + dirX*0.58, y + 0.16, z + dirZ*0.58, dirX*0.75, 0.32, dirZ*0.75, 0.30, 0.78, 'puff');
  };
  const spawnZzz = (x, y, z) => {
    spawnSprite(zTex, x + 0.32, y + 0.55, z + 0.14, 0.14, 0.48, 0, 0.22, 1.65, 'zzz');
  };
  const spawnQuestion = (x, y, z) => {
    spawnSprite(qTex, x + 0.32, y + 0.62, z + 0.12, 0.04, 0.36, 0, 0.26, 1.15, 'float');
  };
  const spawnNote = (x, y, z) => {
    spawnSprite(noteTex, x + (Math.random()-0.5)*0.45, y + 0.58, z + 0.12, (Math.random()-0.5)*0.25, 0.52, 0, 0.23, 1.05, 'float');
  };
  const spawnHungry = (x, y, z) => {
    spawnSprite(hungryTex, x + 0.38, y + 0.74, z + 0.15, 0.02, 0.16, 0, 0.46, 1.85, 'bubble');
  };
  const spawnDust = (x, y, z, count = 4) => {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, spd = 0.45 + Math.random() * 0.65;
      spawnSprite(dustTex, x + Math.cos(a)*0.22, Math.max(0.05, y), z + Math.sin(a)*0.22,
        Math.cos(a)*spd, 0.25 + Math.random()*0.30, Math.sin(a)*spd, 0.14 + Math.random()*0.08, 0.48, 'dust');
    }
  };
  const spawnRipple = (x, z, colorHex = '#6E8872') => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.75, depthWrite: false }));
    m.position.set(x, 0.008, z); m.scale.setScalar(0.35); m.renderOrder = -4; scene.add(m);
    items.push({ m, vx: 0, vy: 0, vz: 0, life: 0.62, maxLife: 0.62, kind: 'ripple', baseScale: 1, phase: 0 });
  };

  const update = dt => {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]; it.life -= dt;
      if (it.life <= 0) { scene.remove(it.m); it.m.material.dispose(); items.splice(i, 1); continue; }
      const u = it.life / it.maxLife;
      it.m.position.x += it.vx*dt; it.m.position.y += it.vy*dt; it.m.position.z += it.vz*dt;
      if (it.kind === 'tick') {
        it.m.quaternion.copy(camera.quaternion); it.m.rotateZ(it.rotZ);
        it.vx *= 1 - 7*dt; it.vy *= 1 - 7*dt; it.m.scale.set(u, 0.5+0.5*u, 1);
      } else if (it.kind === 'crumb') {
        it.m.quaternion.copy(camera.quaternion); it.vy -= 7.5*dt;
        if (it.m.position.y < 0.02) { it.m.position.y = 0.02; it.vy *= -0.3; it.vx *= 0.6; it.vz *= 0.6; }
      } else if (it.kind === 'float') {
        it.m.position.x += Math.sin(it.phase + (1-u)*8) * 0.24 * dt;
      } else if (it.kind === 'bubble') {
        const pop = Math.min(1, (1 - u) * 7);
        it.m.scale.setScalar(it.baseScale * (0.65 + 0.35 * pop));
      } else if (it.kind === 'dust') {
        it.vx *= 1 - 3.5*dt; it.vz *= 1 - 3.5*dt;
        it.m.scale.setScalar(it.baseScale * (0.7 + (1-u) * 0.9));
      } else if (it.kind === 'ripple') {
        const p = 1 - u;
        it.m.scale.setScalar(0.35 + p * 2.1);
        it.m.material.opacity = u * 0.72;
        continue;
      } else if (it.kind === 'sparkle') {
        const s = it.baseScale * (0.7 + 0.45 * Math.sin((1-u) * Math.PI * 2));
        it.m.scale.setScalar(Math.max(0.02, s));
      } else if (it.kind === 'puff') {
        it.m.scale.setScalar(it.baseScale * (0.8 + (1-u) * 0.6));
      } else if (it.kind === 'zzz') {
        it.m.position.x += Math.sin(it.phase + (1-u)*5) * 0.15 * dt;
        it.m.scale.setScalar(0.18 + (1-u) * 0.16);
      }
      it.m.material.opacity = clamp(u * 1.5, 0, 0.94);
    }
  };
  return { spawnImpact, spawnCrumbs, spawnHearts, spawnSparkles, spawnPuff, spawnZzz, spawnQuestion, spawnNote, spawnHungry, spawnDust, spawnRipple, update };
}

// =============================================================================
// 3D-Bühne, Perspektiv-Kamera & Orbit (Mobile-optimiert)
// =============================================================================
const isMobile = typeof window !== 'undefined' && (
  window.matchMedia?.('(pointer: coarse)')?.matches ||
  /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.6 : 2));
renderer.toneMapping = THREE.NoToneMapping;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene(); scene.background = new THREE.Color(SHARED.bg);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 60);

// Großzügiger leerer 3D-Raum mit unsichtbaren Wänden (Anime-Studio-Ton #D4D3CC aus mochi_shiba.html)
const room = { halfW: 2.35, halfD: 2.25, floor: 0.0, ceil: 3.60 };
const roundBox = {
  cx: 0, cy: (room.floor + room.ceil) / 2, cz: 0,
  r: 0.24, knee: 0.020,
  hx: room.halfW - 0.24, hy: (room.ceil - room.floor) / 2 - 0.24, hz: room.halfD - 0.24,
};

const LA = deg(34), LE = deg(50);
const lightDir = new THREE.Vector3(Math.cos(LE)*Math.sin(LA), Math.sin(LE), Math.cos(LE)*Math.cos(LA)).normalize();

// =============================================================================
// Leerer 3D-Anime-Studio-Raum (nahtlos #D4D3CC, im Fokus-Modus sanftes Abend-Dunkel)
// =============================================================================
function buildMinimalStudioRoom() {
  const cDayBg = new THREE.Color('#D4D3CC'), cNightBg = new THREE.Color('#272524');
  const cDayShadow = new THREE.Color('#9A9386'), cNightShadow = new THREE.Color('#131211');
  let moodT = 0;

  return {
    setResolution() {},
    update(dt, _t, isFocus) {
      moodT = lerp(moodT, isFocus ? 1 : 0, Math.min(1, dt * 2.4));
      scene.background.lerpColors(cDayBg, cNightBg, moodT);
      shibaShadow.mat.uniforms.uColor.value.lerpColors(cDayShadow, cNightShadow, moodT);
      ballShadow.mat.uniforms.uColor.value.lerpColors(cDayShadow, cNightShadow, moodT);
      treatShadow.mat.uniforms.uColor.value.lerpColors(cDayShadow, cNightShadow, moodT);
      bowlShadow.mat.uniforms.uColor.value.lerpColors(cDayShadow, cNightShadow, moodT);
      cushionShadow.mat.uniforms.uColor.value.lerpColors(cDayShadow, cNightShadow, moodT);
    },
  };
}
const cafeRoom = buildMinimalStudioRoom();

let coatIdx = 0;
const shiba = buildShiba(COAT_LIST[coatIdx], lightDir);
shiba.root.matrixAutoUpdate = false;
scene.add(shiba.root);

const toy = buildToyBall(lightDir);
scene.add(toy.mesh);

const bowlMesh = buildFoodBowl(lightDir);
const bowlPos = { x: -1.32, z: -0.46 };
bowlMesh.root.position.set(bowlPos.x, 0.0, bowlPos.z);
scene.add(bowlMesh.root);

const cushionMesh = buildCushion(lightDir);
const cushionPos = { x: 1.36, z: -0.76 };
cushionMesh.root.position.set(cushionPos.x, 0.0, cushionPos.z);
cushionMesh.root.rotation.y = deg(-16);
scene.add(cushionMesh.root);

const cushion = {
  x: cushionPos.x, z: cushionPos.z,
  rx: cushionMesh.rx, rz: cushionMesh.rz, height: cushionMesh.height,
  squish: 0, targetSquish: 0,
};
function cushionSurfaceY(x, z) {
  const nx = (x - cushion.x) / cushion.rx, nz = (z - cushion.z) / cushion.rz;
  const r2 = nx * nx + nz * nz;
  if (r2 >= 1.0) return 0;
  const w = Math.cos(Math.sqrt(r2) * Math.PI * 0.5);
  return cushion.height * w * w * (1 - cushion.squish * 0.34);
}

const treatMeshes = buildTreatMeshes(lightDir);
scene.add(treatMeshes.root);

const fx = createFXSystem(scene, camera);

function makeGroundShadow(radius = 1) {
  const g = new THREE.CircleGeometry(radius, 64); g.rotateX(-Math.PI/2);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    uniforms: { uColor: { value: new THREE.Color(SHARED.groundShad) }, uOpacity: { value: 0.84 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
      void main(){
        float r = length(vUv);
        if (r > 1.0) discard;
        float aa = max(fwidth(r) * 1.2, 0.012);
        float alpha = (1.0 - smoothstep(1.0 - aa, 1.0, r)) * uOpacity;
        gl_FragColor = vec4(uColor, alpha);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, mat); m.position.y = 0.0005; m.renderOrder = -10; scene.add(m);
  return { mesh: m, mat };
}
const shibaShadow = makeGroundShadow(1);
const ballShadow = makeGroundShadow(1);
const treatShadow = makeGroundShadow(1); treatShadow.mesh.visible = false;
const bowlShadow = makeGroundShadow(1);
bowlShadow.mesh.position.set(bowlPos.x - 0.04, 0.0005, bowlPos.z - 0.03);
bowlShadow.mesh.scale.set(0.45, 1, 0.42); bowlShadow.mat.uniforms.uOpacity.value = 0.62;
const cushionShadow = makeGroundShadow(1);
cushionShadow.mesh.position.set(cushionPos.x - 0.04, 0.0004, cushionPos.z - 0.03);
cushionShadow.mesh.scale.set(0.84, 1, 0.76); cushionShadow.mat.uniforms.uOpacity.value = 0.54;
cushionShadow.mesh.renderOrder = -15;

// Handy-Bewegung (Kippen -> Schwerkraft + Parallax, Schütteln -> Hopser)
const motion = {
  gx: 0, gz: 0,
  targetGx: 0, targetGz: 0,
  wx: 0, wz: 0,
  lastShakeAt: 0,
};

// Exakter mochi_shiba.html 3/4-Kamerawinkel (niedrig auf Augenhöhe: volle runde Mochi-Form, Ohren über Silhouette, 2-Ton-Cel-Schatten & Pfötchen sichtbar!)
const camCtrl = { yaw: 0.42, pitch: 0.09, dist: 15.2, baseDist: 15.2, targetDist: 15.2, zoomScale: 1.0, targetYaw: 0.42, targetPitch: 0.09, lookX: 0, lookY: 0.49, lookZ: 0.0 };
function updateCamera(dt, shake) {
  const goalDist = clamp(camCtrl.baseDist * camCtrl.zoomScale, 6.2, 22.0);
  camCtrl.targetDist = goalDist;
  camCtrl.dist  = lerp(camCtrl.dist,  camCtrl.targetDist,  Math.min(1, dt * 10));
  camCtrl.yaw   = lerp(camCtrl.yaw,   camCtrl.targetYaw,   Math.min(1, dt * 10));
  camCtrl.pitch = lerp(camCtrl.pitch, camCtrl.targetPitch, Math.min(1, dt * 10));
  const isPortrait = camera.aspect < 0.85;
  const baseLookY = isPortrait ? 0.49 : 0.49;
  camCtrl.lookX = lerp(camCtrl.lookX, body.x * (focusMode ? 0.30 : 0.18), Math.min(1, dt * 4.5));
  camCtrl.lookY = lerp(camCtrl.lookY, baseLookY + clamp(body.y - 0.5, 0, 1.4) * 0.12, Math.min(1, dt * 4.5));
  camCtrl.lookZ = lerp(camCtrl.lookZ, body.z * (focusMode ? 0.22 : 0.14), Math.min(1, dt * 4.5));
  // Sanftes Handy-Parallax (±3°) für räumliche 3D-Tiefe
  const effYaw = camCtrl.yaw + motion.gx * 0.055;
  const effPitch = clamp(camCtrl.pitch + motion.gz * 0.045, 0.05, 1.30);
  const cp = Math.cos(effPitch), sp = Math.sin(effPitch);
  camera.position.set(
    camCtrl.lookX + camCtrl.dist*cp*Math.sin(effYaw) + (Math.random()-0.5)*shake,
    Math.max(0.28, camCtrl.lookY + camCtrl.dist*sp + (Math.random()-0.5)*shake),
    camCtrl.lookZ + camCtrl.dist*cp*Math.cos(effYaw),
  );
  camera.lookAt(camCtrl.lookX, camCtrl.lookY, camCtrl.lookZ);
}

function resize() {
  const w = container.clientWidth || innerWidth;
  const h = container.clientHeight || innerHeight;
  camera.aspect = w / h;
  const isPortrait = camera.aspect < 0.85;
  // 32° Tele-FOV wie mochi_shiba.html -> authentische 2D-Anime-Proportionen ohne Weitwinkel-Verzerrung!
  camera.fov = 32;
  camCtrl.baseDist = isPortrait ? clamp(7.45 / Math.max(camera.aspect, 0.44), 11.5, 17.0) : 9.2;
  camCtrl.dist = clamp(camCtrl.baseDist * camCtrl.zoomScale, 6.2, 22.0);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  shiba.setResolution(w, h);
  cafeRoom.setResolution(w, h);
  toy.out.uniforms.uResolution.value.set(w, h);
  bowlMesh.outMat.uniforms.uResolution.value.set(w, h);
  cushionMesh.outMat.uniforms.uResolution.value.set(w, h);
  treatMeshes.outMat.uniforms.uResolution.value.set(w, h);
}
window.addEventListener('resize', resize); resize();

// =============================================================================
// 3D-Physik & Shiba-Zustände (Napf, Apportieren, Knochen/Keks, Sättigung)
// =============================================================================
const RX = 0.66, RY = shiba.centerY, RZ = 0.62;
const MASS = 1.0, INERTIA = 0.22, G = 16.0, MAX_THROW = 18;

const body = {
  x: 0.0, y: RY + 0.02, z: 0.20, vx: 0, vy: 0, vz: 0,
  quat: new THREE.Quaternion(), ox: 0, oy: 0, oz: 0,
  onFloor: true, wallPress: 0,
};
const ball = {
  x: 1.08, y: toy.r, z: 1.05, vx: 0, vy: 0, vz: 0,
  quat: new THREE.Quaternion(), ox: 0, oy: 0, oz: 0,
  r: toy.r, mass: 0.40, enabled: true,
  fetchState: 'idle',
  carried: false, playerThrown: false, throwTime: 0, chaseCd: 0, selfNudgeT: 0,
};
const bowl = {
  x: bowlPos.x, z: bowlPos.z, r: bowlMesh.r,
  food: 0, // 0..1 Füllstand
  eating: false, eatTimer: 0, biteCd: 0, hopCd: 0,
};
const treat = {
  active: false, type: 'bone',
  x: 0, y: 1.8, z: 0, vx: 0, vy: 0, vz: 0, spin: 0,
  hopCd: 0, begCd: 0, holdAboveT: 0,
  eating: false, eatT: 0, bitesDone: 0,
};

const soft = {
  jx: 0, jvx: 0, jy: 0, jvy: 0,
  shearX: 0, shvX: 0, shearZ: 0, shvZ: 0,
  bendX: 0, bvx: 0, bendY: 0, bvy: 0,
  stretch: 0, stX: 0, stY: 1, stZ: 0,
  pullX: 0, pullY: 0, pullZ: 0, pvx: 0, pvy: 0, pvz: 0,
  dentAmp: 0, dentV: 0, dentX: 0, dentY: 0, dentZ: 0.5,
  camShake: 0,
  earL: 0, earLV: 0, earR: 0, earRV: 0,
  planeAmt: 0,
  tailW: 0, tailWV: 0, tailC: 0, tailCV: 0,
};

const events = [];
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _qInv = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _qErr = new THREE.Quaternion();
const _mouthW = new THREE.Vector3();
const _tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _tmpCamDir = new THREE.Vector3(), _tmpDragPt = new THREE.Vector3();

function ellipsoidExtent(nx, ny, nz, quat) {
  _qInv.copy(quat).invert();
  _v1.set(nx, ny, nz).applyQuaternion(_qInv);
  const h = Math.hypot(RX * _v1.x, RY * _v1.y, RZ * _v1.z);
  _v2.set(-RX*RX*_v1.x/h, -RY*RY*_v1.y/h, -RZ*RZ*_v1.z/h).applyQuaternion(quat);
  return { h, rx: _v2.x, ry: _v2.y, rz: _v2.z };
}

function softWallCollide3D(nx, ny, nz, planeD, hStep) {
  const { h, rx, ry, rz } = ellipsoidExtent(nx, ny, nz, body.quat);
  const pen = h - (nx*body.x + ny*body.y + nz*body.z - planeD);
  if (pen <= 0) return 0;

  const vcx = body.vx + (body.oy*rz - body.oz*ry);
  const vcy = body.vy + (body.oz*rx - body.ox*rz);
  const vcz = body.vz + (body.ox*ry - body.oy*rx);
  const vn = vcx*nx + vcy*ny + vcz*nz;

  const grabbed = ptr.grabbed === 'shiba';
  const maxComp = h * (grabbed ? 0.36 : 0.32), penC = Math.min(pen, maxComp);
  const isRestFloor = ny > 0.5 && !grabbed;
  const fn = Math.max(0, (grabbed?120:isRestFloor?950:210)*penC + (grabbed?420:isRestFloor?1400:560)*penC*penC - (grabbed?12:isRestFloor?15.0:10.2)*vn);

  body.vx += (nx*fn/MASS)*hStep; body.vy += (ny*fn/MASS)*hStep; body.vz += (nz*fn/MASS)*hStep;
  if (!grabbed) {
    const fx = nx*fn, fy = ny*fn, fz = nz*fn;
    body.ox += ((ry*fz - rz*fy)/INERTIA)*hStep*0.65;
    body.oy += ((rz*fx - rx*fz)/INERTIA)*hStep*0.65;
    body.oz += ((rx*fy - ry*fx)/INERTIA)*hStep*0.65;
  }
  if (pen > maxComp) {
    const ex = pen - maxComp; body.x += nx*ex; body.y += ny*ex; body.z += nz*ex;
    if (vn < 0) {
      const b = grabbed ? 0.05 : 0.44;
      body.vx -= (1+b)*vn*nx; body.vy -= (1+b)*vn*ny; body.vz -= (1+b)*vn*nz;
    }
  }
  const vtx = vcx - vn*nx, vty = vcy - vn*ny, vtz = vcz - vn*nz, vtLen = Math.hypot(vtx,vty,vtz);
  if (vtLen > 1e-4) {
    const fMag = Math.min(vtLen*16, (grabbed?0.24:0.42)*fn);
    const ftx = -(vtx/vtLen)*fMag, fty = -(vty/vtLen)*fMag, ftz = -(vtz/vtLen)*fMag;
    body.vx += (ftx/MASS)*hStep; body.vy += (fty/MASS)*hStep; body.vz += (ftz/MASS)*hStep;
    if (!grabbed) {
      const aS = Math.abs(vn) < 0.9 && ny > 0.5 ? 0.25 : 0.70;
      body.ox += ((ry*ftz - rz*fty)/INERTIA)*hStep*aS;
      body.oy += ((rz*ftx - rx*ftz)/INERTIA)*hStep*aS;
      body.oz += ((rx*fty - ry*ftx)/INERTIA)*hStep*aS;
    }
  }
  if (-vn > 1.7 && pen < 0.14) events.push({ nx, ny, nz, speed: -vn, cx: body.x+rx, cy: body.y+ry, cz: body.z+rz, kind: 'wall' });
  return penC / h;
}

// Sanfte, klemmfreie Napf-Kollision damit Shiba & Ball nie zwischen Wand & Napf feststecken
function collideWithBowl3D(hStep) {
  const dx = body.x - bowl.x, dz = body.z - bowl.z, distXZ = Math.hypot(dx, dz) || 1e-4;
  const minD = bowl.r + 0.50;
  if (distXZ < minD && body.y < 0.72) {
    const pen = minD - distXZ;
    let nx = dx / distXZ, nz = dz / distXZ;
    // Wenn der normale Schub den Shiba gegen eine Wand drücken würde, sanft zur offenen Raummitte ablenken!
    const nearLeft = body.x + nx * pen < -room.halfW + 0.68;
    const nearBack = body.z + nz * pen < -room.halfD + 0.68;
    if (nearLeft || nearBack) {
      const cx = -body.x, cz = 0.25 - body.z, cl = Math.hypot(cx, cz) || 1;
      nx = nx * 0.35 + (cx / cl) * 0.65;
      nz = nz * 0.35 + (cz / cl) * 0.65;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl; nz /= nl;
    }
    body.x += nx * pen * 0.65; body.z += nz * pen * 0.65;
    const vn = body.vx * nx + body.vz * nz;
    if (vn < 0) {
      // Nur Normal-Anteil abbauen, Tangential-Gleiten erhalten!
      body.vx -= vn * nx * 1.05;
      body.vz -= vn * nz * 1.05;
    }
  }
  // Harte Sicherheits-Grenze + NaN-Schutz: Shiba bleibt garantiert immer frei im 3D-Raum
  const maxX = room.halfW - 0.34, maxZ = room.halfD - 0.34;
  if (!Number.isFinite(body.x) || !Number.isFinite(body.y) || !Number.isFinite(body.z)) {
    body.x = 0; body.y = RY + 0.05; body.z = 0.20;
    body.vx = body.vy = body.vz = 0;
  }
  if (body.x < -maxX) { body.x = -maxX; if (body.vx < 0) body.vx = 0; }
  if (body.x >  maxX) { body.x =  maxX; if (body.vx > 0) body.vx = 0; }
  if (body.z < -maxZ) { body.z = -maxZ; if (body.vz < 0) body.vz = 0; }
  if (body.z >  maxZ) { body.z =  maxZ; if (body.vz > 0) body.vz = 0; }
  if (body.y < room.floor + 0.14) { body.y = room.floor + 0.14; if (body.vy < 0) body.vy = 0; }

  // Ball vs Napf
  if (ball.enabled && !ball.carried) {
    const bdx = ball.x - bowl.x, bdz = ball.z - bowl.z, bd = Math.hypot(bdx, bdz) || 1e-4;
    const bMin = bowl.r + ball.r;
    if (bd < bMin && ball.y < 0.44) {
      const nx = bdx / bd, nz = bdz / bd;
      ball.x = bowl.x + nx * bMin; ball.z = bowl.z + nz * bMin;
      const vn = ball.vx * nx + ball.vz * nz;
      if (vn < 0) { ball.vx -= 1.6 * vn * nx; ball.vz -= 1.6 * vn * nz; sfx.ballHit(-vn * 0.6); }
    }
  }
}

let ballHitCooldown = 0;
function collideShibaAndBall3D(hStep) {
  if (!ball.enabled || ball.carried) return;
  const dx = ball.x - body.x, dy = ball.y - body.y, dz = ball.z - body.z;
  const dist = Math.hypot(dx, dy, dz) || 1e-4;
  const nx = dx/dist, ny = dy/dist, nz = dz/dist;
  const { h, rx, ry, rz } = ellipsoidExtent(-nx, -ny, -nz, body.quat);
  const pen = (h + ball.r) - dist;
  if (pen <= 0) return;

  const rvx = ball.vx - body.vx, rvy = ball.vy - body.vy, rvz = ball.vz - body.vz;
  const vn = rvx*nx + rvy*ny + rvz*nz;

  // Wenn er gerade apportiert und der Ball langsam genug ist -> schnappt er ihn stolz ins Maul!
  const ballSpd = Math.hypot(ball.vx, ball.vy, ball.vz);
  if (ball.fetchState === 'chasing' && ptr.grabbed !== 'ball' && ptr.grabbed !== 'shiba' && ballSpd < 4.5) {
    ball.carried = true;
    ball.fetchState = 'returning';
    ball.vx = ball.vy = ball.vz = 0;
    sfx.yip();
    soft.jvy -= 3.2; soft.jvx += 2.6; soft.tailWV += 12;
    return;
  }

  const fn = Math.max(0, 290*pen + 480*pen*pen - 9.5*vn);
  const invT = 1/MASS + 1/ball.mass;
  body.vx -= (nx*fn/MASS)*hStep; body.vy -= (ny*fn/MASS)*hStep; body.vz -= (nz*fn/MASS)*hStep;
  ball.vx += (nx*fn/ball.mass)*hStep; ball.vy += (ny*fn/ball.mass)*hStep; ball.vz += (nz*fn/ball.mass)*hStep;

  if (vn < -0.75) {
    const j = -1.62 * vn / invT;
    body.vx -= (nx*j/MASS)*0.45; body.vy -= (ny*j/MASS)*0.45; body.vz -= (nz*j/MASS)*0.45;
    ball.vx += (nx*j/ball.mass)*0.65; ball.vy += (ny*j/ball.mass)*0.65; ball.vz += (nz*j/ball.mass)*0.65;
  }
  if (pen > 0.13) {
    const corr = pen - 0.13, wb = (1/MASS)/invT, wB = (1/ball.mass)/invT;
    body.x -= nx*corr*wb; body.y -= ny*corr*wb; body.z -= nz*corr*wb;
    ball.x += nx*corr*wB; ball.y += ny*corr*wB; ball.z += nz*corr*wB;
  }
  if (-vn > 0.95 && ballHitCooldown <= 0) {
    ballHitCooldown = 0.15;
    events.push({
      nx: -nx, ny: -ny, nz: -nz, speed: -vn,
      cx: body.x-rx, cy: body.y-ry, cz: body.z-rz,
      rxLocal: -rx, ryLocal: -ry, rzLocal: -rz, kind: 'ball',
    });
  }
}

function stepBall3D(hStep) {
  if (!ball.enabled) return;
  if (ball.carried) return; // wird am Mund positioniert
  if (ptr.grabbed === 'ball') {
    ball.vx += ((ptr.dragPos.x - ball.x)*140 - ball.vx*14)*hStep;
    ball.vy += ((ptr.dragPos.y - ball.y)*140 - ball.vy*14)*hStep;
    ball.vz += ((ptr.dragPos.z - ball.z)*140 - ball.vz*14)*hStep;
    ball.ox *= 1 - 4*hStep; ball.oy *= 1 - 4*hStep; ball.oz *= 1 - 4*hStep;
  } else {
    ball.vy -= G * hStep;
    if (!focusMode) {
      ball.vx += motion.wx * 14.5 * hStep;
      ball.vz += motion.wz * 14.5 * hStep;
    }
    ball.vx *= 1 - 0.24*hStep; ball.vz *= 1 - 0.24*hStep;
  }
  ball.x += ball.vx*hStep; ball.y += ball.vy*hStep; ball.z += ball.vz*hStep;

  const e = 0.72, r = ball.r;
  const cY = cushionSurfaceY(ball.x, ball.z);
  const ballFloor = room.floor + cY;
  if (ball.y - r < ballFloor) {
    ball.y = ballFloor + r;
    if (ball.vy < -1.6) {
      if (cY > 0.015) { sfx.plop(); cushion.targetSquish = Math.max(cushion.targetSquish, clamp(-ball.vy * 0.14, 0.25, 0.75)); }
      else sfx.ballHit(-ball.vy * 0.55);
    }
    const bounceE = cY > 0.015 ? 0.52 : e;
    if (ball.vy < 0) ball.vy = -ball.vy * bounceE;
    const damp = cY > 0.015 ? 2.4 : 1.25;
    ball.vx *= 1 - damp*hStep; ball.vz *= 1 - damp*hStep;
    ball.ox = ball.vz / r; ball.oz = -ball.vx / r;
  }
  if (ball.y + r > room.ceil)   { ball.y = room.ceil - r;   if (ball.vy > 0) ball.vy = -ball.vy * e; }
  if (ball.x - r < -room.halfW) { ball.x = -room.halfW + r; if (ball.vx < 0) ball.vx = -ball.vx * e; }
  if (ball.x + r >  room.halfW) { ball.x =  room.halfW - r; if (ball.vx > 0) ball.vx = -ball.vx * e; }
  if (ball.z - r < -room.halfD) { ball.z = -room.halfD + r; if (ball.vz < 0) ball.vz = -ball.vz * e; }
  if (ball.z + r >  room.halfD) { ball.z =  room.halfD - r; if (ball.vz > 0) ball.vz = -ball.vz * e; }

  const omLen = Math.hypot(ball.ox, ball.oy, ball.oz);
  if (omLen > 1e-4) {
    _dq.setFromAxisAngle(_v1.set(ball.ox/omLen, ball.oy/omLen, ball.oz/omLen), omLen*hStep);
    ball.quat.premultiply(_dq).normalize();
  }
}

// =============================================================================
// Futternapf-KI (Shiba läuft hin, futtert, wird bei zu viel Futter „Satt & Träge“!)
// =============================================================================
function fillFoodBowl() {
  bowl.food = 1.0;
  bowlMesh.foodGroup.visible = true;
  bowlMesh.foodGroup.scale.setScalar(1);
  sfx.pourKibble();
  emitHaptic('tap');
  emitCare('feed');
  fx.spawnCrumbs(bowl.x, 0.35, bowl.z, SHARED.kibbleLit, 9);
  mood.wakeUp();
  // Wenn er schon kugelrund satt ist -> nur ein skeptischer / zufriedener Seufzer!
  if (mood.fullness >= 0.85) {
    mood.skepticT = 2.4;
    sfx.sigh();
  } else {
    // Apportieren abbrechen – Essen hat bei Shibas Priorität!
    if (ball.carried) dropCarriedBall(false);
    ball.fetchState = 'idle';
  }
}

function updateBowlBehavior(dt) {
  bowlMesh.updateFood(bowl.food);

  // Wenn gegriffen oder am Kauen von Knochen/Keks oder schon randvoll -> kein Napf-Fressen
  if (ptr.grabbed === 'shiba' || treat.active || mood.fullness >= 0.96 || bowl.food <= 0.03) {
    bowl.eating = false;
    return;
  }

  // Ist er schon super satt (>0.84) oder richtig eingeschnappt (<0.20)? Dann ignoriert er den Napf erstmal!
  if (!bowl.eating && (mood.fullness >= 0.84 || mood.happiness < 0.20)) return;

  const dx = bowl.x - body.x, dz = bowl.z - body.z, distXZ = Math.hypot(dx, dz);

  if (distXZ < 1.16 && body.onFloor) {
    // Am Napf angekommen -> dynamisch eintauchen, knuspern & aufschauen!
    bowl.eating = true;
    bowl.biteCd -= dt;
    bowl.eatTimer += dt;
    mood.eatingBowlT = 0.45;
    if (bowl.biteCd <= 0) {
      bowl.biteCd = 0.36;
      bowl.food = Math.max(0, bowl.food - 0.14);
      mood.fullness = clamp(mood.fullness + 0.11, 0, 1);
      mood.happiness = clamp(mood.happiness + 0.06, 0, 1);
      mood.wakeUp();
      sfx.crunch(Math.floor(time * 8));
      fx.spawnCrumbs(bowl.x, 0.26, bowl.z, SHARED.kibbleLit, 5);
      // Dynamischer Bissen-Squish + fröhliches Ohren- & Schwanz-Wippen!
      soft.jvy -= 2.8; soft.jvx += 2.3; soft.bvx += 2.6;
      soft.earLV += 4.2; soft.earRV += 4.2; soft.tailWV += 12;
      if (mood.fullness >= 0.88) {
        // Randvoll! -> Satt & Träge Modus!
        bowl.eating = false;
        mood.triggerStuffed();
      } else if (bowl.food <= 0.03) {
        bowl.eating = false;
        mood.happyT = Math.max(mood.happyT, 2.6);
        mood.lipLickT = 1.4;
        // Kleiner zufriedener Schritt weg vom Napf + zur Kamera umdrehen!
        const rdx = body.x - bowl.x, rdz = body.z - bowl.z, rd = Math.hypot(rdx, rdz) || 1;
        body.vx += (rdx / rd) * 0.9; body.vz += (rdz / rd) * 0.9; body.vy += 2.2;
        fx.spawnHearts(body.x, body.y + 0.15, body.z, 3);
        sfx.proud();
      }
    }
  } else {
    bowl.eating = false;
    // Hin-Hopsen zum gefüllten Napf!
    bowl.hopCd -= dt;
    if (body.onFloor && bowl.hopCd <= 0) {
      bowl.hopCd = mood.fullness > 0.65 ? 0.72 : 0.46;
      const spd = clamp(distXZ * 2.0, 1.8, 3.4) * (1 - mood.fullness * 0.35);
      body.vx += (dx / distXZ) * spd;
      body.vz += (dz / distXZ) * spd;
      body.vy += 3.1;
      soft.jvy -= 3.6; soft.jvx += 2.8; soft.tailWV += 9;
      fx.spawnDust(body.x, 0.03, body.z, 2);
      sfx.hop();
    }
  }
}

// =============================================================================
// Apportier-Ball-KI (Hinlaufen, Flug-Fang!, Stolz zurückbringen + Frust bei Spam!)
// =============================================================================
function dropCarriedBall(proud = true) {
  if (!ball.carried) return;
  ball.carried = false;
  ball.fetchState = 'idle';
  shiba.getMouthWorldPos(_mouthW, 0.28);
  ball.x = _mouthW.x; ball.y = Math.max(ball.r + 0.05, _mouthW.y); ball.z = _mouthW.z;
  ball.vx = (Math.random() - 0.5) * 0.5; ball.vy = 1.5; ball.vz = 1.1;
  ball.selfNudgeT = 0.65;
  if (proud) {
    mood.triggerProud();
    if (ball.playerThrown) {
      ball.playerThrown = false;
      emitCare('fetch');
    }
    sfx.proud();
    fx.spawnSparkles(body.x, body.y + 0.20, body.z, 6);
    if (body.onFloor) { body.vy += 3.8; body.vz -= 0.7; } // kleiner stolzer Schritt zurück!
    soft.jvy -= 4.4; soft.jvx += 3.6; soft.tailWV += 16;
  } else {
    ball.playerThrown = false;
  }
}

function updateFetchBehavior(dt) {
  if (!ball.enabled) { ball.fetchState = 'idle'; ball.carried = false; return; }
  if (ptr.grabbed === 'shiba' || ptr.grabbed === 'ball') {
    if (ball.carried) dropCarriedBall(false);
    ball.fetchState = 'idle';
    return;
  }

  // Flugball-Fang! Nur wenn Spieler den Ball geworfen hat -> schnappt er ihn aus der Luft -> Stolz ✦!
  if (ball.playerThrown && !ball.carried && ball.selfNudgeT <= 0 && mood.happiness >= 0.36 && mood.fullness < 0.80 && !treat.active && !bowl.eating) {
    const bSpd = Math.hypot(ball.vx, ball.vy, ball.vz);
    const dAir = Math.hypot(ball.x - body.x, ball.z - body.z);
    if (ball.y > 0.48 && ball.y < 1.38 && dAir < 1.05 && bSpd > 1.4 && bSpd < 7.8 && ball.vy < 1.5) {
      ball.carried = true; ball.fetchState = 'returning'; ball.vx = ball.vy = ball.vz = 0;
      if (body.onFloor) body.vy += 3.8;
      mood.triggerProud();
      emitCare('fetch');
      sfx.proud();
      fx.spawnSparkles(body.x, body.y + 0.28, body.z, 5);
      soft.jvy -= 4.0; soft.jvx += 3.2; soft.tailWV += 16;
      return;
    }
  }

  // Ball im Maul -> stolz zur Bühnenmitte zurückbringen!
  if (ball.carried) {
    shiba.getMouthWorldPos(_mouthW, 0.24);
    ball.x = _mouthW.x; ball.y = Math.max(ball.r, _mouthW.y - 0.04); ball.z = _mouthW.z;
    const goalX = 0.0, goalZ = 0.36;
    const dx = goalX - body.x, dz = goalZ - body.z, dist = Math.hypot(dx, dz);
    if (dist < 0.72 && body.onFloor) {
      dropCarriedBall(true);
      return;
    }
    ball.chaseCd -= dt;
    if (body.onFloor && ball.chaseCd <= 0) {
      ball.chaseCd = 0.44;
      const spd = clamp(dist * 2.1, 1.9, 3.3);
      body.vx += (dx / (dist || 1)) * spd;
      body.vz += (dz / (dist || 1)) * spd;
      body.vy += 3.1;
      soft.jvy -= 3.2; soft.jvx += 2.6; soft.tailWV += 14;
      sfx.hop();
    }
    return;
  }

  // Verfolgen des geworfenen Balls!
  if (ball.fetchState === 'chasing') {
    // Abbrechen wenn satt, schmollend/eingeschnappt oder Napf/Knochen aktiv
    if (mood.fullness >= 0.85 || mood.happiness < 0.30 || treat.active || bowl.eating || performance.now() - ball.throwTime > 9000) {
      ball.fetchState = 'idle';
      return;
    }
    const dx = ball.x - body.x, dz = ball.z - body.z, dist = Math.hypot(dx, dz);
    if (dist < 0.90 && ball.y < 0.76 && Math.hypot(ball.vx, ball.vy, ball.vz) < 5.0) {
      ball.carried = true; ball.fetchState = 'returning'; ball.vx = ball.vy = ball.vz = 0;
      sfx.yip();
      fx.spawnDust(body.x, 0.04, body.z, 3);
      soft.jvy -= 3.2; soft.jvx += 2.5; soft.tailWV += 14;
      return;
    }
    // Anti-Steckenbleiben falls Ball tief in Ecke oder hinterm Napf liegt
    const dbBowl = Math.hypot(ball.x - bowl.x, ball.z - bowl.z);
    if (dbBowl < bowl.r + ball.r + 0.14) {
      ball.vx += (ball.x - bowl.x) * dt * 2.2; ball.vz += (ball.z - bowl.z) * dt * 2.2;
    }
    ball.chaseCd -= dt;
    if (body.onFloor && ball.chaseCd <= 0 && dist > 0.6) {
      ball.chaseCd = 0.42;
      const spd = clamp(dist * 2.3, 2.2, 4.1) * (1 - mood.fullness * 0.30);
      body.vx += (dx / dist) * spd;
      body.vz += (dz / dist) * spd;
      body.vy += 3.5;
      soft.jvy -= 3.8; soft.jvx += 3.0; soft.tailWV += 12;
      fx.spawnDust(body.x, 0.03, body.z, 2);
      sfx.hop();
    }
  }
}

// =============================================================================
// Kauknochen & Honigkeks (Handfütterung, Betteln mit 🥺-Blick, Knuspern)
// =============================================================================
function setTreatVisual(type) {
  treat.type = type;
  for (const k in treatMeshes.meshes) treatMeshes.meshes[k].visible = (k === type);
}

function spawnTreat(type, x, y, z, held = false) {
  setTreatVisual(type);
  treat.active = true; treat.eating = false; treat.eatT = 0; treat.bitesDone = 0; treat.holdAboveT = 0;
  treat.x = clamp(x, -room.halfW + 0.35, room.halfW - 0.35);
  treat.y = clamp(y, 0.14, room.ceil - 0.3);
  treat.z = clamp(z, -room.halfD + 0.35, room.halfD - 0.35);
  treat.vx = held ? 0 : (Math.random() - 0.5) * 0.5; treat.vy = 0; treat.vz = held ? 0 : (Math.random() - 0.5) * 0.5;
  treat.spin = Math.random() * 6;
  treatMeshes.root.visible = true; treatMeshes.root.scale.setScalar(1);
  treatShadow.mesh.visible = true;
  if (ball.carried) dropCarriedBall(false);
  ball.fetchState = 'idle';
  if (brain.state === 'nap' && Math.hypot(treat.x - body.x, treat.z - body.z) < 1.5) {
    brain.interrupt(false);
    mood.triggerStartle();
  } else {
    mood.wakeUp();
  }
  sfx.grab();
}

function startEatingTreat() {
  if (treat.eating) return;
  treat.eating = true; treat.eatT = 0; treat.bitesDone = 0;
  if (ptr.grabbed === 'treat') { ptr.grabbed = null; ptr.mode = null; ptr.down = false; }
  mood.startEating(TREAT_SPECS[treat.type]);
}

function updateTreat(dt) {
  if (!treat.active) return;

  if (treat.eating) {
    treat.eatT += dt;
    shiba.getMouthWorldPos(_mouthW, 0.17);
    const bob = Math.sin(treat.eatT * 20) * 0.024;
    treat.x = lerp(treat.x, _mouthW.x, Math.min(1, dt * 18));
    treat.y = lerp(treat.y, _mouthW.y + bob, Math.min(1, dt * 18));
    treat.z = lerp(treat.z, _mouthW.z, Math.min(1, dt * 18));
    treatMeshes.root.position.set(treat.x, treat.y, treat.z);
    treatMeshes.root.rotation.set(0.18, treat.spin + treat.eatT * 3.5, Math.sin(treat.eatT * 18) * 0.25);
    treatShadow.mesh.visible = false;

    const spec = TREAT_SPECS[treat.type];
    const totalDur = spec.bites * 0.30 + 0.16;
    const nextBiteT = 0.08 + treat.bitesDone * 0.28;
    if (treat.bitesDone < spec.bites && treat.eatT >= nextBiteT) {
      treat.bitesDone++;
      sfx.crunch(treat.bitesDone);
      fx.spawnCrumbs(treat.x, treat.y, treat.z, spec.crumb, 5);
      soft.jvy -= 2.3; soft.jvx += 1.9; soft.earLV += 4.5; soft.earRV += 4.5; soft.tailWV += 9;
    }
    const targetScale = Math.max(0.08, 1 - (treat.bitesDone / (spec.bites + 0.35)));
    treatMeshes.root.scale.setScalar(lerp(treatMeshes.root.scale.x, targetScale, Math.min(1, dt * 13)));

    if (treat.eatT >= totalDur) {
      treat.active = false; treat.eating = false; treatMeshes.root.visible = false;
      mood.finishEating(spec);
      fx.spawnHearts(body.x, body.y + 0.16, body.z, spec.hearts);
      if (mood.fullness >= 0.88) {
        mood.triggerStuffed();
      } else {
        sfx.proud();
        if (body.onFloor) body.vy += 3.8;
        soft.jvy -= 4.8; soft.jvx += 4.0; soft.tailWV += 15;
      }
    }
    return;
  }

  if (ptr.grabbed === 'treat') {
    treat.x = lerp(treat.x, ptr.dragPos.x, Math.min(1, dt * 24));
    treat.y = lerp(treat.y, Math.max(0.12, ptr.dragPos.y), Math.min(1, dt * 24));
    treat.z = lerp(treat.z, ptr.dragPos.z, Math.min(1, dt * 24));
    treat.vx = treat.vy = treat.vz = 0;
  } else {
    treat.vy -= G * 0.85 * dt;
    if (!focusMode) {
      treat.vx += motion.wx * 9.0 * dt;
      treat.vz += motion.wz * 9.0 * dt;
    }
    treat.x += treat.vx*dt; treat.y += treat.vy*dt; treat.z += treat.vz*dt;
    if (treat.y < 0.10) {
      treat.y = 0.10;
      if (treat.vy < -1.0) treat.vy = -treat.vy * 0.35; else treat.vy = 0;
      treat.vx *= 1 - 6*dt; treat.vz *= 1 - 6*dt;
    }
    if (treat.x < -room.halfW + 0.2) { treat.x = -room.halfW + 0.2; treat.vx = Math.abs(treat.vx) * 0.5; }
    if (treat.x >  room.halfW - 0.2) { treat.x =  room.halfW - 0.2; treat.vx = -Math.abs(treat.vx) * 0.5; }
    if (treat.z < -room.halfD + 0.2) { treat.z = -room.halfD + 0.2; treat.vz = Math.abs(treat.vz) * 0.5; }
    if (treat.z >  room.halfD - 0.2) { treat.z =  room.halfD - 0.2; treat.vz = -Math.abs(treat.vz) * 0.5; }
  }

  treat.spin += dt * 1.4;
  treatMeshes.root.position.set(treat.x, treat.y + (ptr.grabbed === 'treat' ? 0 : Math.sin(time * 4.5) * 0.015), treat.z);
  treatMeshes.root.rotation.set(0.15, treat.spin, 0);

  const th = Math.max(0, treat.y - 0.10), tf = 1 / (1 + th * 0.7);
  treatShadow.mesh.position.set(treat.x, 0.0005, treat.z);
  treatShadow.mesh.scale.set(0.26 * tf, 1, 0.18 * tf);
  treatShadow.mat.uniforms.uOpacity.value = 0.65 * tf;

  // Wenn kugelrund satt (> 0.90) -> schaut er den Keks nur träge an, Knochen geht aber fast immer!
  const tooFull = mood.fullness >= 0.90 && treat.type === 'biscuit';

  if (ptr.grabbed !== 'shiba' && !tooFull) {
    shiba.getMouthWorldPos(_mouthW, 0.12);
    const dMouth = Math.hypot(treat.x - _mouthW.x, treat.y - _mouthW.y, treat.z - _mouthW.z);
    const dCenterXZ = Math.hypot(treat.x - body.x, treat.z - body.z);
    if (dMouth < 0.45 || (dCenterXZ < 0.60 && Math.abs(treat.y - body.y) < 0.52)) {
      startEatingTreat(); return;
    }
    // Wenn du das Leckerli länger unerreichbar über ihm hältst -> niedlicher Bettel-Blick (🥺)!
    if (ptr.grabbed === 'treat' && dCenterXZ < 1.5 && treat.y > body.y + 0.36) {
      treat.holdAboveT += dt;
      treat.begCd -= dt;
      if (body.onFloor && treat.begCd <= 0) {
        treat.begCd = 0.68; body.vy += 3.4;
        if (dCenterXZ > 0.35) { body.vx += ((treat.x-body.x)/dCenterXZ)*1.1; body.vz += ((treat.z-body.z)/dCenterXZ)*1.1; }
        soft.jvy -= 3.8; soft.jvx += 3.0; soft.tailWV += 10; sfx.hop();
      }
    } else {
      treat.holdAboveT = Math.max(0, treat.holdAboveT - dt * 2);
    }

    treat.hopCd -= dt;
    if (ptr.grabbed !== 'treat' && body.onFloor && treat.y < 0.32 && treat.hopCd <= 0 && dCenterXZ >= 0.58) {
      treat.hopCd = 0.54;
      const spd = clamp(dCenterXZ * 2.1, 1.8, 3.6) * (1 - mood.fullness * 0.35);
      body.vx += ((treat.x - body.x)/dCenterXZ)*spd; body.vz += ((treat.z - body.z)/dCenterXZ)*spd;
      body.vy += 3.3; soft.jvy -= 3.8; soft.jvx += 3.0; soft.tailWV += 9; sfx.hop();
    }
  }
}

// =============================================================================
// Autonomes Eigenleben („Shiba-Brain“: Erkunden, Schnüffeln, Ball-Stupsen,
// Napf-Betteln, Zoomies, Kissen-Kreiseln & Aufwach-Strecken!)
// =============================================================================
const brain = {
  state: 'idle', // 'idle'|'wander'|'sniff'|'playBall'|'checkBowl'|'zoomies'|'goToCushion'|'nestSpin'|'nap'|'stretch'|'comeToSpot'
  timer: 3.4,
  stepCd: 0,
  targetX: 0, targetZ: 0.2,
  energy: 0.85,
  boredom: 0.15,
  zoomAngle: 0,
  sniffCount: 0,
  bowlBegged: false,
  tiltSign: 1,
  stuckT: 0,
  stuckRefX: 0,
  stuckRefZ: 0,

  interrupt(withStretch = false) {
    const wasNap = this.state === 'nap';
    if (wasNap && withStretch) {
      this.enter('stretch', 1.35);
      sfx.yawn();
      return;
    }
    this.state = 'idle';
    this.timer = 3.8 + Math.random() * 2.5;
    this.boredom = Math.max(0, this.boredom - 0.35);
  },

  enter(st, dur = 3.5) {
    this.state = st;
    this.timer = dur;
    this.stepCd = 0.12;
    this.tiltSign = Math.random() < 0.5 ? 1 : -1;
    if (st === 'sniff') this.sniffCount = 0;
    if (st === 'checkBowl') this.bowlBegged = false;
    if (st === 'zoomies') {
      this.zoomAngle = Math.atan2(body.z, body.x);
      sfx.yip();
      fx.spawnSparkles(body.x, body.y + 0.15, body.z, 3);
      fx.spawnNote(body.x, body.y, body.z);
    }
    if (st === 'nap') {
      sfx.plop();
      fx.spawnDust(body.x, 0.06, body.z, 4);
      cushion.targetSquish = 0.92;
      soft.jvy -= 2.6; soft.jvx += 2.6;
    }
    if (st === 'stretch') {
      sfx.yawn();
      soft.tailWV += 6;
    }
  },

  callTo(x, z) {
    mood.wakeUp();
    this.boredom = Math.max(0, this.boredom - 0.55);
    this.energy = Math.min(1, this.energy + 0.18);
    // Shiba-Sturkopf: wenn er gerade schmollt/wütend ist, weigert er sich beim ersten Ruf!
    if (mood.happiness < 0.36 && mood.stubbornCalls < 1) {
      mood.stubbornCalls++;
      mood.stubbornT = 2.6;
      mood.triggerHuffPuff();
      soft.jvy -= 2.4; soft.jvx += 2.2;
      return;
    }
    mood.stubbornCalls = 0;
    if (this.state === 'nap') {
      this.enter('stretch', 1.0);
      return;
    }
    this.targetX = clamp(x, -room.halfW + 0.72, room.halfW - 0.72);
    this.targetZ = clamp(z, -room.halfD + 0.65, room.halfD - 0.65);
    this.enter('comeToSpot', 6.0);
    fx.spawnNote(body.x, body.y, body.z);
    sfx.yip();
  },

  sendToCushion() {
    mood.wakeUp();
    this.targetX = cushion.x;
    this.targetZ = cushion.z;
    this.enter('goToCushion', 8.0);
    fx.spawnNote(body.x, body.y, body.z);
  },

  hopStep(tx, tz, speedScale = 1.0, jumpY = 2.85) {
    const dx = tx - body.x, dz = tz - body.z, dist = Math.hypot(dx, dz) || 1;
    const spd = clamp(dist * 1.9, 1.35, 3.3) * speedScale * (1 - mood.fullness * 0.30);
    body.vx += (dx / dist) * spd;
    body.vz += (dz / dist) * spd;
    body.vy += jumpY;
    soft.jvy -= 3.2; soft.jvx += 2.6; soft.tailWV += 8.5;
    fx.spawnDust(body.x, 0.03, body.z, 2);
    sfx.hop();
  },

  pickNextActivity(idleSec) {
    // Im Fokus-Modus ruhig aufs Kissen und dösen!
    if (focusMode) {
      const distC = Math.hypot(body.x - cushion.x, body.z - cushion.z);
      if (distC > 0.45) {
        this.targetX = cushion.x; this.targetZ = cushion.z;
        this.enter('goToCushion', 9.0);
      } else {
        this.enter('nap', 14.0);
      }
      return;
    }
    // Müde oder länger alleine -> ab aufs gemütliche Matcha-Kissen!
    if (this.energy < 0.26 || (idleSec > 16 && mood.happiness > 0.34)) {
      this.targetX = cushion.x; this.targetZ = cushion.z;
      this.enter('goToCushion', 8.5);
      return;
    }
    // Hungrig + Napf leer -> zum Napf laufen und niedlich betteln!
    if (mood.fullness < 0.28 && bowl.food <= 0.03 && Math.random() < 0.48) {
      this.targetX = bowl.x + 0.65; this.targetZ = bowl.z + 0.48;
      this.enter('checkBowl', 6.5);
      return;
    }
    // Super gelaunt & ausgeruht -> kurze Shiba-Zoomies!
    if (mood.happiness > 0.72 && mood.fullness < 0.68 && this.energy > 0.56 && Math.random() < 0.28) {
      this.enter('zoomies', 3.4);
      return;
    }
    // Ball liegt auf der Matte -> selbstständig anstupsen & bespielen!
    if (ball.enabled && !ball.carried && mood.fullness < 0.78 && this.energy > 0.34 && Math.random() < 0.38) {
      this.enter('playBall', 6.0);
      return;
    }
    // Sonst entspannt im Zimmer umherwandern & schnüffeln
    for (let tries = 0; tries < 8; tries++) {
      const rx = (Math.random() - 0.5) * (room.halfW * 1.45);
      const rz = (Math.random() - 0.5) * (room.halfD * 1.45);
      if (Math.hypot(rx - bowl.x, rz - bowl.z) > 1.05 && Math.hypot(rx - body.x, rz - body.z) > 0.70) {
        this.targetX = rx; this.targetZ = rz; break;
      }
    }
    this.enter('wander', 5.0);
  },

  update(dt, now) {
    const idleSec = (now - mood.lastInteract) / 1000;

    // Anti-Steckenbleiben Watchdog: erkennt Blockaden (auch beim Apportieren/Fressen-Hinweg) und löst sie sanft auf!
    const isTryingToMove = ptr.grabbed !== 'shiba' && (
      ball.fetchState === 'chasing' ||
      (bowl.food > 0.05 && !bowl.eating && mood.fullness < 0.84 && mood.happiness >= 0.20) ||
      this.state === 'wander' || this.state === 'goToCushion' || this.state === 'comeToSpot' ||
      (this.state === 'checkBowl' && !this.bowlBegged) || this.state === 'playBall' || this.state === 'zoomies'
    );
    if (isTryingToMove) {
      if (Math.hypot(body.x - this.stuckRefX, body.z - this.stuckRefZ) > 0.14) {
        this.stuckT = 0;
        this.stuckRefX = body.x;
        this.stuckRefZ = body.z;
      } else {
        this.stuckT += dt;
        if (this.stuckT > 1.35) {
          this.stuckT = 0;
          this.stuckRefX = body.x;
          this.stuckRefZ = body.z;
          // Sanfter Befreiungs-Hopser in Richtung offene Raummitte!
          const cx = -body.x, cz = 0.25 - body.z, cl = Math.hypot(cx, cz) || 1;
          body.vx += (cx / cl) * 2.4;
          body.vz += (cz / cl) * 2.4;
          body.vy = Math.max(body.vy, 2.8);
          if (ball.fetchState === 'chasing') {
            const bx = -ball.x, bz = 0.25 - ball.z, bl = Math.hypot(bx, bz) || 1;
            ball.vx += (bx / bl) * 2.0; ball.vz += (bz / bl) * 2.0; ball.vy += 1.4;
          }
          if (this.state === 'wander' || this.state === 'checkBowl') {
            this.enter('idle', 2.0);
          }
        }
      }
    } else {
      this.stuckT = 0;
      this.stuckRefX = body.x;
      this.stuckRefZ = body.z;
    }

    // Energie & Langeweile entwickeln sich organisch
    if (this.state === 'nap') {
      this.energy = clamp(this.energy + dt * 0.085, 0, 1);
      this.boredom = clamp(this.boredom - dt * 0.06, 0, 1);
    } else if (this.state === 'zoomies' || ball.fetchState !== 'idle') {
      this.energy = clamp(this.energy - dt * 0.055, 0, 1);
      this.boredom = clamp(this.boredom - dt * 0.14, 0, 1);
    } else {
      this.energy = clamp(this.energy - dt * 0.012, 0, 1);
      if (idleSec > 5.0) this.boredom = clamp(this.boredom + dt * 0.032, 0, 1);
    }

    // Externe Prioritäten (Greifen, Fressen, Apportieren, Leckerli, Wut/Satt-Koma) pausieren Autonomie
    const busy = ptr.grabbed === 'shiba' || treat.active || bowl.eating ||
      (bowl.food > 0.05 && mood.fullness < 0.84 && mood.happiness >= 0.20) ||
      ball.fetchState !== 'idle' || mood.winceT > 0 || mood.huffT > 0 || mood.proudT > 0;

    if (busy) {
      if (this.state !== 'idle') this.state = 'idle';
      this.timer = 2.6;
      return;
    }

    // Eingeschnappt oder randvoll satt -> kein aktives Rumhüpfen (nur ausruhen!)
    if (mood.happiness < 0.30 || mood.fullness >= 0.85) {
      if (this.state !== 'idle' && this.state !== 'nap') this.state = 'idle';
      return;
    }

    this.timer -= dt;
    this.stepCd -= dt;

    switch (this.state) {
      case 'idle':
        if (this.timer <= 0 && body.onFloor) this.pickNextActivity(idleSec);
        break;

      case 'wander': {
        const dist = Math.hypot(this.targetX - body.x, this.targetZ - body.z);
        if (dist < 0.45 || this.timer <= 0) {
          this.enter('sniff', 2.4 + Math.random() * 1.2);
          break;
        }
        if (body.onFloor && this.stepCd <= 0) {
          this.stepCd = 0.62;
          this.hopStep(this.targetX, this.targetZ, 0.78, 2.35);
          if (Math.random() < 0.25) fx.spawnNote(body.x, body.y, body.z);
        }
        break;
      }

      case 'sniff':
        if (this.stepCd <= 0 && body.onFloor) {
          this.stepCd = 0.68;
          this.sniffCount++;
          sfx.sniff();
          soft.jvy -= 1.35; soft.jvx += 1.25; soft.earLV += 3.5; soft.earRV += 3.5;
          fx.spawnDust(body.x, 0.04, body.z, 2);
          if (this.sniffCount === 1 && Math.random() < 0.55) fx.spawnQuestion(body.x, body.y, body.z);
        }
        if (this.timer <= 0) {
          this.boredom = Math.max(0, this.boredom - 0.12);
          this.enter('idle', 2.6 + Math.random() * 2.4);
        }
        break;

      case 'playBall': {
        if (!ball.enabled || ball.carried) { this.enter('idle', 2.2); break; }
        const dx = ball.x - body.x, dz = ball.z - body.z, dist = Math.hypot(dx, dz);
        if (dist < 1.15 && body.onFloor) {
          // 50%: Ducken & Anspringen (Pounce) -> danach stolz ✦! | 50%: Ball zu DIR vorrollen (Spiel-Einladung!)
          if (!this.pounceReady) {
            this.pounceReady = true;
            this.stepCd = 0.55; // kurzes Ducken & Popo-Wackeln vor dem Sprung!
            soft.jvy -= 2.8; soft.jvx += 2.6; soft.tailWV += 15;
            fx.spawnQuestion(body.x, body.y, body.z);
            break;
          }
          if (this.stepCd > 0) {
            // Wackelt duckend vor dem Absprung
            soft.tailWV += dt * 35;
            break;
          }
          this.pounceReady = false;
          const passToPlayer = Math.random() < 0.52;
          let dirX, dirZ, kick;
          if (passToPlayer) {
            // Spiel-Einladung: stupst dir den Ball genau nach vorne vor die Füße!
            const pdx = 0.15 - ball.x, pdz = 1.05 - ball.z, pd = Math.hypot(pdx, pdz) || 1;
            dirX = pdx / pd; dirZ = pdz / pd; kick = 3.2 + Math.random() * 1.3;
          } else {
            const nx = dx / (dist || 1), nz = dz / (dist || 1);
            const ang = Math.atan2(nz, nx) + (Math.random() - 0.5) * 0.70;
            dirX = Math.cos(ang); dirZ = Math.sin(ang); kick = 4.2 + Math.random() * 2.0;
          }
          ball.vx += dirX * kick; ball.vz += dirZ * kick; ball.vy += 1.7 + Math.random() * 0.9;
          ball.selfNudgeT = 0.90;
          body.vy += 2.8; body.vx += dirX * 1.1; body.vz += dirZ * 1.1;
          sfx.nudge();
          fx.spawnDust(ball.x, 0.05, ball.z, 4);
          soft.jvy -= 3.6; soft.jvx += 3.0; soft.tailWV += 16;
          this.boredom = Math.max(0, this.boredom - 0.50);
          mood.happiness = clamp(mood.happiness + 0.07, 0, 1);
          if (passToPlayer) {
            // Nach dem Zupassen schaut er dich stolz & erwartungsvoll an!
            mood.triggerProud();
            fx.spawnSparkles(body.x, body.y + 0.18, body.z, 4);
          } else if (Math.random() < 0.65) {
            ball.fetchState = 'chasing';
            ball.throwTime = now;
            fx.spawnNote(body.x, body.y, body.z);
          } else {
            mood.triggerProud();
            fx.spawnSparkles(body.x, body.y + 0.18, body.z, 4);
          }
          this.enter('idle', 3.4);
          break;
        }
        this.pounceReady = false;
        if (this.timer <= 0) { this.enter('idle', 2.5); break; }
        if (body.onFloor && this.stepCd <= 0) {
          this.stepCd = 0.50;
          this.hopStep(ball.x, ball.z, 0.94, 2.75);
        }
        break;
      }

      case 'checkBowl': {
        if (bowl.food > 0.05) { this.enter('idle', 0.5); break; }
        const dist = Math.hypot(bowl.x - body.x, bowl.z - body.z);
        if (dist < 1.02 && body.onFloor) {
          if (!this.bowlBegged) {
            this.bowlBegged = true;
            this.timer = 3.2;
            sfx.whine();
            fx.spawnHungry(body.x, body.y, body.z);
            soft.earLV += 4; soft.earRV += 4;
          }
          if (this.timer <= 0) this.enter('idle', 4.0);
        } else {
          if (this.timer <= 0) { this.enter('idle', 3.0); break; }
          if (body.onFloor && this.stepCd <= 0) {
            this.stepCd = 0.56;
            this.hopStep(bowl.x + 0.65, bowl.z + 0.48, 0.82, 2.5);
          }
        }
        break;
      }

      case 'zoomies': {
        this.zoomAngle += dt * 2.55;
        const zx = Math.cos(this.zoomAngle) * 1.25;
        const zz = Math.sin(this.zoomAngle * 1.5) * 0.95 + 0.20;
        this.targetX = zx; this.targetZ = zz;
        if (body.onFloor && this.stepCd <= 0) {
          this.stepCd = 0.32;
          this.hopStep(zx, zz, 1.25, 3.2);
          fx.spawnDust(body.x, 0.04, body.z, 3);
          if (Math.random() < 0.35) fx.spawnSparkles(body.x, body.y + 0.1, body.z, 1);
        }
        if (this.timer <= 0) {
          mood.happyT = Math.max(mood.happyT, 2.0);
          this.enter('idle', 4.0);
        }
        break;
      }

      case 'goToCushion': {
        const dist = Math.hypot(cushion.x - body.x, cushion.z - body.z);
        if (dist < 0.38 && body.onFloor) {
          this.enter('nestSpin', 0.95);
          break;
        }
        if (this.timer <= 0) { this.enter('nap', 14.0); break; }
        if (body.onFloor && this.stepCd <= 0) {
          this.stepCd = 0.64;
          this.hopStep(cushion.x, cushion.z, 0.74, 2.35);
        }
        break;
      }

      case 'nestSpin':
        // Typisches Shiba-„Körbchen-Kreiseln“ vor dem Hinlegen!
        if (body.onFloor) {
          body.oy += (6.2 - body.oy) * Math.min(1, dt * 8);
          if (this.stepCd <= 0) {
            this.stepCd = 0.30;
            soft.jvy -= 1.6; soft.jvx += 1.4;
            fx.spawnDust(body.x, 0.08, body.z, 2);
          }
        }
        if (this.timer <= 0) this.enter('nap', 16.0);
        break;

      case 'nap':
        if (!focusMode && this.energy >= 0.96 && this.timer <= 0) {
          this.enter('stretch', 1.35);
        }
        break;

      case 'stretch':
        if (this.timer <= 0) {
          // Kleines Aufwach-Schütteln!
          soft.shvX += 7.5; soft.earLV += 7; soft.earRV += 7; soft.tailWV += 10;
          this.enter('idle', 3.4);
        }
        break;

      case 'comeToSpot': {
        const dist = Math.hypot(this.targetX - body.x, this.targetZ - body.z);
        if (dist < 0.45 && body.onFloor) {
          mood.happyT = Math.max(mood.happyT, 1.5);
          fx.spawnHearts(body.x, body.y + 0.14, body.z, 1);
          soft.jvy -= 3.0; soft.jvx += 2.6; soft.tailWV += 13;
          this.enter('idle', 3.6);
          break;
        }
        if (this.timer <= 0) { this.enter('idle', 2.8); break; }
        if (body.onFloor && this.stepCd <= 0) {
          this.stepCd = 0.46;
          this.hopStep(this.targetX, this.targetZ, 1.05, 2.95);
        }
        break;
      }
    }
  },
};

// =============================================================================
// 3D-Raycasting & Eingabe (Streicheln, Greifen, Ball/Knochen, Napf-Klick, 360°)
// =============================================================================
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
const dragPlane = new THREE.Plane(), cursorPlane = new THREE.Plane(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPt = new THREE.Vector3(), _camLookDir = new THREE.Vector3();

const ptr = {
  down: false, mode: null, grabbed: null, // 'shiba' | 'ball' | 'treat' | 'orbit'
  t0: 0, sx0: 0, sy0: 0, lastSx: 0, lastSy: 0,
  dragPos: new THREE.Vector3(), grabLocal: new THREE.Vector3(), grabQuat: new THREE.Quaternion(),
  grabHoldTime: 0, shakeAccum: 0,
  hoverWorld: new THREE.Vector3(0, 0.7, 1.5), hoverOnShiba: false,
  cursorActiveT: 0, cursorWaveT: 0,
  petDist: 0, lastPetFx: 0, samples: [], id: null, fromTray: false,
};

function setRayFromClient(cx, cy) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((cx - r.left)/r.width)*2 - 1, -((cy - r.top)/r.height)*2 + 1);
  raycaster.setFromCamera(ndc, camera);
}
function rayHitsSphere(cx, cy, cz, radius) {
  const ro = raycaster.ray.origin, rd = raycaster.ray.direction;
  const ocx = ro.x-cx, ocy = ro.y-cy, ocz = ro.z-cz;
  const b = ocx*rd.x + ocy*rd.y + ocz*rd.z, c = ocx*ocx + ocy*ocy + ocz*ocz - radius*radius;
  const d = b*b - c; if (d < 0) return null;
  const t = -b - Math.sqrt(d);
  return t > 0 ? raycaster.ray.at(t, new THREE.Vector3()) : null;
}

const canvas = renderer.domElement;
const onContextMenu = e => e.preventDefault();
canvas.addEventListener('contextmenu', onContextMenu);

const activeTouches = new Map();
let pinchBaseDist = 0, pinchBaseZoom = 1;
let audioUnlocked = false;
const unlockAudioOnce = () => {
  if (audioUnlocked) return;
  audioUnlocked = true;
  sfx.unlock();
};
window.addEventListener('pointerdown', unlockAudioOnce, { passive: true });
window.addEventListener('touchstart', unlockAudioOnce, { passive: true });

const onWheel = e => {
  e.preventDefault();
  camCtrl.zoomScale = clamp(camCtrl.zoomScale * (1 + e.deltaY * 0.0012), 0.65, 1.35);
};
canvas.addEventListener('wheel', onWheel, { passive: false });

// Doppelklick auf Boden wirft einen Honigkeks
const onDblClick = e => {
  setRayFromClient(e.clientX, e.clientY);
  if (rayHitsSphere(body.x, body.y, body.z, 0.84)) return;
  if (raycaster.ray.intersectPlane(floorPlane, hitPt)) {
    spawnTreat(Math.random() < 0.45 ? 'bone' : 'biscuit', hitPt.x, 1.85, hitPt.z, false);
  }
};
canvas.addEventListener('dblclick', onDblClick);

function callShiba() {
  sfx.unlock();
  sfx.whistle();
  emitHaptic('tap');
  fx.spawnRipple(0.0, 0.34, '#6E8872');
  brain.callTo(0.0, 0.34);
}

function startTreatDrag(type, clientX, clientY, pointerId) {
  sfx.unlock();
  setRayFromClient(clientX, clientY);
  camera.getWorldDirection(_tmpCamDir);
  dragPlane.setFromNormalAndCoplanarPoint(_tmpCamDir.negate(), _tmpDragPt.set(body.x, Math.max(0.55, body.y), body.z));
  if (!raycaster.ray.intersectPlane(dragPlane, hitPt)) hitPt.set(body.x, 1.2, body.z + 0.5);
  spawnTreat(type, hitPt.x, Math.max(0.25, hitPt.y), hitPt.z, true);
  emitHaptic('tap');

  const now = performance.now();
  ptr.down = true; ptr.id = pointerId; ptr.t0 = now;
  ptr.sx0 = ptr.lastSx = clientX; ptr.sy0 = ptr.lastSy = clientY;
  ptr.mode = 'treat'; ptr.grabbed = 'treat'; ptr.fromTray = true;
  ptr.dragPos.set(treat.x, treat.y, treat.z);
  ptr.samples = [[now, treat.x, treat.y, treat.z]];
}

function applyPetRub(now, hitPoint) {
  const res = mood.rubPet();
  if (res === 'resist') {
    sfx.huff();
    emitHaptic('huff');
    soft.shvX += (Math.random() < 0.5 ? 1 : -1) * 11;
    soft.jvy -= 2.2; soft.jvx += 2.0; soft.earLV += 7; soft.earRV += 7;
    const awayX = body.x - hitPoint.x, awayZ = body.z - hitPoint.z, al = Math.hypot(awayX, awayZ) || 1;
    body.vx += (awayX / al) * 1.05; body.vz += (awayZ / al) * 1.05; body.vy += 1.2;
  } else if (res === 'soften') {
    sfx.sigh();
    emitHaptic('pet');
    soft.earLV += 4; soft.earRV += 4; soft.tailWV += 4;
  } else {
    sfx.pet(true);
    emitHaptic('pet');
    emitCare('pet');
    soft.jvy -= 1.8; soft.jvx += 1.5; soft.tailWV += (res === 'love' ? 13 : 9);
    if (now - ptr.lastPetFx > 440) {
      ptr.lastPetFx = now;
      fx.spawnHearts(body.x, body.y + 0.14, body.z, res === 'love' ? 3 : 1);
    }
  }
}

const onCanvasPointerDown = e => {
  sfx.unlock();
  if (e.pointerType === 'touch') {
    activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activeTouches.size === 2) {
      // 2-Finger Pinch-to-Zoom!
      const [t1, t2] = Array.from(activeTouches.values());
      pinchBaseDist = Math.hypot(t1.x - t2.x, t1.y - t2.y) || 1;
      pinchBaseZoom = camCtrl.zoomScale;
      ptr.down = false; ptr.grabbed = null; ptr.mode = 'pinch';
      return;
    }
  }
  setRayFromClient(e.clientX, e.clientY);
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  const now = performance.now();
  ptr.down = true; ptr.id = e.pointerId; ptr.t0 = now; ptr.fromTray = false;
  ptr.sx0 = ptr.lastSx = e.clientX; ptr.sy0 = ptr.lastSy = e.clientY;
  ptr.grabbed = null;

  if (e.button === 2) { ptr.mode = 'orbit'; return; }

  const treatHit   = (treat.active && !treat.eating) ? rayHitsSphere(treat.x, treat.y, treat.z, 0.38) : null;
  const shibaHit   = rayHitsSphere(body.x, body.y, body.z, 0.88);
  const ballHit    = (ball.enabled && !ball.carried) ? rayHitsSphere(ball.x, ball.y, ball.z, ball.r * 1.65) : null;
  const bowlHit    = rayHitsSphere(bowl.x, 0.14, bowl.z, bowl.r * 1.25);
  const cushionHit = rayHitsSphere(cushion.x, 0.08, cushion.z, 0.76);

  const hits = [
    treatHit   && { kind: 'treat',   pt: treatHit,   d: treatHit.distanceTo(camera.position) - 0.15 },
    shibaHit   && { kind: 'shiba',   pt: shibaHit,   d: shibaHit.distanceTo(camera.position) },
    ballHit    && { kind: 'ball',    pt: ballHit,    d: ballHit.distanceTo(camera.position) },
    bowlHit    && { kind: 'bowl',    pt: bowlHit,    d: bowlHit.distanceTo(camera.position) + 0.05 },
    cushionHit && { kind: 'cushion', pt: cushionHit, d: cushionHit.distanceTo(camera.position) + 0.12 },
  ].filter(Boolean).sort((a, b) => a.d - b.d);

  const pick = hits[0];
  if (!pick) { ptr.mode = 'orbit'; return; }
  if (pick.kind === 'bowl') { ptr.mode = 'bowl'; return; }
  if (pick.kind === 'cushion') { ptr.mode = 'cushion'; return; }

  camera.getWorldDirection(_tmpCamDir);
  dragPlane.setFromNormalAndCoplanarPoint(_tmpCamDir.negate(), pick.pt);
  ptr.dragPos.copy(pick.pt);
  ptr.samples = [[now, pick.pt.x, pick.pt.y, pick.pt.z]];

  if (pick.kind === 'shiba') {
    ptr.mode = 'shiba';
    _qInv.copy(body.quat).invert();
    ptr.grabLocal.copy(pick.pt).sub(_v1.set(body.x, body.y, body.z)).applyQuaternion(_qInv);
    ptr.grabLocal.x = clamp(ptr.grabLocal.x, -RX*0.75, RX*0.75);
    ptr.grabLocal.y = clamp(ptr.grabLocal.y, -RY*0.70, RY*0.70);
    ptr.grabLocal.z = clamp(ptr.grabLocal.z, -RZ*0.70, RZ*0.70);
  } else if (pick.kind === 'ball') {
    ptr.mode = 'ball'; ptr.grabbed = 'ball'; ball.fetchState = 'idle'; sfx.grab(); emitHaptic('tap');
  } else if (pick.kind === 'treat') {
    ptr.mode = 'treat'; ptr.grabbed = 'treat'; sfx.grab(); emitHaptic('tap');
  }
};
canvas.addEventListener('pointerdown', onCanvasPointerDown);

const onGlobalPointerMove = e => {
  if (e.pointerType === 'touch' && activeTouches.has(e.pointerId)) {
    activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activeTouches.size === 2 && ptr.mode === 'pinch') {
      const [t1, t2] = Array.from(activeTouches.values());
      const curDist = Math.hypot(t1.x - t2.x, t1.y - t2.y) || 1;
      camCtrl.zoomScale = clamp(pinchBaseZoom * (pinchBaseDist / curDist), 0.65, 1.35);
      return;
    }
  }

  if (!ptr.down) {
    if (e.target !== canvas) return;
    setRayFromClient(e.clientX, e.clientY);
    const now = performance.now();
    const movePx = Math.hypot(e.clientX - ptr.lastSx, e.clientY - ptr.lastSy);
    ptr.cursorActiveT = 3.8;
    if (movePx > 26) ptr.cursorWaveT = Math.max(ptr.cursorWaveT, 1.35);

    const treatHit   = (treat.active && !treat.eating) ? rayHitsSphere(treat.x, treat.y, treat.z, 0.34) : null;
    const shibaHit   = rayHitsSphere(body.x, body.y, body.z, 0.82);
    const ballHit    = (ball.enabled && !ball.carried) ? rayHitsSphere(ball.x, ball.y, ball.z, ball.r * 1.45) : null;
    const bowlHit    = rayHitsSphere(bowl.x, 0.14, bowl.z, bowl.r * 1.2);
    const cushionHit = rayHitsSphere(cushion.x, 0.08, cushion.z, 0.72);
    canvas.style.cursor = (treatHit || shibaHit || ballHit) ? 'grab' : (bowlHit || cushionHit) ? 'pointer' : 'move';

    if (shibaHit) {
      ptr.hoverWorld.copy(shibaHit);
      if (brain.state === 'nap' && !focusMode && movePx > 34 && body.onFloor) {
        brain.interrupt(false);
        mood.triggerStartle();
      } else if (ptr.hoverOnShiba && movePx > 2 && movePx < 48 && body.onFloor) {
        ptr.petDist += movePx;
        if (ptr.petDist > 82) {
          ptr.petDist = 0;
          applyPetRub(now, shibaHit);
        }
      }
      ptr.hoverOnShiba = true;
    } else {
      ptr.hoverOnShiba = false; ptr.petDist = 0;
      camera.getWorldDirection(_camLookDir);
      cursorPlane.setFromNormalAndCoplanarPoint(_camLookDir.negate(), _v1.set(body.x, body.y, body.z).addScaledVector(_camLookDir, 0.85));
      if (raycaster.ray.intersectPlane(cursorPlane, hitPt)) ptr.hoverWorld.copy(hitPt);
    }
    ptr.lastSx = e.clientX; ptr.lastSy = e.clientY;
    return;
  }

  if (e.pointerId !== ptr.id) return;
  setRayFromClient(e.clientX, e.clientY);
  const now = performance.now();

  if (ptr.mode === 'orbit') {
    const dx = e.clientX - ptr.lastSx, dy = e.clientY - ptr.lastSy;
    camCtrl.targetYaw -= dx * 0.0078;
    camCtrl.targetPitch = clamp(camCtrl.targetPitch + dy * 0.0062, 0.06, 0.92);
    canvas.style.cursor = 'grabbing';
  } else if (ptr.mode === 'touchPet') {
    const stepPx = Math.hypot(e.clientX - ptr.lastSx, e.clientY - ptr.lastSy);
    const shibaHit = rayHitsSphere(body.x, body.y, body.z, 0.96);
    if (shibaHit && body.onFloor) {
      ptr.petDist += stepPx;
      if (ptr.petDist > 58) {
        ptr.petDist = 0;
        applyPetRub(now, shibaHit);
      }
    }
  } else if (ptr.mode === 'shiba' || ptr.mode === 'ball' || ptr.mode === 'treat') {
    if (raycaster.ray.intersectPlane(dragPlane, hitPt)) {
      ptr.dragPos.set(
        clamp(hitPt.x, -room.halfW - 0.25, room.halfW + 0.25),
        clamp(hitPt.y, room.floor - 0.12, room.ceil + 0.25),
        clamp(hitPt.z, -room.halfD - 0.25, room.halfD + 0.25),
      );
      ptr.samples.push([now, ptr.dragPos.x, ptr.dragPos.y, ptr.dragPos.z]);
      while (ptr.samples.length > 2 && now - ptr.samples[0][0] > 85) ptr.samples.shift();
    }
    const dx0 = e.clientX - ptr.sx0, dy0 = e.clientY - ptr.sy0;
    const movedPx = Math.hypot(dx0, dy0);
    if (!ptr.grabbed && ptr.mode === 'shiba') {
      if (e.pointerType === 'touch' && body.onFloor && movedPx > 12 && Math.abs(dx0) > Math.abs(dy0) * 1.1 && (now - ptr.t0) < 260) {
        ptr.mode = 'touchPet';
        ptr.petDist = movedPx;
      } else if ((e.pointerType === 'touch' && (dy0 < -24 || now - ptr.t0 > 240)) ||
                 (e.pointerType !== 'touch' && (movedPx > 10 || now - ptr.t0 > 180))) {
        startShibaGrab();
      }
    }
    canvas.style.cursor = 'grabbing';
  }
  ptr.lastSx = e.clientX; ptr.lastSy = e.clientY;
};
window.addEventListener('pointermove', onGlobalPointerMove);

const onPointerLeave = () => { ptr.hoverOnShiba = false; };
canvas.addEventListener('pointerleave', onPointerLeave);

function startShibaGrab() {
  ptr.grabbed = 'shiba';
  ptr.grabQuat.copy(body.quat);
  ptr.grabHoldTime = 0; ptr.shakeAccum = 0;
  if (ball.carried) dropCarriedBall(false);
  bowl.eating = false;
  mood.grabbed(); sfx.grab(); emitHaptic('grab');
  soft.jvy += 2.0; soft.jvx -= 1.3;
}

const endPointer = e => {
  if (e.pointerType === 'touch') {
    activeTouches.delete(e.pointerId);
    if (ptr.mode === 'pinch') {
      if (activeTouches.size === 0) ptr.mode = null;
      return;
    }
  }
  if (!ptr.down || e.pointerId !== ptr.id) return;
  ptr.down = false;
  if (ptr.mode === 'bowl') {
    fillFoodBowl();
    ptr.mode = null; return;
  }
  if (ptr.mode === 'cushion') {
    fx.spawnRipple(cushion.x, cushion.z, '#748E76');
    sfx.plop(); emitHaptic('tap');
    brain.sendToCushion();
    ptr.mode = null; return;
  }
  if (ptr.mode === 'orbit') {
    const movedPx = Math.hypot(e.clientX - ptr.sx0, e.clientY - ptr.sy0);
    if (movedPx < 10 && performance.now() - ptr.t0 < 320 && (e.button === 0 || e.pointerType === 'touch')) {
      setRayFromClient(e.clientX, e.clientY);
      if (raycaster.ray.intersectPlane(floorPlane, hitPt) &&
          Math.abs(hitPt.x) < room.halfW - 0.15 && Math.abs(hitPt.z) < room.halfD - 0.15) {
        sfx.whistle(); emitHaptic('tap');
        fx.spawnRipple(hitPt.x, hitPt.z, '#C5742E');
        brain.callTo(hitPt.x, hitPt.z);
      }
    }
    ptr.mode = null; return;
  }
  if (ptr.grabbed === 'shiba' || ptr.grabbed === 'ball' || ptr.grabbed === 'treat') {
    const which = ptr.grabbed; ptr.grabbed = null;
    const s = ptr.samples, a = s[0], b = s[s.length - 1];
    const dt = Math.max((b[0] - a[0]) / 1000, 1 / 120);
    let vx = (b[1] - a[1])/dt, vy = (b[2] - a[2])/dt, vz = (b[3] - a[3])/dt;
    const sp = Math.hypot(vx, vy, vz);
    if (sp > MAX_THROW) { vx *= MAX_THROW/sp; vy *= MAX_THROW/sp; vz *= MAX_THROW/sp; }

    if (which === 'shiba') {
      body.vx = lerp(body.vx, vx, 0.82); body.vy = lerp(body.vy, vy, 0.82); body.vz = lerp(body.vz, vz, 0.82);
      body.oz += clamp(-vx*0.36,-7,7); body.ox += clamp(vz*0.36,-7,7); body.oy += clamp(vx*0.24,-5,5);
      soft.pvx -= soft.pullX*24; soft.pvy -= soft.pullY*24; soft.pvz -= soft.pullZ*24;
      mood.shibaThrown(Math.hypot(body.vx, body.vy, body.vz));
    } else if (which === 'ball') {
      ball.vx = vx; ball.vy = vy; ball.vz = vz;
      mood.ballThrown(sp);
      if (sp > 2.0 && mood.happiness >= 0.30 && mood.fullness < 0.84 && mood.throwSpam < 3.4) {
        ball.playerThrown = true;
        ball.fetchState = 'chasing';
        ball.throwTime = performance.now();
        sfx.yip();
      }
    } else if (which === 'treat') {
      const movedPx = Math.hypot(e.clientX - ptr.sx0, e.clientY - ptr.sy0);
      if (ptr.fromTray && movedPx < 24) {
        const ang = Math.random() * Math.PI * 2, rad = 1.15 + Math.random() * 0.7;
        treat.x = clamp(Math.cos(ang)*rad, -room.halfW+0.45, room.halfW-0.45);
        treat.y = 1.85;
        treat.z = clamp(Math.sin(ang)*rad*0.55, -room.halfD+0.45, room.halfD-0.45);
        treat.vx = (Math.random()-0.5)*0.4; treat.vy = 0; treat.vz = (Math.random()-0.5)*0.4;
      } else {
        treat.vx = vx*0.65; treat.vy = vy*0.65; treat.vz = vz*0.65;
      }
    }
  } else if (ptr.mode === 'shiba') {
    onShibaTap();
  }
  ptr.mode = null; ptr.fromTray = false;
};
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);

// =============================================================================
// Shiba-Emotions-Controller (alle 12 Ausdrücke sinnvoll verknüpft!)
// =============================================================================
let lastMoodEmit = 0;

const mood = {
  happiness: 0.68, // 0 = eingeschnappt/wütend, 0.5 = entspannt, 1.0 = verliebt/glücklich
  fullness: 0.22,  // 0 = hungrig, 0.85+ = Satt & Träge (Food Coma!)
  throwSpam: 0,    // steigt bei zu vielem Werfen -> Eingeschnappt / Frustriert!
  lastInteract: performance.now(),
  lastTap: -1e9,
  current: 'Zufrieden',
  holdT: 0, eyePop: 0,
  happyT: 0, loveT: 0, proudT: 0, yumT: 0, eatingBowlT: 0,
  winceT: 0, dazeT: 0, pressT: 0, skepticT: 0, huffT: 0, stuffedT: 0,
  stubbornT: 0, shockT: 0, lipLickT: 0,
  petStreak: 0, stubbornResists: 0, stubbornCalls: 0,
  flying: false, shockedLatch: false,
  blinkT: 2.8, shake: 0, zzzT: 0, huffCd: 0,
  blush: 0, angerMark: 0, sweat: 0,

  wakeUp() { this.lastInteract = performance.now(); },
  grabbed() { this.wakeUp(); this.petStreak = 0; },

  triggerStartle() {
    this.wakeUp();
    this.shockT = 1.15;
    this.shake = 0.25;
    sfx.yip();
    if (body.onFloor) body.vy += 3.6;
    soft.jvy -= 4.2; soft.jvx += 3.4; soft.earLV += 9; soft.earRV += 9;
    fx.spawnDust(body.x, 0.05, body.z, 3);
  },

  shibaThrown(speed) {
    this.wakeUp();
    this.flying = speed > 6.6;
    if (speed > 4.5) this.throwSpam += 1.05;
    if (speed > 7.5) this.happiness = clamp(this.happiness - 0.14, 0, 1);
    if (this.throwSpam >= 2.6) {
      this.happiness = clamp(this.happiness - 0.20, 0, 1);
      this.huffT = Math.max(this.huffT, 3.6);
      this.triggerHuffPuff();
    }
  },

  ballThrown(speed) {
    this.wakeUp();
    if (speed < 2.0) return;
    this.throwSpam += 0.88;
    // Zu oft hintereinander geworfen -> Shiba-Trotz (Eingeschnappt / Frustriert!)
    if (this.throwSpam >= 3.4) {
      this.happiness = clamp(this.happiness - 0.22, 0, 1);
      this.huffT = 4.2;
      this.triggerHuffPuff();
    } else if (this.fullness >= 0.84) {
      // Zu vollgefüttert zum Rennen -> skeptischer Seitenblick!
      this.skepticT = 2.6;
      sfx.sigh();
    }
  },

  triggerHuffPuff() {
    sfx.huff();
    this.shake = 0.24;
    _v1.set(0, 0, 1).applyQuaternion(body.quat);
    fx.spawnPuff(body.x, body.y, body.z, _v1.x, _v1.z);
  },

  triggerProud() {
    this.wakeUp();
    this.happiness = clamp(this.happiness + 0.18, 0, 1);
    this.proudT = 2.8;
    this.throwSpam = Math.max(0, this.throwSpam - 0.35);
    emitHaptic('celebrate');
  },

  triggerStuffed() {
    this.wakeUp();
    this.stuffedT = 8.5;
    this.happiness = clamp(this.happiness + 0.14, 0, 1);
    sfx.sigh();
    fx.spawnHearts(body.x, body.y + 0.12, body.z, 2);
    // Zufrieden einen kleinen Schritt vom Napf wegkugeln, damit man das satte Gesicht sieht!
    const dx = body.x - bowl.x, dz = body.z - bowl.z, d = Math.hypot(dx, dz) || 1;
    if (d < 1.35 && body.onFloor) {
      body.vx += (dx / d) * 1.15; body.vz += (dz / d) * 1.15; body.vy += 1.4;
      soft.jvy -= 2.8; soft.jvx += 2.6;
    }
  },

  rubPet() {
    this.wakeUp();
    this.throwSpam = Math.max(0, this.throwSpam - 0.65);
    // Wenn wütend / schmollend / eingeschnappt -> erst stur sträuben, dann langsam auftauen!
    if (this.happiness < 0.42 || this.huffT > 0.6) {
      this.stubbornResists++;
      this.happiness = clamp(this.happiness + 0.075, 0, 1);
      this.huffT = Math.max(0, this.huffT - 1.1);
      if (this.stubbornResists <= 2) {
        this.stubbornT = 2.0;
        this.triggerHuffPuff();
        return 'resist';
      }
      // 3. Streicheln -> Skeptisches Auftauen!
      if (this.stubbornResists === 3 && this.happiness < 0.48) {
        this.skepticT = 1.8;
        this.stubbornT = 0;
        return 'soften';
      }
      // Durchgebrochen -> verzeiht dir glücklich!
      this.stubbornResists = 0;
      this.stubbornT = 0;
      this.huffT = 0;
      this.happiness = Math.max(this.happiness, 0.56);
      this.happyT = 2.2;
      return 'happy';
    }
    this.stubbornResists = 0;
    this.petStreak++;
    this.happiness = clamp(this.happiness + 0.11, 0, 1);
    // Ab 2–3 Streicheleinheiten schmilzt er mit roten Herzchen-Augen („Verliebt ♥“)!
    if (this.petStreak >= 2 || this.happiness > 0.78) {
      this.loveT = Math.max(this.loveT, 3.2);
      return 'love';
    }
    this.happyT = Math.max(this.happyT, 2.0);
    return 'happy';
  },

  startEating() { this.wakeUp(); this.yumT = 1.4; this.huffT = 0; this.stubbornT = 0; },
  finishEating(spec) {
    this.wakeUp();
    this.happiness = clamp(this.happiness + spec.moodGain, 0, 1);
    this.fullness = clamp(this.fullness + spec.fullGain, 0, 1);
    this.throwSpam = Math.max(0, this.throwSpam - 1.5);
    this.stubbornResists = 0; this.stubbornCalls = 0;
    if (spec.name === 'Kauknochen') { this.loveT = 3.2; }
    else { this.loveT = 2.2; this.happyT = 2.6; }
    this.yumT = 0;
    emitHaptic('eat');
    emitCare('feed');
  },

  impact(speed, kind) {
    this.wakeUp();
    const wasAsleep = this.current === 'Sleepy';
    if (kind === 'ball') {
      if (ball.selfNudgeT > 0) return; // Eigenes Ball-Anstupsen macht ihn nicht sauer!
      if (speed > 4.6) {
        this.winceT = Math.max(this.winceT, 0.55);
        this.huffT = Math.max(this.huffT, 2.8);
        this.happiness = clamp(this.happiness - (wasAsleep ? 0.28 : 0.18), 0, 1);
        this.triggerHuffPuff();
      } else if (speed > 2.2) {
        this.skepticT = Math.max(this.skepticT, 1.4);
        this.happiness = clamp(this.happiness - 0.06, 0, 1);
      }
      return;
    }
    if (speed > 7.2 && (this.flying || speed > 9.2)) {
      this.winceT = 0.60; this.dazeT = 0.55;
      this.happiness = clamp(this.happiness - 0.18, 0, 1);
      if (this.happiness < 0.35) this.huffT = Math.max(this.huffT, 3.0);
    } else if (speed > 4.8) {
      this.winceT = Math.max(this.winceT, 0.28);
      this.happiness = clamp(this.happiness - 0.07, 0, 1);
    }
    if (speed > 3.5) this.flying = false;
  },

  tap(now) {
    this.wakeUp();
    const fastPoke = now - this.lastTap < 800;
    this.lastTap = now;
    if (!fastPoke && this.happiness > 0.34) {
      this.happiness = clamp(this.happiness + 0.11, 0, 1);
      this.happyT = 1.6;
      return 'happy';
    }
    this.happyT = 0;
    this.happiness = clamp(this.happiness - 0.18, 0, 1);
    this.skepticT = this.happiness > 0.30 ? 1.8 : 0;
    if (this.happiness <= 0.30) { this.huffT = 2.8; this.triggerHuffPuff(); }
    this.shake = 0.25;
    return 'annoyed';
  },

  update(dt, now, speed, pressAmt) {
    // Sättigung & Wurf-Frust bauen sich natürlich wieder ab
    this.fullness = clamp(this.fullness - dt * 0.014, 0, 1);
    this.throwSpam = Math.max(0, this.throwSpam - dt * 0.28);

    if (ptr.grabbed === 'shiba') {
      ptr.grabHoldTime += dt;
      if (speed > 4.8) ptr.shakeAccum += dt * (speed / 5.8);
      if (ptr.grabHoldTime > 2.4) this.happiness = clamp(this.happiness - 0.065 * dt, 0, 1);
      if (ptr.shakeAccum > 0.55)  this.happiness = clamp(this.happiness - 0.24 * dt, 0, 1);
      if (pressAmt > 0.24)        this.happiness = clamp(this.happiness - 0.16 * dt, 0, 1);
    }

    const idleSec = (now - this.lastInteract) / 1000;
    if (idleSec > 6.0) {
      const rate = this.happiness < 0.42 ? 0.04 : 0.08;
      this.happiness = lerp(this.happiness, 0.62, Math.min(1, dt * rate));
    }

    this.happyT      = Math.max(0, this.happyT - dt);
    this.loveT       = Math.max(0, this.loveT - dt);
    this.proudT      = Math.max(0, this.proudT - dt);
    this.yumT        = Math.max(0, this.yumT - dt);
    this.eatingBowlT = Math.max(0, this.eatingBowlT - dt);
    this.winceT      = Math.max(0, this.winceT - dt);
    if (this.winceT <= 0) this.dazeT = Math.max(0, this.dazeT - dt);
    this.skepticT    = Math.max(0, this.skepticT - dt);
    this.huffT       = Math.max(0, this.huffT - dt);
    this.stuffedT    = Math.max(0, this.stuffedT - dt);
    this.stubbornT   = Math.max(0, this.stubbornT - dt);
    this.shockT      = Math.max(0, this.shockT - dt);
    this.lipLickT    = Math.max(0, this.lipLickT - dt);
    ptr.cursorActiveT = Math.max(0, ptr.cursorActiveT - dt);
    ptr.cursorWaveT   = Math.max(0, ptr.cursorWaveT - dt);
    if (!ptr.hoverOnShiba && this.loveT <= 0) this.petStreak = Math.max(0, this.petStreak - dt * 0.45);
    ball.selfNudgeT  = Math.max(0, ball.selfNudgeT - dt);
    this.shake       = Math.max(0, this.shake - dt);
    this.holdT       = Math.max(0, this.holdT - dt);
    this.eyePop      = Math.max(0, this.eyePop - dt * 6.5);

    if (pressAmt > 0.22) this.pressT = Math.min(0.4, this.pressT + dt);
    else this.pressT = Math.max(0, this.pressT - dt * 2.5);

    const wantsShock = (ptr.grabbed === 'shiba' && speed > 5.8) || (this.flying && speed > 5.4);
    const keepShock  = (ptr.grabbed === 'shiba' && speed > 3.0) || (this.flying && speed > 2.8);
    this.shockedLatch = this.shockedLatch ? keepShock : wantsShock;

    const stuffed = this.stuffedT > 0 || this.fullness >= 0.85;
    const sleepy = brain.state === 'nap' || (idleSec > 18.0 && body.onFloor && speed < 0.35 && !treat.active && !bowl.eating && ball.fetchState === 'idle' && this.happiness > 0.36);
    const begging = treat.active && !treat.eating && treat.holdAboveT > 1.35;
    const hungryBowl = brain.state === 'checkBowl' && brain.bowlBegged && bowl.food <= 0.03;
    const zoomies = brain.state === 'zoomies';
    const stretching = brain.state === 'stretch';
    const sniffing = brain.state === 'sniff';
    const bored = brain.state === 'idle' && brain.boredom > 0.68 && !sleepy && !stuffed && this.happiness >= 0.36;
    const chasing = ball.fetchState === 'chasing' || ball.carried || (treat.active && !treat.eating) ||
      (bowl.food > 0.05 && !stuffed && this.happiness >= 0.20) ||
      brain.state === 'playBall' || brain.state === 'comeToSpot' || ptr.cursorWaveT > 0.1;

    // Gelegentliches grummeliges Schnauben wenn richtig eingeschnappt
    this.huffCd -= dt;
    if (this.happiness < 0.24 && body.onFloor && ptr.grabbed !== 'shiba' && this.huffCd <= 0) {
      this.huffCd = 3.6 + Math.random() * 2.4;
      this.triggerHuffPuff();
    }

    let desired = 'Zufrieden';
    let urgent = false;
    if (this.yumT > 0 || treat.eating || this.eatingBowlT > 0) { desired = 'Eating'; urgent = true; }
    else if (this.winceT > 0 || this.pressT > 0.12)            { desired = 'Wince'; urgent = true; }
    else if (this.shockedLatch || this.shockT > 0)             { desired = 'Shocked'; urgent = true; }
    else if (this.dazeT > 0)                                   { desired = 'Dazed'; }
    else if (this.proudT > 0)                                  { desired = 'Proud'; urgent = true; }
    else if (this.loveT > 0)                                   { desired = 'Love'; urgent = true; }
    else if (this.stubbornT > 0)                               { desired = 'Stubborn'; urgent = true; }
    else if (this.huffT > 0)                                   { desired = 'Hmpf'; urgent = true; }
    else if (this.happiness < 0.22)                            { desired = 'Ignoring'; }
    else if (this.happiness < 0.36)                            { desired = 'Pouting'; }
    else if (this.skepticT > 0)                                { desired = 'Skeptic'; }
    else if (stretching)                                       { desired = 'Stretching'; urgent = true; }
    else if (zoomies)                                          { desired = 'Zoomies'; urgent = true; }
    else if (begging)                                          { desired = 'Begging'; }
    else if (hungryBowl)                                       { desired = 'Hungry'; }
    else if (sleepy)                                           { desired = 'Sleepy'; }
    else if (stuffed)                                          { desired = 'Stuffed'; }
    else if (this.happyT > 0)                                  { desired = 'Happy'; }
    else if (sniffing)                                         { desired = 'Sniffing'; }
    else if (chasing)                                          { desired = 'Curious'; }
    else if (bored)                                            { desired = 'Bored'; }

    if (desired !== this.current && (urgent || this.holdT <= 0)) {
      this.current = desired;
      this.holdT = (desired === 'Zufrieden' || desired === 'Curious' || desired === 'Sniffing') ? 0.25 : 0.45;
      this.eyePop = 1.0;
    }

    // Passende Augen, Mund, Zunge, Brauen, Flugzeugohren & Effekte je Emotion!
    let eyeMode = 'Button', mouthMode = 'happy', browMode = 'normal';
    let tongue = false, frown = false, wantPlane = 0, cheekPuff = 0;

    switch (this.current) {
      case 'Eating':
        eyeMode = 'Happy'; mouthMode = 'open'; wantPlane = 0.38; break;
      case 'Wince':
        eyeMode = 'Wince'; mouthMode = 'growl'; browMode = 'angry'; frown = true; wantPlane = 0.65; break;
      case 'Shocked':
        eyeMode = 'Shocked'; mouthMode = 'open'; browMode = 'shock'; break;
      case 'Dazed':
        eyeMode = 'Closed'; mouthMode = 'normal'; wantPlane = 0.70; break;
      case 'Proud':
        // Stolz: Brust raus, aufrechte stolze Ohren (leicht angewinkelt), strahlendes Grinsen + Glitzer ✦!
        eyeMode = 'Happy'; mouthMode = 'happy'; tongue = false; wantPlane = 0.22; break;
      case 'Love':
        // Verliebt: Große rote Herzchen-Augen ❤️❤️ + Flugzeugohren + rosa Wangen!
        eyeMode = 'Heart'; mouthMode = 'happy'; tongue = true; wantPlane = 0.88; break;
      case 'Happy':
        eyeMode = 'Happy'; mouthMode = 'happy'; tongue = this.lipLickT > 0 || this.happiness > 0.80; wantPlane = 0.88; break;
      case 'Stubborn':
        // Sturkopf: weigert sich beim Streicheln/Rufen -> geduckt, Schmollaugen, angelegte Ohren!
        eyeMode = 'Pout'; mouthMode = 'hmpf'; browMode = 'angry'; frown = true; cheekPuff = 0.85; wantPlane = 0.68; break;
      case 'Zoomies':
        eyeMode = 'BigCute'; mouthMode = 'happy'; tongue = true; wantPlane = 0.94; break;
      case 'Stretching':
        eyeMode = 'Closed'; mouthMode = 'open'; wantPlane = 0.72; break;
      case 'Sniffing':
        eyeMode = 'Button'; mouthMode = 'normal'; wantPlane = 0.14; break;
      case 'Hungry':
        eyeMode = 'SadPuppy'; mouthMode = 'normal'; browMode = 'sad'; wantPlane = 0.74; break;
      case 'Bored':
        eyeMode = 'SideEye'; mouthMode = 'flat'; browMode = 'skeptic'; wantPlane = 0.24; break;
      case 'Hmpf':
        eyeMode = 'Pout'; mouthMode = 'hmpf'; browMode = 'angry'; frown = true; cheekPuff = 1.0; wantPlane = 0.55; break;
      case 'Pouting':
        eyeMode = 'Pout'; mouthMode = 'normal'; browMode = 'angry'; frown = true; wantPlane = 0.40; break;
      case 'Ignoring':
        eyeMode = this.throwSpam > 2.2 ? 'Huffy' : 'SideEye';
        mouthMode = 'hmpf'; browMode = 'angry'; cheekPuff = 0.75; wantPlane = 0.50; break;
      case 'Skeptic':
        eyeMode = 'Skeptic'; mouthMode = 'flat'; browMode = 'skeptic'; break;
      case 'Begging':
        eyeMode = 'SadPuppy'; mouthMode = 'normal'; browMode = 'sad'; wantPlane = 0.82; break;
      case 'Curious':
        eyeMode = 'BigCute'; mouthMode = 'happy'; tongue = ball.carried || ball.fetchState === 'chasing'; break;
      case 'Stuffed':
        eyeMode = 'Happy'; mouthMode = 'happy'; wantPlane = 0.48; break;
      case 'Sleepy':
        eyeMode = 'Closed'; mouthMode = 'normal'; wantPlane = 0.82;
        this.zzzT -= dt;
        if (this.zzzT <= 0) { this.zzzT = 1.45; fx.spawnZzz(body.x, body.y, body.z); }
        break;
      default: // 'Zufrieden' — offene glänzende Augen folgen dem Cursor, sonst warmes Lächeln!
        eyeMode = (ptr.cursorActiveT > 0.15) ? 'Button' : (this.happiness > 0.64 ? 'Happy' : 'Button');
        mouthMode = this.happiness > 0.50 ? 'happy' : 'normal';
        tongue = this.lipLickT > 0;
        break;
    }

    // Natürliches Blinzeln bei offenen Augen
    if (eyeMode === 'BigCute' || eyeMode === 'Button') {
      this.blinkT -= dt;
      if (this.blinkT < 0) {
        if (this.blinkT > -0.13) eyeMode = 'Closed';
        else this.blinkT = 2.6 + Math.random() * 2.8;
      }
    }

    const wantBlush = (this.current === 'Love' || this.current === 'Happy' || this.current === 'Proud' || this.current === 'Zoomies') ? 0.68
      : (this.current === 'Stuffed' ? 0.44 : 0);
    this.blush = lerp(this.blush, wantBlush, Math.min(1, dt * 5));

    const wantAnger = (this.current === 'Wince' || this.current === 'Hmpf' || this.current === 'Stubborn' || this.happiness < 0.25) ? 1 : 0;
    this.angerMark = lerp(this.angerMark, wantAnger, Math.min(1, dt * 7));

    const wantSweat = (this.current === 'Shocked' || this.current === 'Dazed') ? 1 : 0;
    this.sweat = lerp(this.sweat, wantSweat, Math.min(1, dt * 8));

    // HUD über App-Callback aktualisieren (gedrosselt auf ~10 Hz)
    if (now - lastMoodEmit > 100) {
      lastMoodEmit = now;
      emitMood({ current: this.current, happiness: this.happiness, fullness: this.fullness });
    }

    return {
      eyeMode, mouthMode, browMode, tongue, frown, wantPlane, cheekPuff,
      sleepy, stuffed, chewing: treat.eating || bowl.eating,
      proud: this.current === 'Proud', stubborn: this.current === 'Stubborn',
      zoomies, stretching, sniffing, hungryBowl, bored, begging,
      excited: this.current === 'Proud' || this.current === 'Love' || this.current === 'Happy' || zoomies || chasing,
      ignoring: this.current === 'Ignoring',
    };
  },
};

function onShibaTap() {
  if (brain.state === 'nap') {
    mood.wakeUp();
    brain.interrupt(true);
    emitHaptic('tap');
    return;
  }
  brain.interrupt(false);
  const r = mood.tap(performance.now());
  if (r === 'happy') {
    sfx.yip();
    emitHaptic('tap');
    emitCare('pet');
    if (body.onFloor && mood.fullness < 0.85) body.vy += 4.0;
    soft.jvy -= 4.8; soft.jvx += 4.0; soft.bvx += 3.4;
    soft.earLV += 8; soft.earRV += 8; soft.tailWV += 13;
    fx.spawnHearts(body.x, body.y + 0.14, body.z, 2);
  } else {
    sfx.huff();
    emitHaptic('huff');
    if (body.onFloor) body.vy += 1.5;
    soft.jvy -= 3.6; soft.jvx += 3.0; soft.shvX += (Math.random() - 0.5) * 10;
    soft.earLV += 10; soft.earRV += 10; soft.tailWV += 9;
  }
}

// =============================================================================
// Steuerung über App-Shell
// =============================================================================
function setCoatById(id, silent = false) {
  const idx = COAT_LIST.findIndex(c => c.id === id);
  if (idx < 0) return;
  coatIdx = idx;
  shiba.setCoat(COAT_LIST[coatIdx]);
  if (!silent) { soft.jvy -= 3.2; soft.jvx += 2.6; sfx.hop(); }
}

function setAccessoryById(id, silent = false) {
  shiba.setAccessory(id || 'none');
  if (!silent) {
    soft.jvy -= 3.0; soft.jvx += 2.4;
    fx.spawnSparkles(body.x, body.y + 0.35, body.z, 4);
    sfx.hop();
  }
}

function setBallEnabled(enabled, silent = false) {
  ball.enabled = Boolean(enabled);
  if (!ball.enabled) { ball.carried = false; ball.fetchState = 'idle'; }
  toy.mesh.visible = ball.enabled; ballShadow.mesh.visible = ball.enabled;
  if (ball.enabled) {
    Object.assign(ball, {
      x: silent ? 1.08 : (body.x > 0 ? -0.92 : 0.96),
      y: silent ? toy.r : 1.05,
      z: silent ? 1.05 : 0.72,
      vx: 0, vy: 0, vz: 0, ox: 0, oy: 0, oz: 0, carried: false, fetchState: 'idle',
    });
  }
}

function setSoundEnabled(enabled) {
  sfx.enabled = Boolean(enabled);
}

function setAmbientRain(on) {
  sfx.setAmbientRain(on);
}

function setFocusMode(active) {
  focusMode = Boolean(active);
  if (focusMode) {
    if (ball.carried) dropCarriedBall(false);
    ball.fetchState = 'idle';
    mood.happiness = Math.max(mood.happiness, 0.65);
    mood.huffT = 0; mood.stubbornT = 0;
    brain.sendToCushion();
  } else if (brain.state === 'nap') {
    brain.interrupt(true);
  }
}

function celebrateFocus() {
  focusMode = false;
  sfx.setAmbientRain(false);
  mood.wakeUp();
  brain.interrupt(false);
  mood.happiness = 1.0;
  mood.proudT = 3.8;
  mood.loveT = 3.2;
  sfx.focusDoneChord();
  emitHaptic('celebrate');
  if (body.onFloor) body.vy += 4.6;
  soft.jvy -= 5.2; soft.jvx += 4.4; soft.tailWV += 15;
  fx.spawnSparkles(body.x, body.y + 0.25, body.z, 10);
  fx.spawnHearts(body.x, body.y + 0.18, body.z, 7);
}

function setTiltGravity(gx, gz) {
  motion.targetGx = clamp(Number.isFinite(gx) ? gx : 0, -1, 1);
  motion.targetGz = clamp(Number.isFinite(gz) ? gz : 0, -1, 1);
}

function triggerShake(intensity = 1) {
  const now = performance.now();
  if (focusMode || ptr.grabbed === 'shiba' || now - motion.lastShakeAt < 900) return;
  motion.lastShakeAt = now;
  const pow = clamp(Number.isFinite(intensity) ? intensity : 1, 0.5, 1.5);
  mood.wakeUp();
  brain.interrupt(false);
  mood.shockT = Math.max(mood.shockT, 0.85);
  const ang = Math.random() * Math.PI * 2;
  body.vx += Math.cos(ang) * (1.8 + pow * 1.1);
  body.vz += Math.sin(ang) * (1.8 + pow * 1.1);
  body.vy = Math.max(body.vy, 3.8 + pow * 1.4);
  soft.jvy -= 4.8; soft.jvx += 4.2; soft.earLV += 9; soft.earRV += 9; soft.tailWV += 14;
  sfx.yip();
  emitHaptic('impact');
  fx.spawnDust(body.x, 0.05, body.z, 4);
  if (ball.enabled && !ball.carried && ptr.grabbed !== 'ball') {
    ball.vy += 3.2 + pow * 1.1;
    ball.vx += (Math.random() - 0.5) * 3.4;
    ball.vz += (Math.random() - 0.5) * 3.4;
  }
}

function resetScene() {
  Object.assign(body, { x: 0.0, y: RY + 0.02, z: 0.20, vx: 0, vy: 0, vz: 0, ox: 0, oy: 0, oz: 0, onFloor: true, wallPress: 0 });
  body.quat.identity();
  Object.assign(ball, { x: 1.08, y: toy.r, z: 1.05, vx: 0, vy: 0, vz: 0, ox: 0, oy: 0, oz: 0, carried: false, playerThrown: false, fetchState: 'idle' });
  ball.quat.identity();
  treat.active = false; treat.eating = false; treatMeshes.root.visible = false; treatShadow.mesh.visible = false;
  bowl.food = 0; bowl.eating = false; bowlMesh.foodGroup.visible = false;
  camCtrl.targetYaw = 0.42; camCtrl.targetPitch = 0.09; camCtrl.zoomScale = 1.0;
  motion.gx = motion.gz = motion.targetGx = motion.targetGz = motion.wx = motion.wz = 0;
  Object.assign(mood, {
    happiness: 0.68, fullness: 0.22, throwSpam: 0,
    happyT: 0, loveT: 0, proudT: 0, yumT: 0, eatingBowlT: 0,
    winceT: 0, dazeT: 0, skepticT: 0, huffT: 0, stuffedT: 0,
    stubbornT: 0, shockT: 0, lipLickT: 0, petStreak: 0, stubbornResists: 0, stubbornCalls: 0,
  });
  Object.assign(brain, { state: 'idle', timer: 3.4, energy: 0.85, boredom: 0.15, bowlBegged: false, stuckT: 0 });
  mood.wakeUp();
  soft.jvy -= 3.2; soft.jvx += 2.6;
}

// =============================================================================
// 3D-Physik-Schritt & Hauptschleife
// =============================================================================
const M = new THREE.Matrix4(), Minv = new THREE.Matrix4(), Tc = new THREE.Matrix4(), Rm = new THREE.Matrix4();
const _localUp = new THREE.Vector3(), _localFwd = new THREE.Vector3(), _worldUp = new THREE.Vector3(0, 1, 0);
const _tgtDir = new THREE.Vector3(), _cross = new THREE.Vector3(), _grabGoalQ = new THREE.Quaternion();

let time = 0, lookX = 0, lookY = 0, prevVx = 0, prevVy = 0, prevVz = 0, lastImpactSfx = 0;
let smoothBreath = 0, smoothBulge = 0, smoothCheek = 0, smoothStretch = 0, smoothPitch = 0, smoothRoll = 0;

function stepPhysics3D(dt, moodFlags) {
  const SUB = Math.min(5, Math.max(3, Math.ceil(dt * 180))), h = dt / SUB;
  body.onFloor = false;
  let maxPress = 0;

  for (let i = 0; i < SUB; i++) {
    ballHitCooldown = Math.max(0, ballHitCooldown - h);

    if (ptr.grabbed === 'shiba') {
      _v1.copy(ptr.grabLocal).applyQuaternion(body.quat);
      const dx = ptr.dragPos.x - (body.x + _v1.x);
      const dy = ptr.dragPos.y - (body.y + _v1.y);
      const dz = ptr.dragPos.z - (body.z + _v1.z);
      // Shiba-Sturkopf / kugelrund satt -> spürbar schwerer beim Hochheben!
      const stubborn = (mood.happiness < 0.34 || mood.fullness >= 0.85);
      const kLift = stubborn ? 98 : 125;
      body.vx += ((kLift*dx - 14.5*body.vx)/MASS)*h;
      body.vy += (((kLift*dy - 14.5*body.vy)/MASS) - G*(stubborn ? 0.56 : 0.42))*h;
      body.vz += ((kLift*dz - 14.5*body.vz)/MASS)*h;

      const swayR = clamp(-body.vx * 0.036, -0.34, 0.34), swayP = clamp(body.vy * 0.018, -0.18, 0.18);
      _tmpEuler.set(swayP, 0, swayR);
      _dq.setFromEuler(_tmpEuler);
      _grabGoalQ.copy(ptr.grabQuat).multiply(_dq);
      _qErr.copy(_grabGoalQ).multiply(_qInv.copy(body.quat).invert());
      if (_qErr.w < 0) _qErr.set(-_qErr.x, -_qErr.y, -_qErr.z, -_qErr.w);
      body.ox += (_qErr.x*95 - body.ox*13)*h;
      body.oy += (_qErr.y*95 - body.oy*13)*h;
      body.oz += (_qErr.z*95 - body.oz*13)*h;
    } else {
      body.vy -= G * h;
      if (!focusMode) {
        // Handy-Neigung als sanfte laterale Schwerkraft -> Shiba gleitet & rollt organisch mit!
        body.vx += motion.wx * 12.5 * h;
        body.vz += motion.wz * 12.5 * h;
      }
      body.vx *= 1 - 0.14*h; body.vz *= 1 - 0.14*h;
      body.ox *= 1 - 0.45*h; body.oy *= 1 - 0.65*h; body.oz *= 1 - 0.45*h;
    }

    body.x += body.vx*h; body.y += body.vy*h; body.z += body.vz*h;

    const omLen = Math.hypot(body.ox, body.oy, body.oz);
    if (omLen > 1e-4) {
      _dq.setFromAxisAngle(_v1.set(body.ox/omLen, body.oy/omLen, body.oz/omLen), Math.min(omLen, 14)*h);
      body.quat.premultiply(_dq).normalize();
    }

    const shibaCushY = cushionSurfaceY(body.x, body.z);
    const pF = softWallCollide3D( 0, 1, 0,  room.floor + shibaCushY, h);
    const pC = softWallCollide3D( 0,-1, 0, -room.ceil,  h);
    const pL = softWallCollide3D( 1, 0, 0, -room.halfW, h);
    const pR = softWallCollide3D(-1, 0, 0, -room.halfW, h);
    const pB = softWallCollide3D( 0, 0, 1, -room.halfD, h);
    const pN = softWallCollide3D( 0, 0,-1, -room.halfD, h);
    if (pF > 0) body.onFloor = true;
    maxPress = Math.max(maxPress, pF, pC, pL, pR, pB, pN);

    stepBall3D(h);
    collideWithBowl3D(h);
    collideShibaAndBall3D(h);

    if (body.onFloor && ptr.grabbed !== 'shiba') {
      _localUp.set(0, 1, 0).applyQuaternion(body.quat);
      _cross.crossVectors(_localUp, _worldUp);
      if (_localUp.y < -0.92 && _cross.lengthSq() < 0.02) _cross.set(0, 0, 0.8);
      body.ox += (_cross.x*26 - body.ox*4.4)*h;
      body.oz += (_cross.z*26 - body.oz*4.4)*h;

      // Blick-Ausrichtung zu aktivem Ziel (Leckerli -> Napf -> Ball -> Eigenleben -> Satt/Hungrig zur Kamera!)
      let turnTarget = null;
      if (treat.active && !treat.eating) turnTarget = _v3.set(treat.x, 0, treat.z);
      else if (bowl.eating || (bowl.food > 0.05 && mood.fullness < 0.84 && mood.happiness >= 0.20)) turnTarget = _v3.set(bowl.x, 0, bowl.z);
      else if (ball.fetchState === 'chasing') turnTarget = _v3.set(ball.x, 0, ball.z);
      else if (ball.carried) turnTarget = _v3.set(0.15, 0, 0.65);
      else if (moodFlags && moodFlags.ignoring) turnTarget = _v3.set(body.x - 1.5, 0, body.z - 1.2);
      else if (moodFlags && (moodFlags.stuffed || moodFlags.proud || mood.lipLickT > 0)) turnTarget = _v3.set(camera.position.x, 0, camera.position.z);
      else if (brain.state === 'playBall' && ball.enabled) turnTarget = _v3.set(ball.x, 0, ball.z);
      else if (brain.state === 'checkBowl') turnTarget = brain.bowlBegged ? _v3.set(camera.position.x, 0, camera.position.z) : _v3.set(bowl.x, 0, bowl.z);
      else if (brain.state === 'wander' || brain.state === 'zoomies' || brain.state === 'goToCushion' || brain.state === 'comeToSpot') {
        turnTarget = _v3.set(brain.targetX, 0, brain.targetZ);
      } else if (brain.state === 'nap') {
        turnTarget = _v3.set(camera.position.x * 0.4, 0, camera.position.z);
      } else if (ptr.cursorActiveT > 0.1 && !(moodFlags && (moodFlags.sleepy || moodFlags.bored))) {
        // Sanftes Mitdrehen zum Mauszeiger im wachen Idle!
        turnTarget = _v3.set(ptr.hoverWorld.x, 0, ptr.hoverWorld.z);
      }

      if (turnTarget && brain.state !== 'nestSpin') {
        _localFwd.set(0, 0, 1).applyQuaternion(body.quat); _localFwd.y = 0;
        if (_localFwd.lengthSq() > 0.02) {
          _localFwd.normalize();
          _tgtDir.set(turnTarget.x - body.x, 0, turnTarget.z - body.z);
          if (_tgtDir.lengthSq() > 0.04) {
            _tgtDir.normalize();
            const yawErr = Math.atan2(_localFwd.z*_tgtDir.x - _localFwd.x*_tgtDir.z, _localFwd.x*_tgtDir.x + _localFwd.z*_tgtDir.z);
            const isIdleLook = brain.state === 'idle' && !treat.active && !bowl.eating && ball.fetchState === 'idle' && !(moodFlags && (moodFlags.ignoring || moodFlags.stuffed || moodFlags.proud));
            const turnGain = brain.state === 'nap' ? 5.5 : isIdleLook ? 3.8 : 15;
            body.oy += (yawErr * turnGain - body.oy * 4.2) * h;
          }
        }
      } else if (brain.state !== 'nestSpin') {
        body.oy *= 1 - 3.6 * h;
      }

      const floorDrag = (moodFlags && (moodFlags.stuffed || moodFlags.sleepy)) ? 2.6 : 1.3;
      body.vx *= 1 - floorDrag * h; body.vz *= 1 - floorDrag * h;
    }
  }
  body.wallPress = maxPress;
}

let lastMoodOut = null;

function frame(dt) {
  time += dt;
  if (ptr.down && !ptr.grabbed && ptr.mode === 'shiba' && performance.now() - ptr.t0 > 260) startShibaGrab();

  // Handy-Kipp-Eingabe sanft glätten & relativ zur aktuellen Kamera-Richtung auf XZ-Ebene abbilden
  const mAlpha = Math.min(1, dt * 8.0);
  motion.gx = lerp(motion.gx, focusMode ? 0 : motion.targetGx, mAlpha);
  motion.gz = lerp(motion.gz, focusMode ? 0 : motion.targetGz, mAlpha);
  const cosY = Math.cos(camCtrl.yaw), sinY = Math.sin(camCtrl.yaw);
  motion.wx = cosY * motion.gx + sinY * motion.gz;
  motion.wz = -sinY * motion.gx + cosY * motion.gz;
  if (!focusMode && Math.hypot(motion.gx, motion.gz) > 0.28) {
    mood.wakeUp();
    if (brain.state === 'nap') brain.interrupt(false);
  }

  prevVx = body.vx; prevVy = body.vy; prevVz = body.vz;
  stepPhysics3D(dt, lastMoodOut);

  const speed = Math.hypot(body.vx, body.vy, body.vz);
  const ax = clamp((body.vx - prevVx)/Math.max(dt, 1/120), -180, 180);
  const ay = clamp((body.vy - prevVy)/Math.max(dt, 1/120), -180, 180);
  const az = clamp((body.vz - prevVz)/Math.max(dt, 1/120), -180, 180);
  _qInv.copy(body.quat).invert();
  const aLoc = _v1.set(ax, ay, az).applyQuaternion(_qInv);

  // 1. Aufprall-Ereignisse
  let hardest = null;
  for (const ev of events) if (!hardest || ev.speed > hardest.speed) hardest = ev;
  events.length = 0;

  if (hardest) {
    const nLoc = _v2.set(hardest.nx, hardest.ny, hardest.nz).applyQuaternion(_qInv);
    const isBall = hardest.kind === 'ball';
    const imp = clamp(hardest.speed * (isBall ? 0.52 : 0.42), 0.45, 6.2);
    soft.jvx += (Math.abs(nLoc.y) - Math.abs(nLoc.x))*imp*1.4;
    soft.jvy += (Math.abs(nLoc.x) + Math.abs(nLoc.z)*0.7 - Math.abs(nLoc.y))*imp*1.35;
    soft.bvx += nLoc.y*imp*1.15; soft.bvy += nLoc.x*imp*1.15;
    soft.earLV += imp*2.1; soft.earRV += imp*1.9;
    soft.tailCV += imp*2.2; soft.tailWV += (Math.random()-0.5)*imp*4.2;

    if (isBall) {
      _v3.set(hardest.rxLocal, hardest.ryLocal, hardest.rzLocal).applyQuaternion(_qInv);
      soft.dentX = _v3.x; soft.dentY = _v3.y; soft.dentZ = _v3.z;
      soft.dentV += clamp(hardest.speed * 0.55, 0.5, 4.2);
    }
    const now = performance.now();
    if (now - lastImpactSfx > 75) {
      lastImpactSfx = now;
      if (isBall) {
        sfx.ballHit(hardest.speed);
        if (hardest.speed > 1.8) emitHaptic('ballHit');
      } else {
        sfx.bounce(hardest.speed);
        if (hardest.speed > 7.5) emitHaptic('impactHeavy');
        else if (hardest.speed > 3.0) emitHaptic('impact');
      }
    }
    if (hardest.speed > (isBall ? 2.6 : 5.0)) {
      fx.spawnImpact(hardest.cx, hardest.cy, hardest.cz, hardest.nx, hardest.ny, hardest.speed);
      if (hardest.speed > 4.8) soft.camShake = Math.min(0.10, hardest.speed * 0.0045);
    } else if (!isBall && hardest.ny > 0.6 && hardest.speed > 2.2) {
      fx.spawnDust(hardest.cx, 0.04, hardest.cz, 3);
    }
    mood.impact(hardest.speed, hardest.kind);
  }

  // 2. Softbody-Trägheit & Teig-Ziehen
  soft.shvX += (-aLoc.x*0.055)*dt*16; soft.shvZ += (-aLoc.z*0.055)*dt*16;
  soft.bvx  += (-aLoc.y*0.042)*dt*16; soft.bvy  += (-aLoc.x*0.036)*dt*16;

  if (ptr.grabbed === 'shiba') {
    _v2.copy(ptr.grabLocal).applyQuaternion(body.quat).add(_v3.set(body.x, body.y, body.z));
    _v3.copy(ptr.dragPos).sub(_v2).applyQuaternion(_qInv);
    const tx = clamp(_v3.x*0.44,-0.32,0.32), ty = clamp(_v3.y*0.44,-0.32,0.32), tz = clamp(_v3.z*0.44,-0.32,0.32);
    soft.pvx += (170*(tx - soft.pullX) - 14*soft.pvx)*dt;
    soft.pvy += (170*(ty - soft.pullY) - 14*soft.pvy)*dt;
    soft.pvz += (170*(tz - soft.pullZ) - 14*soft.pvz)*dt;
    sfx.squish(body.wallPress);
    if (body.wallPress > 0.14) emitHaptic('squish');
  } else {
    soft.pvx += (-200*soft.pullX - 9.5*soft.pvx)*dt;
    soft.pvy += (-200*soft.pullY - 9.5*soft.pvy)*dt;
    soft.pvz += (-200*soft.pullZ - 9.5*soft.pvz)*dt;
  }
  soft.pullX = clamp(soft.pullX+soft.pvx*dt,-0.36,0.36);
  soft.pullY = clamp(soft.pullY+soft.pvy*dt,-0.36,0.36);
  soft.pullZ = clamp(soft.pullZ+soft.pvz*dt,-0.36,0.36);

  const stepSpring = (val, vel, k, c) => { const nv = vel + (-k*val - c*vel)*dt; return [val + nv*dt, nv]; };
  [soft.jx, soft.jvx] = stepSpring(soft.jx, soft.jvx, 155, 5.8);
  [soft.jy, soft.jvy] = stepSpring(soft.jy, soft.jvy, 155, 5.8);
  [soft.shearX, soft.shvX] = stepSpring(soft.shearX, soft.shvX, 125, 5.6);
  [soft.shearZ, soft.shvZ] = stepSpring(soft.shearZ, soft.shvZ, 125, 5.6);
  [soft.bendX, soft.bvx]   = stepSpring(soft.bendX, soft.bvx, 118, 5.2);
  [soft.bendY, soft.bvy]   = stepSpring(soft.bendY, soft.bvy, 118, 5.2);
  [soft.dentAmp, soft.dentV] = stepSpring(soft.dentAmp, soft.dentV, 180, 7.2);

  soft.jx = clamp(soft.jx,-0.34,0.38); soft.jy = clamp(soft.jy,-0.34,0.38);
  soft.shearX = clamp(soft.shearX,-0.55,0.55); soft.shearZ = clamp(soft.shearZ,-0.55,0.55);
  soft.bendX = clamp(soft.bendX,-0.68,0.68); soft.bendY = clamp(soft.bendY,-0.68,0.68);
  soft.dentAmp = clamp(soft.dentAmp,-0.14,0.24);

  const targetSt = (!body.onFloor || ptr.grabbed === 'shiba') ? clamp(speed * 0.014, 0, 0.22) : 0;
  soft.stretch += (targetSt - soft.stretch) * Math.min(1, dt * 11);
  if (speed > 0.7) {
    _v2.set(body.vx/speed, body.vy/speed, body.vz/speed).applyQuaternion(_qInv).normalize();
    soft.stX = lerp(soft.stX, _v2.x, Math.min(1, dt*12));
    soft.stY = lerp(soft.stY, _v2.y, Math.min(1, dt*12));
    soft.stZ = lerp(soft.stZ, _v2.z, Math.min(1, dt*12));
    const sl = Math.hypot(soft.stX, soft.stY, soft.stZ) || 1;
    soft.stX /= sl; soft.stY /= sl; soft.stZ /= sl;
  }

  // 3. Basis-Matrix & Emotionen + sanfte Mikro-Animationen (Null Sprünge!)
  const now = performance.now();
  const shJit = mood.shake > 0 ? Math.sin(time * 70) * 0.028 * mood.shake : 0;
  M.makeTranslation(body.x + shJit, body.y, body.z)
    .multiply(Rm.makeRotationFromQuaternion(body.quat))
    .multiply(Tc.makeTranslation(0, -shiba.centerY, 0));
  Minv.copy(M).invert();

  const moodOut = mood.update(dt, now, speed, body.wallPress);
  lastMoodOut = moodOut;

  // Schläfrig = gemütlicher Sploot-Squish, Stur = geduckter Sturkopf, Satt = runder Bauch!
  const breathFreq = moodOut.sleepy ? 1.3 : moodOut.stuffed ? 1.5 : moodOut.zoomies ? 4.2 : 2.3;
  const breathAmp  = moodOut.sleepy ? 0.16 : moodOut.stuffed ? 0.13 : 0.075;
  const baseSquish = moodOut.sleepy ? 0.36 : moodOut.stubborn ? 0.28 : moodOut.stuffed ? 0.24 : 0;
  const targetBreath = (body.onFloor && ptr.grabbed !== 'shiba')
    ? (Math.sin(time * breathFreq) * 0.5 + 0.5) * breathAmp + baseSquish : 0;
  smoothBreath = lerp(smoothBreath, targetBreath, Math.min(1, dt * 6.5));

  const targetBulge = moodOut.stuffed ? 1.0 : clamp((mood.fullness - 0.5) * 1.4, 0, 0.7);
  smoothBulge = lerp(smoothBulge, targetBulge, Math.min(1, dt * 4.5));
  smoothCheek = lerp(smoothCheek, moodOut.cheekPuff, Math.min(1, dt * 8.0));

  const targetStretch = moodOut.stretching ? Math.sin(clamp(1 - brain.timer / 1.35, 0, 1) * Math.PI) * 0.92 : 0;
  smoothStretch = lerp(smoothStretch, targetStretch, Math.min(1, dt * 8.5));

  // Organische Kopfneigung: Napf-Eintauchen + Aufschauen, Stolz Brust raus, Cursor-Tilt, Watscheln!
  let targetPitch = 0, targetRoll = 0;
  if (bowl.eating) {
    // Rhythmisches Eintauchen in den Napf & fröhliches Hochschauen beim Kauen + Tippy-Taps!
    const chomp = Math.sin(bowl.eatTimer * 7.8) * 0.5 + 0.5;
    targetPitch = 0.09 + chomp * 0.32;
    targetRoll = Math.sin(bowl.eatTimer * 15.6) * 0.12;
  } else if (moodOut.proud) {
    targetPitch = -0.15; // stolz erhobener Kopf!
    targetRoll = Math.sin(time * 5.0) * 0.05;
  } else if (moodOut.sniffing) {
    targetPitch = 0.22 + Math.sin(time * 13) * 0.05;
    targetRoll = brain.tiltSign * 0.14;
  } else if (moodOut.begging || moodOut.hungryBowl) {
    targetPitch = -0.10;
    targetRoll = brain.tiltSign * 0.20;
  } else if (moodOut.bored) {
    targetRoll = -0.10;
  } else if (moodOut.stuffed) {
    targetRoll = Math.sin(time * 1.6) * 0.07; // träges zufriedenes Schaukeln!
  } else if (speed > 0.6 && body.onFloor) {
    targetRoll = Math.sin(time * (moodOut.zoomies ? 18 : 11)) * clamp(speed * 0.045, 0, 0.14);
  } else if (ptr.cursorActiveT > 0.2 && !moodOut.sleepy && !moodOut.ignoring && !moodOut.stubborn) {
    // Leichter aufmerksamer Kopf-Tilt zur Cursor-Richtung!
    targetRoll = clamp(-lookX * 0.14, -0.14, 0.14);
    targetPitch = clamp(-lookY * 0.09, -0.10, 0.10);
  }
  smoothPitch = lerp(smoothPitch, targetPitch, Math.min(1, dt * 8.5));
  smoothRoll  = lerp(smoothRoll,  targetRoll,  Math.min(1, dt * 7.5));

  shiba.deformBody({
    jx: soft.jx, jy: soft.jy, shearX: soft.shearX, shearZ: soft.shearZ, bendX: soft.bendX, bendY: soft.bendY,
    stretch: soft.stretch, stLocalX: soft.stX, stLocalY: soft.stY, stLocalZ: soft.stZ,
    pullActive: Math.hypot(soft.pullX, soft.pullY, soft.pullZ) > 0.002,
    grabX: ptr.grabLocal.x, grabY: ptr.grabLocal.y, grabZ: ptr.grabLocal.z,
    pullX: soft.pullX, pullY: soft.pullY, pullZ: soft.pullZ,
    dentAmp: soft.dentAmp, dentX: soft.dentX, dentY: soft.dentY, dentZ: soft.dentZ,
    cheekPuff: smoothCheek, fullnessBulge: smoothBulge, bodyStretch: smoothStretch,
    headPitch: smoothPitch, headRoll: smoothRoll,
    breath: smoothBreath, bodyX: body.x, bodyY: body.y, bodyZ: body.z,
  }, M, Minv, roundBox, ball);

  shiba.root.matrix.copy(M);
  shiba.root.matrixWorldNeedsUpdate = true;
  shiba.root.updateMatrixWorld(true);

  // Kissen-Weichheit aktualisieren wenn Shiba oder Ball darauf liegt
  const dCush = Math.hypot((body.x - cushion.x) / cushion.rx, (body.z - cushion.z) / cushion.rz);
  const shibaWeight = (body.onFloor && ptr.grabbed !== 'shiba' && dCush < 0.95)
    ? (1 - dCush * 0.6) * (moodOut.sleepy ? 0.92 : 0.65) : 0;
  cushion.targetSquish = Math.max(shibaWeight, cushion.targetSquish - dt * 2.4);
  cushion.squish = lerp(cushion.squish, cushion.targetSquish, Math.min(1, dt * 10));
  cushionMesh.setSquish(cushion.squish);

  // KI-Updates (Napf, Apportieren, Knochen/Keks & Autonomes Eigenleben!)
  updateTreat(dt);
  updateBowlBehavior(dt);
  updateFetchBehavior(dt);
  brain.update(dt, now);

  // 4. Augen-Blickverfolgung (inkl. lebendiger Maus-Wahrnehmung im Idle!)
  let tgtLX = 0, tgtLY = 0, lookTarget = null;
  const ballSpeed = Math.hypot(ball.vx, ball.vy, ball.vz);
  if (treat.active) lookTarget = _v3.set(treat.x, treat.y, treat.z);
  else if (bowl.food > 0.05 && !moodOut.stuffed) lookTarget = _v3.set(bowl.x, 0.22, bowl.z);
  else if (ball.enabled && !ball.carried && (ptr.grabbed === 'ball' || ballSpeed > 0.55 || ball.fetchState === 'chasing' || brain.state === 'playBall')) {
    lookTarget = _v3.set(ball.x, ball.y, ball.z);
  } else if (!moodOut.sleepy && !moodOut.ignoring && !moodOut.bored) {
    // Lebendiges Augen-Verfolgen des Mauszeigers in alle Richtungen (links, rechts, oben, unten)!
    lookTarget = _v3.set(ptr.hoverWorld.x, ptr.hoverWorld.y, ptr.hoverWorld.z);
  }
  if (lookTarget) {
    _v2.copy(lookTarget).sub(_v1.set(body.x, body.y, body.z)).applyQuaternion(_qInv);
    if (_v2.z > -0.4) { tgtLX = clamp(_v2.x * 0.85, -1, 1); tgtLY = clamp(_v2.y * 0.85, -1, 1); }
  }
  lookX += (tgtLX - lookX) * Math.min(1, dt * 11);
  lookY += (tgtLY - lookY) * Math.min(1, dt * 11);

  const pop = Math.sin(mood.eyePop * Math.PI);
  shiba.applyFace({
    eyeMode: moodOut.eyeMode, mouthMode: moodOut.mouthMode, browMode: moodOut.browMode,
    tongue: moodOut.tongue, frown: moodOut.frown,
    lookX, lookY, blush: mood.blush, angerMark: mood.angerMark, sweat: mood.sweat,
    eyeSX: 1 + pop * 0.14, eyeSY: 1 - pop * 0.42,
    chewPhase: moodOut.chewing ? time : 0,
  });

  // 5. Sekundär-Physik für echte Flugzeugohren & Kringelschwanz
  soft.planeAmt = lerp(soft.planeAmt, moodOut.wantPlane, Math.min(1, dt * 6.5));
  const earSlip = clamp(-body.vy * 0.035, -0.30, 0.45);
  soft.earLV += (135 * (earSlip - soft.earL) - 8.2 * soft.earLV - body.oz * 1.8) * dt;
  soft.earRV += (135 * (earSlip - soft.earR) - 8.2 * soft.earRV + body.oz * 1.8) * dt;
  soft.earL += soft.earLV * dt; soft.earR += soft.earRV * dt;
  shiba.applyEar(shiba.earL, soft.earL, soft.planeAmt);
  shiba.applyEar(shiba.earR, soft.earR, soft.planeAmt);

  const wagFreq = moodOut.zoomies ? 16.0 : moodOut.excited ? 12.5 : moodOut.sleepy || moodOut.stuffed ? 1.2 : moodOut.bored ? 1.6 : 3.4;
  const wagAmp  = moodOut.zoomies ? 0.98 : moodOut.excited ? 0.85 : moodOut.sleepy || moodOut.stuffed ? 0.08 : moodOut.bored ? 0.10 : 0.28;
  const baseWag = Math.sin(time * wagFreq) * wagAmp;
  const baseLift = moodOut.excited ? 0.65 : moodOut.stuffed || moodOut.bored ? -0.15 : 0.10;
  soft.tailWV += (115*(baseWag - soft.tailW) - 6.8*soft.tailWV - aLoc.x*0.12)*dt;
  soft.tailCV += (115*(baseLift - soft.tailC) - 6.8*soft.tailCV - aLoc.y*0.10)*dt;
  soft.tailW += soft.tailWV*dt; soft.tailC += soft.tailCV*dt;
  shiba.applyTail(clamp(soft.tailW, -1.1, 1.1), clamp(soft.tailC, -0.6, 1.1));

  // 6. Spielball & 3D-Bodenschatten
  if (ball.enabled) {
    toy.mesh.position.set(ball.x, ball.y, ball.z);
    toy.mesh.quaternion.copy(ball.quat);
    const bFloor = room.floor + cushionSurfaceY(ball.x, ball.z);
    const bh = Math.max(0, ball.y - ball.r - bFloor), bf = 1 / (1 + bh * 0.55);
    ballShadow.mesh.visible = !ball.carried;
    ballShadow.mesh.position.set(ball.x, bFloor + 0.002, ball.z);
    ballShadow.mesh.scale.set(ball.r * 1.15 * bf, 1, ball.r * 1.15 * bf);
    ballShadow.mat.uniforms.uOpacity.value = 0.70 * bf;
  }

  const sFloor = room.floor + cushionSurfaceY(body.x, body.z);
  const hgt = Math.max(0, body.y - RY - sFloor), f = 1 / (1 + hgt * 0.42);
  const wBoost = 1 + Math.max(0, soft.jx)*0.34 + body.wallPress*0.26 + smoothBulge*0.12 + (moodOut.sleepy ? 0.14 : 0);
  shibaShadow.mesh.position.set(body.x - lightDir.x * 0.22, sFloor + 0.002, body.z - lightDir.z * 0.12);
  shibaShadow.mesh.scale.set(0.88 * f * wBoost, 1, 0.70 * f * wBoost);
  shibaShadow.mat.uniforms.uOpacity.value = 0.84 * Math.min(1, f * 1.1);

  soft.camShake = Math.max(0, soft.camShake - dt * 0.45);
  updateCamera(dt, soft.camShake);
  cafeRoom.update(dt, time, focusMode, camera.position);
  fx.update(dt);
  renderer.render(scene, camera);
}

// Auf Mobile (120Hz ProMotion) auf geschmeidige ~60 FPS deckeln -> spart Hitze & verhindert Ruckler
const minFrameMs = isMobile ? 15.8 : 0;
let last = performance.now(), frameMs = 0;
const tickLoop = () => {
  if (paused) return;
  const now = performance.now();
  const elapsedMs = now - last;
  if (minFrameMs > 0 && elapsedMs < minFrameMs) return;
  const dt = Math.min(elapsedMs / 1000, 1 / 20);
  last = now;
  frame(dt);
  frameMs = performance.now() - now;
};
renderer.setAnimationLoop(tickLoop);

function setPaused(nextPaused) {
  paused = Boolean(nextPaused);
  sfx.syncAmbient();
  if (paused) {
    renderer.setAnimationLoop(null);
  } else {
    last = performance.now();
    renderer.setAnimationLoop(tickLoop);
  }
}

function destroy() {
  renderer.setAnimationLoop(null);
  window.removeEventListener('resize', resize);
  window.removeEventListener('pointerdown', unlockAudioOnce);
  window.removeEventListener('touchstart', unlockAudioOnce);
  window.removeEventListener('pointermove', onGlobalPointerMove);
  window.removeEventListener('pointerup', endPointer);
  window.removeEventListener('pointercancel', endPointer);
  canvas.removeEventListener('contextmenu', onContextMenu);
  canvas.removeEventListener('wheel', onWheel);
  canvas.removeEventListener('dblclick', onDblClick);
  canvas.removeEventListener('pointerdown', onCanvasPointerDown);
  canvas.removeEventListener('pointerleave', onPointerLeave);
  sfx.dispose();
  renderer.dispose();
  if (renderer.domElement.parentNode === container) {
    container.removeChild(renderer.domElement);
  }
}

const api = {
  setCoat: setCoatById,
  setAccessory: setAccessoryById,
  setBallEnabled,
  setSoundEnabled,
  setAmbientRain,
  setFocusMode,
  celebrateFocus,
  setTiltGravity,
  triggerShake,
  playUiTap: () => sfx.uiTap(),
  playUnlock: () => sfx.unlockChord(),
  fillBowl: fillFoodBowl,
  callShiba,
  startTreatDrag,
  reset: () => { camCtrl.zoomScale = 1.0; resetScene(); },
  setPaused,
  destroy,
  get mode() { return mood.current; },
  get frameMs() { return frameMs; },
};

window.__shiba = api;
return api;
}
