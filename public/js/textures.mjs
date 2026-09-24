// ======================================================================
//  G5a: PROCEDURAL TEXTURES — mỗi thiên thể một "khuôn mặt" riêng
//  Vẽ bằng Canvas 2D + value-noise (seeded, deterministic). 0 tài nguyên
//  ngoài — khớp PWA offline. Kích thước texture 1024×512 (hành tinh lớn).
//  Phong cách: artistic-but-recognizable — đặc trưng thật (GRS, lục địa,
//  mũ băng, miệng hố, trái tim Pluto) vẽ đủ rõ để nhận ra.
// ======================================================================

// ---- value noise 2D seeded (mượt, tileable ngang) ----
function makeNoise(seed) {
  const P = 512, perm = new Uint8Array(P * 2);
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const base = [...Array(P).keys()];
  for (let i = P - 1; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    [base[i], base[j]] = [base[j], base[i]];
  }
  for (let i = 0; i < P * 2; i++) perm[i] = base[i & 255];
  const grad = (h, x, y) => {
    switch (h & 3) {
      case 0: return x + y; case 1: return -x + y;
      case 2: return x - y; default: return -x - y;
    }
  };
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    // tileable theo chu kỳ P theo trục x (texture wrap ngang)
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    const xw = ((xi % P) + P) % P, xw1 = (xw + 1) % P;
    const aa = perm[perm[xw] + (yi & 255)], ab = perm[perm[xw] + ((yi + 1) & 255)];
    const ba = perm[perm[xw1] + (yi & 255)], bb = perm[perm[xw1] + ((yi + 1) & 255)];
    const l = (a, b, t) => a + t * (b - a);
    return l(l(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
             l(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u), v) * 0.5 + 0.5;
  };
}

// ---- fbm: nhiều tầng noise — nền cho hầu hết bề mặt ----
function fbm(noise, x, y, oct = 4, lac = 2, gain = 0.5) {
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += a * noise(x * f, y * f);
    norm += a; a *= gain; f *= lac;
  }
  return sum / norm;
}

// ---- helpers canvas ----
const hex2rgb = h => {
  const c = parseInt(h.replace("#", ""), 16);
  return [c >> 16 & 255, c >> 8 & 255, c & 255];
};
const mix = (c1, c2, t) => c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;
// clamp 0..1
const cl = v => Math.max(0, Math.min(1, v));
const smooth = (e0, e1, v) => { const t = cl((v - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

function makeCanvas(w = 1024, h = 512) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  return [cv, cv.getContext("2d", { willReadFrequently: true })];
}

function toTexture(ctx) {
  const tex = new THREE.CanvasTexture(ctx.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// vẽ pixel-perfect qua ImageData: fn(x, y, lat) → [r,g,b] hoặc [r,g,b,a]
// (lat 0=đỉnh 1=đáy; trả 4 phần tử → alpha riêng — dùng cho lớp mây)
function paint(ctx, w, h, fn) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const lat = y / h;
    for (let x = 0; x < w; x++) {
      const px = fn(x / w, lat, x, y);
      const i = (y * w + x) * 4;
      d[i] = px[0]; d[i + 1] = px[1]; d[i + 2] = px[2];
      d[i + 3] = px.length > 3 ? px[3] : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

import * as THREE from "three";
// ======================================================================
//  ĐÁ — Mercury / Moon: xám tro + miệng hố + maria (vùng tối rộng)
//  (bump: cùng noise — vẽ sang canvas xám, MeshStandard dùng làm bumpMap)
// ======================================================================
function crateredSurface({ base, dark, light, craters = 420, maria = true, seed = 11, size = 512 }) {
  const [cv, ctx] = makeCanvas(size, size / 2);
  const w = cv.width, h = cv.height;
  const n1 = makeNoise(seed), n2 = makeNoise(seed + 7), n3 = makeNoise(seed + 13);
  const b = hex2rgb(base), dk = hex2rgb(dark), lt = hex2rgb(light);
  // nền fbm
  paint(ctx, w, h, (u, lat) => {
    const f = fbm(n1, u * 8, lat * 4, 4);
    const m = maria ? smooth(0.55, 0.72, fbm(n2, u * 3, lat * 1.5, 3)) * 0.5 : 0;
    return mix(mix(dk, b, cl(f)), lt, m * 0.6);
  });
  // miệng hố: radial gradient — vành sáng mỏng, lòng tối mềm (không vòng cứng)
  let s = seed * 977;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let k = 0; k < craters; k++) {
    const x = rnd() * w, y = h * (0.08 + rnd() * 0.84);
    const r = 1.2 + rnd() * rnd() * 9;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${dk[0]},${dk[1]},${dk[2]},${(0.22 + rnd() * 0.25).toFixed(2)})`);
    g.addColorStop(0.55, `rgba(${dk[0]},${dk[1]},${dk[2]},0.10)`);
    g.addColorStop(0.78, `rgba(${lt[0]},${lt[1]},${lt[2]},${(0.16 + rnd() * 0.2).toFixed(2)})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1;
  return cv;
}

function crateredTexture(opts) {
  return toTexture(crateredSurface(opts).getContext("2d"));
}

// bump map cho thiên thể có hố: same craters, grayscale
function craterBump(opts) {
  const cv = crateredSurface({ ...opts, maria: false, base: "#808080", dark: "#404040", light: "#c0c0c0" });
  return toTexture(cv.getContext("2d"));
}

// ======================================================================
//  MARS: gỉ sét + vệt tối + chỏm băng 2 cực + vài miệng hố lớn
// ======================================================================
function marsTexture() {
  const [cv, ctx] = makeCanvas();
  const w = cv.width, h = cv.height;
  const n1 = makeNoise(31), n2 = makeNoise(37), n3 = makeNoise(41);
  const rust = hex2rgb("#b5603c"), dk = hex2rgb("#6e3a24"), lt = hex2rgb("#d8926a"), ice = [240, 238, 235];
  paint(ctx, w, h, (u, lat) => {
    const f = fbm(n1, u * 9, lat * 4.5, 5);
    const dark = smooth(0.58, 0.75, fbm(n2, u * 5, lat * 2.5, 4)) * 0.55;
    let c = mix(mix(dk, rust, cl(f)), lt, dark * 0.5);
    // chỏm băng: gần cực (lat<0.07 hoặc >0.93) + viền noise mềm
    const edge = fbm(n3, u * 10, 0.5, 3) * 0.05;
    const cap = smooth(0.075 + edge, 0.045 + edge, lat) + smooth(0.925 - edge, 0.955 - edge, lat);
    return mix(c, ice, cl(cap));
  });
  // vài hố lớn mờ (Hellas, Argire...)
  let s = 999;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let k = 0; k < 40; k++) {
    const x = rnd() * w, y = h * (0.25 + rnd() * 0.5), r = 4 + rnd() * 12;
    ctx.globalAlpha = 0.10 + rnd() * 0.1;
    ctx.strokeStyle = css(dk); ctx.lineWidth = Math.max(1, r * 0.2);
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = css(rust);
    ctx.beginPath(); ctx.arc(x + 1, y + 1, r * 0.7, 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1;
  return toTexture(ctx);
}

// ======================================================================
//  VENUS: mây sulfur đặc — dải chéo vàng kem cuộn mềm (đặc trưng V-shaped)
// ======================================================================
function venusTexture() {
  const [cv, ctx] = makeCanvas();
  const w = cv.width, h = cv.height;
  const n1 = makeNoise(53);
  const cream = hex2rgb("#e8d5a8"), mid = hex2rgb("#c9a86b"), dk = hex2rgb("#a5813f");
  paint(ctx, w, h, (u, lat) => {
    // dải chéo: lệch pha theo vĩ độ (chữ V đặc trưng mây Venus)
    const shear = (lat - 0.5) * 2.2;
    const v = fbm(n1, (u * 3 + shear) % 1 * 8 + u * 2, lat * 5, 4);
    const band = 0.5 + 0.5 * Math.sin(lat * Math.PI * 7 + v * 4);
    return mix(mix(dk, cream, cl(v * 0.9 + 0.15)), mid, band * 0.45);
  });
  return toTexture(ctx);
}

// ======================================================================
//  EARTH: đại dương + lục địa fbm-threshold + mũ băng + sa mạc + mây layer
// ======================================================================
let earthCloudsTex = null;
export function earthClouds(name) {
  if (name !== "Earth") return null;
  if (!earthCloudsTex) earthTexture();   // init cả surface + clouds cùng lúc
  return earthCloudsTex;
}

export function earthTexture() {
  const [cv, ctx] = makeCanvas();
  const w = cv.width, h = cv.height;
  const n1 = makeNoise(71), n2 = makeNoise(73), n3 = makeNoise(79);
  const ocean = hex2rgb("#1b4b8f"), ocean2 = hex2rgb("#2a6ab8");
  const land = hex2rgb("#4a7c3a"), desert = hex2rgb("#c2a35c"), rock = hex2rgb("#8a7a5a");
  const ice = [245, 248, 250];
  paint(ctx, w, h, (u, lat) => {
    // lục địa: fbm threshold (nền đại dương 2 tông theo depth noise)
    const cont = fbm(n1, u * 4.5, lat * 2.2, 5, 2.1, 0.55);
    const isLand = cont > 0.535;
    let c;
    if (isLand) {
      const e = (cont - 0.535) / 0.2;                    // "độ cao" giả
      const dry = fbm(n2, u * 6, lat * 3, 3);            // sa mạc / thảm thực vật
      const green = mix(land, desert, smooth(0.45, 0.62, dry) * smooth(0.35, 0.12, Math.abs(lat - 0.5) * 2));
      c = mix(green, rock, smooth(0.3, 0.8, e) * 0.7);
      // bờ biển nhạt
      if (cont < 0.55) c = mix(c, [200, 200, 190], 0.25);
    } else {
      c = mix(ocean2, ocean, fbm(n3, u * 5, lat * 2.5, 3));
    }
    // mũ băng 2 cực
    const edge = fbm(n2, u * 9, 0.5, 3) * 0.035;
    const cap = smooth(0.10 + edge, 0.055 + edge, lat) + smooth(0.90 - edge, 0.945 - edge, lat);
    return mix(c, ice, cl(cap));
  });
  // mây: layer canvas riêng → mesh bán trong suốt quay lệch tốc độ
  // (threshold thấp để coverage ~35-40% bề mặt như Trái Đất thật)
  const [cv2, ctx2] = makeCanvas();
  const n4 = makeNoise(97);
  paint(ctx2, w, h, (u, lat) => {
    const swirl = fbm(n4, u * 6, lat * 3.2, 5, 2.2, 0.55);
    const band = 0.62 + 0.38 * Math.sin(lat * Math.PI * 5);
    const a = smooth(0.52, 0.78, swirl * band) * 235;
    return [255, 255, 255, a];
  });
  const surface = toTexture(ctx);
  earthCloudsTex = toTexture(ctx2);
  return surface;
}

// ======================================================================
//  PLUTO: nâu tan + trái tim Tombaugh Regio trắng kem + mũ tối Cthulhu
// ======================================================================
function plutoTexture() {
  const [cv, ctx] = makeCanvas(768, 384);
  const w = cv.width, h = cv.height;
  const n1 = makeNoise(113);
  const tan = hex2rgb("#c9a582"), dk = hex2rgb("#6b4a38"), lt = hex2rgb("#e8d8c0");
  const heart = [235, 228, 215];
  paint(ctx, w, h, (u, lat) => {
    const f = fbm(n1, u * 6, lat * 3, 4);
    let c = mix(dk, tan, cl(f));
    // vành sáng phía bắc
    c = mix(c, lt, smooth(0.35, 0.12, lat) * 0.35);
    // Cthulhu Macula: dải tối xích đạo phía tây
    const cth = smooth(0.62, 0.5, Math.abs(lat - 0.52) * 3) * smooth(0.72, 0.6, u);
    c = mix(c, dk, cth * 0.7);
    // trái tim Tombaugh: 2 thùy tròn tách (lõm giữa) + V co nhọn xuống
    const dx = (u - 0.67) * 4.2, dy = (lat - 0.55) * 4.2;
    const rL = Math.hypot(dx + 0.34, dy + 0.20) - 0.26;
    const rR = Math.hypot(dx - 0.34, dy + 0.20) - 0.26;
    const tV = cl((dy - 0.02) / 0.80);
    const halfW = 0.46 * (1 - tV) * (1 - 0.35 * tV) + 0.002;
    const tri = Math.abs(dx) - halfW;
    const vPart = dy > 0.02 ? tri : 0.2;
    const heartM = smooth(0.07, -0.07, Math.min(rL, rR, vPart));
    return mix(c, heart, heartM);
  });
  return toTexture(ctx);
}

// ======================================================================
//  IO: vàng lưu huỳnh + đốm núi lửa đỏ nâu; EUROPA: băng trắng + vằn nứt
// ======================================================================
function ioTexture() {
  const [cv, ctx] = makeCanvas(512, 256);
  const w = cv.width, h = cv.height;
  const n1 = makeNoise(131);
  const yel = hex2rgb("#d8c050"), org = hex2rgb("#b07828"), wt = hex2rgb("#f0e8c8");
  paint(ctx, w, h, (u, lat) => {
    const f = fbm(n1, u * 7, lat * 3.5, 4);
    return mix(mix(org, yel, cl(f)), wt, smooth(0.66, 0.8, f) * 0.5);
  });
  // đốm núi lửa
  let s = 313;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let k = 0; k < 26; k++) {
    const x = rnd() * w, y = h * (0.15 + rnd() * 0.7), r = 2 + rnd() * 5;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#7a2a10";
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#2a2a2a";
    ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1;
  return toTexture(ctx);
}

function europaTexture() {
  const [cv, ctx] = makeCanvas(512, 256);
  const w = cv.width, h = cv.height;
  const n1 = makeNoise(149), n2 = makeNoise(151);
  const ice = hex2rgb("#e8e0d0"), tint = hex2rgb("#c8b498");
  paint(ctx, w, h, (u, lat) => {
    const f = fbm(n1, u * 5, lat * 2.5, 3);
    let c = mix(ice, tint, cl(f) * 0.3);
    // lineae: vằn nứt cong — noise 1D kéo theo sin
    const w1 = fbm(n2, u * 2.5, lat * 1.2, 2);
    for (const [freq, amp, off] of [[9, 0.10, 0], [13, 0.07, 0.4], [6, 0.12, 0.7]]) {
      const line = Math.abs(Math.sin(u * Math.PI * freq + w1 * 5 + off) * amp * Math.cos(lat * 3 + off));
      c = mix(c, [150, 100, 70], smooth(0.02, 0.0, line) * 0.55);
    }
    return c;
  });
  return toTexture(ctx);
}

// ======================================================================
//  TITAN / GANYMEDE / CALLISTO — vỏ ngoài dịu, ít tương phản
// ======================================================================
function softTexture({ base, dark, light, seed, scale = 5, bands = 0 }) {
  const [cv, ctx] = makeCanvas(512, 256);
  const w = cv.width, h = cv.height;
  const n1 = makeNoise(seed);
  const b = hex2rgb(base), dk = hex2rgb(dark), lt = hex2rgb(light);
  paint(ctx, w, h, (u, lat) => {
    const f = fbm(n1, u * scale, lat * scale / 2, 4);
    let c = mix(dk, b, cl(f));
    if (bands) c = mix(c, lt, 0.5 + 0.5 * Math.sin(lat * Math.PI * bands + f * 3) * 0.35);
    return c;
  });
  return toTexture(ctx);
}

// ======================================================================
//  KHÍ — Jupiter/Saturn/Uranus/Neptune: dải + cuộn turbulence theo vĩ độ
// ======================================================================
function gasTexture({ palette, seed = 201, bands = 11, turb = 0.9, spot = null, flat = 0 }) {
  // palette: mảng màu dọc theo vĩ độ (top→bottom); spot: {u, lat, rx, ry, color, ring}
  const [cv, ctx] = makeCanvas();
  const w = cv.width, h = cv.height;
  const n1 = makeNoise(seed), n2 = makeNoise(seed + 3);
  const cols = palette.map(hex2rgb);
  const bandAt = t => {
    const pos = t * (cols.length - 1);
    const i = Math.min(cols.length - 2, Math.floor(pos));
    return mix(cols[i], cols[i + 1], pos - i);
  };
  paint(ctx, w, h, (u, lat) => {
    // turbulence: méo vĩ độ theo noise (cuộn rối quanh biên dải)
    const w1 = fbm(n1, u * 5, lat * 7, 4) - 0.5;
    const latW = lat + w1 * turb * 0.045;
    let c = bandAt(cl(latW));
    // micro-turbulence sáng/tối
    const m = fbm(n2, u * 12, lat * 16, 3);
    c = mix(c, m > 0.5 ? [255, 255, 255] : [0, 0, 0], Math.abs(m - 0.5) * 0.18);
    if (spot) {
      const dx = u - spot.u, dy = lat - spot.lat;
      // quấn ngang: khoảng cách theo u tính cả wrap
      const du = Math.min(Math.abs(dx), 1 - Math.abs(dx));
      const d = Math.hypot(du / spot.rx, dy / spot.ry);
      const core = smooth(1, 0.35, d);
      c = mix(c, hex2rgb(spot.color), core);
      if (spot.ring) c = mix(c, hex2rgb(spot.ring), smooth(1.25, 0.9, d) * smooth(0.7, 1.0, d) * 0.6);
    }
    if (flat) c = mix(c, bandAt(0.5), flat);   // Uranus: phẳng lì
    return c;
  });
  return toTexture(ctx);
}

// ======================================================================
//  REGISTER — ánh xạ tên → texture. Minor (116 thiên thể nhỏ) giữ generic.
// ======================================================================
const REGISTRY = {};

function reg(name, fn) { REGISTRY[name] = fn; }

reg("Mercury", () => crateredTexture({ base: "#9c8f84", dark: "#5c534c", light: "#c8bcb0", craters: 520, maria: false, seed: 11 }));
reg("Earth", () => earthTexture());
reg("Mars", () => marsTexture());
reg("Venus", () => venusTexture());
reg("Jupiter", () => gasTexture({
  palette: ["#c8b090", "#e8dcc0", "#b08860", "#e8d8b8", "#a87850", "#d8c8a8", "#c09870", "#e0d0b0"],
  seed: 201, turb: 1.2,
  spot: { u: 0.30, lat: 0.62, rx: 0.11, ry: 0.085, color: "#c8503a", ring: "#e8d0b0" },
}));
reg("Saturn", () => gasTexture({
  palette: ["#e0c896", "#d8bc88", "#e8d8ac", "#ccb070", "#e4d09c", "#d8c090"],
  seed: 211, turb: 0.5, bands: 8,
}));
reg("Uranus", () => gasTexture({
  palette: ["#a8dde8", "#b8e4ec", "#9cd2e0", "#b0e0e8"],
  seed: 221, turb: 0.25, flat: 0.55,
}));
reg("Neptune", () => gasTexture({
  palette: ["#3a5cd0", "#5a7ce8", "#2a48b0", "#4a68d8", "#3555c8"],
  seed: 231, turb: 0.8,
  spot: { u: 0.72, lat: 0.40, rx: 0.09, ry: 0.07, color: "#1a2870", ring: "#6a8af0" },
}));
reg("Pluto", () => plutoTexture());
reg("Ceres", () => crateredTexture({ base: "#a8a29a", dark: "#6e6a62", light: "#c4beb4", craters: 300, maria: false, seed: 41, size: 512 }));
reg("Eris", () => softTexture({ base: "#dfe4e8", dark: "#b8c2cc", light: "#f4f8fa", seed: 61, scale: 4 }));

// moons
reg("_Moon", () => crateredTexture({ base: "#9a9a94", dark: "#5c5c58", light: "#c8c8c2", craters: 480, seed: 17 }));
reg("_Io", () => ioTexture());
reg("_Europa", () => europaTexture());
reg("_Ganymede", () => crateredTexture({ base: "#8a7a68", dark: "#5a4e42", light: "#b8aa98", craters: 340, seed: 23, size: 512 }));
reg("_Callisto", () => crateredTexture({ base: "#7a6a58", dark: "#463c30", light: "#a89880", craters: 560, seed: 29, size: 512 }));
reg("_Titan", () => softTexture({ base: "#d8a850", dark: "#a87828", light: "#e8c878", seed: 67, scale: 3.5, bands: 4 }));

// bump cho thiên thể hố (đặt theo tên mesh — bodies.mjs tra khi build)
export const BUMPS = new Map();
BUMPS.set("Mercury", () => craterBump({ base: "#888", dark: "#333", light: "#ccc", craters: 520, seed: 11 }));
BUMPS.set("_Moon", () => craterBump({ base: "#888", dark: "#333", light: "#ccc", craters: 480, seed: 17 }));
BUMPS.set("_Callisto", () => craterBump({ base: "#888", dark: "#333", light: "#ccc", craters: 560, seed: 29 }));
BUMPS.set("_Ganymede", () => craterBump({ base: "#888", dark: "#333", light: "#ccc", craters: 340, seed: 23 }));

// legacy: giữ planetTexture export để fallback + 116 minor dùng chung
export { planetTexture } from "./scene.mjs";

// API chính: texture theo tên (cache) — không có bản sắc riêng → null
const cache = new Map();
export function bodyTexture(name) {
  if (cache.has(name)) return cache.get(name);
  const fn = REGISTRY[name];
  const tex = fn ? fn() : null;
  cache.set(name, tex);
  return tex;
}
export function bumpTexture(key) {
  const fn = BUMPS.get(key);
  return fn ? fn() : null;
}
