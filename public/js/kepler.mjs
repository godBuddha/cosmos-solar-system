// ======================================================================
//  G3: KEPLER — giải M = E - e*sinE (Newton-Raphson) -> vị trí ellipse
// ======================================================================
import { distScale } from "./data.mjs";

export function solveKepler(M, e) {
  let E = M;
  for (let k = 0; k < 6; k++) E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}
// Ephemeris thật: M(t) = M0(J2000) + 2π·(t − J2000)/T, với t = days từ J2000.
// Transform đầy đủ 3 góc: ω (trong mặt phẳng, = ϖ − Ω) -> nghiêng i quanh đường
// node -> xoay Ω quanh trục đứng (Y). Hệ scene: Y = lên, hoàng đạo = mặt XZ.
export function orbitalPosition(p, days) {
  const M = (p.M0 * Math.PI / 180) + 2 * Math.PI * (days / p.T);   // rad
  const E = solveKepler(((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), p.e);
  // tọa độ trong mặt phẳng quỹ đạo, perihelion hướng +X (tiêu điểm = Mặt Trời)
  const XP = p.a * (Math.cos(E) - p.e);
  const ZP = p.a * Math.sqrt(1 - p.e * p.e) * Math.sin(E);
  const D = Math.PI / 180;
  const w = (p.om - p.node) * D;                 // argument of perihelion ω
  const inc = p.i * D;
  const om = p.node * D;
  // 1) quay trong mặt phẳng bởi ω
  const x1 = XP * Math.cos(w) - ZP * Math.sin(w);
  const z1 = XP * Math.sin(w) + ZP * Math.cos(w);
  // 2) nghiêng quỹ đạo i quanh trục X (đường node)
  const y2 = z1 * Math.sin(inc);
  const z2 = z1 * Math.cos(inc);
  // 3) xoay quanh trục đứng bởi Ω
  const x3 = x1 * Math.cos(om) + z2 * Math.sin(om);
  const z3 = -x1 * Math.sin(om) + z2 * Math.cos(om);
  // nén khoảng cách hiển thị (giữ hình dạng/hướng ellipse)
  const s = distScale(p.a) / p.a;
  return { x: x3 * s, y: y2 * s, z: z3 * s, r: Math.hypot(XP, ZP) };
}
