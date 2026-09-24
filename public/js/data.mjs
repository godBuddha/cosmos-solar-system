// ======================================================================
//  G3: DỮ LIỆU THIÊN VĂN (số liệu thật, tỷ lệ hiển thị nén theo luỹ thừa)
//  a: bán trục lớn (AU) | e: độ lệch tâm | i: nghiêng quỹ đạo (deg)
//  T: chu kỳ quy hoạch (ngày) | rot: chu kỳ tự quay (ngày)
//  tilt: nghiêng trục (deg) | r: bán kính hiển thị (đã nén tay)
//  info: dữ liệu NASA fact sheet (khối lượng = Trái Đất=1, nhiệt độ K, số moon)
//  Nguồn: NASA planetary fact sheet (kiến thức chuẩn, ghi để kiểm chứng)
// ======================================================================
//  M0 = mean anomaly tại epoch J2000 (JD 2451545.0) = L − ϖ (bảng JPL
//  "Approximate Positions of the Planets", độ chính xác ~vài phút cung)
//  om = longitude of perihelion ϖ | node = longitude of ascending node Ω (deg)
// Bảng PLANETS nạp từ catalog.json (sinh từ docs/bodies/*.md — single
// source of truth). Fallback hard-code giữ cho app chạy khi fetch fail.
// Lưu ý: PLANETS/CATALOG_DESC là live bindings — loadCatalog() gán lại và
// mọi module import chúng đều thấy giá trị mới.
export const PLANETS_FALLBACK = [
  { name:"Mercury", a:0.387, e:0.206, i:7.005, T:88,     rot:58.6, tilt:0.03, r:0.55, col:"#9c8f84", col2:"#6b615a", M0:174.795, om:77.457,  node:48.331,  info:{mass:0.055, temp:440, moons:0, dia:4879} },
  { name:"Venus",   a:0.723, e:0.007, i:3.395, T:225,    rot:-243, tilt:177.4,r:0.85, col:"#e8c78f", col2:"#b8945f", M0:50.416,  om:131.564, node:76.680,  info:{mass:0.815, temp:737, moons:0, dia:12104} },
  { name:"Earth",   a:1.000, e:0.017, i:0.0,   T:365.25, rot:1.0,  tilt:23.4, r:0.9,  col:"#5f8fd8", col2:"#3a5f9f", M0:357.527, om:102.937, node:-11.26,  info:{mass:1.0, temp:288, moons:1, dia:12756} },
  { name:"Mars",    a:1.524, e:0.093, i:1.850, T:687,    rot:1.03, tilt:25.2, r:0.68, col:"#d1704a", col2:"#94452c", M0:19.406,  om:336.041, node:49.559,  info:{mass:0.107, temp:210, moons:2, dia:6792} },
  { name:"Jupiter", a:5.203, e:0.048, i:1.303, T:4333,   rot:0.41, tilt:3.1,  r:2.4,  col:"#d8b088", col2:"#a87850", M0:19.668,  om:14.728,  node:100.474, info:{mass:317.8, temp:165, moons:95, dia:142984} },
  { name:"Saturn",  a:9.537, e:0.054, i:2.489, T:10759,  rot:0.44, tilt:26.7, r:2.05, col:"#e0c896", col2:"#b09860", M0:317.355, om:92.599,  node:113.662, info:{mass:95.2, temp:134, moons:146, dia:120536} },
  { name:"Uranus",  a:19.19, e:0.047, i:0.773, T:30687,  rot:-0.72,tilt:97.8, r:1.4,  col:"#9fdde8", col2:"#6ba8b8", M0:142.284, om:170.954, node:74.017,  info:{mass:14.5, temp:76, moons:28, dia:51118} },
  { name:"Neptune", a:30.07, e:0.009, i:1.770, T:60190,  rot:0.67, tilt:28.3, r:1.35, col:"#4a6fe0", col2:"#2a45a8", M0:259.916, om:44.964,  node:131.784, info:{mass:17.1, temp:72, moons:16, dia:49528} },
  { name:"Ceres",  a:2.77,  e:0.076, i:10.6, T:1682,   rot:0.38, tilt:4,    r:0.30, col:"#a8a29a", col2:"#7a756d", M0:95.99,  om:153.9,  node:80.3,  dwarf:true, info:{mass:0.00016, temp:168, moons:0, dia:940} },
  { name:"Pluto",   a:39.48, e:0.249, i:17.2, T:90560,  rot:-6.39, tilt:119.6,r:0.42, col:"#d8c0a8", col2:"#a08878", M0:14.53,  om:224.07, node:110.3, dwarf:true, info:{mass:0.0022, temp:44, moons:5, dia:2377} },
  { name:"Eris",    a:67.78, e:0.44,  i:44.2, T:203830, rot:15.8/24,tilt:78, r:0.40, col:"#cfd8dc", col2:"#9aa4ab", M0:205.99, om:187.35, node:35.95, dwarf:true, info:{mass:0.0027, temp:30, moons:1, dia:2326} },
];
export let PLANETS = [...PLANETS_FALLBACK];   // sẽ bị thay nếu fetch catalog thành công
export let CATALOG_DESC = {};   // mô tả đa ngôn ngữ theo id, từ catalog

// nạp catalog — PHẢI hoàn tất trước khi dựng scene (main.mjs await trước khi dựng)
export async function loadCatalog() {
  try {
    const res = await fetch("./data/catalog.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const cat = await res.json();
    PLANETS = cat.map(b => ({
      name: b.names.en,                       // key nội bộ giữ EN (map qua I18N.names)
      a: b.a, e: b.e, i: b.i, T: b.T, rot: b.rot, tilt: b.tilt, r: b.r,
      col: b.col, col2: b.col2, M0: b.M0, om: b.om, node: b.node,
      dwarf: !!b.dwarf,
      info: { mass: b.mass, temp: b.temp, moons: b.moons, dia: b.dia },
    }));
    for (const b of cat) CATALOG_DESC[b.id] = b.desc;
    console.info("catalog loaded:", PLANETS.length, "bodies");
  } catch (e) {
    console.warn("catalog fetch fail — dùng fallback hard-code:", e.message);
  }
}

// NÉN KHOẢNG CÁCH: d_scene = C * a^0.55 (Neptune chỉ ~6.6x Earth thay vì 30x)
export const DIST_C = 11.0;
export const distScale = a => DIST_C * Math.pow(a, 0.55);

// MẶT TRỜI là thiên thể chọn được: đứng yên tại gốc (a=0, animate loop bỏ
// qua orbitalPosition), không có đường quỹ đạo. a=0 → tìm kiếm hiển thị "0 AU".
export const SUN_DATA = {
  name: "Sun", a: 0, e: 0, i: 0, T: 1e9, M0: 0, om: 0, node: 0,
  rot: 25.38, tilt: 7.25, r: 3.2, dwarf: false,
  info: { mass: 333000, temp: 5772, moons: 8, dia: 1391400 },
};

// PHASE 2a: MOONS — mặt trăng cho Trái Đất / Jupiter / Saturn
export const MOONS = [
  { parent: "Earth",   r: 0.24, dist: 1.7,  T: 27.3,  tilt: 0.09, col: 0x9a9a94 },
  { parent: "Jupiter", r: 0.18, dist: 3.4,  T: 1.77,  tilt: 0.03, col: 0xd8c078 },  // Io
  { parent: "Jupiter", r: 0.16, dist: 4.1,  T: 3.55,  tilt: 0.05, col: 0xc8b8a8 },  // Europa
  { parent: "Jupiter", r: 0.22, dist: 4.9,  T: 7.15,  tilt: 0.04, col: 0x8a7a68 },  // Ganymede
  { parent: "Jupiter", r: 0.19, dist: 5.8,  T: 16.7,  tilt: 0.06, col: 0xb8a890 },  // Callisto
  { parent: "Saturn",  r: 0.20, dist: 4.3,  T: 15.9,  tilt: 0.35, col: 0xd8b878 },  // Titan
];
