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

// G4c: timeline scrubber 1900–2100 — kéo thả ST.days, mốc sự kiện tàu thăm dò
const TL_MIN = -36525;    // 1900-01-01 (days từ J2000)
const TL_MAX = 36525;     // 2100-01-01
let tlState = null;       // { input, yearEl } khi #timeline tồn tại

export function syncTimeline() {
  if (!tlState) return;
  const { input, yearEl } = tlState;
  if (!tlState.dragging && Math.abs(+input.value - ST.days) > 0.5) {
    input.value = Math.round(ST.days);
  }
  const y = new Date((ST.days + 2451545.0 - 2440587.5) * 86400000).getFullYear();
  const ys = String(y);
  if (yearEl.textContent !== ys) yearEl.textContent = ys;
}

function initTimeline(timelineEvents) {
  const $ = id => document.getElementById(id);
  const input = $("timeline"), yearEl = $("tlYear"), marks = $("tlMarks");
  if (!input || !yearEl || !marks) return;
  tlState = { input, yearEl, dragging: false };

  input.addEventListener("input", () => { tlState.dragging = true; ST.days = +input.value; });
  const endDrag = () => { if (tlState) tlState.dragging = false; };
  input.addEventListener("change", endDrag);
  input.addEventListener("pointerup", endDrag);

  // nút về hiện tại
  $("tlNow").addEventListener("click", () => { ST.days = NOW_DAYS; });

  // dựng mốc sự kiện (đặc tính theo lang — rebuild khi đổi ngôn ngữ)
  const buildMarks = () => {
    marks.replaceChildren();
    if (typeof timelineEvents !== "function") return;
    for (const ev of timelineEvents()) {
      const dot = document.createElement("span");
      dot.style.left = ((ev.t - TL_MIN) / (TL_MAX - TL_MIN) * 100).toFixed(2) + "%";
      dot.style.background = ev.color;
      dot.title = `${ev.mission} — ${(new Date((ev.t + 2451545.0 - 2440587.5) * 86400000))
        .toLocaleDateString("vi-VN")}`;
      dot.addEventListener("click", () => { ST.days = ev.t; });
      marks.appendChild(dot);
    }
  };
  buildMarks();
  document.addEventListener("cosmos:lang", buildMarks);
}

export function initTime(deps = {}) {
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
  initTimeline(deps.timelineEvents);
}
