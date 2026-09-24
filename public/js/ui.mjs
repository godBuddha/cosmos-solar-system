// ======================================================================
//  G3: UI — chọn thiên thể/info panel, tìm kiếm, settings, tour/ambient,
//  free-fly, bottom-sheet, share/admin. State chia sẻ qua uiState + FLY.
// ======================================================================
import * as THREE from "three";
import { PLANETS, CATALOG_DESC, SUN_DATA } from "./data.mjs";
import { T, getLang } from "./i18n.mjs";
import { ST } from "./time.mjs";

const $ = id => document.getElementById(id);
const $s = id => document.getElementById(id);

// state đọc từ main (animate loop) — flyTarget được animate tự xoá sau dwell
export const uiState = { followTarget: null, flyTarget: null };
export const FLY = { on: false, keys: {}, speed: 22 };

// ---- G2: SETTINGS — hiệu năng + AI key (localStorage, không hard-code) ----
export const SETTINGS_KEY = "cosmos_settings";
export function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
  catch { return {}; }
}

export function initUI({ canvas, camera, controls, bloomPass, planetObjs, toggleGalaxies, renderProbeSections, captureFrame }) {

  // ---- click canvas chọn thiên thể ----
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downXY = null;
  canvas.addEventListener("pointerdown", e => { downXY = [e.clientX, e.clientY]; });
  canvas.addEventListener("pointerup", e => {
    if (!downXY || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 5) return;
    pointer.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(planetObjs.map(o => o.mesh));
    if (hits.length) {
      if (cleanOn) setClean(false);   // clean view: click thiên thể = muốn xem info → hiện lại UI
      const o = planetObjs.find(p => p.mesh === hits[0].object);
      selectPlanet(o);
    }
  });

  // ---- Phase 3: chọn hành tinh + info panel + fly-to follow camera ----
  // DOM-safe helper: dựng <div id="ipsecK"><h4>title</h4> rows... [desc]</div>
  // (textContent thay chuỗi HTML — mô tả catalog/AI không bao giờ thành markup)
  function sectionEl(k, title, rows, descText) {
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
    if (descText) {
      const dv = document.createElement("div");
      dv.style.cssText = "margin-top:6px; opacity:.85";
      dv.textContent = descText;
      sec.appendChild(dv);
    }
    return sec;
  }
  function selectPlanet(o) {
    uiState.followTarget = o;
    const t = T();
    const d = o.data.info;
    const isSun = o.data.name === "Sun";
    const bodyId = o.data.name.toLowerCase();
    const descText = isSun ? t.sunDesc : (CATALOG_DESC[bodyId] || {})[getLang()] || "";
    document.getElementById("ipName").textContent = t.names[o.data.name] || o.data.name;
    document.getElementById("ipNameEn").textContent = o.data.name + (o.data.dwarf ? " " + t.dwarf : "");
    const fmt = n => n.toLocaleString("vi-VN");
    const ipBody = document.getElementById("ipBody");
    let sections, tocTitles;
    if (o.data.probe && renderProbeSections) {
      // G4: tàu thăm dò — panel riêng (Tổng quan / Hành trình / Hiện trạng)
      const pb = renderProbeSections(o);
      sections = pb.sections;
      tocTitles = pb.tocTitles;
    } else if (isSun) {
      sections = [
        sectionEl(1, t.sec1, [
          [t.mass, `${fmt(d.mass)} ${t.earthU}`],
          [t.dia, `${fmt(d.dia)} km`],
          [t.temp, `${fmt(d.temp)} K`],
          [t.spectral, "G2V"],
        ], descText),
        sectionEl(2, t.secSun2, [
          [t.lum, "3.828×10²⁶ W"],
          [t.coreT, "15.7M K"],
          [t.comp, "H 73% · He 25%"],
          [t.sunAge, t.sunAgeVal],
        ], null),
        sectionEl(3, t.sec3, [
          ["Rot", `${o.data.rot} ${t.days}`],
          ["Tilt", `${o.data.tilt}°`],
        ], null),
      ];
      tocTitles = [t.sec1, t.secSun2, t.sec3];
    } else {
      sections = [
        sectionEl(1, t.sec1, [
          [t.mass, `${d.mass} ${t.earthU}`],
          [t.dia, `${fmt(d.dia)} km`],
          [t.temp, `${d.temp} K`],
          [t.moons, `${d.moons}`],
        ], descText || null),
        sectionEl(2, t.sec2, [
          [t.period, `${o.data.T} ${t.days}`],
          ["a", `${o.data.a} AU`],
          ["e", `${o.data.e}`],
          ["i", `${o.data.i}°`],
        ], null),
        sectionEl(3, t.sec3, [
          ["Rot", `${Math.abs(o.data.rot)} ${t.days}`],
          ["Tilt", `${o.data.tilt}°`],
        ], null),
      ];
      tocTitles = [t.sec1, t.sec2, t.sec3];
    }
    ipBody.replaceChildren(...sections);
    const toc = document.getElementById("ipToc");
    toc.replaceChildren();
    tocTitles.forEach((title, i) => {
      const btn = document.createElement("button");
      btn.textContent = title;
      btn.addEventListener("click", () => {
        document.getElementById("ipsec" + (i + 1)).scrollIntoView({ behavior: "smooth" });
        toc.querySelectorAll("button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      });
      toc.appendChild(btn);
    });
    const panel = document.getElementById("infopanel");
    panel.classList.add("open");
    panel.classList.remove("sheet-peek", "sheet-full");   // mobile: mở chế độ half
    // quy ước mobile: đóng AI panel nếu đang mở
    if (window.innerWidth <= 768) {
      const ap = document.getElementById("aiPanel");
      if (ap) ap.classList.remove("open");
    }
  }
  document.getElementById("btnUnfollow").addEventListener("click", () => {
    uiState.followTarget = null;
    document.getElementById("infopanel").classList.remove("open");
    controls.target.set(0, 0, 0);
  });

  // G4c: initTime() chuyển lên main (cần deps timelineEvents) — không gọi đúp

  $("pause").addEventListener("click", () => {
    ST.paused = !ST.paused;
    $("pause").textContent = ST.paused ? "▶" : "⏸";
  });
  $("orbits").addEventListener("click", () => {
    ST.showOrbits = !ST.showOrbits;
    PLANETS.forEach(p => p._orbitLine.visible = ST.showOrbits);
    $("orbits").textContent = T().orbits(ST.showOrbits);
  });
  $("labels").addEventListener("click", () => {
    ST.showLabels = !ST.showLabels;
    $("labels").textContent = T().labels(ST.showLabels);
    planetObjs.forEach(o => o.lblObj.visible = ST.showLabels);
  });

  // ---- G2: SETTINGS ----
  function applySettingsUI() {
    const s = loadSettings();
    $s("setBloom").value = s.bloom ?? 1.0;
    $s("setBloomOn").value = (s.bloomOn ?? "1");
    $s("setKuiper").value = s.kuiper ?? "50000";
    $s("setAiUrl").value = s.aiUrl ?? "";
    $s("setAiKey").value = s.aiKey ?? "";
    $s("setAiModel").value = s.aiModel ?? "";
    $s("setGalaxy").value = s.galaxy ?? "off";
    $s("setUiScale").value = s.uiScale ?? "medium";
    $s("setUiMode").value = s.uiMode ?? "auto";
  }
  $s("btnSettings").addEventListener("click", () => { applySettingsUI(); $s("settingsModal").classList.add("open"); });
  $s("setClose").addEventListener("click", () => $s("settingsModal").classList.remove("open"));
  $s("settingsModal").addEventListener("click", e => {
    if (e.target === $s("settingsModal")) $s("settingsModal").classList.remove("open");
  });
  $s("setBloom").addEventListener("input", e => {
    bloomPass.strength = +e.target.value;
    const s = loadSettings(); s.bloom = +e.target.value;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  });
  $s("setBloomOn").addEventListener("change", e => {
    bloomPass.enabled = e.target.value === "1";
    const s = loadSettings(); s.bloomOn = e.target.value;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  });
  $s("setSave").addEventListener("click", () => {
    const oldKuiper = loadSettingsKuiper();               // đọc TRƯỚC khi ghi
    const s = {
      bloom: +$s("setBloom").value,
      bloomOn: $s("setBloomOn").value,
      kuiper: $s("setKuiper").value,
      aiUrl: $s("setAiUrl").value.trim(),
      aiKey: $s("setAiKey").value.trim(),                  // localStorage máy user — không vào repo
      aiModel: $s("setAiModel").value.trim(),
      galaxy: $s("setGalaxy").value,
      uiScale: $s("setUiScale").value,
      uiMode: $s("setUiMode").value,
    };
    const galaxyChanged = $s("setGalaxy").value !== (loadSettings().galaxy ?? "off");
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    const needReload = String(s.kuiper) !== oldKuiper;    // so với giá trị cũ thật
    // áp UI scale/mode realtime + lưu body attribute
    document.body.dataset.uiscale = s.uiScale;
    document.body.dataset.uimode = s.uiMode;
    $s("settingsModal").classList.remove("open");
    if (galaxyChanged) { toggleGalaxies($s("setGalaxy").value === "on"); }
    if (needReload) location.reload();                    // Kuiper đổi số hạt cần rebuild geometry
  });
  function loadSettingsKuiper() {
    const s = loadSettings();
    return String(s.kuiper ?? "50000");
  }
  // áp bloom + galaxies đã lưu lúc mở trang
  (() => {
    const st = loadSettings();
    if (st.uiScale && st.uiScale !== "medium") document.body.dataset.uiscale = st.uiScale;
    if (st.uiMode && st.uiMode !== "auto") document.body.dataset.uimode = st.uiMode;
    if (st.galaxy === "on") toggleGalaxies(true);
  })();
  (() => {
    const s = loadSettings();
    // AUTO-DETECT thiết bị lần đầu (chưa có settings): máy yếu -> giảm hạt + tắt galaxy
    if (!localStorage.getItem(SETTINGS_KEY)) {
      const weakGPU = /Mali|Adreno [1-5]|PowerVR|Apple GPU.*(A1[0-3]|M1[^0])/.test(
        (() => { try { return (new (window.WebGLDebugRendererInfo ?? function(){}) ) && "" } catch { return "" } })())
        || navigator.hardwareConcurrency <= 4
        || (navigator.deviceMemory && navigator.deviceMemory <= 4);
      if (weakGPU) {
        s.kuiper = "10000";
        s.bloom = 0.8;
        console.info("auto-detect: thiết bị yếu — Kuiper 10k, bloom nhẹ");
      }
    }
    if (s.bloom != null) bloomPass.strength = s.bloom;
    if (s.bloomOn != null) bloomPass.enabled = s.bloomOn === "1";
  })();

  // ---- Tour tự động: camera bay qua các hành tinh theo thứ tự ----
  // (G4e: tách hàm để AI action gọi được)
  function toggleTour(on) {
    ST.tourOn = on === undefined ? !ST.tourOn : !!on;
    $("tour").textContent = T().tour(ST.tourOn);
    if (ST.tourOn) {
      uiState.followTarget = null;              // tour đè lên follow
      document.getElementById("infopanel").classList.remove("open");
      ST.tourIdx = 0;
      ST.tourPhase = "approach";                // approach -> dwell -> next
      ST.tourTimer = 0;
    }
  }
  $("tour").addEventListener("click", () => toggleTour());

  // ---- Âm thanh ambient: Web Audio API, drone pad procedural (không file ngoài) ----
  let audioCtx = null, ambientNodes = null;
  $("ambient").addEventListener("click", () => {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (!ambientNodes) {
      // 3 oscillator detune nhẹ tạo drone pad + LFO điều biến gain cho "thở"
      const master = audioCtx.createGain();
      master.gain.value = 0;                     // fade-in bằng setTargetAtTime
      master.connect(audioCtx.destination);
      const lfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      lfo.frequency.value = 0.07;                // chu kỳ thở ~14s
      lfoGain.gain.value = 0.035;
      lfo.connect(lfoGain);
      const oscs = [];
      [[55, "sine"], [110.5, "sine"], [164.8, "triangle"]].forEach(([f, type], i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = type; o.frequency.value = f;
        g.gain.value = i === 2 ? 0.04 : 0.09;    // гармон higher nhỏ hơn
        o.connect(g); g.connect(master);
        o.start();
        oscs.push(o);
      });
      lfo.connect(oscs[0].frequency);            // vibrato nhẹ tầng nền
      lfo.start();
      master.gain.setTargetAtTime(0.22, audioCtx.currentTime, 1.5);   // fade-in 1.5s
      ambientNodes = { master, oscs, lfo };
    } else {
      const on = ambientNodes.master.gain.value > 0.01;
      ambientNodes.master.gain.setTargetAtTime(on ? 0 : 0.22, audioCtx.currentTime, 0.8);
    }
    const on = ambientNodes.master.gain.value > 0.01;
    $("ambient").textContent = T().audio(!on);
  });

  // ======================================================================
  //  G2: SEARCH — tìm thiên thể đa ngôn ngữ, bay camera tới
  // ======================================================================
  const searchInput = document.getElementById("searchInput");
  const searchResults = document.getElementById("searchResults");

  function doSearch(q) {
    q = q.trim().toLowerCase();
    if (!q) { searchResults.style.display = "none"; return; }
    const t = T();
    const probeData = planetObjs.filter(o => o.data.probe).map(o => o.data);
    const matches = PLANETS.concat([SUN_DATA], probeData).filter(o => {
      const en = o.name.toLowerCase();
      const vi = (t.names[o.name] || "").toLowerCase();
      const zh = t.names[o.name] || "";
      return en.includes(q) || vi.includes(q) || zh.includes(q) ||
             en.replace(/\s/g, "").includes(q.replace(/\s/g, ""));
    });
    searchResults.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.style.opacity = ".5";
      empty.textContent = "∅";
      searchResults.appendChild(empty);
    } else {
      for (const m of matches) {
        const div = document.createElement("div");
        div.append(
          (t.names[m.name] || m.name),
          Object.assign(document.createElement("span"), {
            className: "sr-sub",
            textContent: m.name + (m.dwarf ? " " + t.dwarf : "") + " · " + m.a + " AU",
          })
        );
        div.addEventListener("click", () => {
          searchResults.style.display = "none";
          searchInput.value = "";
          if (cleanOn) setClean(false);   // chọn kết quả tìm kiếm → hiện lại UI
          flyToBody(m);
        });
        searchResults.appendChild(div);
      }
    }
    searchResults.style.display = "block";
  }
  searchInput.addEventListener("input", () => doSearch(searchInput.value));
  searchInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const first = searchResults.querySelector("div");
      if (first && first.textContent !== "∅") first.click();
    }
  });
  document.addEventListener("click", e => {
    if (!document.getElementById("searchbox").contains(e.target))
      searchResults.style.display = "none";
  });

  // fly-to: tái dùng cơ chế tour (approach + dwell) cho 1 thiên thể bất kỳ
  function flyToBody(o) {
    // guard: nhận object (planetObjs entry / PLANETS entry) hoặc string tên
    if (!o) { console.warn("flyToBody: thiếu tham số"); return; }
    const bodyName = typeof o === "string" ? o : o.name;
    if (!bodyName) { console.warn("flyToBody: o không có .name"); return; }
    const sceneObj = planetObjs.find(po =>
      po.data.name.toLowerCase() === bodyName.toLowerCase());
    if (!sceneObj) { console.warn("flyToBody: không tìm thấy", bodyName); return; }
    ST.tourOn = false;
    document.getElementById("tour").textContent = T().tour(false);
    uiState.flyTarget = { obj: sceneObj, phase: "approach", timer: 0 };
    try { selectPlanet(sceneObj); }
    catch (e) { console.error("selectPlanet lỗi:", e); }
  }

  // ---- ADMIN: mở trang setup/đăng nhập quản trị ----
  document.getElementById("btnAdmin").addEventListener("click", () => {
    window.open("/admin.html", "_blank");
  });

  // ---- SHARE: copy link góc nhìn hiện tại ----
  // G4d: chụp ảnh góc nhìn (PNG) — capture ở main ngay sau frame render
  document.getElementById("btnShot").addEventListener("click", () => {
    if (captureFrame) captureFrame();
    cleanToast(T().shotOk);
  });

  document.getElementById("btnShare").addEventListener("click", async () => {
    const t = T();
    const url = new URL(location.origin + location.pathname);
    if (uiState.followTarget) url.searchParams.set("body", uiState.followTarget.data.name.toLowerCase());
    url.searchParams.set("d", ST.days.toFixed(2));
    try {
      await navigator.clipboard.writeText(url.href);
      alert(t.shareCopied + "\n" + url.href);
    } catch {
      prompt(t.shareCopied, url.href);
    }
  });

  // ======================================================================
  //  FREE-FLY CAMERA — phím F bật/tắt, WASD + Q/E dịch chuyển, Shift ×5,
  //  lăn chuột đổi tốc độ bay. OrbitControls tạm vô hiệu trong chế độ này.
  // ======================================================================
  const flyUI = (() => {
    const el = document.createElement("div");
    el.id = "flyHud";
    el.style.cssText = "position:fixed;bottom:12px;left:50%;transform:translateX(-50%);" +
      "color:#ffd27a;font:12px ui-monospace,monospace;background:rgba(4,10,22,.8);" +
      "border:1px solid rgba(255,210,122,.35);border-radius:8px;padding:6px 14px;" +
      "z-index:40;display:none;user-select:none";
    // dựng DOM tĩnh 1 lần (DOM-safe — không ghép chuỗi HTML); toggle chỉ set value
    el.append("FREE-FLY — W/S: tới/lùi · A/D: trái/phải · Q/E: xoay · R/Space: lên/xuống · Shift ×5 · F/Esc: thoát · Tốc độ: ");
    const num = document.createElement("input");
    num.id = "flySpeed"; num.type = "number"; num.min = "1"; num.max = "2000";
    num.style.cssText = "width:60px;background:#0a1626;color:#ffd27a;border:1px solid rgba(255,210,122,.4);border-radius:4px;padding:0 4px;font-size:11px";
    el.appendChild(num);
    document.body.appendChild(el);
    return el;
  })();
  function flyToggle(force) {
    FLY.on = force !== undefined ? force : !FLY.on;
    controls.enabled = !FLY.on;
    if (!FLY.on) {
      // thoát free-fly: đồng bộ OrbitControls với camera hiện tại để không bị "giật về"
      controls.target.copy(camera.position).add(new THREE.Vector3().subVectors(
        (function(){ const d = new THREE.Vector3(); camera.getWorldDirection(d); return d; })(), 0))
        ;
      controls.target.copy(camera.position).add(
        new THREE.Vector3(-Math.sin(FLY.yaw) * Math.cos(FLY.pitch),
                          Math.sin(FLY.pitch),
                          -Math.cos(FLY.yaw) * Math.cos(FLY.pitch)).multiplyScalar(10));
      controls.update();
    }
    flyUI.style.display = FLY.on ? "block" : "none";
    if (FLY.on) flyUI.querySelector("#flySpeed").value = FLY.speed.toFixed(0);
    // hướng nhìn hiện tại làm mốc bay
    if (FLY.on) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      FLY.yaw = Math.atan2(-dir.x, -dir.z);
      FLY.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    }
  }
  // ======================================================================
  //  G4b: CLEAN VIEW — 1 nút ẩn/hiện toàn bộ UI (H toggle · Esc hiện lại)
  //  Trạng thái nhớ localStorage; AI đang stream (data-busy) vẫn giữ panel.
  // ======================================================================
  const CLEAN_KEY = "cosmos_clean_view";
  let cleanOn = false;
  function cleanToast(msg) {
    const el = document.createElement("div");
    el.id = "cleanToast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }
  function setClean(on) {
    cleanOn = on;
    document.body.classList.toggle("ui-clean", on);
    try { localStorage.setItem(CLEAN_KEY, on ? "1" : "0"); } catch { /* lưu được thì nhớ, không thì bỏ qua */ }
    const btn = $("uiToggle");
    const t = T();
    btn.title = on ? t.cleanShow : t.cleanHide;
    btn.setAttribute("aria-label", btn.title);
    if (on && !localStorage.getItem("cosmos_clean_toast")) {
      try { localStorage.setItem("cosmos_clean_toast", "1"); } catch { /* tương tự */ }
      cleanToast(t.cleanToast);
    }
  }
  $("uiToggle").addEventListener("click", () => setClean(!cleanOn));
  window.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.code === "KeyH") setClean(!cleanOn);
    else if (e.code === "Escape" && cleanOn) setClean(false);
  });
  if (localStorage.getItem(CLEAN_KEY) === "1") setClean(true);   // restore khi load lại trang

  window.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.code === "KeyF") flyToggle();
    if (e.code === "Escape" && FLY.on) flyToggle(false);
    if (FLY.on) {
      FLY.keys[e.code] = true;
      if (e.code === "Space") e.preventDefault();   // chặn scroll trang
    }
  });
  window.addEventListener("keyup", e => { FLY.keys[e.code] = false; });
  // tốc độ đổi qua ô nhập số trong HUD (không dùng lăn chuột)
  window.addEventListener("input", e => {
    if (e.target.id === "flySpeed" && isFinite(+e.target.value)) {
      FLY.speed = THREE.MathUtils.clamp(+e.target.value, 1, 2000);
    }
  });
  // pitch/yaw từ chuột kéo + TOUCH (chỉ trong free-fly)
  let lastTouch = null;
  canvas.addEventListener("pointermove", e => {
    if (!FLY.on || !(e.buttons & 1)) return;
    FLY.yaw   -= e.movementX * 0.0026;
    FLY.pitch -= e.movementY * 0.0026;
    FLY.pitch = THREE.MathUtils.clamp(FLY.pitch, -1.55, 1.55);
  });
  canvas.addEventListener("touchstart", e => {
    if (!FLY.on || e.touches.length !== 1) return;
    lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  canvas.addEventListener("touchmove", e => {
    if (!FLY.on || !lastTouch || e.touches.length !== 1) return;
    e.preventDefault();                       // chặn scroll khi đang free-fly touch
    const t = e.touches[0];
    FLY.yaw   -= (t.clientX - lastTouch.x) * 0.005;
    FLY.pitch -= (t.clientY - lastTouch.y) * 0.005;
    FLY.pitch = THREE.MathUtils.clamp(FLY.pitch, -1.55, 1.55);
    lastTouch = { x: t.clientX, y: t.clientY };
  }, { passive: false });
  canvas.addEventListener("touchend", () => { lastTouch = null; }, { passive: true });

  // ======================================================================
  //  G5: BOTTOM-SHEET GESTURE (mobile) — peek/half/full + swipe trên handle
  // ======================================================================
  (() => {
    const panel = document.getElementById("infopanel");
    const handle = document.getElementById("sheetHandle");
    if (!handle) return;
    let startY = 0, curMode = "half";

    function setMode(m) {
      curMode = m;
      panel.classList.remove("sheet-peek", "sheet-full");
      if (m === "peek") panel.classList.add("sheet-peek");
      if (m === "full") panel.classList.add("sheet-full");
    }
    // mở từ click thiên thể -> mặc định half
    window.__setSheetMode = setMode;
    // touch trên handle
    handle.addEventListener("touchstart", e => {
      startY = e.touches[0].clientY;
      handle.setPointerCapture && handle.setPointerCapture(e.pointerId);
    }, { passive: true });
    handle.addEventListener("touchend", e => {
      const dy = e.changedTouches[0].clientY - startY;
      if (dy < -40) setMode(curMode === "peek" ? "half" : "full");        // kéo lên
      else if (dy > 40) {
        if (curMode === "full") setMode("half");
        else if (curMode === "half") setMode("peek");
        else { panel.classList.remove("open", "sheet-peek", "sheet-full"); uiState.followTarget = null; }
      }
    });
    // click handle (desktop debug): cycle peek->half->full
    handle.addEventListener("click", () => {
      setMode(curMode === "peek" ? "half" : curMode === "half" ? "full" : "peek");
    });
  })();

  // ======================================================================
  //  SHARE-LINK: ?body=saturn&d=<days-tu-J2000> — copy/mở link chia sẻ góc nhìn
  // ======================================================================
  (() => {
    const q = new URLSearchParams(location.search);
    const d = parseFloat(q.get("d"));
    if (isFinite(d)) ST.days = d;                      // thời điểm từ link
    const bodyName = q.get("body");
    if (bodyName) {
      flyToBody(bodyName);
    }
  })();

  return { selectPlanet, flyToBody, setClean, toggleTour };
}
