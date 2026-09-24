// ======================================================================
//  G3: TIME — vòng thời gian mô phỏng + tốc độ
//  speed slider: 10^v ngày/giây (v từ -2..3 => 0.01 .. 1000 ngày/s)
//  Khởi tạo: số ngày Julius từ J2000 (2000-01-01 12:00 TT) đến hiện tại thực
//  JD = 2440587.5 + unix_ms/86400000  ->  days = JD − 2451545.0
// ======================================================================
export const NOW_DAYS = (Date.now() / 86400000 + 2440587.5) - 2451545.0;
export const ST = { days: NOW_DAYS, speedExp: 0.7, paused: false, showOrbits: true, showLabels: true,
             tourOn: false, tourIdx: 0, tourPhase: "approach", tourTimer: 0 };

// G2: SPEED PRESETS — nút nhanh cho tốc độ mô phỏng (F12 fix: đúng toán học)
export const PRESETS = [
  { label: "Thực", v: -4.94 },          // 1 giây thực = 1/86400 ngày (F12 fix)
  { label: "1h/s", v: -1.38 },          // 1/24 ngày/s (F12 fix: cũ -1.62 ≈ 43 phút/s)
  { label: "1d/s", v: 0.0 },            // 1 ngày/s
  { label: "1mo/s", v: 1.48 },          // ~30 ngày/s
  { label: "1y/s", v: 2.563 },          // 365.25 ngày/s
];

export function initTime() {
  const $ = id => document.getElementById(id);
  $("speed").addEventListener("input", e => {
    ST.speedExp = +e.target.value;
    $("speedLabel").textContent =
      (ST.speedExp >= 0 ? Math.pow(10, ST.speedExp).toFixed(ST.speedExp < 1 ? 2 : 0)
                        : Math.pow(10, ST.speedExp).toFixed(2)) + " ngày/s";
  });
  const presetBox = document.getElementById("speedPresets");
  presetBox.replaceChildren();
  for (const pr of PRESETS) {
    const btn = document.createElement("button");
    btn.textContent = pr.label;
    btn.addEventListener("click", () => {
      ST.speedExp = pr.v;
      const slider = document.getElementById("speed");
      if (slider) slider.value = pr.v;
    });
    presetBox.appendChild(btn);
  }
}
