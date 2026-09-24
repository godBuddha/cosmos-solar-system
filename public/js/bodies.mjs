// ======================================================================
//  G3: BODIES — dựng hành tinh + đường quỹ đạo + nhãn CSS2D + moons
// ======================================================================
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { planetTexture } from "./scene.mjs";
import { bodyTexture, bumpTexture, earthClouds } from "./textures.mjs";
import { orbitalPosition } from "./kepler.mjs";
import { PLANETS, SUN_DATA, MOONS } from "./data.mjs";

const GAS = new Set(["Jupiter", "Saturn", "Uranus", "Neptune"]);

export function createBodies({ scene, sun }) {
  const planetObjs = [];

  for (const p of PLANETS) {
    const grp = new THREE.Group();                    // nghiêng trục
    const spin = new THREE.Group();                   // tự quay
    grp.add(spin);
    // G5a: texture bản sắc riêng (Mercury hố, Earth lục địa+mây, Mars băng,
    // Jupiter GRS, Pluto trái tim...). Minor khác fallback planetTexture.
    const tex = bodyTexture(p.name) ||
      planetTexture(p.col, p.col2, GAS.has(p.name));
    const bump = bumpTexture(p.name);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(p.r, 48, 48),
      new THREE.MeshStandardMaterial({
        map: tex, bumpMap: bump, bumpScale: bump ? 0.012 : 0,
        roughness: 0.85, metalness: 0.1,
      })
    );
    spin.add(mesh);
    // Trái Đất: lớp mây riêng quay lệch tốc độ (texture bán trong suốt)
    const clouds = earthClouds(p.name);
    if (clouds) {
      const cm = new THREE.Mesh(
        new THREE.SphereGeometry(p.r * 1.018, 48, 48),
        new THREE.MeshStandardMaterial({
          map: clouds, transparent: true, opacity: 0.85,
          depthWrite: false, roughness: 1,
        })
      );
      spin.add(cm);
      cm.userData.cloudDrift = true;
    }
    grp.rotation.z = p.tilt * Math.PI / 180;          // nghiêng trục quay
    scene.add(grp);
    // nhãn tên (CSS2D, nhỏ hơn + mờ hơn cho dwarf planet)
    const lbl = document.createElement("div");
    // nhãn hành tinh: tên dịch theo ngôn ngữ
    lbl.textContent = p.name;   // tên dịch do applyLang() bổ sung khi init
    lbl.style.cssText = "font:11px ui-sans-serif; color:" +
      (p.dwarf ? "#7a95b5" : "#cfe2ff") + "; text-shadow:0 0 6px rgba(0,20,50,.9); pointer-events:none;";
    const lblObj = new CSS2DObject(lbl);
    lblObj.position.set(0, p.r + 0.5, 0);
    grp.add(lblObj);
    planetObjs.push({ data: p, grp, spin, mesh, lblObj });

    // đường quỹ đạo ellipse (mẫu quỹ đạo thật, có tính e + i)
    const pts = [];
    for (let k = 0; k <= 256; k++) {
      const pos = orbitalPosition(p, k / 256 * p.T);
      pts.push(new THREE.Vector3(pos.x, pos.y, pos.z));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x2a4a6a, transparent: true, opacity: 0.5 })
    );
    scene.add(line);
    p._orbitLine = line;
  }

  // MẶT TRỜI là thiên thể chọn được: đứng yên tại gốc (a=0, animate loop bỏ
  // qua orbitalPosition), không có đường quỹ đạo. a=0 → tìm kiếm hiển thị "0 AU".
  {
    const lbl = document.createElement("div");
    lbl.textContent = "Sun";
    lbl.style.cssText = "font:11px ui-sans-serif; color:#ffd27a; text-shadow:0 0 6px rgba(0,20,50,.9); pointer-events:none;";
    const sunLblObj = new CSS2DObject(lbl);
    sunLblObj.position.set(0, SUN_DATA.r + 1.6, 0);
    sun.add(sunLblObj);
    planetObjs.push({ data: SUN_DATA, grp: sun, spin: sun, mesh: sun, lblObj: sunLblObj });
  }

  // PHASE 2a: MOONS — mặt trăng cho Trái Đất / Jupiter / Saturn
  // G5a: Moon/Io/Europa/Ganymede/Callisto/Titan có texture riêng
  const JUP_TEX = ["_Io", "_Europa", "_Ganymede", "_Callisto"];
  const texFor = (parent, idx) => {
    if (parent === "Jupiter") return bodyTexture(JUP_TEX[idx] || "");
    if (parent === "Earth") return bodyTexture("_Moon");
    if (parent === "Saturn") return bodyTexture("_Titan");
    return null;
  };
  const bumpFor = (parent, idx) => {
    if (parent === "Earth") return bumpTexture("_Moon");
    if (parent === "Jupiter" && (idx === 2 || idx === 3)) return bumpTexture(JUP_TEX[idx]);
    return null;
  };
  const moonCount = {};
  const moonObjs = [];
  for (const m of MOONS) {
    const host = planetObjs.find(o => o.data.name === m.parent);
    if (!host) continue;
    const idx = moonCount[m.parent] = (moonCount[m.parent] ?? -1) + 1;
    const pivot = new THREE.Group();
    pivot.rotation.x = m.tilt;                          // nghiêng mặt phẳng quỹ đạo moon
    const mtex = texFor(m.parent, idx);
    const mbump = bumpFor(m.parent, idx);
    const mm = new THREE.Mesh(
      new THREE.SphereGeometry(m.r, 24, 24),
      mtex
        ? new THREE.MeshStandardMaterial({
            map: mtex, bumpMap: mbump, bumpScale: mbump ? 0.01 : 0,
            roughness: 0.9, metalness: 0.05 })
        : new THREE.MeshStandardMaterial({ color: m.col, roughness: 0.9, metalness: 0.05 })
    );
    mm.position.x = m.dist;
    pivot.add(mm);
    host.grp.add(pivot);                                // moon đi theo hành tinh mẹ
    moonObjs.push({ pivot, mm, T: m.T, host });
  }

  return { planetObjs, moonObjs };
}
