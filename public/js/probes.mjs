// ======================================================================
//  G4: TÀU THĂM DÒ — 6 sứ mệnh thật (Voyager 1/2, Cassini, Juno,
//  New Horizons, Parker Solar Probe) với lộ trình lịch sử theo ngày.
//
//  Thiết kế (theo cấu trúc tàu thật — NASA/JPL):
//   • Voyager  : bus 10 cạnh + đĩa parabolic 3.66 m trắng, 2 cần RTG,
//                cần magnetometer dài, cần khoa học + scan platform
//   • Cassini  : bus vàng foil + đĩa HGA 4 m, 3 RTG, cần mag, Huygens cone
//   • Juno     : bus 6 cạnh + 3 cánh pin mặt trời xanh (9 m mỗi cánh)
//   • New Horizons : thân gọn + đĩa 2.1 m + RTG đen, không panel
//   • Parker   : khiên nhiệt carbon đen (đĩa phẳng) che thân về hướng Mặt Trời
//
//  Lộ trình: waypoint = vị trí hành tinh tại ngày lịch (orbitalPosition —
//  deterministic) + offset nhỏ. Nội suy smoothstep giữa các mốc → cong mềm
//  như bay qua hấp dẫn. Sau mốc cuối: extrapolate theo hướng rời (Voyager/NH).
//  Phase quỹ đạo (Cassini/Juno/Parker): sample vòng quanh thiên thể mẹ.
//  Nén khoảng cách dùng chung distScale(a^0.55) — nhất quán với hành tinh.
// ======================================================================
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { PLANETS } from "./data.mjs";
import { orbitalPosition, solveKepler } from "./kepler.mjs";
import { distScale } from "./data.mjs";
import { ST } from "./time.mjs";
import { T, getLang } from "./i18n.mjs";

// ngày lịch → days từ J2000 (JD = 2440587.5 + unix/86400000)
const Y = (y, m = 1, d = 1) =>
  (Date.UTC(y, m - 1, d, 12) / 86400000 + 2440587.5) - 2451545.0;

// ngày hiện tại (dùng cho dữ liệu "hiện trạng")
const NOW = Y(2026, 9, 25);

// vị trí hành tinh tại ngày d + offset nhỏ (không nằm đúng tâm hành tinh)
function bodyPos(name, days, off = 1.1) {
  const p = PLANETS.find(x => x.name === name);
  if (!p) return new THREE.Vector3(0, 0, 0);
  const pos = orbitalPosition(p, days);
  // offset: vuông góc ổn định theo hướng vị trí (deterministic, không random)
  const v = new THREE.Vector3(pos.x, pos.y, pos.z);
  const away = v.clone().normalize();
  const perp = Math.abs(away.y) < 0.9
    ? new THREE.Vector3(0, 1, 0).cross(away).normalize()
    : new THREE.Vector3(1, 0, 0);
  return v.add(perp.multiplyScalar(off));
}

// ======================================================================
//  I18N riêng cho probes (VI/EN/ZH — gọn, không đụng i18n.mjs)
// ======================================================================
const PI18N = {
  vi: {
    secs: ["Tổng quan", "Hành trình", "Hiện trạng"],
    launch: "Phóng", agency: "Quản lý", mass: "Khối lượng", power: "Nguồn",
    status: "Trạng thái", events: "Sự kiện", date: "Ngày",
    dist: "Khoảng cách nay", speed: "Tốc độ", contact: "Liên lạc cuối",
    interstellar: "Không gian liên sao", active: "Đang hoạt động",
    ended: "Kết thúc sứ mệnh", orbiting: "Đang quanh",
    ev: {
      launch: "Phóng", flyby: "Bay ngang", arrival: "Đến",
      soi: "Vào quỹ đạo", finale: "Grand Finale", impact: "Kết thúc",
      pluto: "Bay ngang Pluto", kuiper: "Vành Kuiper", peri: "Cận nhật",
    },
  },
  en: {
    secs: ["Overview", "Journey", "Status"],
    launch: "Launch", agency: "Agency", mass: "Mass", power: "Power",
    status: "Status", events: "Event", date: "Date",
    dist: "Distance now", speed: "Speed", contact: "Last contact",
    interstellar: "Interstellar space", active: "Active",
    ended: "Mission ended", orbiting: "Orbiting",
    ev: {
      launch: "Launch", flyby: "Flyby", arrival: "Arrival",
      soi: "Orbit insertion", finale: "Grand Finale", impact: "End",
      pluto: "Pluto flyby", kuiper: "Kuiper Belt", peri: "Perihelion",
    },
  },
  zh: {
    secs: ["概述", "旅程", "现状"],
    launch: "发射", agency: "机构", mass: "质量", power: "电源",
    status: "状态", events: "事件", date: "日期",
    dist: "当前距离", speed: "速度", contact: "末次联络",
    interstellar: "星际空间", active: "运行中",
    ended: "任务结束", orbiting: "环绕",
    ev: {
      launch: "发射", flyby: "飞掠", arrival: "到达",
      soi: "入轨", finale: "壮丽终章", impact: "结束",
      pluto: "飞掠冥王星", kuiper: "柯伊伯带", peri: "近日点",
    },
  },
};
const PT = () => PI18N[getLang()] || PI18N.vi;

// ======================================================================
//  ĐỊNH NGHĨA SỨ MỆNH
// ======================================================================
const MISSIONS = [
  {
    id: "voyager1", name: "Voyager 1", color: 0x8fd0ff, scale: 0.5,
    launch: Y(1977, 9, 5),
    info: { agency: "NASA / JPL", massKg: 721.9, power: "470 W RTG (nay ~226 W)",
            statusKey: "interstellar", distAU: 167.5, speed: "17.0 km/s",
            contact: "24 giờ/ngày (DSN)" },
    waypoints: [
      { t: Y(1977, 9, 5),  ev: "launch", body: "Earth" },
      { t: Y(1979, 3, 5),  ev: "flyby",  body: "Jupiter" },
      { t: Y(1980, 11, 12), ev: "flyby", body: "Saturn" },
    ],
    exit: { t0: Y(1980, 11, 12), up: 0.62, capAU: 190, auPerDay: 17.0 * 5.7754e-4 },   // 17 km/s  // hướng lên bắc hoàng đạo
  },
  {
    id: "voyager2", name: "Voyager 2", color: 0xa0e8c0, scale: 0.5,
    launch: Y(1977, 8, 20),
    info: { agency: "NASA / JPL", massKg: 825, power: "470 W RTG (nay ~220 W)",
            statusKey: "interstellar", distAU: 139.5, speed: "15.3 km/s",
            contact: "24 giờ/ngày (DSN)" },
    waypoints: [
      { t: Y(1977, 8, 20), ev: "launch", body: "Earth" },
      { t: Y(1979, 7, 9),  ev: "flyby",  body: "Jupiter" },
      { t: Y(1981, 8, 25), ev: "flyby",  body: "Saturn" },
      { t: Y(1986, 1, 24), ev: "flyby",  body: "Uranus" },
      { t: Y(1989, 8, 25), ev: "flyby",  body: "Neptune" },
    ],
    exit: { t0: Y(1989, 8, 25), up: -0.55, capAU: 160, auPerDay: 15.4 * 5.7754e-4 },  // 15.4 km/s  // rời xuống nam
  },
  {
    id: "cassini", name: "Cassini", color: 0xffd27a, scale: 0.55,
    launch: Y(1997, 10, 15), end: Y(2017, 9, 15),   // chết chìm vào Saturn
    info: { agency: "NASA / ESA / ASI", massKg: 2125, power: "3 RTG ~880 W",
            statusKey: "ended", distAU: 9.5, speed: "—",
            contact: "15/09/2017 (Grand Finale)" },
    waypoints: [
      { t: Y(1997, 10, 15), ev: "launch", body: "Earth" },
      { t: Y(1998, 4, 26),  ev: "flyby",  body: "Venus" },
      { t: Y(1999, 6, 24),  ev: "flyby",  body: "Venus" },
      { t: Y(1999, 8, 18),  ev: "flyby",  body: "Earth" },
      { t: Y(2000, 12, 30), ev: "flyby",  body: "Jupiter" },
      { t: Y(2004, 7, 1),   ev: "soi",    body: "Saturn" },
    ],
    orbit: { body: "Saturn", from: Y(2004, 7, 1), to: Y(2017, 9, 15),
             r: 1.65, period: 80, tiltY: 0.42, endAtCenter: true },
  },
  {
    id: "juno", name: "Juno", color: 0x7fa8ff, scale: 0.5,
    launch: Y(2011, 8, 5),
    info: { agency: "NASA / JPL", massKg: 3625, power: "Pin mặt trời ~500 W",
            statusKey: "orbiting", orbitBody: "Jupiter", distAU: 5.2,
            speed: "—", contact: "Đang hoạt động" },
    waypoints: [
      { t: Y(2011, 8, 5),  ev: "launch", body: "Earth" },
      { t: Y(2013, 10, 9), ev: "flyby",  body: "Earth" },  // gravity assist
      { t: Y(2016, 7, 4),  ev: "soi",    body: "Jupiter" },
    ],
    orbit: { body: "Jupiter", from: Y(2016, 7, 4), to: null /* → nay */,
             r: 1.2, period: 53.5, tiltY: 0.08, endAtCenter: false },
  },
  {
    id: "newhorizons", name: "New Horizons", color: 0xe8a0ff, scale: 0.42,
    launch: Y(2006, 1, 19),
    info: { agency: "NASA / APL", massKg: 478, power: "RTG ~200 W",
            statusKey: "kuiper", distAU: 61.5, speed: "13.8 km/s",
            contact: "Đang hoạt động" },
    waypoints: [
      { t: Y(2006, 1, 19), ev: "launch", body: "Earth" },
      { t: Y(2007, 2, 28), ev: "flyby",  body: "Jupiter" },
      { t: Y(2015, 7, 14), ev: "pluto",  body: "Pluto" },
    ],
    exit: { t0: Y(2015, 7, 14), up: 0.1, capAU: 80, auPerDay: 13.8 * 5.7754e-4 },    // 13.8 km/s  // Kuiper, gần mặt phẳng
  },
  {
    id: "parker", name: "Parker Solar Probe", color: 0xff8866, scale: 0.4,
    launch: Y(2018, 8, 12),
    info: { agency: "NASA / APL", massKg: 685, power: "Pin mặt trời (làm mát)",
            statusKey: "active", distAU: 0.04, speed: "692 000 km/h (kỷ lục)",
            contact: "Đang hoạt động" },
    // ellipse quanh Mặt Trời: a=0.384 AU, e=0.896, T=86.7 ngày — cận nhật
    // 24/12/2024. Clamp bán kính ≥ 3.55 (đĩa cận nhật phóng to cho nhìn được).
    synth: {
      a: 0.384, e: 0.896, T: 86.7, i: 3.5, node: 0, om: 0,
      periAt: Y(2024, 12, 24), rMin: 3.55, until: Y(2027, 12, 31),
    },
  },
];

// ======================================================================
//  MODEL PROCEDURAL — dựng theo cấu trúc tàu thật (primitives Three.js)
// ======================================================================
function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.45, ...opts });
}
// đĩa parabolic: nửa cầu dẹt
function dish(r, color) {
  const g = new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 3.4);
  const m = new THREE.Mesh(g, mat(color, { metalness: 0.7, roughness: 0.35 }));
  m.rotation.x = Math.PI / 2;       // miệng đĩa hướng +Z
  m.scale.z = 0.45;                 // dẹt thành parabolic
  return m;
}
function boom(len, r = 0.012, color = 0x9aa4ab) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat(color));
  m.rotation.x = Math.PI / 2;
  m.position.z = len / 2;
  return m;
}
function box(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
}

const MODELS = {
  // Voyager: bus 10 cạnh + đĩa trắng + 2 RTG + cần mag dài + cần khoa học
  voyager() {
    const g = new THREE.Group();
    const bus = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.16, 10), mat(0xb8a878));
    g.add(bus);
    const d = dish(0.42, 0xe8e4dc); d.position.z = 0.18; g.add(d);   // đĩa 3.66m → +Z (hướng Trái Đất)
    const rtg = boom(0.5); rtg.rotation.z = 1.1; rtg.position.set(0.18, 0.1, 0); g.add(rtg);
    const rtg2 = boom(0.5); rtg2.rotation.z = -1.1; rtg2.position.set(-0.18, 0.1, 0); g.add(rtg2);
    const mag = boom(1.1); mag.rotation.x = -Math.PI / 2; mag.position.z = -0.35; g.add(mag);
    const sci = boom(0.55); sci.rotation.x = Math.PI / 2; sci.position.z = -0.3; g.add(sci);
    const scan = box(0.07, 0.05, 0.07, 0x6a7a8a); scan.position.set(0, -0.03, -0.85); g.add(scan);
    return g;
  },
  // Cassini: đĩa HGA 4 m (một đầu) + bus vàng + 3 RTG + cần mag + Huygens cone
  cassini() {
    const g = new THREE.Group();
    const bus = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 12), mat(0xc8a848));
    g.add(bus);
    const d = dish(0.44, 0xb8bcc4); d.position.z = 0.42; g.add(d);   // HGA hướng +Z
    const eng = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 10), mat(0x5a5f68));
    eng.rotation.x = Math.PI / 2; eng.position.z = -0.35; g.add(eng);
    const rtgBoom = boom(0.5); rtgBoom.rotation.z = Math.PI / 2;
    rtgBoom.position.set(0.4, 0, 0); g.add(rtgBoom);
    for (let k = 0; k < 3; k++) {
      const rtg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 8), mat(0x2a2f38));
      rtg.rotation.z = Math.PI / 2; rtg.position.set(0.58, 0, (k - 1) * 0.12); g.add(rtg);
    }
    const mag = boom(0.9); mag.rotation.z = -Math.PI / 2; mag.position.set(-0.6, 0, 0); g.add(mag);
    const huy = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.22, 10), mat(0xd8dce4));
    huy.rotation.z = -Math.PI / 2; huy.position.set(-0.2, 0.16, 0); g.add(huy);   // Huygens cone
    return g;
  },
  // Juno: bus 6 cạnh + 3 cánh pin xanh lớn (đặc trưng nhất)
  juno() {
    const g = new THREE.Group();
    const bus = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.2, 6), mat(0xd8dce4));
    g.add(bus);
    const d = dish(0.13, 0xc8ccd4); d.position.z = 0.2; g.add(d);   // HGA nhỏ
    for (let k = 0; k < 3; k++) {
      const wing = box(0.85, 0.02, 0.28, 0x1a2a5a);   // panel xanh đậm
      wing.position.set(0, 0, 0);
      wing.rotation.y = (k * 2 * Math.PI) / 3;
      const pivot = new THREE.Group();
      wing.position.z = 0.55;
      pivot.add(wing); pivot.rotation.y = (k * 2 * Math.PI) / 3;
      g.add(pivot);
    }
    return g;
  },
  // New Horizons: thân gọn + đĩa 2.1 m + RTG đen 3 góc, không panel
  newhorizons() {
    const g = new THREE.Group();
    const bus = box(0.2, 0.18, 0.24, 0x8a9078);
    g.add(bus);
    const d = dish(0.3, 0xd8dce0); d.position.z = 0.3; g.add(d);
    const rtg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 8), mat(0x1a1e24));
    rtg.rotation.z = Math.PI / 2; rtg.position.set(0.28, 0, 0); g.add(rtg);
    return g;
  },
  // Parker: khiên nhiệt carbon đen (đĩa phẳng rất to so với thân) che +Z
  parker() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 8), mat(0xd8dce4));
    g.add(body);
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.05, 24), mat(0x14161a));
    shield.rotation.x = Math.PI / 2; shield.position.z = 0.2; g.add(shield);
    for (const s of [-1, 1]) {          // 2 cánh panel nhỏ nằm sau khiên
      const wing = box(0.16, 0.02, 0.3, 0x1a2a5a);
      wing.position.set(s * 0.2, 0, 0.02);
      g.add(wing);
    }
    return g;
  },
};

// ======================================================================
//  TRAJ — nội suy lộ trình
// ======================================================================
function smooth(u) { return u * u * (3 - 2 * u); }

function buildTrajectory(m) {
  const pts = [];   // { t, v: Vector3 }
  // 1) waypoints từ vị trí hành tinh tại ngày lịch
  for (const w of m.waypoints ?? []) {
    const p = bodyPos(w.body, w.t, w.ev === "launch" ? 0.5 : 1.1);
    pts.push({ t: w.t, v: p });
  }
  // 2) phase quỹ đạo quanh thiên thể mẹ (Cassini/Juno)
  if (m.orbit) {
    const o = m.orbit;
    const to = o.to ?? Y(2027, 12, 31);
    const step = o.period / 12;                    // 12 mẫu/vòng
    const end = Math.min(to, Y(2027, 12, 31));
    for (let t = o.from + step; t < end; t += step) {
      const th = 2 * Math.PI * (t - o.from) / o.period;
      const base = bodyPos(o.body, t, 0);
      const off = new THREE.Vector3(
        Math.cos(th) * o.r,
        Math.sin(th * 2) * o.r * o.tiltY * 0.3,
        Math.sin(th) * o.r * Math.cos(o.tiltY));
      pts.push({ t, v: base.add(off) });
    }
    if (o.endAtCenter) pts.push({ t: o.to, v: bodyPos(o.body, o.to, 0) });  // Grand Finale
  }
  // 3) Parker: ellipse Kepler quanh Mặt Trời (clamp bán kính hiển thị)
  if (m.synth) {
    const s = m.synth;
    const M0 = 2 * Math.PI * (s.periAt - 2451545) / s.T;   // perihelion tại periAt
    const D = Math.PI / 180;
    for (let t = m.launch + 20; t < s.until; t += 14) {
      const M = M0 + 2 * Math.PI * (t / s.T);
      const E = solveKepler(((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), s.e);
      const XP = s.a * (Math.cos(E) - s.e);
      const ZP = s.a * Math.sqrt(1 - s.e * s.e) * Math.sin(E);
      const w = (s.om - s.node) * D, inc = s.i * D, om = s.node * D;
      const x1 = XP * Math.cos(w) - ZP * Math.sin(w);
      const z1 = XP * Math.sin(w) + ZP * Math.cos(w);
      const y2 = z1 * Math.sin(inc), z2 = z1 * Math.cos(inc);
      let v = new THREE.Vector3(
        x1 * Math.cos(om) + z2 * Math.sin(om),
        y2, -x1 * Math.sin(om) + z2 * Math.cos(om));
      // nén theo distScale trên bán kính AU thật, rồi clamp ≥ rMin
      const rAU = v.length();
      v = v.multiplyScalar(distScale(rAU) / Math.max(rAU, 1e-9));
      const len = v.length();
      if (len < s.rMin) v.multiplyScalar(s.rMin / len);
      pts.push({ t, v });
    }
  }
  // 4) extrapolate theo hướng rời (Voyager 1/2, New Horizons)
  //    Tốc độ theo AU/th ngày DÙNG tốc độ thật của tàu (km/s → AU/ngày) —
  //    tốc độ đo từ segment scene sẽ bị bóp bởi nén a^0.55 (bay chậm giả).
  //    Vị trí = dir * distScale(a) — đúng luật nén của scene.
  if (m.exit) {
    const e = m.exit;
    const last = pts[pts.length - 1], prev = pts[pts.length - 2];
    const dir = last.v.clone().sub(prev.v).normalize();
    dir.y += e.up * 0.9;                 // nghiêng rời khỏi mặt phẳng hoàng đạo
    dir.normalize();
    const aOf = v => Math.pow(v.length() / 11.0, 1 / 0.55);   // scene → AU
    const aPerDay = e.auPerDay ??
      Math.max((aOf(last.v) - aOf(prev.v)) / (last.t - prev.t), 1e-6);
    let t = last.t, a = aOf(last.v);
    const until = Math.min(Y(2027, 12, 31), e.t0 + 365.25 * 90);
    while (t < until && a < e.capAU) {
      t += 120;
      a += aPerDay * 120;
      pts.push({ t, v: dir.clone().multiplyScalar(distScale(a)) });
    }
  }
  return pts;
}

function trajPos(pts, t) {
  if (t <= pts[0].t) return null;                       // chưa phóng
  if (t >= pts[pts.length - 1].t) return pts[pts.length - 1].v.clone();
  let i = 0;
  while (i < pts.length - 1 && pts[i + 1].t < t) i++;
  const a = pts[i], b = pts[i + 1];
  const u = smooth((t - a.t) / (b.t - a.t));
  return a.v.clone().lerp(b.v, u);
}

// ======================================================================
//  PANEL — dựng sections DOM-safe cho info panel (giống style planets)
// ======================================================================
function secEl(k, title, rows) {
  const sec = document.createElement("div");
  sec.id = "ipsec" + k;
  const h4 = document.createElement("h4");
  h4.textContent = title;
  sec.appendChild(h4);
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.className = "row";
    const sp = document.createElement("span"); sp.textContent = label;
    const b = document.createElement("b"); b.textContent = value;
    row.append(sp, b);
    sec.appendChild(row);
  }
  return sec;
}
const fmtDate = days => new Date((days + 2451545.0 - 2440587.5) * 86400000)
  .toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

// ======================================================================
//  CREATE
// ======================================================================
export function createProbes({ scene, planetObjs }) {
  const group = new THREE.Group();               // line trajectories (toggle theo orbits)
  scene.add(group);

  const probes = [];
  for (const m of MISSIONS) {
    const pts = buildTrajectory(m);

    // đường lộ trình (Line) — màu theo mission
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts.map(p => p.v));
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({
      color: m.color, transparent: true, opacity: 0.5,
    }));
    group.add(line);

    // model tàu (từ MODELS — giống cấu trúc thật)
    const grp = new THREE.Group();
    const model = (MODELS[m.id] ?? MODELS.voyager)();
    model.scale.setScalar(m.scale);
    const spin = new THREE.Group();
    spin.add(model);
    grp.add(spin);
    scene.add(grp);

    // nhãn CSS2D (màu mission — nổi hơn dwarf)
    const lbl = document.createElement("div");
    lbl.textContent = m.name;
    lbl.style.cssText = "font:11px ui-sans-serif; color:" + m.color.toString(16).padStart(6, "0") +
      "; text-shadow:0 0 6px rgba(0,20,50,.9); pointer-events:none;";
    const lblObj = new CSS2DObject(lbl);
    lblObj.position.set(0, 0.55, 0);
    grp.add(lblObj);

    // entry hợp nhất vào planetObjs → click/search/fly-to/AI action ăn luôn
    const entry = {
      data: {
        name: m.name, probe: true, mission: m,
        a: 0, rot: 720, r: 0.4, dwarf: false,   // rot=720: quay rất chậm
      },
      grp, spin, mesh: model.children[0], lblObj,
      pts, line,
    };
    planetObjs.push(entry);
    probes.push(entry);
  }

  // cập nhật mỗi frame: vị trí theo ST.days + visibility
  function update() {
    const days = ST.days;
    for (const p of probes) {
      const m = p.data.mission;
      const end = m.end ?? (m.synth ? m.synth.until : Y(2027, 12, 31));
      const active = days >= m.launch && days <= end;
      p.grp.visible = active;
      p.lblObj.visible = active;
      // lộ trình: hiện theo toggle orbits (đường quỹ đạo)
      p.line.visible = ST.showOrbits && days >= m.launch;
      if (!active) continue;
      const v = trajPos(p.pts, days);
      if (v) p.grp.position.copy(v);
    }
  }

  // panel: sections + tiêu đề TOC cho selectPlanet
  function renderProbeSections(o) {
    const pt = PT();
    const m = o.data.mission, inf = m.info;
    const distNow = () => {
      const v = trajPos(o.pts, Math.min(ST.days, o.pts[o.pts.length - 1].t));
      if (!v) return "—";
      const rScene = v.length();
      const aAU = Math.pow(rScene / 11.0, 1 / 0.55);
      return aAU >= 0.1 ? aAU.toFixed(1) + " AU" : (aAU * 150).toFixed(1) + " triệu km";
    };
    const stLabel = {
      interstellar: pt.interstellar, active: pt.active,
      ended: pt.ended, orbiting: pt.orbiting + " " + (inf.orbitBody || ""),
      kuiper: pt.ev.kuiper,
    }[inf.statusKey] || inf.statusKey;

    // rows hành trình từ waypoints (tối đa 6 mốc gần nhất quanh thời điểm)
    const evRows = [];
    for (const w of m.waypoints ?? []) {
      evRows.push([`${pt.ev[w.ev] || w.ev} ${w.body}`, fmtDate(w.t)]);
    }
    if (m.orbit) {
      evRows.push([pt.ev.soi + " " + m.orbit.body, fmtDate(m.orbit.from)]);
      if (m.orbit.endAtCenter) evRows.push([pt.ev.impact, fmtDate(m.orbit.to)]);
    }
    if (m.synth) {
      evRows.push([pt.ev.peri, fmtDate(m.synth.periAt)]);
    }

    const s1 = secEl(1, pt.secs[0], [
      [pt.launch, fmtDate(m.launch)],
      [pt.agency, inf.agency],
      [pt.mass, inf.massKg.toLocaleString("vi-VN") + " kg"],
      [pt.power, inf.power],
    ]);
    const s2 = secEl(2, pt.secs[1], evRows.slice(0, 6));
    const s3 = secEl(3, pt.secs[2], [
      [pt.status, stLabel],
      [pt.dist, inf.statusKey === "ended" ? "—" : distNow()],
      [pt.speed, inf.speed],
      [pt.contact, inf.contact],
    ]);
    return { sections: [s1, s2, s3], tocTitles: pt.secs };
  }

  console.info("probes loaded:", MISSIONS.map(m => m.name).join(", "));
  return { update, renderProbeSections, probes, trajGroup: group };
}
