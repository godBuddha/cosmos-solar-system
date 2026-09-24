// ======================================================================
//  G3: MAIN — orchestration: catalog → scene → bodies → particles →
//  ui → ai → i18n → vòng lặp animate
// ======================================================================
import * as THREE from "three";
import { loadCatalog, distScale } from "./data.mjs";
import { solveKepler, orbitalPosition } from "./kepler.mjs";
import { createScene } from "./scene.mjs";
import { createBodies } from "./bodies.mjs";
import { createParticles, toggleGalaxies } from "./particles.mjs";
import { createProbes, probeEvents } from "./probes.mjs";
import { ST, initTime, syncTimeline } from "./time.mjs";
import { initI18n, applyLang } from "./i18n.mjs";
import { initUI, uiState, FLY } from "./ui.mjs";
import { initAI } from "./ai.mjs";

await loadCatalog();

const { canvas, renderer, scene, camera, controls, composer, bloomPass,
        labelRenderer, sunUniforms, sun } = createScene();
const { planetObjs } = createBodies({ scene, sun });
const { saturnRing, asteroidBelt, kuiperBelt, cometGPU, meteorGPU } =
  createParticles({ scene, planetObjs });

// G4: tàu thăm dò — lộ trình lịch sử (đăng ký vào planetObjs → click/search/AI ăn luôn)
const { update: updateProbes, renderProbeSections } = createProbes({ scene, planetObjs });

// G4d: chụp ảnh — cờ set từ nút 📷, thực thi ngay sau composer.render()
// (cùng task → drawing buffer chưa bị xoá, không cần preserveDrawingBuffer)
let shotPending = false;
const ui = initUI({ canvas, camera, controls, bloomPass, planetObjs, toggleGalaxies, renderProbeSections,
                    captureFrame: () => { shotPending = true; } });
initAI({ planetObjs, flyToBody: ui.flyToBody, setClean: ui.setClean,
         toggleTour: ui.toggleTour, getFollow: () => uiState.followTarget });
initTime({ timelineEvents: probeEvents });
initI18n({ ST, planetObjs, selectPlanet: ui.selectPlanet,
           getFollowTarget: () => uiState.followTarget });
applyLang();   // khởi tạo ngôn ngữ từ localStorage

const $ = id => document.getElementById(id);
// G3 float32 precision: uDays (~9760 ngày từ J2000) tách uD_HI (nguyên) +
// uD_LO (phân số) — cả hai exact trong float32, shader chia riêng từng phần
// => sai số là HẰNG SỐ, không dao động theo frame (hết jitter phase).
const setDaysUniforms = (mat, days) => {
  const hi = Math.floor(days);
  mat.uniforms.uD_HI.value = hi;
  mat.uniforms.uD_LO.value = days - hi;
};
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());

  if (!ST.paused) {
    const daysPerSec = Math.pow(10, ST.speedExp);
    ST.days += daysPerSec * dt;
    for (const o of planetObjs) {
      if (o.data.a > 0) {                      // Mặt Trời (a=0) đứng yên tại gốc
        const pos = orbitalPosition(o.data, ST.days);
        o.grp.position.set(pos.x, pos.y, pos.z);
      }
      // tự quay: rot = chu kỳ tự quay (ngày), âm = quay ngược (Venus, Uranus)
      o.spin.rotation.y = 2 * Math.PI * ST.days / o.data.rot;
      // G5a: mây Trái Đất trôi lệch tốc độ ~4% — chiều sâu khí quyển
      for (const ch of o.spin.children) {
        if (ch.userData.cloudDrift) ch.rotation.y = 2 * Math.PI * ST.days / (o.data.rot * 1.04);
      }
    }
    sunUniforms.uTime.value = ST.days * 0.02;
    // hiển thị ngày/giờ lịch thực: days -> unix ms -> Date
    const dObj = new Date((ST.days + 2451545.0 - 2440587.5) * 86400000);
    $("date").textContent = dObj.toLocaleString("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  }
  syncTimeline();   // G4c: đồng bộ thanh thời gian khi ST.days đổi từ nguồn khác

  // ---- Phase 2: vành Saturn Keplerian — GPU (chỉ set uniform) ----
  if (saturnRing) setDaysUniforms(saturnRing.mat, ST.days);

  // ---- Asteroid belt — GPU (chỉ set uniform) ----
  if (asteroidBelt) setDaysUniforms(asteroidBelt.mat, ST.days);

  // ---- FREE-FLY camera movement (chuẩn FPS) ----
  if (FLY.on) {
    const k = FLY.keys;
    // Q/E xoay yaw (xử lý ngoài di chuyển, tốc độ xoay 1.8 rad/s)
    if (k["KeyQ"]) FLY.yaw += 1.8 * dt;
    if (k["KeyE"]) FLY.yaw -= 1.8 * dt;

    // forward ĐÚNG hướng nhìn: yaw=0 nhìn về -Z
    const fwd = new THREE.Vector3(
      -Math.sin(FLY.yaw) * Math.cos(FLY.pitch),
      Math.sin(FLY.pitch),
      -Math.cos(FLY.yaw) * Math.cos(FLY.pitch));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x).normalize();

    const move = new THREE.Vector3();
    if (k["KeyW"]) move.add(fwd);
    if (k["KeyS"]) move.sub(fwd);
    if (k["KeyA"]) move.sub(right);
    if (k["KeyD"]) move.add(right);
    if (k["KeyR"] || k["Space"]) move.y += 1;
    if (k["KeyC"] || k["ControlLeft"]) move.y -= 1;

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(FLY.speed * (k["ShiftLeft"] || k["ShiftRight"] ? 5 : 1) * dt);
      camera.position.add(move);
    }
    const lookAtPt = camera.position.clone().add(fwd);
    controls.target.copy(lookAtPt);
    camera.lookAt(lookAtPt);
  }

  // QUAN TRỌNG: khi free-fly, KHÔNG gọi controls.update() —
  // OrbitControls nội bộ sẽ ghi đè vị trí camera mỗi frame (nguyên nhân
  // "camera tự lùi ra, WASD không ăn"). Khi thoát: sync lại state.
  if (!FLY.on) controls.update();

  // ---- Phase 3: camera bám hành tinh theo delta (không set cứng) ----
  if (uiState.followTarget) {
    const p = uiState.followTarget.grp.position;
    // giữ khoảng cách hiện tại, chỉ dịch target + camera cùng delta vị trí hành tinh
    const delta = p.clone().sub(controls.target);
    controls.target.add(delta);
    camera.position.add(delta);
  }
  // ---- G2: fly-to từ search ----
  if (uiState.flyTarget) {
    const o = uiState.flyTarget.obj;
    const p = o.grp.position;
    const offset = o.data.r * 6 + 2.5;
    const desired = new THREE.Vector3(p.x + offset, p.y + offset * 0.55, p.z + offset * 0.8);
    uiState.flyTarget.timer += dt;
    camera.position.lerp(desired, 1 - Math.exp(-2.0 * dt));
    controls.target.lerp(p, 1 - Math.exp(-2.6 * dt));
    if (uiState.flyTarget.phase === "approach" &&
        camera.position.distanceTo(desired) < 0.6 && uiState.flyTarget.timer > 1.6) {
      uiState.flyTarget.phase = "dwell"; uiState.flyTarget.timer = 0;
    }
    if (uiState.flyTarget.phase === "dwell" && uiState.flyTarget.timer > 3.0) uiState.flyTarget = null;
  }

  // ---- Tour tự động: camera bay giữa các hành tinh ----
  if (ST.tourOn && planetObjs.length) {
    const target = planetObjs[ST.tourIdx % planetObjs.length];
    const p = target.grp.position;
    // điểm ngắm: lệch lên và ra ngoài hành tinh một khoảng theo bán kính hiển thị
    const offset = target.data.r * 6 + 2.5;
    const desired = new THREE.Vector3(p.x + offset, p.y + offset * 0.55, p.z + offset * 0.8);
    ST.tourTimer += dt;
    if (ST.tourPhase === "approach") {
      // lerp mượt theo exp-decay — tốc độ không phụ thuộc framerate
      camera.position.lerp(desired, 1 - Math.exp(-1.6 * dt));
      controls.target.lerp(p, 1 - Math.exp(-2.2 * dt));
      if (camera.position.distanceTo(desired) < 0.6 && ST.tourTimer > 2.2) {
        ST.tourPhase = "dwell"; ST.tourTimer = 0;
      }
    } else {   // dwell: đứng xem hành tinh 4s (vẫn bám theo khi nó di chuyển)
      camera.position.lerp(desired, 1 - Math.exp(-0.5 * dt));
      controls.target.lerp(p, 1 - Math.exp(-0.8 * dt));
      if (ST.tourTimer > 4.0) {
        ST.tourIdx = (ST.tourIdx + 1) % planetObjs.length;
        ST.tourPhase = "approach"; ST.tourTimer = 0;
      }
    }
  }

  // ---- Vành đai Kuiper: GPU-side Kepler (chỉ set uniform thời gian) ----
  if (kuiperBelt) setDaysUniforms(kuiperBelt.mat, ST.days);

  // ---- Sao chổi + mưa sao băng ----
  if (cometGPU) setDaysUniforms(cometGPU.mat, ST.days);  // đầu comet: 1 mesh duy nhất — cập nhật CPU (không đáng GPU hóa)
  if (cometGPU) {
    const CA = 18, CE = 0.85, CT = 365.25 * Math.pow(18, 1.5);
    const M = 6.283185 * (ST.days / CT);
    const E = solveKepler(((M % 6.283185) + 6.283185) % 6.283185, CE);
    const sc = distScale(CA) / CA;
    const inc = 25 * Math.PI / 180;
    const xO = CA * (Math.cos(E) - CE);
    const yO = CA * Math.sqrt(1 - CE * CE) * Math.sin(E);
    cometGPU.head.position.set(xO * sc, yO * Math.cos(inc), yO * Math.sin(inc));
  }
  if (meteorGPU) meteorGPU.uniforms.uTime.value = clock.elapsedTime;

  // ---- G4: tàu thăm dò — vị trí theo ngày mô phỏng ----
  updateProbes();

  // ---- fade nhãn theo khoảng cách: hành tinh lớn 260, thiên thể nhỏ 45 ----
  // (chính sách đã chốt: 121+ nhãn chỉ hiện khi zoom gần, tránh "rừng nhãn")
  for (const o of planetObjs) {
    if (!ST.showLabels) break;
    const isMinor = o.data.dwarf || o.data.a > 2.2;
    const maxD = isMinor ? 45 : 260;
    const d = camera.position.distanceTo(o.grp.position);
    const opacity = Math.max(0, Math.min(1, (maxD - d) / (maxD * 0.4)));
    o.lblObj.visible = opacity > 0.02;
    if (o.lblObj.visible) o.lblObj.element.style.opacity = opacity.toFixed(2);
  }

  composer.render();
  labelRenderer.render(scene, camera);          // Phase 3.5: nhãn CSS2D

  // G4d: chụp PNG góc nhìn hiện tại (đặt tên theo ngày mô phỏng)
  if (shotPending) {
    shotPending = false;
    const name = "cosmos-" + new Date((ST.days + 2451545.0 - 2440587.5) * 86400000)
      .toISOString().slice(0, 16).replace(/[:T]/g, "-") + ".png";
    canvas.toBlob(b => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  }
}
animate();

// G4f: PWA — đăng ký service worker (offline + cài như app)
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.mjs")
    .catch(e => console.info("Service worker:", e.message));
}
