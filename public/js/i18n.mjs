// ======================================================================
//  G3: I18N — đa ngôn ngữ (VI / EN / ZH), lưu lựa chọn vào localStorage
//  Tên hành tinh giữ quốc tế chuẩn thiên văn (không dịch)
//  T/getLang dùng được ở mọi module; applyLang cần deps (ST, planetObjs,
//  selectPlanet...) — bind qua initI18n() ở main.
// ======================================================================
const I18N = {
  vi: {
    shareCopied: "Đã copy link chia sẻ!", aiBtn: "Hỏi AI", aiTitle: "Trợ lý AI",
    cleanHide: "Ẩn giao diện (H)", cleanShow: "Hiện giao diện (H)",
    cleanToast: "Đã ẩn UI — bấm H hoặc nút 👁 để hiện lại",
    tlNow: "Về hiện tại",
    aiReadyServer: "Sẵn sàng — AI gateway server đã cấu hình. Hỏi bất kỳ điều gì về thiên thể!", aiReadyUser: "Sẵn sàng — dùng API key của bạn (Settings). Hỏi bất kỳ điều gì!", aiNone: "Chưa cấu hình AI. Vào ⚙️ Settings nhập Base URL + Model (và API key nếu dùng cloud).",
    names: { Sun:"Mặt Trời", Mercury:"Sao Thủy", Venus:"Sao Kim", Earth:"Trái Đất", Mars:"Sao Hỏa", Jupiter:"Sao Mộc", Saturn:"Sao Thổ", Uranus:"Sao Thiên Vương", Neptune:"Sao Hải Vương", Ceres:"Ceres", Pluto:"Sao Diêm Vương", Eris:"Eris" },
    sec1: "Tổng quan", sec2: "Quỹ đạo", sec3: "Tự quay",
    secSun2: "Cấu trúc & Vật lý",
    spectral: "Loại quang phổ", lum: "Độ phát sáng", coreT: "Nhiệt độ lõi",
    comp: "Thành phần", sunAge: "Tuổi", sunAgeVal: "≈ 4,6 tỷ năm",
    sunDesc: "Mặt Trời — ngôi sao lùn vàng loại G2V ở trung tâm hệ, chiếm 99,86% khối lượng toàn hệ. Hợp nhất ~600 triệu tấn hydro mỗi giây; ánh sáng mất ~8 phút 20 giây tới Trái Đất.",
    note: "tỷ lệ nghệ thuật, quỹ đạo Kepler thật",
    hint: "Kéo: xoay · Lăn: zoom · Click hành tinh: xem tên",
    orbits: b => "Đường quỹ đạo: " + (b ? "BẬT" : "TẮT"),
    labels: b => "Nhãn: " + (b ? "BẬT" : "TẮT"),
    tour: b => "🎬 Tour: " + (b ? "ON" : "OFF"),
    audio: b => "🎵 Âm thanh: " + (b ? "ON" : "OFF"),
    date: "Ngày mô phỏng:",
    follow: "Bám theo", unfollow: "Thả camera",
    mass: "Khối lượng", earthU: "× Trái Đất", dia: "Đường kính",
    temp: "Nhiệt độ", moons: "Mặt trăng", period: "Chu kỳ", days: "ngày",
    dwarf: "(dwarf)",
  },
  en: {
    shareCopied: "Share link copied!", aiBtn: "Ask AI", aiTitle: "AI Assistant",
    cleanHide: "Hide interface (H)", cleanShow: "Show interface (H)",
    cleanToast: "UI hidden — press H or the 👁 button to bring it back",
    tlNow: "Jump to now",
    aiReadyServer: "Ready — server AI gateway configured. Ask anything about the bodies!", aiReadyUser: "Ready — using your API key (Settings). Ask anything!", aiNone: "AI not configured. Open ⚙️ Settings and enter Base URL + Model (plus API key for cloud).",
    names: { Sun:"Sun", Mercury:"Mercury", Venus:"Venus", Earth:"Earth", Mars:"Mars", Jupiter:"Jupiter", Saturn:"Saturn", Uranus:"Uranus", Neptune:"Neptune", Ceres:"Ceres", Pluto:"Pluto", Eris:"Eris" },
    sec1: "Overview", sec2: "Orbit", sec3: "Rotation",
    secSun2: "Structure & Physics",
    spectral: "Spectral type", lum: "Luminosity", coreT: "Core temp",
    comp: "Composition", sunAge: "Age", sunAgeVal: "≈ 4.6 billion yr",
    sunDesc: "The Sun — a G2V yellow dwarf at the center of the system, holding 99.86% of its total mass. Fuses ~600 million tonnes of hydrogen per second; light takes ~8 min 20 s to reach Earth.",
    note: "artistic scale, true Kepler orbits",
    hint: "Drag: rotate · Scroll: zoom · Click a planet for info",
    orbits: b => "Orbits: " + (b ? "ON" : "OFF"),
    labels: b => "Labels: " + (b ? "ON" : "OFF"),
    tour: b => "🎬 Tour: " + (b ? "ON" : "OFF"),
    audio: b => "🎵 Sound: " + (b ? "ON" : "OFF"),
    date: "Sim date:",
    follow: "Follow", unfollow: "Release",
    mass: "Mass", earthU: "× Earth", dia: "Diameter",
    temp: "Temp", moons: "Moons", period: "Period", days: "days",
    dwarf: "(dwarf)",
  },
  zh: {
    shareCopied: "分享链接已复制！", aiBtn: "问AI", aiTitle: "AI助手",
    cleanHide: "隐藏界面 (H)", cleanShow: "显示界面 (H)",
    cleanToast: "界面已隐藏 — 按 H 或 👁 按钮恢复",
    tlNow: "回到当前",
    aiReadyServer: "就绪——服务器AI网关已配置。随意提问！", aiReadyUser: "就绪——使用你的API密钥（设置）。随意提问！", aiNone: "未配置AI。打开⚙️设置输入Base URL + Model（云服务还需API密钥）。",
    names: { Sun:"太阳", Mercury:"水星", Venus:"金星", Earth:"地球", Mars:"火星", Jupiter:"木星", Saturn:"土星", Uranus:"天王星", Neptune:"海王星", Ceres:"谷神星", Pluto:"冥王星", Eris:"阋神星" },
    sec1: "概述", sec2: "轨道", sec3: "自转",
    secSun2: "结构与物理",
    spectral: "光谱型", lum: "光度", coreT: "核心温度",
    comp: "成分", sunAge: "年龄", sunAgeVal: "≈ 46亿年",
    sunDesc: "太阳——系统中心的G2V黄矮星，占系统总质量的99.86%。每秒聚变约6亿吨氢；光到达地球约需8分20秒。",
    note: "艺术比例，真实开普勒轨道",
    hint: "拖动：旋转 · 滚轮：缩放 · 点击行星查看信息",
    orbits: b => "轨道线：" + (b ? "开" : "关"),
    labels: b => "标签：" + (b ? "开" : "关"),
    tour: b => "🎬 巡游：" + (b ? "开" : "关"),
    audio: b => "🎵 音效：" + (b ? "开" : "关"),
    date: "模拟日期：",
    follow: "跟随", unfollow: "释放",
    mass: "质量", earthU: "× 地球", dia: "直径",
    temp: "温度", moons: "卫星", period: "周期", days: "天",
    dwarf: "（矮行星）",
  },
};

let LANG = localStorage.getItem("cosmos_lang") || "vi";
if (!I18N[LANG]) LANG = "vi";
export const T = () => I18N[LANG];
export const getLang = () => LANG;

// deps cho applyLang — bind 1 lần ở main (tránh import vòng ui <-> i18n)
let deps = null;
export function bindI18n(d) { deps = d; }

export function applyLang() {
  const t = T();
  document.querySelector(".t-note").textContent = t.note;
  document.querySelector(".t-hint").textContent = t.hint;
  document.querySelector(".t-date").textContent = t.date;
  document.getElementById("orbits").textContent = t.orbits(deps.ST.showOrbits);
  document.getElementById("labels").textContent = t.labels(deps.ST.showLabels);
  document.getElementById("tour").textContent = t.tour(deps.ST.tourOn);
  document.getElementById("ambient").textContent = t.audio(false);
  document.querySelector(".t-ai").textContent = t.aiBtn;
  // clean view: tooltip nút 👁 theo ngôn ngữ hiện tại
  const uiT = document.getElementById("uiToggle");
  if (uiT) uiT.title = (document.body.classList.contains("ui-clean") ? t.cleanShow : t.cleanHide);
  // G4c: tooltip nút về hiện tại
  const tlNow = document.getElementById("tlNow");
  if (tlNow) tlNow.title = t.tlNow;
  document.querySelector(".t-share").textContent = t.share || "Share";
  document.querySelector(".t-ai2").textContent = t.aiTitle;
  document.getElementById("lang").textContent = "🌐 " + LANG.toUpperCase();
  // nhãn hành tinh: tên dịch theo ngôn ngữ + đuôi dwarf
  for (const o of deps.planetObjs) {
    o.lblObj.element.textContent = (t.names[o.data.name] || o.data.name) +
      (o.data.dwarf ? " " + t.dwarf : "");
  }
  // info panel đang mở thì render lại theo ngôn ngữ mới
  if (deps.getFollowTarget()) deps.selectPlanet(deps.getFollowTarget());
  // G4c: báo cho các module phụ (timeline markers...) render lại nhãn
  document.dispatchEvent(new Event("cosmos:lang"));
  localStorage.setItem("cosmos_lang", LANG);
}

export function initI18n(d) {
  bindI18n(d);
  document.getElementById("lang").addEventListener("click", () => {
    LANG = LANG === "vi" ? "en" : LANG === "en" ? "zh" : "vi";
    applyLang();
  });
}
