// ======================================================================
//  G3: PARTICLES — các hệ hạt GPU (Saturn ring, sao chổi, mưa sao băng,
//  asteroid belt, Kuiper, sao nền, multi-galaxy). CPU chỉ set uniform thời gian.
// ======================================================================
import * as THREE from "three";

function makeGlowTexture() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const ctx = cv.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.6)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

// MULTI-GALAXY — 4 thiên hà xoắn ốc nền (Points, mặc định OFF qua Settings)
let galaxyGroup = null;
let galaxyScene = null;      // scene tham chiếu từ createParticles
function toggleGalaxies(on) {
  if (on && !galaxyGroup) buildGalaxies();
  if (galaxyGroup) galaxyGroup.visible = on;
}
function buildGalaxies() {
  galaxyGroup = new THREE.Group();
  galaxyScene.add(galaxyGroup);
  const defs = [
    { pos: [-420, 60, -520], yaw: 0.4, tilt: 0.9, size: 240 },
    { pos: [520, -40, -380], yaw: 2.2, tilt: 1.2, size: 200 },
    { pos: [-260, -80, 560], yaw: 4.0, tilt: 0.6, size: 180 },
    { pos: [480, 90, 470], yaw: 5.3, tilt: 1.0, size: 210 },
  ];
  // glow texture dùng chung (soft radial — như particle các vành)
  const glowCv = document.createElement("canvas");
  glowCv.width = glowCv.height = 64;
  const gctx = glowCv.getContext("2d");
  const g = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.8)");
  g.addColorStop(0.5, "rgba(255,255,255,0.25)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  gctx.fillStyle = g; gctx.fillRect(0, 0, 64, 64);
  const glowTex = new THREE.CanvasTexture(glowCv);

  for (const d of defs) {
    const N = 40000;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3),
          sz = new Float32Array(N);
    let s = 12345 + Math.floor(d.yaw * 1000);
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < N; i++) {
      // lõi đặc: 35% hạt trong 12% bán kính (pow gắt 2.6)
      let r;
      const u = rnd();
      if (u < 0.35) r = 0.02 + Math.pow(rnd(), 2.6) * 0.10;
      else r = 0.12 + Math.pow(rnd(), 0.72) * 0.88;
      const arm = rnd() < 0.5 ? 0 : Math.PI;
      const spread = (rnd() - 0.5) * (0.16 + 0.34 * r);        // lõi chặt, rìa loe
      const ang = Math.log(r / 0.04 + 1) / 0.3 + arm + spread;
      const h = (rnd() - 0.5) * 0.05 * (1 + 2.5 * Math.exp(-r / 0.2));
      pos[i*3] = r * Math.cos(ang) * d.size;
      pos[i*3+1] = h * d.size;
      pos[i*3+2] = r * Math.sin(ang) * d.size;
      // màu vật lý: lõi vàng-cam già (K-giant) -> arms xanh trắng trẻ;
      // vùng HII hồng rải rác ở cánh ngoài
      let cR, cG, cB;
      const t = Math.min(1, Math.max(0, (r - 0.1) / 0.9));
      if (rnd() < 0.05 && r > 0.4) {           // HII regions
        cR = 1.0; cG = 0.35; cB = 0.5;
      } else {
        cR = 1.0 * (1-t) + 0.62 * t;
        cG = 0.82 * (1-t) + 0.72 * t;
        cB = 0.55 * (1-t) + 1.0 * t;
      }
      const b = Math.pow(rnd(), 1.6) * 1.6 + 0.35;
      // hạt lõi to sáng hơn (halo effect qua point size)
      sz[i] = (r < 0.12 ? 2.6 : 1.4) * (0.7 + rnd() * 0.6);
      col[i*3] = cR * b; col[i*3+1] = cG * b; col[i*3+2] = cB * b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aSz", new THREE.BufferAttribute(sz, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uMap: { value: glowTex }, uPx: { value: 1.0 } },
      vertexShader: /* glsl */`
        attribute float aSz;
        attribute vec3 color;
        varying vec3 vCol;
        void main() {
          vCol = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSz * uPx * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        varying vec3 vCol;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vCol, 1.0) * tex;
        }
      `,
    });
    const pts = new THREE.Points(geo, mat);
    pts.position.set(d.pos[0], d.pos[1], d.pos[2]);
    pts.rotation.set(d.tilt, d.yaw, 0.2);
    galaxyGroup.add(pts);

    // sprite glow trung tâm — lõi rực mờ như ảnh thật
    const spriteMat = new THREE.SpriteMaterial({
      map: glowTex, color: 0xfff0c8, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85,
    });
    const core = new THREE.Sprite(spriteMat);
    core.scale.setScalar(d.size * 0.55);
    pts.add(core);
  }
  console.info("galaxies built: 4 x 40000 pts (upgraded render)");
}

export function createParticles({ scene, planetObjs }) {
  galaxyScene = scene;
  const out = {};

  // --------------------------------------------------------------------
  //  PHASE 2b: VÀNH SAO THỔ — particle Kepler (tái dùng kỹ thuật Saturn
  //  rings: radial glow texture, AdditiveBlending, depthWrite false, khe Cassini)
  // --------------------------------------------------------------------
  const sat = planetObjs.find(o => o.data.name === "Saturn");
  if (sat) {
    const N = 9000;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const rAng = new Float32Array(N), rRad = new Float32Array(N), rOm = new Float32Array(N);
    let s = 20240923;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    // vành: 3 dải có khe Cassini ở giữa, nén theo bán kính hành tinh r=2.05
    const bands = [[2.6, 3.3], [3.5, 4.2], [4.45, 5.1]];   // đơn vị scene
    const gold = new THREE.Color(0xd8c090), pale = new THREE.Color(0x8898a8);
    let idx = 0;
    for (let b = 0; b < bands.length; b++) {
      const [r0, r1] = bands[b];
      const nB = Math.floor(N * (b === 0 ? 0.38 : b === 1 ? 0.37 : 0.25));
      for (let k = 0; k < nB && idx < N; k++, idx++) {
        const u = rnd();
        const r = r0 + (r1 - r0) * (b === 0 ? Math.pow(u, 0.7) : u);  // dải trong dày
        const a = rnd() * 6.283;
        rRad[idx] = r; rAng[idx] = a;
        rOm[idx] = 1.6 / Math.sqrt(r);                                // Keplerian ω ∝ 1/√r
        pos[idx * 3] = Math.cos(a) * r;
        pos[idx * 3 + 1] = ((rnd() + rnd() + rnd()) / 3 - 0.5) * 0.12;  // mỏng
        pos[idx * 3 + 2] = Math.sin(a) * r;
        // màu: trong vàng kem, ngoài xám xanh băng
        const c = gold.clone().lerp(pale, (r - 2.6) / 2.5);
        const br = 0.5 + rnd() * 0.5;
        col[idx * 3] = c.r * br; col[idx * 3 + 1] = c.g * br; col[idx * 3 + 2] = c.b * br;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    // GPU-side Kepler: góc quay tính trong vertex shader, CPU chỉ set uDays
    g.setAttribute("aR", new THREE.BufferAttribute(rRad, 1));
    g.setAttribute("aOm", new THREE.BufferAttribute(rOm, 1));
    const ringMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uDays: { value: 0 }, uMap: { value: makeGlowTexture() }, uSize: { value: 0.09 } },
      vertexShader: /* glsl */`
        attribute float aR, aOm;
        attribute vec3 color;
        uniform float uDays, uSize;
        varying vec3 vCol;
        void main() {
          // quay quanh Y trong hệ quy chiếu của Saturn (grp), omega du 1/sqrt(r)
          float a = aOm * uDays * 0.35;
          vec3 p = vec3(cos(a) * aR, position.y, sin(a) * aR);
          vCol = color;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uSize * (240.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        varying vec3 vCol;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vCol, 1.0) * tex;
        }
      `,
    });
    const ringPts = new THREE.Points(g, ringMat);
    ringPts.rotation.x = 0.47;          // nghiêng vành theo trục Saturn 26.7°
    sat.grp.add(ringPts);
    out.saturnRing = { mat: ringMat, n: idx };
  }

  // --------------------------------------------------------------------
  //  SAO CHỖI — GPU: quỹ đạo Kepler đầu comet + đuôi ion 900 hạt trong vertex shader
  // --------------------------------------------------------------------
  {
    const CA = 18, CE = 0.85, CT = 365.25 * Math.pow(18, 1.5);
    const cometHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xcfefff })
    );
    scene.add(cometHead);

    const CN = 900;
    const cPos = new Float32Array(CN * 3);
    const cCol = new Float32Array(CN * 3);
    const cIdx = new Float32Array(CN);
    for (let i = 0; i < CN; i++) cIdx[i] = i / (CN - 1);
    const cg = new THREE.BufferGeometry();
    cg.setAttribute("position", new THREE.BufferAttribute(cPos, 3));
    cg.setAttribute("color", new THREE.BufferAttribute(cCol, 3));
    cg.setAttribute("aT", new THREE.BufferAttribute(cIdx, 1));
    const cMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uDays: { value: 0 },
        uMap: { value: makeGlowTexture() },
        uSize: { value: 0.16 },
        uCA: { value: CA }, uCE: { value: CE }, uCT: { value: CT },
        uInc: { value: 25 * Math.PI / 180 },
      },
      vertexShader: /* glsl */`
        attribute float aT;
        attribute vec3 color;
        uniform float uDays, uSize, uCA, uCE, uCT, uInc;
        varying vec3 vCol;
        float solveK(float M, float e) {
          float E = M;
          for (int k = 0; k < 6; k++) E = E - (E - e * sin(E) - M) / (1.0 - e * cos(E));
          return E;
        }
        void main() {
          float M = 6.283185 * (uDays / uCT);
          M = mod(mod(M, 6.283185) + 6.283185, 6.283185);
          float E = solveK(M, uCE);
          float sc = 11.0 * pow(uCA, 0.55) / uCA;
          vec3 head;
          head.x = uCA * (cos(E) - uCE) * sc;
          float yO = uCA * sqrt(1.0 - uCE * uCE) * sin(E) * sc;
          head.y = yO * cos(uInc);
          head.z = yO * sin(uInc);
          vec3 away = normalize(head);
          float t = aT;
          float dist = t * 5.5;
          float wob = sin(t * 40.0 + uDays * 0.02) * 0.25 * t;
          vec3 p = head + away * dist + vec3(wob * 0.6, wob, wob * 0.4);
          float bright = (1.0 - t) * (0.5 + 0.5 * sin(t * 20.0 + uDays * 0.05));
          vCol = vec3(0.75, 0.85, 1.0) * bright;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uSize * (240.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        varying vec3 vCol;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vCol, 1.0) * tex;
        }
      `,
    });
    const cometTail = new THREE.Points(cg, cMat);
    scene.add(cometTail);
    out.cometGPU = { mat: cMat, head: cometHead };
  }

  // --------------------------------------------------------------------
  //  MƯA SAO BĂNG — GPU: mỗi vệt mang seed, vị trí/life tính trong vertex shader
  // --------------------------------------------------------------------
  {
    const MN = 40;
    const mPos = new Float32Array(MN * 2 * 3);       // 2 đỉnh/vệt
    const mSeed = new Float32Array(MN * 2);          // seed per-vertex
    const mEnd = new Float32Array(MN * 2);           // 0 = đầu vệt, 1 = đuôi
    for (let i = 0; i < MN; i++) {
      mSeed[i*2] = mSeed[i*2+1] = i * 7.13 + 0.5;    // seed chung 2 đỉnh
      mEnd[i*2] = 0; mEnd[i*2+1] = 1;
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute("position", new THREE.BufferAttribute(mPos, 3));  // placeholder
    mg.setAttribute("aSeed", new THREE.BufferAttribute(mSeed, 1));
    mg.setAttribute("aEnd", new THREE.BufferAttribute(mEnd, 1));
    const mMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */`
        attribute float aSeed, aEnd;
        uniform float uTime;
        varying float vBr;
        // hash pseudo-random từ seed
        float hash(float n) { return fract(sin(n) * 43758.5453); }
        void main() {
          // chu kỳ sống mỗi meteor: 6s + offset theo seed (40 vệt xen kẽ)
          float cycle = 6.0;
          float phase = mod(uTime + aSeed * 3.7, cycle);
          float life = 1.0 - phase / cycle * 1.4;              // 1 -> 0 (fade)
          // spawn: chỉ "sống" khi phase trong khoảng ngắn đầu chu kỳ
          float isOn = step(phase, 1.4);
          // vị trí xuất phát + hướng từ hash(seed)
          vec3 spawn = vec3(
            (hash(aSeed) - 0.5) * 90.0,
            20.0 + hash(aSeed + 1.7) * 30.0,
            (hash(aSeed + 3.1) - 0.5) * 90.0);
          vec3 dir = normalize(vec3(
            hash(aSeed + 5.3) - 0.5,
            -(0.4 + hash(aSeed + 7.9) * 0.4),
            hash(aSeed + 9.7) - 0.5));
          float speed = 55.0 + hash(aSeed + 11.3) * 35.0;
          vec3 head = spawn + dir * speed * phase;
          vec3 pos = head - dir * 2.8 * aEnd;                  // đuôi dài 2.8
          vBr = max(0.0, life) * isOn;
          // màu đầu trắng-vàng, đuôi mờ (tính qua varying)
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying float vBr;
        uniform float uTime;
        void main() {
          float head = step(0.5, vBr) * 0.9;                    // placeholder
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.8) * vBr, vBr);
        }
      `,
    });
    const meteors = new THREE.LineSegments(mg, mMat);
    scene.add(meteors);
    out.meteorGPU = mMat;
  }

  // --------------------------------------------------------------------
  //  PHASE 2c: ASTEROID BELT — GPU Points giữa Mars–Jupiter
  //  (Kepler per-asteroid tính trong vertex shader — cùng mẫu Kuiper)
  // --------------------------------------------------------------------
  {
    const N_AST = 6000;   // nâng gấp 2 vì chi phí CPU = 0 sau khi GPU hóa
    const aPos = new Float32Array(N_AST * 3), aCol = new Float32Array(N_AST * 3);
    const aArr = new Float32Array(N_AST), aEa = new Float32Array(N_AST),
          aIa = new Float32Array(N_AST), aMa = new Float32Array(N_AST), aTa = new Float32Array(N_AST);
    let s = 55555;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const cRock = new THREE.Color(0x8a7f70), cRock2 = new THREE.Color(0x5f5648);
    for (let i = 0; i < N_AST; i++) {
      // a giữa 2.1 - 3.3 AU (vành chính), e ngẫu nhiên nhỏ, i nghiêng nhẹ
      const a = 2.1 + rnd() * 1.2;
      const e = rnd() * 0.12;
      const inc = (rnd() - 0.5) * 0.15;
      const M0 = rnd() * 6.283;
      const T = 365.25 * Math.pow(a, 1.5);                  // định luật III Kepler
      aArr[i] = a; aEa[i] = e; aIa[i] = inc; aMa[i] = M0; aTa[i] = T;
      aPos[i * 3] = 0; aPos[i * 3 + 1] = 0; aPos[i * 3 + 2] = 0;   // shader tự tính
      const c = cRock.clone().lerp(cRock2, rnd());
      const b = 0.5 + rnd() * 0.5;
      aCol[i * 3] = c.r * b; aCol[i * 3 + 1] = c.g * b; aCol[i * 3 + 2] = c.b * b;
    }
    const ag = new THREE.BufferGeometry();
    ag.setAttribute("position", new THREE.BufferAttribute(aPos, 3));
    ag.setAttribute("color", new THREE.BufferAttribute(aCol, 3));
    ag.setAttribute("aA", new THREE.BufferAttribute(aArr, 1));
    ag.setAttribute("aE", new THREE.BufferAttribute(aEa, 1));
    ag.setAttribute("aI", new THREE.BufferAttribute(aIa, 1));
    ag.setAttribute("aM", new THREE.BufferAttribute(aMa, 1));
    ag.setAttribute("aT", new THREE.BufferAttribute(aTa, 1));
    const aMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uDays: { value: 0 }, uMap: { value: makeGlowTexture() }, uSize: { value: 0.13 } },
      vertexShader: /* glsl */`
        attribute float aA, aE, aI, aM, aT;
        attribute vec3 color;
        uniform float uDays, uSize;
        varying vec3 vCol;
        float solveK(float M, float e) {
          float E = M;
          for (int k = 0; k < 5; k++) E = E - (E - e * sin(E) - M) / (1.0 - e * cos(E));
          return E;
        }
        void main() {
          float M = aM + 6.283185 * (uDays / aT);
          M = mod(mod(M, 6.283185) + 6.283185, 6.283185);
          float E = solveK(M, aE);
          float sc = 11.0 * pow(aA, 0.55) / aA;
          vec3 p;
          p.x = aA * (cos(E) - aE) * sc;
          float yO = aA * sqrt(1.0 - aE * aE) * sin(E) * sc;
          p.y = yO * cos(aI);
          p.z = yO * sin(aI);
          vCol = color;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uSize * (240.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        varying vec3 vCol;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vCol, 1.0) * tex;
        }
      `,
    });
    const belt = new THREE.Points(ag, aMat);
    scene.add(belt);
    out.asteroidBelt = { mat: aMat, n: N_AST };
  }

  // --------------------------------------------------------------------
  //  VÀNH ĐAI KUIPER — 50.000 thiên thể nhỏ 32–48 AU (ngoài Neptune),
  //  vùng của Pluto/Eris. Points cho rẻ draw call, Kepler per-object,
  //  nghiêng lan tỏa dày hơn mặt phẳng hoàng đạo (đúng đặc trưng Belt)
  // --------------------------------------------------------------------
  {
    // F4: guard JSON.parse — localStorage hỏng không được phép trắng trang
    let N_K = 50000;
    try {
      const ks = JSON.parse(localStorage.getItem("cosmos_settings") || "{}");
      if (ks.kuiper) N_K = parseInt(ks.kuiper, 10);
    } catch (e) { console.warn("settings localStorage hỏng — dùng mặc định 50k:", e.message); }
    N_K = THREE.MathUtils.clamp(N_K, 1000, 100000);
    const kPos = new Float32Array(N_K * 3), kCol = new Float32Array(N_K * 3);
    const kData = [];
    let s = 733331;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const cIce = new THREE.Color(0x9fb8cc), cDim = new THREE.Color(0x4a5a6e);
    for (let i = 0; i < N_K; i++) {
      // a 32–48 AU, dày hơn gần biên trong (32–38 chiếm ~70%)
      const u = rnd();
      const a = u < 0.7 ? 32 + u / 0.7 * 6 : 38 + (u - 0.7) / 0.3 * 10;
      const e = rnd() * 0.12;
      const inc = (rnd() - 0.5) * 0.35;          // lan tỏa ±10° — dày hơn asteroid belt
      const M0 = rnd() * 6.283;
      const T = 365.25 * Math.pow(a, 1.5);       // định luật III Kepler
      kData.push({ a, e, inc, M0, T });
      const c = cIce.clone().lerp(cDim, rnd() * 0.8);
      const b = 0.35 + rnd() * 0.5;
      kCol[i * 3] = c.r * b; kCol[i * 3 + 1] = c.g * b; kCol[i * 3 + 2] = c.b * b;
    }
    const kg = new THREE.BufferGeometry();
    kg.setAttribute("position", new THREE.BufferAttribute(kPos, 3));
    kg.setAttribute("color", new THREE.BufferAttribute(kCol, 3));
    // attributes cho GPU-side Kepler: tính vị trí trong vertex shader
    // (CPU chỉ set uDays — không còn vòng lặp 8000 hạt mỗi frame)
    const kA = new Float32Array(N_K), kE = new Float32Array(N_K),
          kI = new Float32Array(N_K), kM = new Float32Array(N_K), kT = new Float32Array(N_K);
    for (let i = 0; i < N_K; i++) {
      kA[i] = kData[i].a; kE[i] = kData[i].e; kI[i] = kData[i].inc;
      kM[i] = kData[i].M0; kT[i] = kData[i].T;
    }
    kg.setAttribute("aA", new THREE.BufferAttribute(kA, 1));
    kg.setAttribute("aE", new THREE.BufferAttribute(kE, 1));
    kg.setAttribute("aI", new THREE.BufferAttribute(kI, 1));
    kg.setAttribute("aM", new THREE.BufferAttribute(kM, 1));
    kg.setAttribute("aT", new THREE.BufferAttribute(kT, 1));
    // nén scale theo a (distScale) tính sẵn vào aA để shader đơn giản
    const kMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uDays: { value: 0 },
        uMap:  { value: makeGlowTexture() },
        uSize: { value: 0.11 },
      },
      vertexShader: /* glsl */`
        attribute float aA, aE, aI, aM, aT;
        attribute vec3 color;
        uniform float uDays, uSize;
        varying vec3 vColor2;
        varying vec3 vCol;
        // Newton-Raphson giải M = E - e*sin(E) ngay trên GPU
        float solveK(float M, float e) {
          float E = M;
          for (int k = 0; k < 5; k++) E = E - (E - e * sin(E) - M) / (1.0 - e * cos(E));
          return E;
        }
        void main() {
          float M = aM + 6.283185 * (uDays / aT);
          M = mod(mod(M, 6.283185) + 6.283185, 6.283185);
          float E = solveK(M, aE);
          float sc = 11.0 * pow(aA, 0.55) / aA;           // distScale nén sẵn
          vec3 p;
          p.x = aA * (cos(E) - aE) * sc;
          float yO = aA * sqrt(1.0 - aE * aE) * sin(E) * sc;
          p.y = yO * cos(aI);
          p.z = yO * sin(aI);
          vCol = color;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uSize * (240.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        varying vec3 vCol;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vCol, 1.0) * tex;
        }
      `,
    });
    const kuiper = new THREE.Points(kg, kMat);
    kg.getAttribute("position").setUsage(THREE.StaticDrawUsage);   // vị trí do shader quyết định
    scene.add(kuiper);
    out.kuiperBelt = { mat: kMat, n: N_K };
  }

  // --------------------------------------------------------------------
  //  SAO NỀN
  // --------------------------------------------------------------------
  {
    const n = 3500, sp = new Float32Array(n * 3), sc = new Float32Array(n * 3);
    let s = 31337;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < n; i++) {
      const r = 500 + rnd() * 700;
      const th = rnd() * 6.283, ph = Math.acos(2 * rnd() - 1);
      sp[i * 3] = r * Math.sin(ph) * Math.cos(th);
      sp[i * 3 + 1] = r * Math.cos(ph);
      sp[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      const b = 0.3 + rnd() * 0.7;
      sc[i * 3] = b; sc[i * 3 + 1] = b; sc[i * 3 + 2] = b * (0.9 + rnd() * 0.2);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    sg.setAttribute("color", new THREE.BufferAttribute(sc, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({
      size: 1.6, vertexColors: true, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false,
    })));
  }

  return out;
}

export { toggleGalaxies };
