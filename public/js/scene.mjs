// ======================================================================
//  G3: SCENE / RENDERER / CAMERA / BLOOM + MẶT TRỜI + TEXTURE PROCEDURAL
// ======================================================================
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";

// TEXTURE PROCEDURAL — canvas sọc + noise cho bề mặt hành tinh
export function planetTexture(colHex, col2Hex, banded) {
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 256;
  const ctx = cv.getContext("2d");
  const c1 = new THREE.Color(colHex), c2 = new THREE.Color(col2Hex);
  // nền gradient dọc
  const grd = ctx.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#" + c2.getHexString());
  grd.addColorStop(0.5, "#" + c1.getHexString());
  grd.addColorStop(1, "#" + c2.getHexString());
  ctx.fillStyle = grd; ctx.fillRect(0, 0, 512, 256);
  // seeded noise
  let s = 777;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  if (banded) {
    // hành tinh khí: sọc ngang jitter
    for (let y = 0; y < 256; y += 3) {
      if (rnd() < 0.55) continue;
      ctx.globalAlpha = 0.12 + rnd() * 0.25;
      ctx.fillStyle = rnd() < 0.5 ? "#" + c1.getHexString() : "#" + c2.getHexString();
      ctx.fillRect(0, y, 512, 2 + rnd() * 5);
    }
  } else {
    // hành tinh đá: vệt loang
    for (let k = 0; k < 900; k++) {
      ctx.globalAlpha = 0.05 + rnd() * 0.16;
      ctx.fillStyle = rnd() < 0.5 ? "#" + c1.getHexString() : "#" + c2.getHexString();
      const x = rnd() * 512, y = rnd() * 256, r = 2 + rnd() * 14;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, rnd() * 3.14, 0, 6.283); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// G5b: dựng Mặt Trời chân thực (tách hàm để test page dùng riêng)
export function buildSun(scene) {
// --------------------------------------------------------------------
//  G5b: MẶT TRỜI CHÂN THỰC — GPU shader, không ảnh ngoài
//  • Granulation (hạt đối lưu) 5-octave FBM, trôi theo differential
//    rotation (xích đạo nhanh hơn ~1.4× như Mặt Trời thật)
//  • Sunspot: nhóm vết đen (umbra tối + penumbra nâu loang) theo
//    noise threshold lớn — xuất/huyền chậm, nằm band vĩ độ ±5..30°
//  • Plage / faculae: vùng sáng trắng quanh nhóm vết đen
//  • Limb darkening theo công thức bán cầu thật
//  • Corona: tia + streamer theo noise góc, pulsed chậm
//  • Prominence: vòng plasma đỏ leo ở rìa (billboard shader)
// --------------------------------------------------------------------
const sunUniforms = {
  uTime: { value: 0 },
  uSpotSeed: { value: 17.3 },        // dịch phase sunspot (chu kỳ ~11 năm scale)
};
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(3.2, 128, 128),
  new THREE.ShaderMaterial({
    uniforms: sunUniforms,
    vertexShader: /* glsl */`
      varying vec3 vNormal; varying vec3 vPos; varying vec3 vViewDir;
      varying vec3 vObj;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vObj = normalize(position);          // toạ độ trên cầu đơn vị
        vPos = position;
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uSpotSeed;
      varying vec3 vNormal; varying vec3 vPos; varying vec3 vViewDir;
      varying vec3 vObj;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
      float noise(vec3 p){
        vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x),
                       mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
                       mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p){
        float v = 0.0, a = 0.5;
        for(int k = 0; k < 3; k++){ v += a * noise(p); p *= 2.1; a *= 0.5; }
        return v;
      }
      float fbm5(vec3 p){
        float v = 0.0, a = 0.5;
        for(int k = 0; k < 5; k++){ v += a * noise(p); p *= 2.03; a *= 0.52; }
        return v;
      }
      void main() {
        vec3 n = normalize(vObj);
        float lat = n.y;                              // -1..1
        // ---- differential rotation: xích đạo nhanh hơn cực 1.4× ----
        float rot = uTime * (1.0 - 0.28 * abs(lat));
        float cs = cos(rot * 0.05), sn = sin(rot * 0.05);
        vec3 p = vec3(n.x * cs + n.z * sn, n.y, -n.x * sn + n.z * cs);
        // ---- granulation: hạt đối lưu ~1000km + supergranulation ----
        float g  = fbm5(p * 14.0 + vec3(uTime * 0.012, uTime * 0.008, -uTime * 0.010));
        float g2 = fbm(p * 26.0 - vec3(0.0, uTime * 0.02, uTime * 0.014));
        float sg = fbm(p * 2.6 + vec3(-uTime * 0.006, 0.0, uTime * 0.004)); // supergranule
        // ---- sunspot: nhóm vết đen — noise threshold CAO, band vĩ độ ----
        float bandMask = smoothstep(0.12, 0.30, abs(lat)) * (1.0 - smoothstep(0.62, 0.85, abs(lat)));
        float spotN = fbm5(p * 1.35 + vec3(uSpotSeed) + vec3(uTime * 0.002)) * 1.45 - 0.22;
        float spot = smoothstep(0.62, 0.66, spotN) * bandMask;
        // umbra (lõi rất tối) + penumbra (vành nâu loang quanh)
        float umbra = smoothstep(0.665, 0.71, spotN) * bandMask;
        float penumbra = spot * (1.0 - umbra);
        // ---- plage: vùng sáng từ trắng quanh ranh giới spot ----
        float plage = (smoothstep(0.56, 0.62, spotN) - smoothstep(0.62, 0.66, spotN)) * bandMask;
        // ---- palette nhiệt độ: granule sáng vàng-trắng, khe tối cam-đỏ ----
        float bright = g * 0.62 + g2 * 0.38;
        vec3 hot  = vec3(1.00, 0.90, 0.66);   // granule đỉnh ~6300K
        vec3 mid  = vec3(1.00, 0.72, 0.30);   // nền photosphere ~5800K
        vec3 dark = vec3(0.78, 0.28, 0.05);   // khe giữa granule ~5000K
        vec3 col = mix(dark, mid, smoothstep(0.30, 0.62, bright));
        col = mix(col, hot, smoothstep(0.58, 0.86, bright));
        // supergranule: chấm sáng lan toả nhẹ
        col *= 0.94 + 0.10 * sg;
        // plage sáng thêm
        col += vec3(0.35, 0.30, 0.18) * plage;
        // penumbra: nâu xám loang; umbra: gần đen — phân biệt nổi
        col = mix(col, vec3(0.30, 0.13, 0.04), penumbra);
        col = mix(col, vec3(0.03, 0.01, 0.005), umbra);
        // ---- limb darkening chuẩn: I(μ)/I(0) = 1 - u(1-μ), u≈0.6; mượt ----
        float mu = max(dot(normalize(vNormal), normalize(vViewDir)), 0.0);
        float limb = 0.42 + 0.58 * (mu * 0.72 + 0.28 * sqrt(mu));
        col *= limb;
        gl_FragColor = vec4(col * 1.28, 1.0);  // >1 vừa đủ cho bloom
      }
    `,
  })
);
scene.add(sun);

// G5b: CORONA — tia + streamer: noise theo hướng (không theo thời gian trên
// bề mặt), pulsed chậm; dày hơn quanh xích đạo (streamer belt thật)
const corona = new THREE.Mesh(
  new THREE.SphereGeometry(5.4, 96, 96),
  new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending,
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(0xffa030) },
                uTime: sunUniforms.uTime },
    vertexShader: /* glsl */`
      varying vec3 vNormal; varying vec3 vViewDir; varying vec3 vObj;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vObj = normalize(position);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uTime;
      varying vec3 vNormal; varying vec3 vViewDir; varying vec3 vObj;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
      float noise(vec3 p){
        vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x),
                       mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
                       mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p){
        float v = 0.0, a = 0.5;
        for(int k = 0; k < 3; k++){ v += a * noise(p); p *= 2.2; a *= 0.5; }
        return v;
      }
      void main() {
        vec3 n = normalize(vObj);
        // rìa: dot(view, normal) → fresnel căn
        float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), 2.2);
        // tia: fbm theo hướng — kéo dài theo góc (ray structure)
        float rays = fbm(n * 7.0 + vec3(uTime * 0.008));
        float rays2 = fbm(n * 18.0 - vec3(uTime * 0.012));
        float streamer = 0.55 + 0.45 * fbm(n * 3.0);
        // streamer belt: dày hơn quanh mặt phẳng xích đạo
        float belt = 1.0 - smoothstep(0.25, 0.75, abs(n.y));
        float intensity = fres * (0.55 + 0.75 * rays * streamer + 0.30 * rays2);
        intensity *= 0.75 + 0.5 * belt;       // xích đạo dày hơn
        intensity *= 0.92 + 0.08 * sin(uTime * 0.4);   // pulsed chậm
        gl_FragColor = vec4(uColor * intensity * 2.0, intensity);
      }
    `,
  })
);
scene.add(corona);

// G5b: PROMINENCE — vòng plasma đỏ leo ở rìa Mặt Trời (2 arch cố định vị trí
// + dao động nhẹ; additive, luôn hướng theo rìa cầu)
const promGeo = new THREE.SphereGeometry(3.38, 64, 64, 0, Math.PI * 2, 0, Math.PI);
const promUni = [
  { phase: 0.8, axis: new THREE.Vector3(1, 0.15, 0.2) },
  { phase: 3.9, axis: new THREE.Vector3(-0.6, 0.25, 0.8) },
].map(cfg => {
  const m = new THREE.Mesh(promGeo, new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, depthWrite: false,
    uniforms: {
      uTime: sunUniforms.uTime,
      uPhase: { value: cfg.phase },
      uAxis: { value: cfg.axis.clone().normalize() },
      uColor: { value: new THREE.Color(0xff5030) },
    },
    vertexShader: /* glsl */`
      varying vec3 vObj; varying vec3 vNormal; varying vec3 vViewDir;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vObj = normalize(position);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uPhase; uniform vec3 uAxis; uniform vec3 uColor;
      varying vec3 vObj; varying vec3 vNormal; varying vec3 vViewDir;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
      float noise(vec3 p){
        vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x),
                       mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
                       mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        vec3 n = normalize(vObj);
        // khoảng góc tới trục prominence — tính prominence quanh 1 vĩ tuyến
        float ang = distance(n, uAxis);
        // vòng hẹp quanh góc ~1.05 rad (rìa trên cầu)
        float ring = smoothstep(0.22, 0.02, abs(ang - 1.05));
        // plasma nhấp nhô: noise động theo vị trí + thời gian
        float wobble = noise(n * 9.0 + vec3(uTime * 0.35 + uPhase));
        float a = ring * (0.35 + 0.65 * wobble);
        // fade ở mặt nhìn thẳng (chỉ nổi ở rìa)
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), 1.6);
        float intensity = a * rim * (0.75 + 0.25 * sin(uTime * 0.9 + uPhase));
        gl_FragColor = vec4(uColor * intensity * 2.4, intensity);
      }
    `,
  }));
  scene.add(m);
  return m;
});
void promUni;
  return { sunUniforms, sun, corona };
}

export function createScene() {
  const canvas = document.getElementById("c");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.0016);

  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2000);
  camera.position.set(0, 46, 62);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 3;
  controls.maxDistance = 400;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(innerWidth, innerHeight), 1.0, 0.5, 0.12
  );
  composer.addPass(bloomPass);

  // CSS2D renderer cho nhãn tên hành tinh
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(innerWidth, innerHeight);
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.top = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  document.body.appendChild(labelRenderer.domElement);

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    labelRenderer.setSize(innerWidth, innerHeight);
  });

  const { sunUniforms, sun, corona } = buildSun(scene);


  // nguồn sáng duy nhất của cả hệ
  scene.add(new THREE.PointLight(0xfff2dd, 3200, 0, 2));   // decay=2 vật lý
  scene.add(new THREE.AmbientLight(0x1a2030, 0.55));       // ánh ambiental rất nhẹ

  return { canvas, renderer, scene, camera, controls, composer, bloomPass,
           labelRenderer, sunUniforms, sun };
}
