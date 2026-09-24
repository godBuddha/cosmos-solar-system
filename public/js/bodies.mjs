// ======================================================================
//  G3: BODIES — dựng hành tinh + đường quỹ đạo + nhãn CSS2D + moons
// ======================================================================
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { planetTexture } from "./scene.mjs";
import { orbitalPosition } from "./kepler.mjs";
import { PLANETS, SUN_DATA, MOONS } from "./data.mjs";

const GAS = new Set(["Jupiter", "Saturn", "Uranus", "Neptune"]);

export function createBodies({ scene, sun }) {
  const planetObjs = [];

  for (const p of PLANETS) {
    const grp = new THREE.Group();                    // nghiêng trục
    const spin = new THREE.Group();                   // tự quay
    grp.add(spin);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(p.r, 48, 48),
      new THREE.MeshStandardMaterial({
        map: planetTexture(p.col, p.col2, GAS.has(p.name)),
        roughness: 0.85, metalness: 0.1,
      })
    );
    spin.add(mesh);
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
  const moonObjs = [];
  for (const m of MOONS) {
    const host = planetObjs.find(o => o.data.name === m.parent);
    if (!host) continue;
    const pivot = new THREE.Group();
    pivot.rotation.x = m.tilt;                          // nghiêng mặt phẳng quỹ đạo moon
    const mm = new THREE.Mesh(
      new THREE.SphereGeometry(m.r, 24, 24),
      new THREE.MeshStandardMaterial({ color: m.col, roughness: 0.9, metalness: 0.05 })
    );
    mm.position.x = m.dist;
    pivot.add(mm);
    host.grp.add(pivot);                                // moon đi theo hành tinh mẹ
    moonObjs.push({ pivot, mm, T: m.T, host });
  }

  return { planetObjs, moonObjs };
}
