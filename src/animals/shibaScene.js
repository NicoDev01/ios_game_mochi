import * as THREE from 'three';

export function mountShibaScene(container, hooks = {}) {
  const emitHaptic = (kind) => hooks.onHaptic?.(kind);
  const emitMood = (info) => hooks.onMoodChange?.(info);
  let paused = false;

  // ===========================================================================
  // Exakte Farbpalette aus mochi_shiba.html (Aka-Shiba + Anime-Studio-Töne)
  // ===========================================================================
  const COAT = {
    bodyLit: '#D48A45',
    bodyShadow: '#A9642A',
    creamLit: '#F5EFE2',
    creamShadow: '#D5CBB7',
    innerEarLit: '#F5EFE2',
    innerEarShadow: '#D7CCB8',
    browLit: '#F6F0E3',
    showBrows: true,
    blush: '#EE958D',
  };

  const SHARED = {
    ink: '#181514',
    eyeWhite: '#F9F8F4',
    tongue: '#E87478',
    heart: '#DF4E4A',
    tear: '#88D4F5',
    sparkle: '#F5D054',
    bg: '#FFFFFF',
    groundShad: '#D4D0C8',
  };

  const deg = THREE.MathUtils.degToRad;
  const clamp = THREE.MathUtils.clamp;
  const lerp = THREE.MathUtils.lerp;
  const smoothstepJS = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // ===========================================================================
  // Prozedurales Cozy-Audio (Boing, Glass-Splat, Squish, Yip, Schnüffeln, Purr)
  // ===========================================================================
  const sfx = (() => {
    let ctx = null, master = null, enabled = true, noiseBuf = null;
    let lastSquish = 0, lastPet = 0;

    const ensure = () => {
      if (!enabled) return null;
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 4400;
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
      const len = Math.floor(c.sampleRate * 2.0);
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
      g.gain.linearRampToValueAtTime(vol, t + Math.min(0.010, dur * 0.2));
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
      src.start(t, Math.random() * 1.0, dur + 0.03);
    };

    return {
      unlock() {
        const c = ensure(); if (!c) return;
        try {
          const b = c.createBuffer(1, 1, c.sampleRate);
          const s = c.createBufferSource();
          s.buffer = b; s.connect(c.destination); s.start(0);
        } catch {}
      },
      set enabled(v) { enabled = Boolean(v); },
      get enabled() { return enabled; },
      dispose() {
        if (ctx) { ctx.close().catch(() => {}); ctx = null; master = null; }
      },
      bounce(speed) {
        const k = clamp((speed - 1.0) / 14, 0, 1);
        if (k <= 0.03) return;
        // Saftiges Mochi-Bloop & elastisches Boing wie im Referenzvideo!
        tone(125 + k * 45, 290 + k * 210, 0.13 + k * 0.07, 0.075 + k * 0.10, 'sine');
        tone(220 + k * 60, 145 + k * 40, 0.09, 0.045 * k, 'triangle', 0.045);
        if (k > 0.35) {
          tone(92, 52, 0.10, 0.085 * k, 'triangle');
          noiseBurst(680, 1.5, 0.06, 0.042 * k);
        }
      },
      pancake(speed) {
        const k = clamp(speed / 15, 0.3, 1);
        // Tiefer Pfannkuchen-Platsch + federndes Nach-Bloop!
        tone(155, 62, 0.14, 0.11 * k, 'sine');
        noiseBurst(580, 1.3, 0.09, 0.065 * k);
        tone(170, 390, 0.13, 0.070 * k, 'sine', 0.09);
        tone(340, 520, 0.09, 0.045 * k, 'triangle', 0.15);
      },
      wallSplat(speed) {
        const k = clamp(speed / 14, 0.28, 1);
        // Gummiball-Wandklatscher + kurzes Quietschen!
        tone(175, 76, 0.13, 0.105 * k, 'sine');
        tone(560, 320, 0.15, 0.055 * k, 'triangle', 0.025);
        noiseBurst(940, 1.7, 0.085, 0.058 * k);
      },
      throwWhoosh(speed) {
        const k = clamp((speed - 3.5) / 18, 0, 1);
        if (k <= 0.04) return;
        noiseBurst(460 + k * 640, 1.1, 0.15, 0.052 * k);
        tone(260, 620 + k * 240, 0.13, 0.045 * k, 'sine');
      },
      yip() {
        tone(370, 610, 0.085, 0.070, 'triangle');
        tone(570, 430, 0.070, 0.048, 'sine', 0.048);
      },
      boop() {
        tone(480, 720, 0.07, 0.062, 'sine');
        noiseBurst(1700, 2.6, 0.04, 0.036, 0.05);
      },
      pet() {
        const now = performance.now();
        if (now - lastPet < 240) return;
        lastPet = now;
        tone(400, 540, 0.11, 0.040, 'sine');
        tone(590, 680, 0.09, 0.025, 'sine', 0.055);
      },
      huff() {
        noiseBurst(700, 1.2, 0.14, 0.068);
        tone(195, 120, 0.14, 0.056, 'triangle');
      },
      sniff() {
        noiseBurst(1650, 2.5, 0.04, 0.034);
        noiseBurst(1800, 2.5, 0.04, 0.030, 0.085);
      },
      yawn() {
        tone(310, 440, 0.18, 0.036, 'sine');
        tone(430, 210, 0.32, 0.034, 'sine', 0.16);
      },
      shakeOff() {
        for (let i = 0; i < 4; i++) {
          noiseBurst(820 + i * 90, 2.0, 0.045, 0.036, i * 0.065);
        }
      },
      whistle() {
        tone(700, 940, 0.085, 0.040, 'sine');
        tone(890, 1180, 0.11, 0.044, 'sine', 0.085);
      },
      hop() { tone(255, 390, 0.072, 0.044, 'sine'); },
      grab() { tone(275, 420, 0.060, 0.050, 'sine'); },
      squish(amount) {
        const now = performance.now();
        if (now - lastSquish < 180 || amount < 0.18) return;
        lastSquish = now;
        tone(178, 116, 0.095, 0.040 * clamp(amount, 0, 1), 'sine');
        noiseBurst(540, 1.8, 0.065, 0.024 * clamp(amount, 0, 1));
      },
    };
  })();

  // ===========================================================================
  // Quad-Mesh & Catmull-Clark-Subdivision (100% identisch zu mochi_shiba.html)
  // ===========================================================================
  function makeCubeQuadMesh() {
    const verts = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
    const quads = [[4,5,6,7],[1,0,3,2],[5,1,2,6],[0,4,7,3],[7,6,2,3],[0,1,5,4]];
    return { verts, quads };
  }
  function planarSubdivide(mesh, levels = 1) {
    let { verts, quads } = mesh;
    for (let lv = 0; lv < levels; lv++) {
      const nv = verts.map((v) => [...v]), em = new Map();
      const mid = (a, b) => {
        const k = a < b ? `${a}_${b}` : `${b}_${a}`;
        let i = em.get(k);
        if (i === undefined) {
          const A = verts[a], B = verts[b];
          i = nv.length;
          nv.push([(A[0]+B[0])/2, (A[1]+B[1])/2, (A[2]+B[2])/2]);
          em.set(k, i);
        }
        return i;
      };
      const nq = [];
      for (const [a,b,c,d] of quads) {
        const ab = mid(a,b), bc = mid(b,c), cd = mid(c,d), da = mid(d,a);
        const A = verts[a], B = verts[b], C = verts[c], D = verts[d], f = nv.length;
        nv.push([(A[0]+B[0]+C[0]+D[0])/4, (A[1]+B[1]+C[1]+D[1])/4, (A[2]+B[2]+C[2]+D[2])/4]);
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
      const facePts = quads.map(([a,b,c,d]) => {
        const A=verts[a], B=verts[b], C=verts[c], D=verts[d];
        return [(A[0]+B[0]+C[0]+D[0])/4, (A[1]+B[1]+C[1]+D[1])/4, (A[2]+B[2]+C[2]+D[2])/4];
      });
      const edges = new Map(), vFaces = Array.from({length:nV},()=>[]), vEdges = Array.from({length:nV},()=>[]);
      const reg = (u, v, f) => {
        const a = Math.min(u,v), b = Math.max(u,v), key = a*1000003+b;
        let e = edges.get(key);
        if (!e) { e = {a,b,faces:[],idx:-1}; edges.set(key,e); vEdges[a].push(e); vEdges[b].push(e); }
        e.faces.push(f);
      };
      quads.forEach((q, f) => { for (let i = 0; i < 4; i++) { vFaces[q[i]].push(f); reg(q[i], q[(i+1)&3], f); } });
      const nvs = new Array(nV);
      for (let v = 0; v < nV; v++) {
        const n = vFaces[v].length;
        if (n < 3) { nvs[v] = [...verts[v]]; continue; }
        let fx=0,fy=0,fz=0;
        for (const fi of vFaces[v]) { const p = facePts[fi]; fx+=p[0]; fy+=p[1]; fz+=p[2]; }
        fx/=n; fy/=n; fz/=n;
        let rx=0,ry=0,rz=0; const ne = vEdges[v].length;
        for (const e of vEdges[v]) { const A=verts[e.a], B=verts[e.b]; rx+=(A[0]+B[0])/2; ry+=(A[1]+B[1])/2; rz+=(A[2]+B[2])/2; }
        rx/=ne; ry/=ne; rz/=ne;
        const p = verts[v];
        nvs[v] = [(fx+2*rx+(n-3)*p[0])/n, (fy+2*ry+(n-3)*p[1])/n, (fz+2*rz+(n-3)*p[2])/n];
      }
      const fo = nvs.length;
      for (const p of facePts) nvs.push(p);
      for (const e of edges.values()) {
        const A = verts[e.a], B = verts[e.b]; e.idx = nvs.length;
        if (e.faces.length === 2) {
          const F0 = facePts[e.faces[0]], F1 = facePts[e.faces[1]];
          nvs.push([(A[0]+B[0]+F0[0]+F1[0])/4, (A[1]+B[1]+F0[1]+F1[1])/4, (A[2]+B[2]+F0[2]+F1[2])/4]);
        } else {
          nvs.push([(A[0]+B[0])/2, (A[1]+B[1])/2, (A[2]+B[2])/2]);
        }
      }
      const eI = (u, v) => edges.get(Math.min(u,v)*1000003+Math.max(u,v)).idx;
      const nq = [];
      quads.forEach(([a,b,c,d], f) => {
        const F = fo+f, ab=eI(a,b), bc=eI(b,c), cd=eI(c,d), da=eI(d,a);
        nq.push([a,ab,F,da],[b,bc,F,ab],[c,cd,F,bc],[d,da,F,cd]);
      });
      verts = nvs; quads = nq;
    }
    return { verts, quads };
  }
  function quadMeshToGeometry(mesh, weightFn = () => 1) {
    const { verts, quads } = mesh;
    const pos = new Float32Array(verts.length * 3);
    const rest = new Float32Array(verts.length * 3);
    const w = new Float32Array(verts.length);
    verts.forEach((v, i) => { pos.set(v, i*3); rest.set(v, i*3); w[i] = weightFn(v); });
    const idx = new Uint32Array(quads.length * 6);
    let k = 0;
    for (const [a,b,c,d] of quads) { idx[k++]=a; idx[k++]=b; idx[k++]=c; idx[k++]=a; idx[k++]=c; idx[k++]=d; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRestPos', new THREE.BufferAttribute(rest, 3));
    g.setAttribute('aOutlineWeight', new THREE.BufferAttribute(w, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    return g;
  }

  // Exakter mochi_shiba.html Körper + 4 Pfötchen
  function buildShibaBodyQuadMesh() {
    const m = planarSubdivide(makeCubeQuadMesh(), 3);
    for (const v of m.verts) {
      const len = Math.hypot(...v) || 1;
      let x = v[0]/len*0.66, y = v[1]/len*0.55, z = v[2]/len*0.62;
      const t = clamp((0.55 - y) / 1.10, 0, 1);
      const w = 1 + 0.14 * Math.pow(t, 1.55);
      x *= w; z *= w;
      if (y < -0.39) y = -0.39 + (y + 0.39) * 0.48;
      v[0] = x; v[1] = y; v[2] = z;
    }
    let yMin = Infinity;
    for (const v of m.verts) yMin = Math.min(yMin, v[1]);
    const chosen = [];
    for (const [tx, ty, tz] of [[-0.32,yMin,0.24],[0.32,yMin,0.24],[-0.32,yMin,-0.24],[0.32,yMin,-0.24]]) {
      let best = -1, bd = Infinity;
      m.quads.forEach(([a,b,c,d], f) => {
        if (chosen.includes(f)) return;
        const A=m.verts[a], B=m.verts[b], C=m.verts[c], D=m.verts[d];
        const ux=B[0]-A[0], uz=B[2]-A[2], wx=C[0]-A[0], wz=C[2]-A[2];
        if (uz*wx - ux*wz > -0.0005) return;
        const cx=(A[0]+B[0]+C[0]+D[0])/4, cy=(A[1]+B[1]+C[1]+D[1])/4, cz=(A[2]+B[2]+C[2]+D[2])/4;
        const dd = Math.hypot(cx-tx, (cy-ty)*0.6, cz-tz);
        if (dd < bd) { bd = dd; best = f; }
      });
      chosen.push(best);
    }
    const extrude = (fi, dy, s) => {
      const ids = m.quads[fi];
      let cx = 0, cz = 0;
      for (const i of ids) { cx += m.verts[i][0]; cz += m.verts[i][2]; }
      cx /= 4; cz /= 4;
      const nids = ids.map((i) => {
        const p = m.verts[i];
        m.verts.push([cx + (p[0]-cx)*s, p[1] - dy, cz + (p[2]-cz)*s]);
        return m.verts.length - 1;
      });
      const [a,b,c,d] = ids, [a2,b2,c2,d2] = nids;
      m.quads[fi] = [a2,b2,c2,d2];
      m.quads.push([a,b,b2,a2],[b,c,c2,b2],[c,d,d2,c2],[d,a,a2,d2]);
    };
    for (const f of chosen) { extrude(f, 0.046, 0.72); extrude(f, 0.032, 0.56); }
    const s = catmullClark(m, 2);
    let minY = Infinity;
    for (const v of s.verts) minY = Math.min(minY, v[1]);
    for (const v of s.verts) v[1] -= minY;
    return s;
  }

  function buildShibaEarQuadMesh() {
    const m = planarSubdivide(makeCubeQuadMesh(), 2);
    for (const v of m.verts) {
      const len = Math.hypot(...v) || 1;
      let x = v[0]/len*0.126, y = v[1]/len*0.146, z = v[2]/len*0.070;
      if (y > 0) {
        const u = clamp(y/0.146, 0, 1);
        x *= 1 - 0.64 * Math.pow(u, 0.92);
        z *= 1 - 0.34 * Math.pow(u, 1.1);
      } else {
        const u = clamp(-y/0.146, 0, 1);
        x *= 1 + 0.14 * u;
      }
      if (z > 0) {
        const nx = x/0.092, ny = (y-0.005)/0.088, r2 = nx*nx + ny*ny;
        if (r2 < 1) z -= 0.022 * Math.pow(1 - r2, 1.5);
      }
      v[0] = x; v[1] = y; v[2] = z;
    }
    return catmullClark(m, 2);
  }

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
    const norm = (v) => { const l = Math.hypot(...v) || 1; return [v[0]/l, v[1]/l, v[2]/l]; };
    const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
    const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    const tangents = samples.map((_, i) => norm(sub(samples[Math.min(samples.length-1,i+1)].p, samples[Math.max(0,i-1)].p)));
    const normals = [norm(sub([1,0,0], tangents[0].map((c) => c * tangents[0][0])))];
    const binormals = [norm(cross(tangents[0], normals[0]))];
    for (let i = 1; i < samples.length; i++) {
      const tP = tangents[i-1], tC = tangents[i], ax = cross(tP, tC), al = Math.hypot(...ax);
      let nN = normals[i-1];
      if (al > 1e-6) {
        const k = ax.map((c) => c/al), cA = clamp(dot(tP,tC),-1,1), sA = Math.sqrt(Math.max(0,1-cA*cA)), kn = cross(k,nN), kd = dot(k,nN);
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
    for (let ri = 0; ri < samples.length-1; ri++) {
      for (let s = 0; s < segs; s++) {
        const r0 = ri*segs, r1 = (ri+1)*segs, sn = (s+1)%segs;
        quads.push([r0+s, r0+sn, r1+sn, r1+s]);
      }
    }
    const rc = verts.length, p0 = samples[0].p, t0 = tangents[0];
    verts.push([p0[0]-t0[0]*0.015, p0[1]-t0[1]*0.015, p0[2]-t0[2]*0.015]);
    for (let s = 0; s < segs; s += 2) quads.push([rc, (s+2)%segs, (s+1)%segs, s]);
    const li = samples.length-1, lb = li*segs, tc = verts.length, pE = samples[li].p, tE = tangents[li];
    verts.push([pE[0]+tE[0]*0.022, pE[1]+tE[1]*0.022, pE[2]+tE[2]*0.022]);
    for (let s = 0; s < segs; s += 2) quads.push([tc, lb+s, lb+(s+1)%segs, lb+(s+2)%segs]);
    return catmullClark({ verts, quads }, 2);
  }

  // ===========================================================================
  // Shader: 2-Ton Cel-Shading & tiefenadaptive Tusche-Outline (mochi_shiba.html)
  // ===========================================================================
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
        varying vec3 vWorldNormal;
        varying vec3 vRestPos;
        void main() {
          vRestPos = aRestPos;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uLitColor, uShadowColor, uCreamLitColor, uCreamShadowColor, uLightDir;
        uniform float uThreshold;
        varying vec3 vWorldNormal;
        varying vec3 vRestPos;
        float sdEll(vec3 p, vec3 c, vec3 r) { return length((p - c) / r) - 1.0; }
        float smin(float a, float b, float k) {
          float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
          return mix(b, a, h) - k*h*(1.0-h);
        }
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

  function createCelMaterial({ litHex, shadowHex, innerLitHex = null, innerShadowHex = null, lightDir, threshold = 0.20, mode = 'plain' }) {
    const modeId = { plain: 0, ear: 1, tail: 2 }[mode] ?? 0;
    return new THREE.ShaderMaterial({
      uniforms: {
        uLitColor:         { value: new THREE.Color(litHex) },
        uShadowColor:      { value: new THREE.Color(shadowHex) },
        uInnerLitColor:    { value: new THREE.Color(innerLitHex || litHex) },
        uInnerShadowColor: { value: new THREE.Color(innerShadowHex || shadowHex) },
        uLightDir:         { value: lightDir.clone().normalize() },
        uThreshold:        { value: threshold },
        uMode:             { value: modeId },
      },
      vertexShader: /* glsl */`
        attribute vec3 aRestPos;
        varying vec3 vWorldNormal;
        varying vec3 vLocalPos;
        varying vec3 vLocalNormal;
        void main() {
          vLocalPos = aRestPos;
          vLocalNormal = normalize(normal);
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uLitColor, uShadowColor, uInnerLitColor, uInnerShadowColor, uLightDir;
        uniform float uThreshold, uMode;
        varying vec3 vWorldNormal;
        varying vec3 vLocalPos;
        varying vec3 vLocalNormal;
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
            litC = mix(litC, uInnerLitColor, m);
            shdC = mix(shdC, uInnerShadowColor, m);
          } else if (uMode > 1.5 && uMode < 2.5) {
            vec2 cYZ = vec2(0.132, -0.155);
            float inw = dot(normalize(vLocalNormal.yz + vec2(1e-5)), normalize(cYZ - vLocalPos.yz + vec2(1e-5)));
            float tip = smoothstep(0.118, 0.068, length(vLocalPos.yz - cYZ));
            float inn = smoothstep(-0.10, 0.25, inw) * smoothstep(-0.02, -0.09, vLocalPos.z);
            float cm = clamp(max(tip, inn * 0.92), 0.0, 1.0);
            float aaT = max(fwidth(cm) * 0.9, 0.03);
            cm = smoothstep(0.45 - aaT, 0.45 + aaT, cm);
            litC = mix(litC, uInnerLitColor, cm);
            shdC = mix(shdC, uInnerShadowColor, cm);
          }
          gl_FragColor = vec4(mix(shdC, litC, litMask), 1.0);
          #include <colorspace_fragment>
        }`,
    });
  }

  function createOutlineMaterial({ inkHex, thicknessPx = 3.8, depthBias = 0.00045, refDist = 6.5 }) {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uInkColor:    { value: new THREE.Color(inkHex) },
        uThicknessPx: { value: thicknessPx },
        uRefDist:     { value: refDist },
        uResolution:  { value: new THREE.Vector2(innerWidth, innerHeight) },
        uDepthBias:   { value: depthBias },
      },
      vertexShader: /* glsl */`
        attribute float aOutlineWeight;
        uniform float uThicknessPx;
        uniform float uRefDist;
        uniform vec2 uResolution;
        uniform float uDepthBias;
        void main() {
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vec4 clipPos = projectionMatrix * mvPos;
          vec3 viewN = normalize(normalMatrix * normal);
          vec2 clipN = (projectionMatrix * vec4(viewN, 0.0)).xy;
          float len = length(clipN);
          if (len > 1e-5) clipN /= len;
          float viewDist = max(-mvPos.z, 0.5);
          float depthScale = clamp(uRefDist / viewDist, 0.58, 1.32);
          vec2 offset = clipN * (uThicknessPx * depthScale * aOutlineWeight) * (2.0 / max(uResolution, vec2(1.0))) * clipPos.w;
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

  // ===========================================================================
  // Oberflächen-Patches & gekrümmte 2D-Gesichtselemente (curve 0.88 wie Original)
  // ===========================================================================
  function sampleBodySurface(bodyGeo, x, y, zSign = 1) {
    const pos = bodyGeo.attributes.position, nrm = bodyGeo.attributes.normal;
    let bi = 0, bs = Infinity;
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

  function makeCurvedEyePatch(w, h, drawFn, zOffset = 0.004, cX = 0.84, cY = 0.84) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 512;
    const ctx = cv.getContext('2d');
    ctx.save(); ctx.translate(256, 256); ctx.scale(512 / w, -512 / h);
    drawFn(ctx);
    ctx.restore();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    const geo = new THREE.PlaneGeometry(w, h, 16, 16);
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
  function curvedGridOval(rx, ry, zOff = 0, cX = 0.84, cY = 0.84, segs = 36, rings = 4, cx = 0, cy = 0) {
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
  function curvedStroke(pts, hws, zOff = 0, cX = 0.84, cY = 0.84) {
    const n = pts.length, P = [], I = [], hw = (i) => Array.isArray(hws) ? hws[i] : hws;
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
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setIndex(I);
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
  function makeCurvedNoseGeo(w = 0.026, h = 0.015, zOff = 0.004) {
    const sh = new THREE.Shape();
    sh.moveTo(-w*0.72, h*0.55); sh.quadraticCurveTo(0, h*0.92, w*0.72, h*0.55);
    sh.quadraticCurveTo(w*1.05, h*0.15, w*0.45, -h*0.50); sh.quadraticCurveTo(0, -h*1.05, -w*0.45, -h*0.50);
    sh.quadraticCurveTo(-w*1.05, h*0.15, -w*0.72, h*0.55);
    const g = new THREE.ShapeGeometry(sh, 14), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, zOff - (x*x*0.84 + y*y*0.84)); }
    return g;
  }

  // ===========================================================================
  // 3D-Frustum-Raum-Ebenen (Screen-Ränder erweitern sich perspektivisch nach hinten!)
  // ===========================================================================
  const frustum = {
    planes: [], // [{ nx, ny, nz, d, tag }]
    knee: 0.025,
    scaleAtZ(z) {
      return 1 + (room.halfD - z) / camCfg.dFront;
    },
    boundsAtZ(z) {
      const s = this.scaleAtZ(z);
      return {
        maxX: room.halfW * s,
        maxY: camCfg.baseEyeY + (room.ceil - camCfg.baseEyeY) * s,
      };
    },
    rebuild() {
      const d = camCfg.dFront;
      const hw = room.halfW;
      const hd = room.halfD;
      const eyeY = camCfg.baseEyeY;
      const topH = room.ceil - eyeY;

      const lLen = Math.hypot(d, hw);
      const cLen = Math.hypot(d, topH);

      this.planes = [
        { nx: 0,           ny: 1,         nz: 0,           d: 0,                                    tag: 'floor' },
        { nx: 0,           ny: -d / cLen, nz: -topH / cLen, d: -(eyeY * d + topH * (d + hd)) / cLen, tag: 'ceil'  },
        { nx:  d / lLen,   ny: 0,         nz: -hw / lLen,   d: -(hw * (d + hd)) / lLen,              tag: 'left'  },
        { nx: -d / lLen,   ny: 0,         nz: -hw / lLen,   d: -(hw * (d + hd)) / lLen,              tag: 'right' },
        { nx: 0,           ny: 0,         nz: 1,           d: -hd,                                  tag: 'back'  },
        { nx: 0,           ny: 0,         nz: -1,          d: -hd,                                  tag: 'front' },
      ];
    },
  };

  const _sdfOut = { pen: 0, nx: 0, ny: 0, nz: 0, corner: 0 };
  function evalInsideFrustum(wx, wy, wz) {
    let maxPen = -1e9;
    let bnx = 0, bny = 0, bnz = 0;
    let activeCount = 0;
    const knee = frustum.knee;
    const planes = frustum.planes;
    for (let i = 0; i < planes.length; i++) {
      const pl = planes[i];
      const pen = -(pl.nx * wx + pl.ny * wy + pl.nz * wz - pl.d);
      if (pen > -knee) {
        if (pen > 0.005) activeCount++;
        if (pen > maxPen) {
          maxPen = pen;
          bnx = pl.nx; bny = pl.ny; bnz = pl.nz;
        }
      }
    }
    _sdfOut.pen = maxPen;
    _sdfOut.nx = bnx; _sdfOut.ny = bny; _sdfOut.nz = bnz;
    _sdfOut.corner = activeCount >= 2 ? 0.75 : 0;
    return _sdfOut;
  }

  // ===========================================================================
  // Mochi-Shiba bauen (Original mochi_shiba.html Style: EINE saubere Außen-Outline!)
  // ===========================================================================
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

    // Einheitlicher Stencil für Körper + Ohren -> EINE durchgehende Außenlinie ohne störende Ohr-Innenlinien!
    matBody.stencilWrite = true;
    matBody.stencilRef = 1;
    matBody.stencilFunc = THREE.AlwaysStencilFunc;
    matBody.stencilZPass = THREE.ReplaceStencilOp;

    matEar.stencilWrite = true;
    matEar.stencilRef = 1;
    matEar.stencilFunc = THREE.AlwaysStencilFunc;
    matEar.stencilZPass = THREE.ReplaceStencilOp;

    const outBody = createOutlineMaterial({ inkHex: SHARED.ink, thicknessPx: 4.0, depthBias: 0.0004 });
    outBody.stencilWrite = true;
    outBody.stencilRef = 1;
    outBody.stencilFunc = THREE.NotEqualStencilFunc;

    const outEar = createOutlineMaterial({ inkHex: SHARED.ink, thicknessPx: 3.6, depthBias: 0.0005 });
    outEar.stencilWrite = true;
    outEar.stencilRef = 1;
    outEar.stencilFunc = THREE.NotEqualStencilFunc;

    // Schwanz behält klassische Tiefen-Outline wie mochi_shiba.html (damit die Spirale von hinten klar lesbar bleibt!)
    const outTail = createOutlineMaterial({ inkHex: SHARED.ink, thicknessPx: 3.5, depthBias: 0.0006 });

    const mkFaceMat = (color, extra = {}) => new THREE.MeshBasicMaterial({
      color, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...extra,
    });
    const matInk = mkFaceMat(SHARED.ink);
    const matWhite = mkFaceMat(SHARED.eyeWhite);
    const matTongue = mkFaceMat(SHARED.tongue);
    const matBrow = mkFaceMat(coat.browLit);
    const matBlush = createBlushMaterial(coat.blush, 0.0);

    const root = new THREE.Group(); root.name = 'Mochi_Shiba';
    const meshCol = new THREE.Group(), faceCol = new THREE.Group();
    root.add(meshCol, faceCol);

    const bodyGeo = quadMeshToGeometry(buildShibaBodyQuadMesh());
    const bodyRest = new Float32Array(bodyGeo.attributes.position.array);
    const body = new THREE.Mesh(bodyGeo, matBody);
    body.renderOrder = 1;
    const bodyOutline = new THREE.Mesh(bodyGeo, outBody);
    bodyOutline.renderOrder = 2;
    body.add(bodyOutline);
    meshCol.add(body);

    let maxY = 0;
    for (let i = 1; i < bodyRest.length; i += 3) maxY = Math.max(maxY, bodyRest[i]);
    const centerY = maxY / 2;

    // Exakte Ohr-Anbringung aus mochi_shiba.html (kompakt im Schädel, nahtlose Außenlinie!)
    const earQM = buildShibaEarQuadMesh();
    const makeEar = (side) => {
      const geo = quadMeshToGeometry(earQM, ([, vy]) => {
        const t = clamp((vy + 0.090) / 0.085, 0, 1);
        return t * t * (3 - 2 * t);
      });
      const g = new THREE.Group();
      const s = sampleBodySurface(bodyGeo, side * 0.30, 0.87, 1);
      const patch = buildSurfacePatch(bodyGeo, s.point, 10);
      const baseRot = new THREE.Euler(deg(12), deg(side * 14), deg(-side * 24));
      const pivot = new THREE.Group();
      pivot.rotation.order = 'ZYX';
      g.add(pivot);
      const m = new THREE.Mesh(geo, matEar);
      m.position.y = 0.056; // exakt mochi_shiba.html!
      m.renderOrder = 1;
      const earOut = new THREE.Mesh(geo, outEar);
      earOut.renderOrder = 2;
      m.add(earOut);
      pivot.add(m);
      meshCol.add(g);
      const ear = {
        group: g, pivot, geo, rest: new Float32Array(geo.attributes.position.array), side,
        patch, offset: -0.024, baseQuat: new THREE.Quaternion().setFromEuler(baseRot),
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
    const tailGeo = quadMeshToGeometry(buildShibaTailQuadMesh(), ([, , vz]) => {
      const t = clamp((-vz - 0.005) / 0.075, 0, 1);
      return t * t * (3 - 2 * t);
    });
    const tailRest = new Float32Array(tailGeo.attributes.position.array);
    const tailGroup = new THREE.Group();
    const ts = sampleBodySurface(bodyGeo, 0, 0.375, -1);
    const tailPatch = buildSurfacePatch(bodyGeo, ts.point, 8);
    tailGroup.position.set(0, 0.375, ts.point.z + 0.036);
    tailGroup.rotation.set(deg(-6), deg(30), deg(-6));
    const tailPivot = new THREE.Group();
    tailGroup.add(tailPivot);
    const tailMesh = new THREE.Mesh(tailGeo, matTail);
    tailMesh.renderOrder = 1;
    const tailOutline = new THREE.Mesh(tailGeo, outTail);
    tailOutline.renderOrder = 2;
    tailMesh.add(tailOutline);
    tailPivot.add(tailMesh);
    meshCol.add(tailGroup);

    const faceAttachments = [];
    const attachFacePart = (obj, x, y, zSign, clearance, lookStrength) => {
      const s = sampleBodySurface(bodyGeo, x, y, zSign);
      const patch = buildSurfacePatch(bodyGeo, s.point, 10);
      faceCol.add(obj);
      faceAttachments.push({ obj, patch, clearance, lookStrength, zSign });
    };

    const traceClippedSclera = (ctx, rx, ry, topY) => {
      ctx.beginPath();
      for (let i = 0; i <= 48; i++) {
        const a = Math.PI + (i / 48) * Math.PI * 2;
        const px = Math.cos(a) * rx, py = Math.min(topY, Math.sin(a) * ry);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };

    const makeEye = (side) => {
      const eroot = new THREE.Group();
      attachFacePart(eroot, side * 0.155, 0.605, 1, 0.013, 0.80);
      const content = new THREE.Group(); eroot.add(content);
      const states = {};

      // 1. Zufrieden / Glücklich (⌒ ⌒)
      const hPts = [];
      for (let i = 0; i <= 14; i++) { const u = i/14*2-1; hPts.push([u * 0.056, 0.022 * (1 - u*u) - 0.006]); }
      const mHappy = new THREE.Mesh(curvedStroke(hPts, 0.0074, 0.004), matInk); mHappy.renderOrder = 13;
      states.Happy = mHappy;

      // 2. Wache Knopfaugen (• •) mit Glanzpunkt
      const btnGrp = new THREE.Group();
      const mBtn = new THREE.Mesh(curvedGridOval(0.038, 0.040, 0.004), matInk); mBtn.renderOrder = 13;
      const mBtnG = new THREE.Mesh(curvedGridOval(0.011, 0.011, 0.006, 0.84, 0.84, 16, 2, -0.011, 0.012), matWhite); mBtnG.renderOrder = 14;
      btnGrp.add(mBtn, mBtnG);
      states.Button = btnGrp;

      // 3. Neugierig (● ●) — große glänzende Mochi-Augen
      const big = new THREE.Group();
      const mBigO = new THREE.Mesh(curvedGridOval(0.088, 0.086, 0.000), matInk); mBigO.renderOrder = 10;
      const mBigW = new THREE.Mesh(curvedGridOval(0.080, 0.078, 0.003), matWhite); mBigW.renderOrder = 11;
      const mBigP = new THREE.Group();
      const mBigPM = new THREE.Mesh(curvedGridOval(0.066, 0.064, 0.006), matInk); mBigPM.renderOrder = 12;
      const mBigG  = new THREE.Mesh(curvedGridOval(0.016, 0.015, 0.008, 0.84, 0.84, 16, 2, -0.018, 0.020), matWhite); mBigG.renderOrder = 13;
      mBigP.add(mBigPM, mBigG);
      big.add(mBigO, mBigW, mBigP);
      states.BigCute = big;

      // 4. Schmollend (😠)
      states.Pout = makeCurvedEyePatch(0.19, 0.16, (ctx) => {
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

      // 5. Skeptisch (😒)
      states.Skeptic = makeCurvedEyePatch(0.20, 0.14, (ctx) => {
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

      // 6. Seitenblick (¬ ¬)
      states.SideEye = makeCurvedEyePatch(0.20, 0.16, (ctx) => {
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

      // 7. Verliebt (♥ ♥)
      states.Heart = makeCurvedEyePatch(0.16, 0.15, (ctx) => {
        ctx.rotate(deg(side * 6));
        makeKawaiiHeartPath(ctx, 0.044);
        ctx.fillStyle = SHARED.heart; ctx.fill();
        ctx.lineWidth = 0.010; ctx.lineJoin = 'round'; ctx.strokeStyle = SHARED.ink; ctx.stroke();
      });

      // 8. Geschlossen / Müde (—)
      const cPts = [];
      for (let i = 0; i <= 14; i++) { const u = i/14*2-1; cPts.push([u * 0.058, -0.004*(1-u*u) + side*u*0.003]); }
      const mClosed = new THREE.Mesh(curvedStroke(cPts, 0.0068, 0.004), matInk); mClosed.renderOrder = 13;
      states.Closed = mClosed;

      // 9. Wince / Zusammengekniffen (> <)
      const wince = new THREE.Group(); const sg = -side;
      const wT = new THREE.Mesh(curvedStroke([[-sg*0.048, 0.032], [sg*0.042, 0]], 0.0076, 0.004), matInk);
      const wB = new THREE.Mesh(curvedStroke([[-sg*0.048,-0.032], [sg*0.042, 0]], 0.0076, 0.004), matInk);
      wT.renderOrder = 13; wB.renderOrder = 13; wince.add(wT, wB);
      states.Wince = wince;

      // 10. Schockiert (⊙)
      const sh = new THREE.Group();
      const shO = new THREE.Mesh(curvedGridOval(0.080, 0.076, 0.000), matInk); shO.renderOrder = 10;
      const shW = new THREE.Mesh(curvedGridOval(0.070, 0.066, 0.003), matWhite); shW.renderOrder = 11;
      const shP = new THREE.Mesh(curvedGridOval(0.030, 0.030, 0.006), matInk); shP.renderOrder = 12;
      sh.add(shO, shW, shP);
      states.Shocked = sh;

      // 11. Schwindelig (Spiral-Augen @_@ nach heftigem Bounce!)
      states.Dizzy = makeCurvedEyePatch(0.18, 0.18, (ctx) => {
        ctx.beginPath();
        for (let i = 0; i <= 54; i++) {
          const t = i / 54;
          const a = t * Math.PI * 4.4 * side;
          const r = 0.006 + t * 0.050;
          const px = Math.cos(a) * r, py = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.lineWidth = 0.011; ctx.lineCap = 'round'; ctx.strokeStyle = SHARED.ink; ctx.stroke();
      });

      for (const k in states) content.add(states[k]);
      return { root: eroot, content, side, states, pupilBig: mBigP, pupilShock: shP };
    };
    const eyeL = makeEye(-1), eyeR = makeEye(1);

    // Maro-Augenbrauen + Stirn-Zornesfalten
    const makeBrow = (side) => {
      const g = new THREE.Group();
      attachFacePart(g, side * 0.115, 0.710, 1, 0.012, 0.86);
      const inner = new THREE.Group(); g.add(inner);
      const m = new THREE.Mesh(curvedGridOval(0.031, 0.017, 0.002, 0.84, 0.84, 24, 2), matBrow);
      m.renderOrder = 11; inner.add(m);
      return { group: g, inner, side };
    };
    const browL = makeBrow(-1), browR = makeBrow(1);

    const frownLines = new THREE.Group();
    attachFacePart(frownLines, 0, 0.678, 1, 0.013, 0.86);
    const fL = new THREE.Mesh(curvedStroke([[-0.017, 0.014], [-0.011, -0.014]], 0.0038, 0.003), matInk); fL.renderOrder = 13;
    const fR = new THREE.Mesh(curvedStroke([[ 0.017, 0.014], [ 0.011, -0.014]], 0.0038, 0.003), matInk); fR.renderOrder = 13;
    frownLines.add(fL, fR); frownLines.visible = false;

    // Wangenröte
    for (const side of [-1, 1]) {
      const bg = new THREE.Group();
      attachFacePart(bg, side * 0.275, 0.525, 1, 0.011, 0.80);
      const bm = new THREE.Mesh(curvedGridOval(0.062, 0.036, 0.001, 0.84, 0.84, 24, 2), matBlush);
      bm.renderOrder = 9; bg.add(bm);
    }

    // Manga-Wut-Ader (💢)
    const angerGroup = new THREE.Group();
    attachFacePart(angerGroup, 0.25, 0.76, 1, 0.015, 0.88);
    const angerPatch = makeCurvedEyePatch(0.16, 0.16, (ctx) => {
      for (const [sx, sy] of [[1,1],[-1,1],[-1,-1],[1,-1]]) {
        ctx.beginPath();
        ctx.moveTo(sx*0.056, sy*0.016); ctx.quadraticCurveTo(sx*0.018, sy*0.018, sx*0.016, sy*0.056);
        ctx.lineCap = 'round';
        ctx.lineWidth = 0.018; ctx.strokeStyle = SHARED.ink; ctx.stroke();
        ctx.lineWidth = 0.009; ctx.strokeStyle = SHARED.heart; ctx.stroke();
      }
    });
    angerGroup.add(angerPatch); angerGroup.visible = false;

    // Schweißperle (💧)
    const sweatGroup = new THREE.Group();
    attachFacePart(sweatGroup, -0.31, 0.69, 1, 0.015, 0.82);
    const sweatPatch = makeCurvedEyePatch(0.14, 0.18, (ctx) => {
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

    // Mund + Shiba-Nase + optionale Zunge
    const mouth = new THREE.Group();
    attachFacePart(mouth, 0, 0.545, 1, 0.013, 0.84);
    const noseM = new THREE.Mesh(makeCurvedNoseGeo(), matInk); noseM.position.y = 0.017; noseM.renderOrder = 14;
    mouth.add(noseM);

    const mouthStates = {};
    const addSt = (grp, pts, hw) => { const m = new THREE.Mesh(curvedStroke(pts, hw, 0.003), matInk); m.renderOrder = 13; grp.add(m); };
    const stem = [[0, 0.009], [0, -0.004]];

    const mHappy = new THREE.Group();
    const wL = [], wR = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, x = t * 0.066, y = -0.004 - Math.sin(t * Math.PI) * 0.013 + Math.pow(t, 1.65) * 0.009;
      wL.push([-x, y]); wR.push([x, y]);
    }
    addSt(mHappy, stem, 0.0042); addSt(mHappy, wL, 0.0044); addSt(mHappy, wR, 0.0044);
    mouthStates.happy = mHappy;

    const mNorm = new THREE.Group();
    addSt(mNorm, stem, 0.0046);
    addSt(mNorm, [[0,-0.004],[-0.012,-0.014],[-0.022,-0.024]], 0.0046);
    addSt(mNorm, [[0,-0.004],[ 0.012,-0.014],[ 0.022,-0.024]], 0.0046);
    mouthStates.normal = mNorm;

    const mFlat = new THREE.Group();
    addSt(mFlat, [[-0.028, -0.016], [0.028, -0.016]], 0.0052);
    mouthStates.flat = mFlat;

    const mGrowl = new THREE.Group();
    addSt(mGrowl, [[-0.048,-0.017],[-0.024,-0.005],[0,-0.016],[0.024,-0.005],[0.048,-0.017]], 0.0048);
    mouthStates.growl = mGrowl;

    const mHmpf = new THREE.Group();
    const hArc = [];
    for (let i = 0; i <= 12; i++) { const u = i/12*2-1; hArc.push([-0.034 + (1-u*u)*0.016, -0.011 - u*0.022]); }
    addSt(mHmpf, hArc, 0.0046);
    addSt(mHmpf, [[-0.018,-0.011],[0.002,-0.013],[0.020,-0.022]], 0.0046);
    mouthStates.hmpf = mHmpf;

    const mOpen = new THREE.Group();
    const mOpenO = new THREE.Mesh(curvedGridOval(0.028, 0.036, 0.002, 0.84, 0.84, 24, 2, 0, -0.032), matInk); mOpenO.renderOrder = 12;
    const mOpenI = new THREE.Mesh(curvedGridOval(0.020, 0.027, 0.0045, 0.84, 0.84, 24, 2, 0, -0.032), matTongue); mOpenI.renderOrder = 13;
    mOpen.add(mOpenO, mOpenI);
    mouthStates.open = mOpen;

    for (const k in mouthStates) mouth.add(mouthStates[k]);

    const tongueGrp = new THREE.Group();
    const tO = new THREE.Mesh(curvedGridOval(0.019, 0.021, 0.001, 0.84, 0.84, 20, 2, 0, -0.021), matInk); tO.renderOrder = 11;
    const tI = new THREE.Mesh(curvedGridOval(0.013, 0.015, 0.003, 0.84, 0.84, 20, 2, 0, -0.022), matTongue); tI.renderOrder = 12;
    tongueGrp.add(tO, tI); tongueGrp.visible = false;
    mouth.add(tongueGrp);

    // Popo-„×“
    const buttX = new THREE.Group();
    attachFacePart(buttX, 0, 0.155, -1, 0.011, 0.88);
    const bx1 = new THREE.Mesh(curvedStroke([[-0.016,-0.016],[0.016,0.016]], 0.0046, 0.002), matInk); bx1.renderOrder = 12;
    const bx2 = new THREE.Mesh(curvedStroke([[-0.016, 0.016],[0.016,-0.016]], 0.0046, 0.002), matInk); bx2.renderOrder = 12;
    buttX.add(bx1, bx2);

    // 3D-Softbody-Deformation (ultra-elastisches Mochi + Glas-Squish!)
    const tmpP = new THREE.Vector3(), tmpN = new THREE.Vector3();
    const zFwd = new THREE.Vector3(0, 0, 1), zBack = new THREE.Vector3(0, 0, -1);
    const tmpBlend = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

    function deformBody(def, baseMat, invBaseMat) {
      const pos = bodyGeo.attributes.position;
      const mB = baseMat.elements, mI = invBaseMat.elements;

      const bodyStretch = def.bodyStretch || 0;
      const headPitch = def.headPitch || 0;
      const headRoll = def.headRoll || 0;
      // Natürliches, knackiges Mochi-Squash & Stretch (nicht übertrieben/verzögert!)
      const sx = clamp((1 + def.jx) * (1 - bodyStretch * 0.10), 0.72, 1.38);
      const sy = clamp((1 + def.jy) * (1 - bodyStretch * 0.18), 0.56, 1.32);
      const sz = clamp((1 / Math.sqrt(sx * sy)) * (1 + bodyStretch * 0.30), 0.74, 1.38);
      const breath = def.breath;
      const bXZ = 1 + 0.14 * breath, bY = 1 - 0.18 * breath;

      const shearX = def.shearX, shearZ = def.shearZ, bendX = def.bendX, bendY = def.bendY;
      const stAmt = def.stretch, stX = def.stLocalX, stY = def.stLocalY, stZ = def.stLocalZ;
      const pullActive = def.pullActive, gx = def.grabX, gy = def.grabY, gz = def.grabZ;
      const px = def.pullX, py = def.pullY, pz = def.pullZ;
      const cheekPuff = def.cheekPuff || 0;

      let maxWallPen = 0;

      for (let i = 0; i < pos.count; i++) {
        let rx0 = bodyRest[i*3], ry0 = bodyRest[i*3+1], rz0 = bodyRest[i*3+2];

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
          const dot = x*stX + y*stY + z*stZ, along = dot * stAmt, shrink = 1 - stAmt * 0.38;
          x = x*shrink + stX*(dot*(1-shrink)+along);
          y = y*shrink + stY*(dot*(1-shrink)+along);
          z = z*shrink + stZ*(dot*(1-shrink)+along);
        }

        const yn = y / centerY, xn = x / 0.70;
        x += shearX * yn * 0.38; z += shearZ * yn * 0.38;
        y += bendX * (xn*xn - 0.35) * 0.30; x += bendY * (yn*yn - 0.35) * 0.30;

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

        if (pullActive) {
          const ddx = x-gx, ddy = y-gy, ddz = z-gz, wP = Math.exp(-(ddx*ddx+ddy*ddy+ddz*ddz)/0.44);
          x += px*wP; y += py*wP; z += pz*wP;
        }

        const lx = x, ly = y + centerY, lz = z;
        let wx = mB[0]*lx + mB[4]*ly + mB[8]*lz + mB[12];
        let wy = mB[1]*lx + mB[5]*ly + mB[9]*lz + mB[13];
        let wz = mB[2]*lx + mB[6]*ly + mB[10]*lz + mB[14];

        const sdf = evalInsideFrustum(wx, wy, wz);
        if (sdf.pen > -frustum.knee) {
          let push = 0;
          if (sdf.pen >= frustum.knee) push = sdf.pen;
          else { const t = (sdf.pen + frustum.knee)/(2*frustum.knee); push = frustum.knee*0.5*t*t; }
          if (push > 0) {
            wx += sdf.nx*push; wy += sdf.ny*push; wz += sdf.nz*push;
            maxWallPen = Math.max(maxWallPen, push);
            // Natürliches, sofortiges Mochi-Abflachen an den unsichtbaren Wänden
            const ba = Math.min(push, 0.22) * 0.52 * (1 - sdf.corner * 0.78);
            if (ba > 0.001) {
              const rx = wx-def.bodyX, ry = wy-def.bodyY, rz = wz-def.bodyZ;
              const rN = rx*sdf.nx + ry*sdf.ny + rz*sdf.nz;
              wx += clamp(rx-sdf.nx*rN,-0.62,0.62)*ba;
              wy += clamp(ry-sdf.ny*rN,-0.54,0.54)*ba;
              wz += clamp(rz-sdf.nz*rN,-0.54,0.54)*ba;
              const s2 = evalInsideFrustum(wx, wy, wz);
              if (s2.pen > 0) { wx += s2.nx*s2.pen; wy += s2.ny*s2.pen; wz += s2.nz*s2.pen; }
            }
          }
        }
        // Pfoten bleiben strikt auf/über Y = 0.0 -> Schatten kann niemals über die Füße ragen!
        if (wy < 0.0) wy = 0.0;

        pos.setXYZ(i,
          mI[0]*wx + mI[4]*wy + mI[8]*wz + mI[12],
          mI[1]*wx + mI[5]*wy + mI[9]*wz + mI[13],
          mI[2]*wx + mI[6]*wy + mI[10]*wz + mI[14],
        );
      }

      pos.needsUpdate = true;
      bodyGeo.computeVertexNormals();

      for (const ear of [earL, earR]) {
        evalSurfacePatch(bodyGeo, ear.patch, tmpP, tmpN);
        ear.group.position.copy(tmpP).addScaledVector(tmpN, ear.offset);
        tmpQ.setFromUnitVectors(ear.restNrm, tmpN);
        ear.group.quaternion.copy(tmpQ).multiply(ear.baseQuat);
      }
      evalSurfacePatch(bodyGeo, tailPatch, tmpP, tmpN);
      tailGroup.position.copy(tmpP).addScaledVector(tmpN, -0.036);

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
      tailPivot.rotation.set(deg(-14) * lift, deg(28) * wag, deg(-11) * wag);
      const pos = tailGeo.attributes.position, fw = deg(18) * wag, fl = deg(14) * lift;
      for (let i = 0; i < pos.count; i++) {
        const x = tailRest[i*3], y = tailRest[i*3+1], z = tailRest[i*3+2], b = clamp(-z/0.30, 0, 1) ** 2;
        const ca = fl*b, y1 = y*Math.cos(ca) - z*Math.sin(ca), z1 = y*Math.sin(ca) + z*Math.cos(ca);
        const wa = fw*b;
        pos.setXYZ(i, x*Math.cos(wa) + z1*Math.sin(wa), y1, -x*Math.sin(wa) + z1*Math.cos(wa));
      }
      pos.needsUpdate = true; tailGeo.computeVertexNormals();
    };

    const applyEar = (ear, twitch, planeAmt) => {
      const tw = clamp(twitch, -0.55, 1.25);
      const pl = clamp(planeAmt, 0, 1);
      if (Math.abs(ear.lastTwitch - tw) < 0.003 && Math.abs(ear.lastPlane - pl) < 0.003) return;
      ear.lastTwitch = tw; ear.lastPlane = pl;
      const f = pl * pl * (3 - 2 * pl);
      ear.pivot.rotation.set(deg(-8) * f, deg(ear.side * 110) * f, deg(-ear.side * 68) * f);
      ear.pivot.scale.set(1 + 0.04*f, 1 + 0.45*f, 1 - 0.26*f);
      ear.pivot.position.set(ear.side * 0.075 * f, -0.018 * f, 0.008 * f);

      const pos = ear.geo.attributes.position, mx = deg(24) * tw * (1 - f * 0.55);
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
      tongueGrp.visible = Boolean(cfg.tongue) && cfg.mouthMode !== 'open';

      // Spiral-Augen drehen sich lustig bei Schwindel!
      if (cfg.eyeMode === 'Dizzy') {
        const spin = performance.now() * 0.009;
        eyeL.states.Dizzy.rotation.z = spin;
        eyeR.states.Dizzy.rotation.z = -spin;
      }

      const lx = clamp(cfg.lookX, -1, 1), ly = clamp(cfg.lookY, -1, 1);
      const key = `${cfg.eyeMode}|${lx.toFixed(2)}|${ly.toFixed(2)}|${cfg.eyeSX.toFixed(2)}|${cfg.eyeSY.toFixed(2)}|${cfg.browMode}`;
      if (key === lastFaceKey) return;
      lastFaceKey = key;

      for (const e of [eyeL, eyeR]) {
        for (const k in e.states) e.states[k].visible = (k === cfg.eyeMode);
        const trackScale = (cfg.eyeMode === 'Closed' || cfg.eyeMode === 'Wince' || cfg.eyeMode === 'Dizzy') ? 0.25 : 1.0;
        e.content.position.set(lx * 0.026 * trackScale, ly * 0.018 * trackScale, 0);
        e.content.scale.set(cfg.eyeSX, cfg.eyeSY, 1);
        if (cfg.eyeMode === 'BigCute') e.pupilBig.position.set(lx * 0.013, ly * 0.010, 0);
        if (cfg.eyeMode === 'Shocked') e.pupilShock.position.set(lx * 0.022, ly * 0.015, 0);
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

    return {
      root, bodyMesh: body, mouth, centerY, maxY, earL, earR,
      deformBody, applyTail, applyEar, applyFace,
      setResolution: (w, h, refDist) => {
        outBody.uniforms.uResolution.value.set(w, h);
        outEar.uniforms.uResolution.value.set(w, h);
        outTail.uniforms.uResolution.value.set(w, h);
        if (refDist) {
          outBody.uniforms.uRefDist.value = refDist;
          outEar.uniforms.uRefDist.value = refDist;
          outTail.uniforms.uRefDist.value = refDist;
        }
      },
    };
  }

  // ===========================================================================
  // 2D-Anime-Partikel (Aufprall-Linien, Herzen, Glitzer, Glas-Platsch, Staub, Zzz)
  // ===========================================================================
  function createFXSystem(scene, camera) {
    const items = [];
    const inkMat = new THREE.MeshBasicMaterial({ color: SHARED.ink, side: THREE.DoubleSide, transparent: true, depthTest: false });
    const tickGeo = new THREE.PlaneGeometry(0.12, 0.022);
    const ringGeo = new THREE.RingGeometry(0.16, 0.21, 36);
    ringGeo.rotateX(-Math.PI / 2);
    const glassRingGeo = new THREE.RingGeometry(0.28, 0.34, 40);

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
      c.fillStyle = '#D48A45'; c.fillText('♪', s/2, s/2 + 3);
    });
    const dustTex = mkTex(64, (c, s) => {
      c.fillStyle = 'rgba(204, 198, 188, 0.82)';
      c.beginPath(); c.arc(s/2, s/2, 24, 0, Math.PI*2); c.fill();
    });

    const spawnSprite = (tex, x, y, z, vx, vy, vz, scale, life, kind) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.95, depthTest: false }));
      sp.position.set(x, y, z); sp.scale.setScalar(scale); sp.renderOrder = 30; scene.add(sp);
      items.push({ m: sp, vx, vy, vz, life, maxLife: life, kind, baseScale: scale, phase: Math.random() * 6 });
    };

    const spawnImpact = (x, y, z, nx, ny, power) => {
      const count = Math.min(8, 4 + Math.floor(power * 0.3));
      const baseAng = Math.atan2(ny, nx);
      for (let i = 0; i < count; i++) {
        const a = (Math.abs(nx) + Math.abs(ny) < 0.2)
          ? (i / count) * Math.PI * 2 + Math.random() * 0.25
          : baseAng + (i / (count - 1 || 1) - 0.5) * 2.2;
        const m = new THREE.Mesh(tickGeo, inkMat.clone());
        m.position.set(x + Math.cos(a)*0.09, y + Math.sin(a)*0.09, z);
        m.renderOrder = 30; scene.add(m);
        const spd = 1.6 + Math.random()*1.5 + power*0.09;
        items.push({ m, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd, vz: 0, life: 0.24, maxLife: 0.24, kind: 'tick', rotZ: a });
      }
    };
    const spawnGlassSplat = (x, y, zGlass) => {
      const m = new THREE.Mesh(
        glassRingGeo,
        new THREE.MeshBasicMaterial({ color: '#181514', side: THREE.DoubleSide, transparent: true, opacity: 0.22, depthWrite: false }),
      );
      m.position.set(x, y, zGlass - 0.015);
      m.scale.setScalar(0.65);
      m.renderOrder = 29;
      scene.add(m);
      items.push({ m, vx: 0, vy: 0, vz: 0, life: 0.42, maxLife: 0.42, kind: 'glassRing', baseScale: 1, phase: 0 });
    };
    const spawnHearts = (x, y, z, count = 3) => {
      for (let i = 0; i < count; i++) {
        spawnSprite(heartTex, x+(Math.random()-0.5)*0.6, y+0.48+Math.random()*0.22, z+(Math.random()-0.5)*0.25,
          (Math.random()-0.5)*0.35, 0.92+Math.random()*0.40, 0, 0.22+Math.random()*0.10, 0.95, 'float');
      }
    };
    const spawnSparkles = (x, y, z, count = 4) => {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
        spawnSprite(sparkleTex, x+Math.cos(a)*0.62, y+0.45+Math.random()*0.32, z+Math.sin(a)*0.30,
          Math.cos(a)*0.28, 0.55+Math.random()*0.35, 0, 0.24+Math.random()*0.08, 1.0, 'sparkle');
      }
    };
    const spawnPuff = (x, y, z, dirX, dirZ) => {
      spawnSprite(puffTex, x + dirX*0.58, y + 0.16, z + dirZ*0.58, dirX*0.75, 0.32, dirZ*0.75, 0.30, 0.78, 'puff');
    };
    const spawnZzz = (x, y, z) => {
      spawnSprite(zTex, x + 0.34, y + 0.56, z + 0.14, 0.14, 0.48, 0, 0.22, 1.65, 'zzz');
    };
    const spawnQuestion = (x, y, z) => {
      spawnSprite(qTex, x + 0.32, y + 0.62, z + 0.12, 0.04, 0.36, 0, 0.26, 1.10, 'float');
    };
    const spawnNote = (x, y, z) => {
      spawnSprite(noteTex, x + (Math.random()-0.5)*0.45, y + 0.58, z + 0.12, (Math.random()-0.5)*0.25, 0.52, 0, 0.23, 1.0, 'float');
    };
    const spawnDust = (x, y, z, count = 4) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, spd = 0.45 + Math.random() * 0.70;
        spawnSprite(dustTex, x + Math.cos(a)*0.22, Math.max(0.05, y), z + Math.sin(a)*0.22,
          Math.cos(a)*spd, 0.25 + Math.random()*0.32, Math.sin(a)*spd, 0.15 + Math.random()*0.08, 0.48, 'dust');
      }
    };
    const spawnRipple = (x, z, colorHex = '#B86524') => {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.78, depthWrite: false }));
      m.position.set(x, 0.010, z); m.scale.setScalar(0.35); m.renderOrder = -4; scene.add(m);
      items.push({ m, vx: 0, vy: 0, vz: 0, life: 0.58, maxLife: 0.58, kind: 'ripple', baseScale: 1, phase: 0 });
    };

    const update = (dt) => {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i]; it.life -= dt;
        if (it.life <= 0) { scene.remove(it.m); it.m.material.dispose(); items.splice(i, 1); continue; }
        const u = it.life / it.maxLife;
        it.m.position.x += it.vx*dt; it.m.position.y += it.vy*dt; it.m.position.z += it.vz*dt;
        if (it.kind === 'tick') {
          it.m.quaternion.copy(camera.quaternion); it.m.rotateZ(it.rotZ);
          it.vx *= 1 - 7*dt; it.vy *= 1 - 7*dt; it.m.scale.set(u, 0.5+0.5*u, 1);
        } else if (it.kind === 'float') {
          it.m.position.x += Math.sin(it.phase + (1-u)*8) * 0.24 * dt;
        } else if (it.kind === 'dust') {
          it.vx *= 1 - 3.5*dt; it.vz *= 1 - 3.5*dt;
          it.m.scale.setScalar(it.baseScale * (0.7 + (1-u) * 0.9));
        } else if (it.kind === 'ripple') {
          const p = 1 - u;
          it.m.scale.setScalar(0.35 + p * 2.2);
          it.m.material.opacity = u * 0.72;
          continue;
        } else if (it.kind === 'glassRing') {
          const p = 1 - u;
          it.m.scale.setScalar(0.65 + p * 1.45);
          it.m.material.opacity = u * 0.22;
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
    return { spawnImpact, spawnGlassSplat, spawnHearts, spawnSparkles, spawnPuff, spawnZzz, spawnQuestion, spawnNote, spawnDust, spawnRipple, update };
  }

  // ===========================================================================
  // Renderer, Szene & 3D-Fenster-Diorama-Raum (iPhone-Rand = vorderer Rahmen!)
  // ===========================================================================
  const isMobile = typeof window !== 'undefined' && (
    window.matchMedia?.('(pointer: coarse)')?.matches ||
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  );
  const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NoToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SHARED.bg);
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.2, 45);

  // Raum-Geometrie passt sich exakt dem iPhone-Screen-Seitenverhältnis an!
  const room = { halfW: 1.24, halfD: 2.00, floor: 0.0, ceil: 4.90 };
  const camCfg = { dFront: 4.30, baseEyeY: 1.15 };

  const LA = deg(34), LE = deg(50);
  const lightDir = new THREE.Vector3(Math.cos(LE)*Math.sin(LA), Math.sin(LE), Math.cos(LE)*Math.cos(LA)).normalize();

  // ===========================================================================
  // Reiner weißer Studio-Space mit unsichtbaren 3D-Frustum-Wänden!
  // ===========================================================================
  const shiba = buildShiba(COAT, lightDir);
  shiba.root.matrixAutoUpdate = false;
  scene.add(shiba.root);

  const fx = createFXSystem(scene, camera);

  // Flacher 2D-Cel-Bodenschatten EXAKT wie in mochi_shiba.html:
  // transparent: false + renderOrder: -10 + depthWrite: false -> rendert GARANTIERT VOR den Pfoten!
  const shibaShadow = (() => {
    const g = new THREE.CircleGeometry(1, 64);
    g.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: false,
      depthWrite: false,
      depthTest: true,
      uniforms: {
        uColor:   { value: new THREE.Color(SHARED.groundShad) },
        uBgColor: { value: new THREE.Color(SHARED.bg) },
        uOpacity: { value: 0.86 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform vec3 uBgColor; uniform float uOpacity; varying vec2 vUv;
        void main(){
          float r = length(vUv);
          if (r > 1.0) discard;
          float aa = max(fwidth(r) * 1.2, 0.012);
          float alpha = (1.0 - smoothstep(1.0 - aa, 1.0, r)) * uOpacity;
          gl_FragColor = vec4(mix(uBgColor, uColor, alpha), 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = -10;
    scene.add(m);
    return { mesh: m, mat };
  })();

  // ===========================================================================
  // Off-Axis 3D-Fenster-Kamera (Bildschirmrand = vorderer Rahmen, 3D-Parallax!)
  // ===========================================================================
  const motion = { gx: 0, gz: 0, targetGx: 0, targetGz: 0, lastShakeAt: 0 };
  const view = {
    peekX: 0, peekY: 0,
    targetPeekX: 0, targetPeekY: 0,
    eyeX: 0, eyeY: 1.15,
  };

  function updateCamera(dt, shake) {
    // Sanftes Zurückfedern beim Loslassen des 3D-Umschauens
    if (ptr.mode !== 'peek') {
      view.targetPeekX = lerp(view.targetPeekX, 0, Math.min(1, dt * 3.6));
      view.targetPeekY = lerp(view.targetPeekY, 0, Math.min(1, dt * 3.6));
    }
    view.peekX = lerp(view.peekX, view.targetPeekX, Math.min(1, dt * 11));
    view.peekY = lerp(view.peekY, view.targetPeekY, Math.min(1, dt * 11));

    // iPhone-Gyroskop-Parallax + sanfte Shiba-Blickfolge + manuelles 3D-Rein-Linsen
    const goalEyeX = clamp(motion.gx * 1.05 + view.peekX + body.x * 0.08, -2.4, 2.4);
    const goalEyeY = clamp(camCfg.baseEyeY - motion.gz * 0.72 + view.peekY + clamp(body.y - 0.8, 0, 3.0) * 0.08, 0.55, room.ceil - 0.55);
    view.eyeX = lerp(view.eyeX, goalEyeX, Math.min(1, dt * 10));
    view.eyeY = lerp(view.eyeY, goalEyeY, Math.min(1, dt * 10));

    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;
    const ex = view.eyeX + sx;
    const ey = view.eyeY + sy;
    const d = camCfg.dFront;

    camera.position.set(ex, ey, room.halfD + d);
    camera.quaternion.identity();
    camera.updateMatrixWorld();

    // Exakte Off-Axis-Frustum-Projektion: unsichtbare Wände sitzen sauber am iPhone-Rand (+ etwas Home-Bar-Luft unten!)
    const near = camera.near;
    const far = camera.far;
    const scale = near / d;
    const floorPad = 0.42;
    const left   = (-room.halfW - ex) * scale;
    const right  = ( room.halfW - ex) * scale;
    const bottom = (-floorPad   - ey) * scale;
    const top    = ( room.ceil  - ey) * scale;
    camera.projectionMatrix.makePerspective(left, right, top, bottom, near, far);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  function resize() {
    const w = container.clientWidth || innerWidth;
    const h = container.clientHeight || innerHeight;
    const aspect = w / Math.max(h, 1);

    if (aspect < 0.85) {
      // iPhone / Portrait: niedrige Augenhöhe wie mochi_shiba.html + Frustum wächst nach hinten mit den Screen-Rändern!
      room.halfW = 1.24;
      room.ceil  = clamp(room.halfW * 2 / aspect - 0.36, 4.0, 5.10);
      room.halfD = 2.00;
      camCfg.dFront = 4.30;
      camCfg.baseEyeY = 1.15;
    } else {
      // Desktop / Landscape / iPad
      room.ceil  = 3.45;
      room.halfW = clamp(((room.ceil + 0.35) * aspect) / 2, 1.75, 3.20);
      room.halfD = 2.15;
      camCfg.dFront = 4.10;
      camCfg.baseEyeY = 1.05;
    }

    frustum.rebuild();
    renderer.setSize(w, h);
    shiba.setResolution(w, h, camCfg.dFront + room.halfD * 0.72);
    updateCamera(1, 0);
  }

  // ===========================================================================
  // 3D-Physik (direkt, ohne Verzögerung, natürliche elastische Bounces!)
  // ===========================================================================
  const RX = 0.66, RY = shiba.centerY, RZ = 0.62;
  const MASS = 1.0, INERTIA = 0.20, G = 22.0, MAX_THROW = 34;

  const body = {
    x: 0.0, y: RY + 0.01, z: 0.65,
    vx: 0, vy: 0, vz: 0,
    quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, deg(16), 0)),
    ox: 0, oy: 0, oz: 0,
    onFloor: true,
    wallPress: 0,
  };

  const soft = {
    jx: 0, jvx: 0, jy: 0, jvy: 0,
    shearX: 0, shvX: 0, shearZ: 0, shvZ: 0,
    bendX: 0, bvx: 0, bendY: 0, bvy: 0,
    stretch: 0, stX: 0, stY: 1, stZ: 0,
    pullX: 0, pullY: 0, pullZ: 0, pvx: 0, pvy: 0, pvz: 0,
    camShake: 0,
    earL: 0, earLV: 0, earR: 0, earRV: 0,
    planeAmt: 0,
    tailW: 0, tailWV: 0, tailC: 0, tailCV: 0,
  };

  const events = [];
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  const _qInv = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _qErr = new THREE.Quaternion();
  const _tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  function ellipsoidExtent(nx, ny, nz, quat) {
    _qInv.copy(quat).invert();
    _v1.set(nx, ny, nz).applyQuaternion(_qInv);
    const h = Math.hypot(RX * _v1.x, RY * _v1.y, RZ * _v1.z);
    _v2.set(-RX*RX*_v1.x/h, -RY*RY*_v1.y/h, -RZ*RZ*_v1.z/h).applyQuaternion(quat);
    return { h, rx: _v2.x, ry: _v2.y, rz: _v2.z };
  }

  function softWallCollide3D(nx, ny, nz, planeD, hStep, wallTag) {
    const { h, rx, ry, rz } = ellipsoidExtent(nx, ny, nz, body.quat);
    const pen = h - (nx*body.x + ny*body.y + nz*body.z - planeD);
    if (pen <= 0) return 0;

    const vcx = body.vx + (body.oy*rz - body.oz*ry);
    const vcy = body.vy + (body.oz*rx - body.ox*rz);
    const vcz = body.vz + (body.ox*ry - body.oy*rx);
    const vn = vcx*nx + vcy*ny + vcz*nz;

    const grabbed = ptr.grabbed === 'shiba';
    const isFloor = wallTag === 'floor';
    const isFrontGlass = wallTag === 'front';

    // Kein künstliches Ankleben/Delay -> sofortige, knackige elastische Kollision!
    const maxComp = h * (grabbed ? 0.34 : 0.26);
    const penC = Math.min(pen, maxComp);
    const isRestFloor = isFloor && !grabbed;

    const kWall = grabbed ? 150 : isRestFloor ? 1250 : 340;
    const kSq   = grabbed ? 480 : isRestFloor ? 1700 : 760;
    const damp  = grabbed ? 14 : isRestFloor ? 16.0 : 8.5;
    const fn = Math.max(0, kWall * penC + kSq * penC * penC - damp * vn);

    body.vx += (nx*fn/MASS)*hStep;
    body.vy += (ny*fn/MASS)*hStep;
    body.vz += (nz*fn/MASS)*hStep;
    if (!grabbed) {
      const fx = nx*fn, fy = ny*fn, fz = nz*fn;
      body.ox += ((ry*fz - rz*fy)/INERTIA)*hStep*0.58;
      body.oy += ((rz*fx - rx*fz)/INERTIA)*hStep*0.58;
      body.oz += ((rx*fy - ry*fx)/INERTIA)*hStep*0.58;
    }
    if (pen > maxComp) {
      const ex = pen - maxComp;
      body.x += nx*ex; body.y += ny*ex; body.z += nz*ex;
      if (vn < 0) {
        const b = grabbed ? 0.05 : isFloor ? 0.44 : 0.60;
        body.vx -= (1+b)*vn*nx; body.vy -= (1+b)*vn*ny; body.vz -= (1+b)*vn*nz;
      }
    }
    const vtx = vcx - vn*nx, vty = vcy - vn*ny, vtz = vcz - vn*nz, vtLen = Math.hypot(vtx,vty,vtz);
    if (vtLen > 1e-4) {
      const fric = grabbed ? 0.20 : isFloor ? 0.40 : 0.22;
      const fMag = Math.min(vtLen*16, fric * fn);
      const ftx = -(vtx/vtLen)*fMag, fty = -(vty/vtLen)*fMag, ftz = -(vtz/vtLen)*fMag;
      body.vx += (ftx/MASS)*hStep; body.vy += (fty/MASS)*hStep; body.vz += (ftz/MASS)*hStep;
      if (!grabbed) {
        const aS = Math.abs(vn) < 0.9 && isFloor ? 0.22 : 0.65;
        body.ox += ((ry*ftz - rz*fty)/INERTIA)*hStep*aS;
        body.oy += ((rz*ftx - rx*ftz)/INERTIA)*hStep*aS;
        body.oz += ((rx*fty - ry*ftx)/INERTIA)*hStep*aS;
      }
    }
    if (!grabbed && -vn > 1.8 && pen < 0.22) {
      events.push({
        nx, ny, nz, speed: -vn,
        cx: body.x+rx, cy: body.y+ry, cz: isFrontGlass ? room.halfD : body.z+rz,
        kind: isFrontGlass ? 'glass' : (isFloor && -vn > 5.8) ? 'pancake' : 'wall',
      });
    }
    return penC / h;
  }

  // ===========================================================================
  // Lebendiges Shiba-Eigenleben („als wäre das ein echtes Lebewesen im Raum“)
  // ===========================================================================
  const brain = {
    state: 'idle', // 'idle'|'approachGlass'|'inspectGlass'|'wander'|'sniff'|'zoomies'|'stretch'|'nap'|'comeToSpot'|'shakeOff'
    timer: 2.2,
    stepCd: 0,
    targetX: 0, targetZ: 0.35,
    energy: 0.90,
    zoomAngle: 0,
    sniffCount: 0,
    tiltSign: 1,

    interrupt(withStretch = false) {
      const wasNap = this.state === 'nap';
      if (wasNap && withStretch) {
        this.enter('stretch', 1.15);
        sfx.yawn();
        return;
      }
      this.state = 'idle';
      this.timer = 2.6 + Math.random() * 2.0;
    },

    enter(st, dur = 3.2) {
      this.state = st;
      this.timer = dur;
      this.stepCd = 0.08;
      this.tiltSign = Math.random() < 0.5 ? 1 : -1;
      if (st === 'sniff' || st === 'inspectGlass') this.sniffCount = 0;
      if (st === 'zoomies') {
        this.zoomAngle = Math.atan2(body.z, body.x);
        sfx.yip();
        fx.spawnSparkles(body.x, body.y + 0.18, body.z, 4);
        fx.spawnNote(body.x, body.y, body.z);
      }
      if (st === 'stretch') {
        sfx.yawn();
        soft.tailWV += 7;
      }
      if (st === 'shakeOff') {
        sfx.shakeOff();
        soft.shvX += 11; soft.earLV += 11; soft.earRV += 11; soft.tailWV += 14;
      }
    },

    callTo(x, z, excited = true) {
      mood.wakeUp();
      this.energy = Math.min(1, this.energy + 0.15);
      if (this.state === 'nap') {
        this.enter('stretch', 0.85);
        return;
      }
      this.targetZ = clamp(z, -room.halfD + 0.68, room.halfD - 0.64);
      const bnd = frustum.boundsAtZ(this.targetZ);
      this.targetX = clamp(x, -bnd.maxX + 0.68, bnd.maxX - 0.68);
      this.enter('comeToSpot', 5.2);
      if (excited) {
        fx.spawnNote(body.x, body.y, body.z);
        sfx.yip();
      }
    },

    hopStep(tx, tz, speedScale = 1.0, jumpY = 3.2) {
      const dx = tx - body.x, dz = tz - body.z, dist = Math.hypot(dx, dz) || 1;
      const spd = clamp(dist * 2.4, 1.8, 4.4) * speedScale;
      body.vx += (dx / dist) * spd;
      body.vz += (dz / dist) * spd;
      body.vy += jumpY;
      soft.jvy -= 3.6; soft.jvx += 3.0; soft.tailWV += 10;
      fx.spawnDust(body.x, 0.03, body.z, 2);
      sfx.hop();
    },

    pickNextActivity(idleSec) {
      // Nach ~20s Ruhe gemütlich eindösen
      if (this.energy < 0.22 || idleSec > 20) {
        this.enter('nap', 14.0);
        return;
      }
      const r = Math.random();
      // 38%: Neugierig ganz nach vorne an die iPhone-Glasscheibe trippeln & dich anschauen!
      if (r < 0.38 && body.z < room.halfD - 1.15) {
        this.targetX = (Math.random() - 0.5) * (room.halfW * 0.72);
        this.targetZ = room.halfD - 0.66;
        this.enter('approachGlass', 5.0);
        return;
      }
      // 22%: Spontane 3D-Zoomies quer durch die ganze Raumtiefe!
      if (r < 0.60 && this.energy > 0.45) {
        this.enter('zoomies', 3.2);
        return;
      }
      // 40%: Tief in den 3D-Raum wandern (auch ganz nach hinten!) & schnüffeln
      for (let tries = 0; tries < 6; tries++) {
        const rz = (Math.random() - 0.5) * (room.halfD * 1.50);
        const bnd = frustum.boundsAtZ(rz);
        const rx = (Math.random() - 0.5) * (bnd.maxX * 1.45);
        if (Math.hypot(rx - body.x, rz - body.z) > 0.9) {
          this.targetX = rx; this.targetZ = rz; break;
        }
      }
      this.enter('wander', 4.6);
    },

    update(dt, now) {
      const idleSec = (now - mood.lastInteract) / 1000;
      if (this.state === 'nap') {
        this.energy = clamp(this.energy + dt * 0.09, 0, 1);
      } else if (this.state === 'zoomies') {
        this.energy = clamp(this.energy - dt * 0.055, 0, 1);
      } else {
        this.energy = clamp(this.energy - dt * 0.010, 0, 1);
      }

      const busy = ptr.grabbed === 'shiba' || mood.winceT > 0 || mood.dazeT > 0 || mood.huffT > 0;
      if (busy) {
        if (this.state !== 'idle') this.state = 'idle';
        this.timer = 1.8;
        return;
      }

      this.timer -= dt;
      this.stepCd -= dt;

      switch (this.state) {
        case 'idle':
          if (this.timer <= 0 && body.onFloor) this.pickNextActivity(idleSec);
          break;

        case 'approachGlass': {
          const dist = Math.hypot(this.targetX - body.x, this.targetZ - body.z);
          if (dist < 0.42 || this.timer <= 0) {
            this.enter('inspectGlass', 3.6);
            break;
          }
          if (body.onFloor && this.stepCd <= 0) {
            this.stepCd = 0.40;
            this.hopStep(this.targetX, this.targetZ, 0.95, 2.7);
          }
          break;
        }

        case 'inspectGlass':
          // Schnüffelt neugierig an der iPhone-Scheibe und schaut dich groß an!
          if (this.stepCd <= 0 && body.onFloor) {
            this.stepCd = 0.85;
            this.sniffCount++;
            sfx.sniff();
            soft.jvy -= 1.4; soft.jvx += 1.2; soft.earLV += 4; soft.earRV += 4; soft.tailWV += 10;
            if (this.sniffCount === 1) fx.spawnQuestion(body.x, body.y, body.z);
            else if (this.sniffCount === 2) fx.spawnHearts(body.x, body.y + 0.12, body.z, 1);
          }
          if (this.timer <= 0) this.enter('idle', 2.6);
          break;

        case 'wander': {
          const dist = Math.hypot(this.targetX - body.x, this.targetZ - body.z);
          if (dist < 0.45 || this.timer <= 0) {
            this.enter('sniff', 2.1 + Math.random() * 1.0);
            break;
          }
          if (body.onFloor && this.stepCd <= 0) {
            this.stepCd = 0.46;
            this.hopStep(this.targetX, this.targetZ, 0.88, 2.6);
          }
          break;
        }

        case 'sniff':
          if (this.stepCd <= 0 && body.onFloor) {
            this.stepCd = 0.62;
            this.sniffCount++;
            sfx.sniff();
            soft.jvy -= 1.4; soft.jvx += 1.3; soft.earLV += 3.5; soft.earRV += 3.5;
            fx.spawnDust(body.x, 0.04, body.z, 2);
            if (this.sniffCount === 1 && Math.random() < 0.5) fx.spawnQuestion(body.x, body.y, body.z);
          }
          if (this.timer <= 0) this.enter('idle', 2.0 + Math.random() * 1.8);
          break;

        case 'zoomies': {
          this.zoomAngle += dt * 3.1;
          const zz = Math.sin(this.zoomAngle * 1.35) * (room.halfD * 0.65);
          const bnd = frustum.boundsAtZ(zz);
          const zx = Math.cos(this.zoomAngle) * (bnd.maxX * 0.62);
          this.targetX = zx; this.targetZ = zz;
          if (body.onFloor && this.stepCd <= 0) {
            this.stepCd = 0.26;
            this.hopStep(zx, zz, 1.38, 3.6);
            fx.spawnDust(body.x, 0.04, body.z, 3);
            if (Math.random() < 0.35) fx.spawnSparkles(body.x, body.y + 0.14, body.z, 1);
          }
          if (this.timer <= 0) {
            mood.happyT = Math.max(mood.happyT, 1.8);
            this.enter('idle', 2.8);
          }
          break;
        }

        case 'comeToSpot': {
          const dist = Math.hypot(this.targetX - body.x, this.targetZ - body.z);
          if (dist < 0.44 && body.onFloor) {
            if (this.targetZ > room.halfD - 1.05) {
              this.enter('inspectGlass', 2.8);
            } else {
              mood.happyT = Math.max(mood.happyT, 1.4);
              fx.spawnHearts(body.x, body.y + 0.14, body.z, 1);
              soft.jvy -= 3.0; soft.jvx += 2.6; soft.tailWV += 14;
              this.enter('idle', 2.8);
            }
            break;
          }
          if (this.timer <= 0) { this.enter('idle', 2.2); break; }
          if (body.onFloor && this.stepCd <= 0) {
            this.stepCd = 0.36;
            this.hopStep(this.targetX, this.targetZ, 1.18, 3.2);
          }
          break;
        }

        case 'shakeOff':
          if (this.stepCd <= 0) {
            this.stepCd = 0.11;
            const sgn = Math.random() < 0.5 ? 1 : -1;
            soft.shvX += sgn * 8.5; soft.earLV += 6; soft.earRV += 6;
          }
          if (this.timer <= 0) {
            mood.happyT = Math.max(mood.happyT, 1.5);
            this.enter('idle', 2.4);
          }
          break;

        case 'nap':
          if (this.energy >= 0.96 && this.timer <= 0) this.enter('stretch', 1.25);
          break;

        case 'stretch':
          if (this.timer <= 0) {
            this.enter('shakeOff', 0.48);
          }
          break;
      }
    },
  };

  // ===========================================================================
  // Shiba-Emotionen (reaktiv, lebendig, verspielt — kein Spaßbremser!)
  // ===========================================================================
  let lastMoodEmit = 0;

  const mood = {
    happiness: 0.76,
    slamCount: 0,
    lastInteract: performance.now(),
    lastTap: -1e9,
    tapBurst: 0,
    current: 'Zufrieden',
    holdT: 0, eyePop: 0,
    happyT: 0, loveT: 0, winceT: 0, dazeT: 0, pressT: 0,
    skepticT: 0, huffT: 0, shockT: 0, curiousT: 0,
    flying: false, shockedLatch: false,
    blinkT: 2.6, shake: 0, zzzT: 0,
    blush: 0, angerMark: 0, sweat: 0,

    wakeUp() { this.lastInteract = performance.now(); },

    onGrab() {
      this.wakeUp();
      this.huffT = Math.max(0, this.huffT - 1.5);
      brain.interrupt(false);
    },

    onKneadPet() {
      this.wakeUp();
      this.slamCount = Math.max(0, this.slamCount - 1.5);
      this.huffT = 0;
      this.skepticT = 0;
      this.happiness = clamp(this.happiness + 0.14, 0, 1);
      this.loveT = Math.max(this.loveT, 2.6);
    },

    onThrown(speed) {
      this.wakeUp();
      this.flying = speed > 5.8;
      if (speed > 7.5) this.shockT = Math.max(this.shockT, 0.55);
      // Werfen macht ihm erst mal Spaß (aufregendes Fliegen!), erst extremes Dauer-Slammen macht ihn kurz frech
      if (speed > 14.0) this.slamCount += 0.85;
    },

    onGlassSplat(speed) {
      this.wakeUp();
      this.winceT = Math.max(this.winceT, 0.45);
      this.shockT = Math.max(this.shockT, 0.75);
      this.slamCount += speed > 10 ? 0.9 : 0.4;
      if (this.slamCount >= 4.2) {
        this.huffT = 2.6;
        this.slamCount = 0;
        this.triggerHuffPuff();
      }
    },

    onWallImpact(speed) {
      this.wakeUp();
      if (speed > 9.5) {
        this.winceT = Math.max(this.winceT, 0.42);
        this.dazeT = Math.max(this.dazeT, 0.70);
        this.slamCount += 0.8;
        if (this.slamCount >= 4.5) {
          this.huffT = 2.6;
          this.slamCount = 0;
          this.triggerHuffPuff();
        }
      } else if (speed > 5.2) {
        this.winceT = Math.max(this.winceT, 0.22);
      }
      if (speed > 3.6) this.flying = false;
    },

    triggerHuffPuff() {
      sfx.huff();
      this.shake = 0.24;
      _v1.set(0, 0, 1).applyQuaternion(body.quat);
      fx.spawnPuff(body.x, body.y, body.z, _v1.x, _v1.z);
    },

    onTap(now, zone) {
      this.wakeUp();
      if (now - this.lastTap < 460) this.tapBurst++;
      else this.tapBurst = 1;
      this.lastTap = now;

      if (this.tapBurst >= 5) {
        this.tapBurst = 0;
        this.huffT = 2.4;
        this.triggerHuffPuff();
        return 'huff';
      }
      if (zone === 'nose') {
        this.shockT = 0.42;
        this.happyT = 1.6;
        this.happiness = clamp(this.happiness + 0.08, 0, 1);
        return 'boop';
      }
      if (zone === 'head') {
        this.loveT = 2.2;
        this.happiness = clamp(this.happiness + 0.14, 0, 1);
        return 'love';
      }
      this.happyT = 1.6;
      this.happiness = clamp(this.happiness + 0.10, 0, 1);
      return 'happy';
    },

    update(dt, now, speed, pressAmt) {
      this.slamCount = Math.max(0, this.slamCount - dt * 0.35);
      const idleSec = (now - this.lastInteract) / 1000;
      if (idleSec > 5.0) {
        this.happiness = lerp(this.happiness, 0.74, Math.min(1, dt * 0.12));
      }

      this.happyT   = Math.max(0, this.happyT - dt);
      this.loveT    = Math.max(0, this.loveT - dt);
      this.winceT   = Math.max(0, this.winceT - dt);
      const wasDazed = this.dazeT > 0;
      if (this.winceT <= 0) this.dazeT = Math.max(0, this.dazeT - dt);
      // Nach Schwindel schüttelt er sich süß wie ein echter Hund!
      if (wasDazed && this.dazeT <= 0 && body.onFloor && ptr.grabbed !== 'shiba') {
        brain.enter('shakeOff', 0.55);
      }
      this.skepticT = Math.max(0, this.skepticT - dt);
      this.huffT    = Math.max(0, this.huffT - dt);
      this.shockT   = Math.max(0, this.shockT - dt);
      this.curiousT = Math.max(0, this.curiousT - dt);
      this.shake    = Math.max(0, this.shake - dt);
      this.holdT    = Math.max(0, this.holdT - dt);
      this.eyePop   = Math.max(0, this.eyePop - dt * 7.0);

      if (pressAmt > 0.20) this.pressT = Math.min(0.4, this.pressT + dt);
      else this.pressT = Math.max(0, this.pressT - dt * 2.8);

      const wantsShock = (ptr.grabbed === 'shiba' && speed > 5.2) || (this.flying && speed > 5.2);
      const keepShock  = (ptr.grabbed === 'shiba' && speed > 2.8) || (this.flying && speed > 2.6);
      this.shockedLatch = this.shockedLatch ? keepShock : wantsShock;

      const sleepy = brain.state === 'nap';
      const zoomies = brain.state === 'zoomies';
      const stretching = brain.state === 'stretch';
      const inspecting = brain.state === 'inspectGlass' || brain.state === 'approachGlass' || brain.state === 'comeToSpot';
      const sniffing = brain.state === 'sniff';

      let desired = 'Zufrieden';
      let urgent = false;
      if (this.winceT > 0 || this.pressT > 0.11)   { desired = 'Wince'; urgent = true; }
      else if (this.shockedLatch || this.shockT > 0) { desired = 'Shocked'; urgent = true; }
      else if (this.dazeT > 0)                     { desired = 'Dazed'; urgent = true; }
      else if (this.huffT > 0)                     { desired = 'Hmpf'; urgent = true; }
      else if (this.loveT > 0)                     { desired = 'Love'; urgent = true; }
      else if (stretching)                         { desired = 'Stretching'; urgent = true; }
      else if (zoomies)                            { desired = 'Zoomies'; urgent = true; }
      else if (this.skepticT > 0)                  { desired = 'Skeptic'; }
      else if (sleepy)                             { desired = 'Sleepy'; }
      else if (this.happyT > 0)                    { desired = 'Happy'; }
      else if (inspecting || this.curiousT > 0)    { desired = 'Curious'; }
      else if (sniffing)                           { desired = 'Sniffing'; }

      if (desired !== this.current && (urgent || this.holdT <= 0)) {
        this.current = desired;
        this.holdT = (desired === 'Zufrieden' || desired === 'Curious') ? 0.18 : 0.34;
        this.eyePop = 1.0;
      }

      let eyeMode = 'Button', mouthMode = 'happy', browMode = 'normal';
      let tongue = false, frown = false, wantPlane = 0, cheekPuff = 0;

      switch (this.current) {
        case 'Wince':
          eyeMode = 'Wince'; mouthMode = 'growl'; browMode = 'angry'; frown = true; wantPlane = 0.72; break;
        case 'Shocked':
          eyeMode = 'Shocked'; mouthMode = 'open'; browMode = 'shock'; break;
        case 'Dazed':
          eyeMode = 'Dizzy'; mouthMode = 'open'; wantPlane = 0.78; break;
        case 'Love':
          eyeMode = 'Heart'; mouthMode = 'happy'; tongue = true; wantPlane = 0.90; break;
        case 'Happy':
          eyeMode = 'Happy'; mouthMode = 'happy'; tongue = true; wantPlane = 0.82; break;
        case 'Zoomies':
          eyeMode = 'BigCute'; mouthMode = 'happy'; tongue = true; wantPlane = 0.94; break;
        case 'Stretching':
          eyeMode = 'Closed'; mouthMode = 'open'; wantPlane = 0.74; break;
        case 'Sniffing':
          eyeMode = 'Button'; mouthMode = 'normal'; wantPlane = 0.16; break;
        case 'Hmpf':
          eyeMode = 'Pout'; mouthMode = 'hmpf'; browMode = 'angry'; frown = true; cheekPuff = 1.0; wantPlane = 0.56; break;
        case 'Skeptic':
          eyeMode = 'Skeptic'; mouthMode = 'flat'; browMode = 'skeptic'; break;
        case 'Curious':
          eyeMode = 'BigCute'; mouthMode = 'happy'; tongue = brain.state === 'comeToSpot'; break;
        case 'Sleepy':
          eyeMode = 'Closed'; mouthMode = 'normal'; wantPlane = 0.84;
          this.zzzT -= dt;
          if (this.zzzT <= 0) { this.zzzT = 1.45; fx.spawnZzz(body.x, body.y, body.z); }
          break;
        default:
          eyeMode = (this.happiness > 0.70 && idleSec > 3.5) ? 'Happy' : 'Button';
          mouthMode = 'happy';
          break;
      }

      if (eyeMode === 'BigCute' || eyeMode === 'Button') {
        this.blinkT -= dt;
        if (this.blinkT < 0) {
          if (this.blinkT > -0.12) eyeMode = 'Closed';
          else this.blinkT = 2.4 + Math.random() * 2.6;
        }
      }

      const wantBlush = (this.current === 'Love' || this.current === 'Happy' || this.current === 'Zoomies') ? 0.72 : 0;
      this.blush = lerp(this.blush, wantBlush, Math.min(1, dt * 6));

      const wantAnger = (this.current === 'Hmpf') ? 1 : 0;
      this.angerMark = lerp(this.angerMark, wantAnger, Math.min(1, dt * 8));

      const wantSweat = (this.current === 'Shocked' || this.current === 'Dazed') ? 1 : 0;
      this.sweat = lerp(this.sweat, wantSweat, Math.min(1, dt * 9));

      if (now - lastMoodEmit > 140) {
        lastMoodEmit = now;
        emitMood({ current: this.current, happiness: this.happiness });
      }

      return {
        eyeMode, mouthMode, browMode, tongue, frown, wantPlane, cheekPuff,
        sleepy, zoomies, stretching, sniffing, inspecting,
        excited: this.current === 'Love' || this.current === 'Happy' || zoomies,
      };
    },
  };

  // ===========================================================================
  // Ultra-reaktive 3D Mobile Touch- & Wurf-Mechanik (0ms Lag!)
  // ===========================================================================
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPt = new THREE.Vector3();
  const _planeNormal = new THREE.Vector3(0, 0, 1);

  const ptr = {
    down: false,
    mode: null,     // 'shiba' | 'peek'
    grabbed: null,  // 'shiba' | null
    id: null,
    t0: 0, sx0: 0, sy0: 0, lastSx: 0, lastSy: 0,
    dragZ: 0,
    dragPos: new THREE.Vector3(),
    grabLocal: new THREE.Vector3(),
    grabQuat: new THREE.Quaternion(),
    grabStartWorld: new THREE.Vector3(),
    kneadDist: 0,
    lastPetFx: 0,
    samples: [],
    lookWorld: new THREE.Vector3(0, 0.7, 2.5),
    lookActiveT: 0,
  };

  function setRayFromClient(cx, cy) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }
  function rayHitsSphere(cx, cy, cz, radius) {
    const ro = raycaster.ray.origin, rd = raycaster.ray.direction;
    const ocx = ro.x - cx, ocy = ro.y - cy, ocz = ro.z - cz;
    const b = ocx*rd.x + ocy*rd.y + ocz*rd.z;
    const c = ocx*ocx + ocy*ocy + ocz*ocz - radius*radius;
    const d = b*b - c;
    if (d < 0) return null;
    const t = -b - Math.sqrt(d);
    return t > 0 ? raycaster.ray.at(t, new THREE.Vector3()) : null;
  }

  const canvas = renderer.domElement;
  const onContextMenu = (e) => e.preventDefault();
  canvas.addEventListener('contextmenu', onContextMenu);

  // 2-Finger Pinch beim Halten = Tiefe (+Z ans Glas / -Z nach hinten!) direkt verschieben!
  const activeTouches = new Map();
  let pinchStartDist = 0, pinchStartZ = 0;

  let audioUnlocked = false;
  const unlockAudioOnce = () => {
    if (audioUnlocked) return;
    audioUnlocked = true;
    sfx.unlock();
  };
  window.addEventListener('pointerdown', unlockAudioOnce, { passive: true });
  window.addEventListener('touchstart', unlockAudioOnce, { passive: true });

  // Mausrad auf Desktop: Shiba beim Halten vor/zurück schieben
  const onWheel = (e) => {
    e.preventDefault();
    if (ptr.grabbed === 'shiba') {
      ptr.dragZ = clamp(ptr.dragZ - e.deltaY * 0.004, -room.halfD + 0.45, room.halfD - 0.35);
      dragPlane.setFromNormalAndCoplanarPoint(_planeNormal, _v1.set(0, 0, ptr.dragZ));
      ptr.dragPos.z = ptr.dragZ;
    }
  };
  canvas.addEventListener('wheel', onWheel, { passive: false });

  function startShibaGrab() {
    if (ptr.grabbed === 'shiba') return;
    ptr.grabbed = 'shiba';
    ptr.grabQuat.copy(body.quat);
    ptr.grabStartWorld.set(body.x, body.y, body.z);
    ptr.kneadDist = 0;
    mood.onGrab();
    sfx.grab();
    soft.jy += 0.08; soft.jx -= 0.06;
  }

  let lastBgTapAt = 0;

  const onCanvasPointerDown = (e) => {
    sfx.unlock();
    if (e.pointerType === 'touch') {
      activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activeTouches.size === 2 && ptr.grabbed === 'shiba') {
        const [t1, t2] = Array.from(activeTouches.values());
        pinchStartDist = Math.hypot(t1.x - t2.x, t1.y - t2.y) || 1;
        pinchStartZ = ptr.dragZ;
        return;
      }
    }

    setRayFromClient(e.clientX, e.clientY);
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    const now = performance.now();
    ptr.down = true; ptr.id = e.pointerId; ptr.t0 = now;
    ptr.sx0 = ptr.lastSx = e.clientX; ptr.sy0 = ptr.lastSy = e.clientY;
    ptr.grabbed = null;

    // Großzügige Touch-Hitbox auf Mobile -> nie danebengreifen!
    const shibaHit = rayHitsSphere(body.x, body.y, body.z, isMobile ? 1.08 : 0.96);
    if (shibaHit) {
      ptr.mode = 'shiba';
      ptr.dragZ = clamp(body.z, -room.halfD + 0.55, room.halfD - 0.45);
      dragPlane.setFromNormalAndCoplanarPoint(_planeNormal, _v1.set(0, 0, ptr.dragZ));
      if (!raycaster.ray.intersectPlane(dragPlane, hitPt)) hitPt.copy(shibaHit);
      ptr.dragPos.copy(hitPt);
      ptr.samples = [[now, hitPt.x, hitPt.y, hitPt.z]];

      _qInv.copy(body.quat).invert();
      ptr.grabLocal.copy(shibaHit).sub(_v1.set(body.x, body.y, body.z)).applyQuaternion(_qInv);
      ptr.grabLocal.x = clamp(ptr.grabLocal.x, -RX * 0.72, RX * 0.72);
      ptr.grabLocal.y = clamp(ptr.grabLocal.y, -RY * 0.68, RY * 0.68);
      ptr.grabLocal.z = clamp(ptr.grabLocal.z, -RZ * 0.68, RZ * 0.68);
      return;
    }

    ptr.mode = 'peek';
  };
  canvas.addEventListener('pointerdown', onCanvasPointerDown);

  const onGlobalPointerMove = (e) => {
    if (e.pointerType === 'touch' && activeTouches.has(e.pointerId)) {
      activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activeTouches.size === 2 && ptr.grabbed === 'shiba') {
        const [t1, t2] = Array.from(activeTouches.values());
        const curDist = Math.hypot(t1.x - t2.x, t1.y - t2.y) || 1;
        // Finger auseinanderziehen = näher ans Glas (+Z), zusammenschieben = tiefer in den Raum (-Z)!
        const delta = (curDist - pinchStartDist) * 0.015;
        ptr.dragZ = clamp(pinchStartZ + delta, -room.halfD + 0.45, room.halfD - 0.35);
        dragPlane.setFromNormalAndCoplanarPoint(_planeNormal, _v1.set(0, 0, ptr.dragZ));
        ptr.dragPos.z = ptr.dragZ;
        return;
      }
    }

    if (!ptr.down) {
      if (e.target !== canvas) return;
      setRayFromClient(e.clientX, e.clientY);
      const shibaHit = rayHitsSphere(body.x, body.y, body.z, 0.86);
      canvas.style.cursor = shibaHit ? 'grab' : 'default';
      ptr.lookActiveT = 2.8;
      if (shibaHit) {
        ptr.lookWorld.copy(shibaHit);
      } else {
        dragPlane.setFromNormalAndCoplanarPoint(_planeNormal, _v1.set(0, 0, clamp(body.z + 0.6, -room.halfD, room.halfD)));
        if (raycaster.ray.intersectPlane(dragPlane, hitPt)) ptr.lookWorld.copy(hitPt);
      }
      ptr.lastSx = e.clientX; ptr.lastSy = e.clientY;
      return;
    }

    if (e.pointerId !== ptr.id) return;
    setRayFromClient(e.clientX, e.clientY);
    const now = performance.now();

    if (ptr.mode === 'peek') {
      const dx = e.clientX - ptr.lastSx;
      const dy = e.clientY - ptr.lastSy;
      // 3D-Diorama-Einblick: Hintergrund ziehen bewegt den virtuellen Blickpunkt vorm iPhone-Fenster!
      view.targetPeekX = clamp(view.targetPeekX - dx * 0.0085, -2.2, 2.2);
      view.targetPeekY = clamp(view.targetPeekY + dy * 0.0075, -1.35, 1.35);
      ptr.lastSx = e.clientX; ptr.lastSy = e.clientY;
      return;
    }

    if (ptr.mode === 'shiba') {
      const movedPx = Math.hypot(e.clientX - ptr.sx0, e.clientY - ptr.sy0);
      if (!ptr.grabbed && (movedPx > 3 || now - ptr.t0 > 90)) {
        startShibaGrab();
      }
      if (raycaster.ray.intersectPlane(dragPlane, hitPt)) {
        const bnd = frustum.boundsAtZ(ptr.dragZ);
        const nx = clamp(hitPt.x, -bnd.maxX - 0.15, bnd.maxX + 0.15);
        const nyW = clamp(hitPt.y, 0.08, bnd.maxY + 0.15);
        const nz = clamp(ptr.dragZ, -room.halfD - 0.15, room.halfD + 0.15);
        const stepDist = Math.hypot(nx - ptr.dragPos.x, nyW - ptr.dragPos.y);
        ptr.dragPos.set(nx, nyW, nz);
        ptr.lookWorld.copy(ptr.dragPos);
        ptr.lookActiveT = 2.0;

        if (ptr.samples.length === 1 && now - ptr.samples[0][0] > 40) {
          ptr.samples[0][0] = now - 20;
        }
        ptr.samples.push([now, nx, nyW, nz]);
        while (ptr.samples.length > 2 && now - ptr.samples[0][0] > 70) ptr.samples.shift();

        // Sanftes Kneten / Streicheln auf der Stelle (wenn er am Boden bleibt und man weich rubbelt!)
        if (ptr.grabbed === 'shiba' && body.y < RY + 0.42 && Math.hypot(nx - ptr.grabStartWorld.x, nyW - ptr.grabStartWorld.y) < 0.72) {
          ptr.kneadDist += stepDist;
          if (ptr.kneadDist > 0.34) {
            ptr.kneadDist = 0;
            mood.onKneadPet();
            sfx.pet();
            soft.tailWV += 12;
            if (now - ptr.lastPetFx > 360) {
              ptr.lastPetFx = now;
              fx.spawnHearts(body.x, body.y + 0.18, body.z, 2);
            }
          }
        }
      }
      canvas.style.cursor = 'grabbing';
    }
    ptr.lastSx = e.clientX; ptr.lastSy = e.clientY;
  };
  window.addEventListener('pointermove', onGlobalPointerMove);

  function onShibaTap() {
    if (brain.state === 'nap') {
      mood.wakeUp();
      brain.interrupt(true);
      emitHaptic('tap');
      return;
    }
    brain.interrupt(false);
    // Erkennen WO der Shiba angetippt wurde (Nase, Kopf, Bauch, Rücken!)
    let zone = 'belly';
    if (ptr.grabLocal.y > 0.16) zone = 'head';
    else if (ptr.grabLocal.z > 0.30 && Math.abs(ptr.grabLocal.x) < 0.25) zone = 'nose';

    const r = mood.onTap(performance.now(), zone);
    if (r === 'boop') {
      sfx.boop();
      emitHaptic('tap');
      if (body.onFloor) { body.vy += 3.4; body.vz -= 0.9; }
      soft.jvy -= 4.4; soft.jvx += 3.6; soft.earLV += 9; soft.earRV += 9; soft.tailWV += 14;
      fx.spawnSparkles(body.x, body.y + 0.20, body.z + 0.35, 3);
    } else if (r === 'love') {
      sfx.pet();
      emitHaptic('pet');
      if (body.onFloor) body.vy += 2.6;
      soft.jvy -= 3.8; soft.jvx += 3.2; soft.earLV += 7; soft.earRV += 7; soft.tailWV += 16;
      fx.spawnHearts(body.x, body.y + 0.22, body.z, 3);
    } else if (r === 'happy') {
      sfx.yip();
      emitHaptic('tap');
      if (body.onFloor) body.vy += 4.4;
      soft.jvy -= 5.0; soft.jvx += 4.2; soft.bvx += 3.6;
      soft.earLV += 8; soft.earRV += 8; soft.tailWV += 14;
      fx.spawnHearts(body.x, body.y + 0.16, body.z, 2);
    } else {
      if (body.onFloor) body.vy += 2.0;
      soft.jvy -= 3.8; soft.jvx += 3.2; soft.shvX += (Math.random() - 0.5) * 12;
      soft.earLV += 11; soft.earRV += 11;
    }
  }

  const endPointer = (e) => {
    if (e.pointerType === 'touch') {
      activeTouches.delete(e.pointerId);
    }
    if (!ptr.down || e.pointerId !== ptr.id) return;
    ptr.down = false;
    canvas.style.cursor = 'default';

    if (ptr.mode === 'peek') {
      const movedPx = Math.hypot(e.clientX - ptr.sx0, e.clientY - ptr.sy0);
      const now = performance.now();
      if (movedPx < 12 && now - ptr.t0 < 300) {
        setRayFromClient(e.clientX, e.clientY);
        const isDbl = (now - lastBgTapAt) < 340;
        lastBgTapAt = now;

        if (isDbl) {
          // Doppel-Tap irgendwo: Shiba flitzt direkt ganz nach vorne an die Glasscheibe!
          sfx.whistle();
          const tx = clamp(body.x * 0.35, -room.halfW + 0.65, room.halfW - 0.65);
          const tz = room.halfD - 0.65;
          fx.spawnRipple(tx, tz, '#C5742E');
          brain.callTo(tx, tz, true);
        } else if (raycaster.ray.intersectPlane(floorPlane, hitPt) &&
                   hitPt.z >= -room.halfD && hitPt.z <= room.halfD &&
                   Math.abs(hitPt.x) < frustum.boundsAtZ(hitPt.z).maxX) {
          // Boden-Tap (egal ob ganz vorne oder ganz hinten in der 3. Dimension!): Shiba läuft genau dorthin!
          sfx.whistle();
          fx.spawnRipple(hitPt.x, hitPt.z, '#C5742E');
          ptr.lookWorld.set(hitPt.x, 0.35, hitPt.z);
          ptr.lookActiveT = 3.0;
          mood.curiousT = 1.6;
          brain.callTo(hitPt.x, hitPt.z, true);
        } else {
          // Tap oben: Shiba schaut neugierig hin & hopst in diese Richtung!
          const backP = new THREE.Plane(_planeNormal, room.halfD * 0.35);
          if (raycaster.ray.intersectPlane(backP, hitPt)) {
            const tz = hitPt.y > room.ceil * 0.55 ? -room.halfD + 0.85 : room.halfD - 0.72;
            const bnd = frustum.boundsAtZ(tz);
            const tx = clamp(hitPt.x, -bnd.maxX + 0.7, bnd.maxX - 0.7);
            sfx.whistle();
            fx.spawnRipple(tx, tz, '#C5742E');
            ptr.lookWorld.set(hitPt.x, hitPt.y, tz);
            ptr.lookActiveT = 2.6;
            mood.curiousT = 1.6;
            brain.callTo(tx, tz, true);
          }
        }
      }
      ptr.mode = null;
      return;
    }

    if (ptr.grabbed === 'shiba') {
      ptr.grabbed = null;
      const s = ptr.samples;
      // Präzise Flick-Geschwindigkeit (funktioniert bei kurzem Schnippen genauso stark wie beim Durchziehen!)
      let vx = 0, vy = 0, vz = 0;
      if (s.length >= 2) {
        const lastS = s[s.length - 1];
        // Fenster 1: Gesamt-Fenster (letzte ~60ms), Fenster 2: jüngster Flick-Impuls (letzte ~25ms)
        const a = s[0];
        const dtAll = Math.max((lastS[0] - a[0]) / 1000, 1 / 120);
        const vxAll = (lastS[1] - a[1]) / dtAll;
        const vyAll = (lastS[2] - a[2]) / dtAll;
        const vzAll = (lastS[3] - a[3]) / dtAll;

        let recentIdx = s.length - 2;
        while (recentIdx > 0 && lastS[0] - s[recentIdx][0] < 22) recentIdx--;
        const rS = s[recentIdx];
        const dtRec = Math.max((lastS[0] - rS[0]) / 1000, 1 / 120);
        const vxRec = (lastS[1] - rS[1]) / dtRec;
        const vyRec = (lastS[2] - rS[2]) / dtRec;
        const vzRec = (lastS[3] - rS[3]) / dtRec;

        // Nimm den stärkeren Impuls (kurzer knackiger Schnipper wird nie runtergemittelt!)
        const useRec = Math.hypot(vxRec, vyRec) > Math.hypot(vxAll, vyAll);
        const boost = 1.38;
        vx = (useRec ? vxRec : vxAll) * boost;
        vy = (useRec ? vyRec : vyAll) * boost;
        vz = (useRec ? vzRec : vzAll) * 1.25;
      }

      const sp = Math.hypot(vx, vy, vz);
      if (sp > MAX_THROW) {
        vx *= MAX_THROW / sp; vy *= MAX_THROW / sp; vz *= MAX_THROW / sp;
      }

      // Direkt übernehmen (kein verzögertes Blending mit 0!)
      body.vx = vx;
      body.vy = vy;
      body.vz = vz;
      body.oz += clamp(-vx * 0.36, -8, 8);
      body.ox += clamp(vz * 0.36, -8, 8);
      body.oy += clamp(vx * 0.24, -5, 5);

      soft.pvx -= soft.pullX * 32;
      soft.pvy -= soft.pullY * 32;
      soft.pvz -= soft.pullZ * 32;

      const finalSp = Math.hypot(body.vx, body.vy, body.vz);
      if (finalSp > 4.5) {
        sfx.throwWhoosh(finalSp);
      }
      mood.onThrown(finalSp);
    } else if (ptr.mode === 'shiba') {
      onShibaTap();
    }
    ptr.mode = null;
  };
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);

  // ===========================================================================
  // 3D-Physik-Step & Hauptschleife
  // ===========================================================================
  const M = new THREE.Matrix4(), Minv = new THREE.Matrix4(), Tc = new THREE.Matrix4(), Rm = new THREE.Matrix4();
  const _localUp = new THREE.Vector3(), _localFwd = new THREE.Vector3(), _worldUp = new THREE.Vector3(0, 1, 0);
  const _tgtDir = new THREE.Vector3(), _cross = new THREE.Vector3(), _grabGoalQ = new THREE.Quaternion();

  let time = 0, lookX = 0, lookY = 0, prevVx = 0, prevVy = 0, prevVz = 0, lastImpactSfx = 0;
  let earTwitchT = 2.6, earTwitchSide = 1;
  let smoothBreath = 0, smoothCheek = 0, smoothStretch = 0, smoothPitch = 0, smoothRoll = 0;

  function stepPhysics3D(dt, moodFlags) {
    const SUB = Math.min(6, Math.max(4, Math.ceil(dt * 210))), h = dt / SUB;
    body.onFloor = false;
    let maxPress = 0;

    for (let i = 0; i < SUB; i++) {
      if (ptr.grabbed === 'shiba') {
        _v1.copy(ptr.grabLocal).applyQuaternion(body.quat);
        const dx = ptr.dragPos.x - (body.x + _v1.x);
        const dy = ptr.dragPos.y - (body.y + _v1.y);
        const dz = ptr.dragPos.z - (body.z + _v1.z);

        // Sofortige, verzögerungsfreie Finger-Kopplung!
        const kLift = 520;
        const cLift = 30.0;
        body.vx += ((kLift * dx - cLift * body.vx) / MASS) * h;
        body.vy += (((kLift * dy - cLift * body.vy) / MASS) - G * 0.08) * h;
        body.vz += ((kLift * dz - cLift * body.vz) / MASS) * h;

        const swayR = clamp(-body.vx * 0.036, -0.34, 0.34);
        const swayP = clamp(body.vy * 0.018, -0.18, 0.18);
        _tmpEuler.set(swayP, 0, swayR);
        _dq.setFromEuler(_tmpEuler);
        _grabGoalQ.copy(ptr.grabQuat).multiply(_dq);
        _qErr.copy(_grabGoalQ).multiply(_qInv.copy(body.quat).invert());
        if (_qErr.w < 0) _qErr.set(-_qErr.x, -_qErr.y, -_qErr.z, -_qErr.w);
        body.ox += (_qErr.x * 130 - body.ox * 16) * h;
        body.oy += (_qErr.y * 130 - body.oy * 16) * h;
        body.oz += (_qErr.z * 130 - body.oz * 16) * h;
      } else {
        body.vy -= G * h;
        body.vx += motion.gx * 15.0 * h;
        body.vz += motion.gz * 15.0 * h;
        body.vx *= 1 - 0.08 * h;
        body.vz *= 1 - 0.08 * h;
        body.ox *= 1 - 0.45 * h;
        body.oy *= 1 - 0.62 * h;
        body.oz *= 1 - 0.45 * h;
      }

      body.x += body.vx * h;
      body.y += body.vy * h;
      body.z += body.vz * h;

      const omLen = Math.hypot(body.ox, body.oy, body.oz);
      if (omLen > 1e-4) {
        _dq.setFromAxisAngle(_v1.set(body.ox/omLen, body.oy/omLen, body.oz/omLen), Math.min(omLen, 16) * h);
        body.quat.premultiply(_dq).normalize();
      }

      const planes = frustum.planes;
      for (let pi = 0; pi < planes.length; pi++) {
        const pl = planes[pi];
        const p = softWallCollide3D(pl.nx, pl.ny, pl.nz, pl.d, h, pl.tag);
        if (pl.tag === 'floor' && p > 0) body.onFloor = true;
        if (p > maxPress) maxPress = p;
      }

      // NaN & Frustum-Sicherheits-Clamp (wächst nach hinten mit!)
      if (!Number.isFinite(body.x) || !Number.isFinite(body.y) || !Number.isFinite(body.z)) {
        body.x = 0; body.y = RY + 0.02; body.z = 0.65; body.vx = body.vy = body.vz = 0;
      }
      body.z = clamp(body.z, -room.halfD + 0.25, room.halfD - 0.25);
      const bnd = frustum.boundsAtZ(body.z);
      body.x = clamp(body.x, -bnd.maxX + 0.25, bnd.maxX - 0.25);
      body.y = clamp(body.y, 0.22, bnd.maxY - 0.25);

      if (body.onFloor && ptr.grabbed !== 'shiba') {
        // Steht zügig und organisch wieder auf seinen 4 Pfötchen auf!
        _localUp.set(0, 1, 0).applyQuaternion(body.quat);
        _cross.crossVectors(_localUp, _worldUp);
        if (_localUp.y < -0.92 && _cross.lengthSq() < 0.02) _cross.set(0, 0, 0.9);
        body.ox += (_cross.x * 34 - body.ox * 5.0) * h;
        body.oz += (_cross.z * 34 - body.oz * 5.0) * h;

        // Blickrichtung: aktives Ziel -> sonst lebendig zu dir nach vorne durch die Scheibe!
        let turnTarget = null;
        if (brain.state === 'wander' || brain.state === 'zoomies' || brain.state === 'approachGlass' || brain.state === 'comeToSpot') {
          turnTarget = _v3.set(brain.targetX, 0, brain.targetZ);
        } else if (mood.current === 'Hmpf') {
          turnTarget = _v3.set(body.x - 1.4, 0, body.z - 1.0);
        } else if (ptr.lookActiveT > 0.1 && !(moodFlags && moodFlags.sleepy)) {
          turnTarget = _v3.set(ptr.lookWorld.x, 0, ptr.lookWorld.z);
        } else {
          // Schaut dich neugierig-direkt durch die iPhone-Scheibe an!
          turnTarget = _v3.set(view.eyeX * 0.65, 0, room.halfD + 3.0);
        }

        if (turnTarget) {
          _localFwd.set(0, 0, 1).applyQuaternion(body.quat); _localFwd.y = 0;
          if (_localFwd.lengthSq() > 0.02) {
            _localFwd.normalize();
            _tgtDir.set(turnTarget.x - body.x, 0, turnTarget.z - body.z);
            if (_tgtDir.lengthSq() > 0.04) {
              _tgtDir.normalize();
              const yawErr = Math.atan2(_localFwd.z*_tgtDir.x - _localFwd.x*_tgtDir.z, _localFwd.x*_tgtDir.x + _localFwd.z*_tgtDir.z);
              const gain = (brain.state === 'idle' || brain.state === 'nap') ? 5.5 : 16;
              body.oy += (yawErr * gain - body.oy * 4.5) * h;
            }
          }
        } else {
          body.oy *= 1 - 4.0 * h;
        }

        const floorDrag = (moodFlags && moodFlags.sleepy) ? 2.8 : 1.5;
        body.vx *= 1 - floorDrag * h;
        body.vz *= 1 - floorDrag * h;
      }
    }
    body.wallPress = maxPress;
  }

  let lastMoodOut = null;

  function frame(dt) {
    time += dt;
    if (ptr.down && !ptr.grabbed && ptr.mode === 'shiba' && performance.now() - ptr.t0 > 110) {
      startShibaGrab();
    }
    ptr.lookActiveT = Math.max(0, ptr.lookActiveT - dt);

    // Gyroskop glätten
    const mAlpha = Math.min(1, dt * 9.0);
    motion.gx = lerp(motion.gx, motion.targetGx, mAlpha);
    motion.gz = lerp(motion.gz, motion.targetGz, mAlpha);
    if (Math.hypot(motion.gx, motion.gz) > 0.30) {
      mood.wakeUp();
      if (brain.state === 'nap') brain.interrupt(false);
    }

    prevVx = body.vx; prevVy = body.vy; prevVz = body.vz;
    stepPhysics3D(dt, lastMoodOut);

    const speed = Math.hypot(body.vx, body.vy, body.vz);
    const ax = clamp((body.vx - prevVx) / Math.max(dt, 1 / 120), -200, 200);
    const ay = clamp((body.vy - prevVy) / Math.max(dt, 1 / 120), -200, 200);
    const az = clamp((body.vz - prevVz) / Math.max(dt, 1 / 120), -200, 200);
    _qInv.copy(body.quat).invert();
    const aLoc = _v1.set(ax, ay, az).applyQuaternion(_qInv);

    // 1. Aufprall-Ereignisse (Wand, Boden, Decke & iPhone-Glasscheibe!)
    let hardest = null;
    for (const ev of events) if (!hardest || ev.speed > hardest.speed) hardest = ev;
    events.length = 0;

    if (hardest) {
      const isGlass = hardest.kind === 'glass';
      const isPancake = hardest.kind === 'pancake';
      const nLoc = _v2.set(hardest.nx, hardest.ny, hardest.nz).applyQuaternion(_qInv);
      const imp = clamp(hardest.speed * 0.032, 0.04, 0.32);

      // SOFORTIGE Kontakt-Stauchung im Aufprall-Frame (0ms Verzögerung!) + schneller federnder Rücksprung!
      const sxHit = (Math.abs(nLoc.y) + Math.abs(nLoc.z) * 0.7 - Math.abs(nLoc.x)) * imp;
      const syHit = (Math.abs(nLoc.x) + Math.abs(nLoc.z) * 0.7 - Math.abs(nLoc.y)) * imp;
      soft.jx = clamp(soft.jx + sxHit * 0.85, -0.28, 0.34);
      soft.jy = clamp(soft.jy + syHit * 0.92, -0.36, 0.28);
      soft.jvx += sxHit * 4.5;
      soft.jvy += syHit * 4.5;
      soft.bvx += nLoc.y * imp * 3.2;
      soft.bvy += nLoc.x * imp * 3.2;
      soft.earLV += imp * 14;
      soft.earRV += imp * 13;
      soft.tailCV += imp * 12;
      soft.tailWV += (Math.random() - 0.5) * imp * 22;

      const now = performance.now();
      if (now - lastImpactSfx > 60) {
        lastImpactSfx = now;
        if (isGlass) {
          sfx.wallSplat(hardest.speed);
        } else if (isPancake) {
          sfx.pancake(hardest.speed);
        } else {
          sfx.bounce(hardest.speed);
        }
      }

      if (isGlass) {
        fx.spawnGlassSplat(hardest.cx, hardest.cy, room.halfD);
        fx.spawnImpact(hardest.cx, hardest.cy, room.halfD - 0.05, 0, 0, hardest.speed);
        soft.camShake = Math.min(0.08, hardest.speed * 0.005);
        mood.onGlassSplat(hardest.speed);
      } else if (isPancake) {
        fx.spawnDust(hardest.cx, 0.05, hardest.cz, 5);
        fx.spawnImpact(hardest.cx, 0.12, hardest.cz, 0, 1, hardest.speed);
        soft.camShake = Math.min(0.07, hardest.speed * 0.004);
        mood.winceT = Math.max(mood.winceT, 0.24);
        mood.onWallImpact(hardest.speed);
      } else {
        if (hardest.speed > 4.6) {
          fx.spawnImpact(hardest.cx, hardest.cy, hardest.cz, hardest.nx, hardest.ny, hardest.speed);
          soft.camShake = Math.min(0.07, hardest.speed * 0.004);
        } else if (hardest.ny > 0.6 && hardest.speed > 2.0) {
          fx.spawnDust(hardest.cx, 0.04, hardest.cz, 3);
        }
        mood.onWallImpact(hardest.speed);
      }
    }

    // 2. Softbody-Trägheit & knackiges elastisches Rückfedern (kein träger Gummi-Delay!)
    soft.shvX += (-aLoc.x * 0.045) * dt * 16;
    soft.shvZ += (-aLoc.z * 0.045) * dt * 16;
    soft.bvx  += (-aLoc.y * 0.036) * dt * 16;
    soft.bvy  += (-aLoc.x * 0.032) * dt * 16;

    if (ptr.grabbed === 'shiba') {
      _v2.copy(ptr.grabLocal).applyQuaternion(body.quat).add(_v3.set(body.x, body.y, body.z));
      _v3.copy(ptr.dragPos).sub(_v2).applyQuaternion(_qInv);
      const tx = clamp(_v3.x * 0.34, -0.22, 0.22);
      const ty = clamp(_v3.y * 0.34, -0.22, 0.22);
      const tz = clamp(_v3.z * 0.34, -0.22, 0.22);
      soft.pvx += (280 * (tx - soft.pullX) - 20 * soft.pvx) * dt;
      soft.pvy += (280 * (ty - soft.pullY) - 20 * soft.pvy) * dt;
      soft.pvz += (280 * (tz - soft.pullZ) - 20 * soft.pvz) * dt;
      sfx.squish(body.wallPress);
    } else {
      soft.pvx += (-320 * soft.pullX - 16 * soft.pvx) * dt;
      soft.pvy += (-320 * soft.pullY - 16 * soft.pvy) * dt;
      soft.pvz += (-320 * soft.pullZ - 16 * soft.pvz) * dt;
    }
    soft.pullX = clamp(soft.pullX + soft.pvx * dt, -0.24, 0.24);
    soft.pullY = clamp(soft.pullY + soft.pvy * dt, -0.24, 0.24);
    soft.pullZ = clamp(soft.pullZ + soft.pvz * dt, -0.24, 0.24);

    const stepSpring = (val, vel, k, c) => {
      const nv = vel + (-k * val - c * vel) * dt;
      return [val + nv * dt, nv];
    };
    // Straffe, lebendige Mochi-Federn (~180ms Rücksprung statt langsamer Zeitlupe!)
    [soft.jx, soft.jvx]         = stepSpring(soft.jx, soft.jvx, 310, 11.2);
    [soft.jy, soft.jvy]         = stepSpring(soft.jy, soft.jvy, 310, 11.2);
    [soft.shearX, soft.shvX]    = stepSpring(soft.shearX, soft.shvX, 240, 10.5);
    [soft.shearZ, soft.shvZ]    = stepSpring(soft.shearZ, soft.shvZ, 240, 10.5);
    [soft.bendX, soft.bvx]      = stepSpring(soft.bendX, soft.bvx, 230, 10.2);
    [soft.bendY, soft.bvy]      = stepSpring(soft.bendY, soft.bvy, 230, 10.2);

    soft.jx = clamp(soft.jx, -0.28, 0.34);
    soft.jy = clamp(soft.jy, -0.36, 0.28);
    soft.shearX = clamp(soft.shearX, -0.34, 0.34);
    soft.shearZ = clamp(soft.shearZ, -0.34, 0.34);
    soft.bendX = clamp(soft.bendX, -0.38, 0.38);
    soft.bendY = clamp(soft.bendY, -0.38, 0.38);

    const targetSt = (!body.onFloor || ptr.grabbed === 'shiba') ? clamp(speed * 0.014, 0, 0.24) : 0;
    soft.stretch += (targetSt - soft.stretch) * Math.min(1, dt * 13);
    if (speed > 0.7) {
      _v2.set(body.vx / speed, body.vy / speed, body.vz / speed).applyQuaternion(_qInv).normalize();
      soft.stX = lerp(soft.stX, _v2.x, Math.min(1, dt * 14));
      soft.stY = lerp(soft.stY, _v2.y, Math.min(1, dt * 14));
      soft.stZ = lerp(soft.stZ, _v2.z, Math.min(1, dt * 14));
      const sl = Math.hypot(soft.stX, soft.stY, soft.stZ) || 1;
      soft.stX /= sl; soft.stY /= sl; soft.stZ /= sl;
    }

    // 3. Matrix, Emotionen & Mikro-Animationen
    const now = performance.now();
    const shJit = mood.shake > 0 ? Math.sin(time * 72) * 0.028 * mood.shake : 0;
    M.makeTranslation(body.x + shJit, body.y, body.z)
      .multiply(Rm.makeRotationFromQuaternion(body.quat))
      .multiply(Tc.makeTranslation(0, -shiba.centerY, 0));
    Minv.copy(M).invert();

    const moodOut = mood.update(dt, now, speed, body.wallPress);
    lastMoodOut = moodOut;

    const breathFreq = moodOut.sleepy ? 1.3 : moodOut.zoomies ? 4.4 : 2.3;
    const breathAmp  = moodOut.sleepy ? 0.16 : 0.075;
    const baseSquish = moodOut.sleepy ? 0.36 : 0;
    const targetBreath = (body.onFloor && ptr.grabbed !== 'shiba')
      ? (Math.sin(time * breathFreq) * 0.5 + 0.5) * breathAmp + baseSquish : 0;
    smoothBreath = lerp(smoothBreath, targetBreath, Math.min(1, dt * 6.5));
    smoothCheek  = lerp(smoothCheek, moodOut.cheekPuff, Math.min(1, dt * 8.0));

    const targetStretch = moodOut.stretching ? Math.sin(clamp(1 - brain.timer / 1.25, 0, 1) * Math.PI) * 0.92 : 0;
    smoothStretch = lerp(smoothStretch, targetStretch, Math.min(1, dt * 8.5));

    let targetPitch = 0, targetRoll = 0;
    if (moodOut.inspecting) {
      targetPitch = -0.10;
      targetRoll = brain.tiltSign * 0.22; // süßer neugieriger Kopf-Tilt vor der Glasscheibe!
    } else if (moodOut.sniffing) {
      targetPitch = 0.22 + Math.sin(time * 14) * 0.05;
      targetRoll = brain.tiltSign * 0.14;
    } else if (speed > 0.6 && body.onFloor) {
      targetRoll = Math.sin(time * (moodOut.zoomies ? 18 : 12)) * clamp(speed * 0.048, 0, 0.15);
    } else if (!moodOut.sleepy) {
      targetRoll = clamp(-lookX * 0.15, -0.15, 0.15);
      targetPitch = clamp(-lookY * 0.10, -0.10, 0.10);
    }
    smoothPitch = lerp(smoothPitch, targetPitch, Math.min(1, dt * 9.0));
    smoothRoll  = lerp(smoothRoll,  targetRoll,  Math.min(1, dt * 8.0));

    shiba.deformBody({
      jx: soft.jx, jy: soft.jy, shearX: soft.shearX, shearZ: soft.shearZ, bendX: soft.bendX, bendY: soft.bendY,
      stretch: soft.stretch, stLocalX: soft.stX, stLocalY: soft.stY, stLocalZ: soft.stZ,
      pullActive: Math.hypot(soft.pullX, soft.pullY, soft.pullZ) > 0.002,
      grabX: ptr.grabLocal.x, grabY: ptr.grabLocal.y, grabZ: ptr.grabLocal.z,
      pullX: soft.pullX, pullY: soft.pullY, pullZ: soft.pullZ,
      cheekPuff: smoothCheek, bodyStretch: smoothStretch,
      headPitch: smoothPitch, headRoll: smoothRoll,
      breath: smoothBreath, bodyX: body.x, bodyY: body.y, bodyZ: body.z,
    }, M, Minv);

    shiba.root.matrix.copy(M);
    shiba.root.matrixWorldNeedsUpdate = true;
    shiba.root.updateMatrixWorld(true);

    brain.update(dt, now);

    // 4. Augen-Blickverfolgung (schaut dir direkt in die Augen oder zum Finger!)
    let tgtLX = 0, tgtLY = 0;
    const lookTarget = (ptr.lookActiveT > 0.1)
      ? ptr.lookWorld
      : _v3.set(camera.position.x * 0.6, camera.position.y * 0.55, camera.position.z);
    if (!moodOut.sleepy) {
      _v2.copy(lookTarget).sub(_v1.set(body.x, body.y, body.z)).applyQuaternion(_qInv);
      if (_v2.z > -0.4) {
        tgtLX = clamp(_v2.x * 0.72, -1, 1);
        tgtLY = clamp(_v2.y * 0.65, -1, 1);
      }
    }
    lookX += (tgtLX - lookX) * Math.min(1, dt * 12);
    lookY += (tgtLY - lookY) * Math.min(1, dt * 12);

    const pop = Math.sin(mood.eyePop * Math.PI);
    shiba.applyFace({
      eyeMode: moodOut.eyeMode, mouthMode: moodOut.mouthMode, browMode: moodOut.browMode,
      tongue: moodOut.tongue, frown: moodOut.frown,
      lookX, lookY, blush: mood.blush, angerMark: mood.angerMark, sweat: mood.sweat,
      eyeSX: 1 + pop * 0.14, eyeSY: 1 - pop * 0.42,
    });

    // 5. Natürliche, lebendige Ohren (sanftes Wippen, zufälliges Ohr-Zucken & weiches Floppern!)
    soft.planeAmt = lerp(soft.planeAmt, moodOut.wantPlane, Math.min(1, dt * 7.5));
    earTwitchT -= dt;
    let autoTwitchL = 0, autoTwitchR = 0;
    if (earTwitchT < 0) {
      const ph = -earTwitchT / 0.26;
      if (ph < 1) {
        const pulse = Math.sin(ph * Math.PI) * (1 - soft.planeAmt * 0.65);
        if (earTwitchSide < 0) autoTwitchL = pulse * 0.78;
        else autoTwitchR = pulse * 0.78;
      } else {
        earTwitchT = 2.2 + Math.random() * 2.8;
        earTwitchSide = Math.random() < 0.5 ? -1 : 1;
      }
    }
    const earIdleL = Math.sin(time * 2.15) * 0.07 + Math.sin(time * 3.7) * 0.03;
    const earIdleR = Math.sin(time * 2.15 + 0.55) * 0.07 + Math.sin(time * 3.4 + 1.1) * 0.03;
    const earSlip = clamp(-body.vy * 0.048, -0.45, 0.65);
    const earLat  = clamp(aLoc.x * 0.008, -0.25, 0.25);
    soft.earLV += (96 * (earSlip + earIdleL - earLat - soft.earL) - 5.4 * soft.earLV - body.oz * 2.4) * dt;
    soft.earRV += (96 * (earSlip + earIdleR + earLat - soft.earR) - 5.4 * soft.earRV + body.oz * 2.4) * dt;
    soft.earL += soft.earLV * dt; soft.earR += soft.earRV * dt;
    shiba.applyEar(shiba.earL, soft.earL + autoTwitchL, soft.planeAmt);
    shiba.applyEar(shiba.earR, soft.earR + autoTwitchR, soft.planeAmt);

    const wagFreq = moodOut.zoomies ? 17.0 : moodOut.excited ? 13.0 : moodOut.sleepy ? 1.2 : 4.0;
    const wagAmp  = moodOut.zoomies ? 1.0  : moodOut.excited ? 0.88 : moodOut.sleepy ? 0.08 : 0.34;
    const baseWag = Math.sin(time * wagFreq) * wagAmp;
    const baseLift = moodOut.excited ? 0.68 : moodOut.sleepy ? -0.10 : 0.14;
    soft.tailWV += (120 * (baseWag - soft.tailW) - 6.6 * soft.tailWV - aLoc.x * 0.14) * dt;
    soft.tailCV += (120 * (baseLift - soft.tailC) - 6.6 * soft.tailCV - aLoc.y * 0.11) * dt;
    soft.tailW += soft.tailWV * dt; soft.tailC += soft.tailCV * dt;
    shiba.applyTail(clamp(soft.tailW, -1.15, 1.15), clamp(soft.tailC, -0.6, 1.15));

    // 6. Flacher 2D-Cel-Bodenschatten exakt wie in mochi_shiba.html (immer HINTER den Pfoten!)
    const hgt = Math.max(0, body.y - RY);
    const f = 1 / (1 + hgt * 0.36);
    const wBoost = 1 + Math.max(0, soft.jx) * 0.34 + body.wallPress * 0.24 + (moodOut.sleepy ? 0.14 : 0);
    shibaShadow.mesh.position.set(
      body.x - lightDir.x * 0.22,
      -0.001,
      body.z - lightDir.z * 0.14,
    );
    shibaShadow.mesh.scale.set(0.88 * f * wBoost, 1, 0.70 * f * wBoost);
    shibaShadow.mat.uniforms.uOpacity.value = 0.86 * Math.min(1, f * 1.1);

    soft.camShake = Math.max(0, soft.camShake - dt * 0.55);
    updateCamera(dt, soft.camShake);
    fx.update(dt);
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', resize);
  resize();

  // Flüssige 60 FPS auf Mobile
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

  function setTiltGravity(gx, gz) {
    motion.targetGx = clamp(Number.isFinite(gx) ? gx : 0, -1, 1);
    motion.targetGz = clamp(Number.isFinite(gz) ? gz : 0, -1, 1);
  }

  function triggerShake(intensity = 1) {
    const now = performance.now();
    if (ptr.grabbed === 'shiba' || now - motion.lastShakeAt < 700) return;
    motion.lastShakeAt = now;
    const pow = clamp(Number.isFinite(intensity) ? intensity : 1, 0.6, 1.6);
    mood.wakeUp();
    brain.interrupt(false);
    mood.shockT = Math.max(mood.shockT, 0.85);
    const ang = Math.random() * Math.PI * 2;
    body.vx += Math.cos(ang) * (2.6 + pow * 1.8);
    body.vz += Math.sin(ang) * (2.6 + pow * 1.8);
    body.vy = Math.max(body.vy, 5.5 + pow * 2.2);
    soft.jvy -= 5.2; soft.jvx += 4.5; soft.earLV += 11; soft.earRV += 11; soft.tailWV += 16;
    sfx.yip();
    fx.spawnDust(body.x, 0.05, body.z, 4);
  }

  function setPaused(nextPaused) {
    paused = Boolean(nextPaused);
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
    canvas.removeEventListener('pointerdown', onCanvasPointerDown);
    sfx.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
  }

  const api = {
    setSoundEnabled: (v) => { sfx.enabled = Boolean(v); },
    setTiltGravity,
    triggerShake,
    setPaused,
    destroy,
    get mode() { return mood.current; },
    get frameMs() { return frameMs; },
    // Debug/Test-Helper
    _debugThrow: (vx, vy, vz) => {
      body.vx = vx; body.vy = vy; body.vz = vz;
      mood.onThrown(Math.hypot(vx, vy, vz));
    },
    _debugPos: () => ({ x: body.x, y: body.y, z: body.z, room: { ...room } }),
  };

  window.__shiba = api;
  return api;
}
