#!/usr/bin/env node
// G2 — Test số học preset tốc độ (hậu viện F12: preset sai toán học)
// G3: PRESETS/NOW_DAYS giờ export trực tiếp từ public/js/time.mjs.
import fs from "node:fs";
import { PRESETS, NOW_DAYS } from "../public/js/time.mjs";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
let failed = 0;
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}${cond ? "" : " " + extra}`);
  if (!cond) failed++;
};

ok("PRESETS đủ 5 nút", PRESETS.length === 5, `got ${PRESETS.length}`);

// chuẩn: label → ngày/giây đúng nghĩa
const EXPECT = {
  "Thực": 1 / 86400,        // 1 giây thực tế
  "1h/s": 1 / 24,           // 1 giờ mô phỏng / giây
  "1d/s": 1,                // 1 ngày / giây
  "1mo/s": 30,              // ~1 tháng / giây
  "1y/s": 365.25,           // 1 năm / giây
};
for (const p of PRESETS) {
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
  const lo = Math.min(...PRESETS.map(p => p.v));
  const hi = Math.max(...PRESETS.map(p => p.v));
  ok(`slider min(${min}) <= preset thấp nhất(${lo})`, min <= lo + 0.05);
  ok(`slider max(${max}) >= preset cao nhất(${hi})`, max >= hi - 0.05);
}
// NOW_DAYS = JD hôm nay − J2000 — ngày Julius phải trong khoảng hợp lệ (2026 ≈ 9760)
ok(`NOW_DAYS ≈ 9760 (JD − J2000), got ${NOW_DAYS.toFixed(1)}`,
   NOW_DAYS > 9000 && NOW_DAYS < 11000);

console.log(failed ? `\n${failed} test FAIL` : "\ntất cả test pass");
process.exit(failed ? 1 : 0);
