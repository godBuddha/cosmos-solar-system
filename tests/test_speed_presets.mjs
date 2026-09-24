#!/usr/bin/env node
// G2 — Test số học preset tốc độ (hậu viện F12: preset sai toán học)
// Parse PRESETS từ public/index.html, khớp log10(ngày/giây) với giá trị chuẩn.
import fs from "node:fs";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
let failed = 0;
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}${cond ? "" : " " + extra}`);
  if (!cond) failed++;
};

const m = html.match(/const PRESETS = \[([\s\S]*?)\];/);
ok("khối PRESETS tồn tại", !!m);
const presets = m
  ? [...m[1].matchAll(/\{ label: "([^"]+)", v: (-?\d+(?:\.\d+)?) \}/g)]
      .map(x => ({ label: x[1], v: +x[2] }))
  : [];
ok("PRESETS đủ 5 nút", presets.length === 5, `got ${presets.length}`);

// chuẩn: label → ngày/giây đúng nghĩa
const EXPECT = {
  "Thực": 1 / 86400,        // 1 giây thực tế
  "1h/s": 1 / 24,           // 1 giờ mô phỏng / giây
  "1d/s": 1,                // 1 ngày / giây
  "1mo/s": 30,              // ~1 tháng / giây
  "1y/s": 365.25,           // 1 năm / giây
};
for (const p of presets) {
  const want = EXPECT[p.label];
  ok(`label "${p.label}" có chuẩn`, want != null);
  if (want == null) continue;
  const v = Math.log10(want);                       // slider = 10^v ngày/giây
  ok(`"${p.label}" v=${p.v} ≈ log10(${want.toExponential(2)})=${v.toFixed(3)}`,
     Math.abs(p.v - v) <= 0.02, `lệch ${Math.abs(p.v - v).toFixed(4)}`);
}

// slider phải bao trùm mọi preset (F12: min mở rộng −5 cho "Thực")
const slider = html.match(/<input type="range" id="speed" min="(-?\d+)" max="(-?\d+)"[^>]*>/);
ok("slider speed tồn tại", !!slider);
if (slider) {
  const min = +slider[1], max = +slider[2];
  const lo = Math.min(...presets.map(p => p.v));
  const hi = Math.max(...presets.map(p => p.v));
  ok(`slider min(${min}) <= preset thấp nhất(${lo})`, min <= lo + 0.05);
  ok(`slider max(${max}) >= preset cao nhất(${hi})`, max >= hi - 0.05);
}
// NOW_DAYS = JD hôm nay − J2000 — ngày Julius phải trong khoảng hợp lệ (2026 ≈ 9760)
const nd = html.match(/const NOW_DAYS = \(Date\.now\(\) \/ 86400000 \+ 2440587\.5\) - 2451545\.0/);
ok("công thức NOW_DAYS (JD − J2000) đúng dạng", !!nd);

console.log(failed ? `\n${failed} test FAIL` : "\ntất cả test pass");
process.exit(failed ? 1 : 0);
