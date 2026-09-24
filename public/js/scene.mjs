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

  // --------------------------------------------------------------------
  //  MẶT TRỜI — shader noise granulation + corona Fresnel
  // --------------------------------------------------------------------
  const sunUniforms = { uTime: { value: 0 } };
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 96, 96),
    new THREE.ShaderMaterial({
      uniforms: sunUniforms,
      vertexShader: /* glsl */`
        varying vec3 vNormal; varying vec3 vPos; varying vec3 vViewDir;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vPos = position;
          vViewDir = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        varying vec3 vNormal; varying vec3 vPos; varying vec3 vViewDir;
        // hash + value noise 3D + 3-octave FBM
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
        void main() {
          // granulation cuộn theo thời gian
          float g = fbm(vPos * 2.2 + vec3(uTime * 0.10, uTime * 0.06, -uTime * 0.08));
          float g2 = fbm(vPos * 5.5 - vec3(0.0, uTime * 0.15, uTime * 0.1));
          vec3 hot  = vec3(1.00, 0.92, 0.62);
          vec3 mid  = vec3(1.00, 0.62, 0.18);
          vec3 dark = vec3(0.85, 0.28, 0.04);
          vec3 col = mix(dark, mid, smoothstep(0.25, 0.6, g));
          col = mix(col, hot, smoothstep(0.55, 0.85, g * 0.7 + g2 * 0.4));
          // limb darkening: rìa tối hơn
          float limb = pow(max(dot(vNormal, vViewDir), 0.0), 0.55);
          col *= 0.55 + 0.65 * limb;
          gl_FragColor = vec4(col * 1.7, 1.0);   // >1 cho bloom ăn
        }
      `,
    })
  );
  scene.add(sun);

  // corona Fresnel quanh Mặt Trời (BackSide)
  const corona = new THREE.Mesh(
    new THREE.SphereGeometry(4.4, 64, 64),
    new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending,
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(0xffa030) } },
      vertexShader: /* glsl */`
        varying vec3 vNormal; varying vec3 vViewDir;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vViewDir = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        varying vec3 vNormal; varying vec3 vViewDir;
        void main() {
          float fres = pow(1.0 - abs(dot(vNormal, vViewDir)), 2.6);
          gl_FragColor = vec4(uColor * fres * 2.2, fres);
        }
      `,
    })
  );
  scene.add(corona);

  // nguồn sáng duy nhất của cả hệ
  scene.add(new THREE.PointLight(0xfff2dd, 3200, 0, 2));   // decay=2 vật lý
  scene.add(new THREE.AmbientLight(0x1a2030, 0.55));       // ánh ambiental rất nhẹ

  return { canvas, renderer, scene, camera, controls, composer, bloomPass,
           labelRenderer, sunUniforms, sun };
}
