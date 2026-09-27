// ======================================================================
//  G3: SCENE / RENDERER / CAMERA / BLOOM + MẶT TRỜI + TEXTURE PROCEDURAL
// ======================================================================
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { createSunRays, createProminenceLoops } from "./sunfx.mjs";
import { createSunFx } from "./postfx.mjs";

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
//  • Prominence loops + tia sáng thật (G5d, xem sunfx.mjs)
// --------------------------------------------------------------------
const R = 3.2;                       // bán kính Mặt Trời (đơn vị scene)
const sunUniforms = {
  uTime: { value: 0 },
  uSpotSeed: { value: 17.3 },        // dịch phase sunspot (chu kỳ ~11 năm scale)
};
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(R, 128, 128),
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
      // G5d: MỖI OCTAVE MỘT MA TRẬN XOAY KHÁC NHAU.
      // noise() là value-noise trên lưới lập phương. Chỉ dùng MỘT phép xoay
      // (dù trước hay giữa các octave) thì lưới chỉ bị XOAY HƯỚNG: trước đây
      // thẳng trục nên ra vằn ngang, sau khi xoay lại thành vân CHÉO kiểu
      // "herringbone" — vẫn là lỗi, chỉ đổi hướng. Cách trị đúng: cho mỗi
      // octave một hướng lưới KHÁC NHAU rồi cộng lại, các cấu trúc lưới triệt
      // tiêu lẫn nhau, còn lại nhiễu gần đẳng hướng.
      void rotOct(vec3 p, int k, out vec3 q){
        if (k == 0)      q = mat3( 0.36, 0.48, 0.80, -0.80, 0.60, 0.00, -0.48, -0.64, 0.60) * p;
        else if (k == 1) q = mat3( 0.60, -0.64, 0.48, 0.64, 0.72, 0.16, -0.48, 0.24, 0.84) * p;
        else if (k == 2) q = mat3( 0.80, 0.00, -0.60, -0.44, 0.68, -0.58, 0.41, 0.73, 0.55) * p;
        else if (k == 3) q = mat3( 0.20, 0.94, 0.28, -0.94, 0.14, 0.31, 0.25, -0.32, 0.91) * p;
        else             q = mat3( 0.71, -0.42, 0.56, 0.42, 0.90, 0.14, -0.56, 0.13, 0.82) * p;
      }
      float fbm(vec3 p){
        float v = 0.0, a = 0.5; vec3 q;
        for(int k = 0; k < 3; k++){ rotOct(p, k, q); v += a * noise(q); p *= 2.1; a *= 0.5; }
        return v;
      }
      float fbm5(vec3 p){
        float v = 0.0, a = 0.5; vec3 q;
        for(int k = 0; k < 5; k++){ rotOct(p, k, q); v += a * noise(q); p *= 2.03; a *= 0.52; }
        return v;
      }
      mat2 rot2(float a){ float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }
      // 3 ma trận xoay 3D "xiên" (không trùng trục toạ độ) để phá đối xứng lưới
      const mat3 R_CV0 = mat3( 0.36,  0.48,  0.80,
                              -0.80,  0.60,  0.00,
                              -0.48, -0.64,  0.60);
      const mat3 R_CV1 = mat3( 0.60, -0.64,  0.48,
                               0.64,  0.72,  0.16,
                              -0.48,  0.24,  0.84);
      const mat3 R_CV2 = mat3( 0.80,  0.00, -0.60,
                              -0.44,  0.68, -0.58,
                               0.41,  0.73,  0.55);
      // xoay vector quanh trục xiên k (công thức Rodrigues) — dùng cho animation
      vec3 rotAxis(vec3 v, float a){
        vec3 k = normalize(vec3(0.31, 0.87, 0.39));
        float c = cos(a), s = sin(a);
        return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
      }
      void main() {
        vec3 n = normalize(vObj);
        float lat = n.y;                              // -1..1
        // ---- differential rotation: xích đạo nhanh hơn cực 1.4× ----
        float rot = uTime * (1.0 - 0.10 * abs(lat));   // G5d: giảm shear (0.28→0.10) tránh cuốn thành sợi ngang
        float cs = cos(rot * 0.05), sn = sin(rot * 0.05);
        vec3 p = vec3(n.x * cs + n.z * sn, n.y, -n.x * sn + n.z * cs);
        // ---- granulation: hạt đối lưu ~1000km + supergranulation ----
        float g  = fbm5(p * 14.0 + vec3(uTime * 0.012, uTime * 0.008, -uTime * 0.010));
        float g2 = fbm(p * 26.0 - vec3(0.0, uTime * 0.02, uTime * 0.014));
        float sg = fbm(p * 2.6 + vec3(-uTime * 0.006, 0.0, uTime * 0.004)); // supergranule
        // ---- G5d: ĐỐI LƯU QUY MÔ LỚN — 3 lớp noise quay quanh 3 TRỤC khác
        // nhau, lệch pha 120° (kỹ thuật Tibi). Nhờ quay quanh yz/zx/xy độc lập
        // nên trường chảy liền mạch, không lộ đường may ở cực; tần số thấp →
        // "ô" đối lưu lớn, nhìn thấy được cả khi camera ở xa (khắc phục việc
        // granulation cao tần bị triệt tiêu thành quả cầu sáng đều).
        // Domain warping (lớp nọ bẻ lớp kia) tạo xoáy cuộn như plasma thật.
        // Xoay quanh TRỤC XIÊN (Rodrigues) chứ không quanh mặt phẳng trục: xoay
        // kiểu yz/zx/xy giữ nguyên một trục nên trường vẫn đối xứng gương và
        // góp phần tạo vằn "bowtie" trên đĩa.
        vec3 anim = rotAxis(p, uTime * 0.05);
        vec3 L0 = R_CV0 * anim;
        vec3 L1 = R_CV1 * R_CV1 * anim;
        vec3 L2 = R_CV2 * anim;
        // warp yếu: warp mạnh làm nhiễu bị KÉO THÀNH VỆT dài (trông như lược/
        // gỗ vân), thay vì các ô đối lưu tròn trịa như granulation thật.
        float cvA = fbm(L0 * 1.7 + fbm(L1 * 0.9) * 0.30);
        float cvB = fbm(L2 * 2.3 + fbm(L0 * 1.1 + 3.7) * 0.30);
        float conv = cvA * 0.62 + cvB * 0.38;
        // Cân tâm quanh 0.5 TRƯỚC khi tăng tương phản. Bản đầu remap lệch tâm
        // clamp((conv-0.24)*2) khiến chỉ cần nhiễu trôi nhẹ là cả vùng đạt 1.0:
        // độ sáng đĩa dao động 1.7× theo thời gian (đo thô: 0.222 lúc t=120 so
        // với 0.381 lúc t=330) → vượt ngưỡng bloom và cháy trắng cả đĩa.
        conv = clamp((conv - 0.50) * 1.5 + 0.50, 0.0, 1.0);
        conv = conv * conv * (3.0 - 2.0 * conv);      // smoothstep mềm
        // ---- sunspot: nhóm vết đen — noise threshold CAO, band vĩ độ ----
        float bandMask = smoothstep(0.04, 0.18, abs(lat)) * (1.0 - smoothstep(0.62, 0.85, abs(lat)));   // G5d: thu hẹp vành trống xích đạo
        float spotN = fbm5(p * 1.35 + vec3(uSpotSeed) + vec3(uTime * 0.002)) * 1.45 - 0.22;
        float spot = smoothstep(0.78, 0.86, spotN) * bandMask;    // G5d: ngưỡng theo thống kê nhiễu mới
        // umbra (lõi rất tối) + penumbra (vành nâu loang quanh)
        float umbra = smoothstep(0.855, 0.930, spotN) * bandMask;  // G5d: lõi nhỏ, mép loang rộng
        float penumbra = spot * (1.0 - umbra);
        // ---- plage: vùng sáng từ trắng quanh ranh giới spot ----
        float plage = (smoothstep(0.72, 0.78, spotN) - smoothstep(0.78, 0.86, spotN)) * bandMask;
        // ---- palette nhiệt độ: trộn 2 thang — ô đối lưu LỚN (conv) + hạt
        // granule (g,g2). Nhìn xa thấy ô lớn cuộn chảy, nhìn gần thấy hạt:
        // cả hai thang đều còn tương phản thay vì triệt tiêu thành màu phẳng.
        float gran = g * 0.62 + g2 * 0.38;
        // Trọng số: granulation (nhiễu CAO tần) gánh phần lớn vì trung bình
        // trên đĩa của nó ỔN ĐỊNH; conv là nhiễu THẤP tần nên khi Mặt Trời tự
        // quay, bán cầu nhìn thấy đổi và trung bình đĩa trôi tới 1.6×
        // (đo thô 0.232 ở t=120 so với 0.376 ở t=300) — đủ để vượt ngưỡng bloom
        // và cháy trắng. conv vẫn giữ vai trò "dòng chảy lớn" cục bộ.
        float bright = conv * 0.15 + gran * 0.85;
        // G5d: bảng màu sửa lại. Bản cũ (dark 0.62,0.19,0.03) cho phần lớn diện
        // tích nằm ở nhánh tối → đĩa ra màu NÂU ĐẤT như đá sa mạc, không phải
        // Mặt Trời. Photosphere thật gần như trắng-ngà, chỉ hơi cam ở khe giữa
        // hạt; nên nền phải SÁNG và dải chuyển hẹp lại.
        vec3 hot  = vec3(1.00, 0.97, 0.86);   // hạt đỉnh ~6300K: trắng ngà
        vec3 mid  = vec3(1.00, 0.84, 0.50);   // nền ~5800K: vàng cam sáng
        vec3 dark = vec3(0.95, 0.52, 0.14);   // khe giữa hạt ~5000K: cam đậm (vẫn sáng)
        vec3 col = mix(dark, mid, smoothstep(0.20, 0.52, bright));
        col = mix(col, hot, smoothstep(0.52, 0.88, bright));
        // supergranule: chấm sáng lan toả nhẹ
        col *= 0.94 + 0.10 * sg;
        // plage sáng thêm
        col += vec3(0.35, 0.30, 0.18) * plage;
        // penumbra: nâu xám loang; umbra: gần đen — phân biệt nổi
        col = mix(col, vec3(0.62, 0.32, 0.10), penumbra);   // G5d: penumbra sáng hơn
        col = mix(col, vec3(0.18, 0.07, 0.02), umbra);      // G5d: umbra bớt đen
        // ---- limb darkening chuẩn: I(μ)/I(0) = 1 - u(1-μ), u≈0.6; mượt ----
        float mu = max(dot(normalize(vNormal), normalize(vViewDir)), 0.0);
        float limb = 0.42 + 0.58 * (mu * 0.72 + 0.28 * sqrt(mu));
        col *= limb;
        // ---- G5c: SOLAR FLARE — bùng phát trắng đột ngột từ vùng vết đen ----
        // ô bề mặt (cùng frame quay p → dính chặt vùng spot), bucket thời gian
        // ~16s: mỗi ô có ~20% bucket bùng flare, flash lên nhanh tắt chậm dần.
        vec3 fcell = floor(p * 6.0);   // G5d: ô nhỏ hơn (trước *3 → mảng ~60°, flash loang nửa đĩa)
        float tb = floor(uTime * 0.06);
        float fh = hash(fcell + vec3(tb * 0.113, tb * 0.271, uSpotSeed * 0.37));
        float fph = fract(uTime * 0.06 + fh * 7.31);
        // LƯU Ý GLSL: pow(x<0, y) undefined → binh phương thủ công thay pow
        float df = (fph - 0.35) / 0.055;
        float pulse = step(0.80, fh) * exp(-df * df);
        // lõi trắng-vàng ngay trong umbra/penumbra + halo cam loang rộng hơn
        col += vec3(1.00, 0.93, 0.80) * pulse * smoothstep(0.84, 0.90, spotN) * bandMask * 0.50;
        col += vec3(1.00, 0.42, 0.10) * pulse * smoothstep(0.68, 0.80, spotN) * bandMask * 0.14;
        // G5d: hạ gain 1.28 → 0.95. Trước đây gain >1 + bloom threshold 0.12
        // làm đĩa bão hoà trắng (mean 201/255) → granulation/vết đen mất chi
        // tiết. Nay quầng sáng do tia + god rays + bloom lo, không cần cháy đĩa.
        gl_FragColor = vec4(col * 0.88, 1.0);
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
                uShellR: { value: 5.4 },
                uTime: sunUniforms.uTime },
    vertexShader: /* glsl */`
      varying vec3 vNormal; varying vec3 vViewDir; varying vec3 vObj;
      varying vec2 vNdc; varying vec2 vSunNdc; varying vec2 vProj;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vObj = normalize(position);
        vViewDir = normalize(-mv.xyz);
        vec4 clip = projectionMatrix * mv;
        gl_Position = clip;
        vNdc = clip.xy / clip.w;
        // Mặt Trời ở gốc toạ độ → chiếu vào NDC để làm tâm quầng trên MÀN HÌNH
        vec4 sc = projectionMatrix * viewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vSunNdc = sc.xy / sc.w;
        // LƯU Ý: trong three.js 'projectionMatrix' CHỈ có ở VERTEX shader —
        // dùng nó trong fragment sẽ lỗi "undeclared identifier" và CẢ vật liệu
        // không biên dịch (corona âm thầm không vẽ gì). Tính ở đây rồi truyền
        // qua varying: x = 1/P[1][1] (tan nửa fov), y = tỉ lệ khung.
        vProj = vec2(1.0 / projectionMatrix[1][1],
                     projectionMatrix[1][1] / projectionMatrix[0][0]);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uTime;
      uniform float uShellR;
      varying vec3 vNormal; varying vec3 vViewDir; varying vec3 vObj;
      varying vec2 vNdc; varying vec2 vSunNdc; varying vec2 vProj;
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
        // ---- G5d: quầng suy giảm theo BÁN KÍNH TRÊN MÀN HÌNH ----
        // (1) Fresnel vỏ cầu BackSide đạt cực đại ở RÌA vỏ → vành tròn cứng như
        //     bong bóng. (2) Bản sửa đầu dùng góc nhìn từ camera → quầng PHỤ
        //     THUỘC GÓC: Mặt Trời lệch tâm là quầng sụp gần hết (thấy rõ khi
        //     review ảnh off-axis). Nay đo khoảng cách NDC giữa mảnh và vị trí
        //     Mặt Trời, chia cho bán kính NDC của vỏ → quầng tròn, đối xứng
        //     quanh Mặt Trời dù ở đâu trong khung, và tự co giãn theo khoảng cách.
        float tanHalf = vProj.x;
        vec2 off = (vNdc - vSunNdc) * vec2(vProj.y, 1.0);
        float shellNdcR = uShellR / max(length(cameraPosition), 0.001) / tanHalf;
        float t = length(off) / max(shellNdcR, 1e-4);
        float fres = 1.0 - smoothstep(0.20, 1.0, t);   // tắt mềm TRƯỚC rìa vỏ
        fres *= fres;
        // tia: fbm theo hướng — kéo dài theo góc (ray structure)
        float rays = fbm(n * 7.0 + vec3(uTime * 0.008));
        float rays2 = fbm(n * 18.0 - vec3(uTime * 0.012));
        float streamer = 0.55 + 0.45 * fbm(n * 3.0);
        // streamer belt: dày hơn quanh mặt phẳng xích đạo
        float belt = 1.0 - smoothstep(0.25, 0.75, abs(n.y));
        float intensity = fres * (0.55 + 0.75 * rays * streamer + 0.30 * rays2);
        intensity *= 0.75 + 0.5 * belt;       // xích đạo dày hơn
        intensity *= 0.92 + 0.08 * sin(uTime * 0.4);   // pulsed chậm
        gl_FragColor = vec4(uColor * intensity * 3.1, intensity);   // G5d: bù vì bỏ được vành cứng
      }
    `,
  })
);
scene.add(corona);

// G5d: PROMINENCE LOOPS + TIA SÁNG — thay 2 vòm tĩnh cũ bằng ~220 vòng plasma
// động (mỗi vòng mọc rồi tàn theo chu kỳ riêng, cung nối 2 chân trên mặt cầu)
// và ~700 tia sáng thật vươn ra ngoài (ribbon billboard, uốn lượn, màu quang
// phổ). Chi tiết kỹ thuật + credit bản tham khảo: xem đầu public/js/sunfx.mjs
const prominenceLoops = createProminenceLoops(scene, R, sunUniforms.uTime);
const sunRays = createSunRays(scene, R, sunUniforms.uTime);

// G5c: CME — khối plasma văng ra ngoài theo hướng NGẪU NHIÊN. GPU Points:
// mỗi particle thuộc 1 "sự kiện" (blob); hướng + tốc độ + chu kỳ của sự kiện
// sinh từ hash(chỉ số sự kiện + chỉ số vòng lặp) → mỗi vòng bay hướng khác
// nhau, nón plasma giãn nở rộng dần theo bán kính như CME thật.
const CME_EVENTS = 5, CME_PER = 260;
const cmeGeo = new THREE.BufferGeometry();
cmeGeo.setAttribute("position",
  new THREE.BufferAttribute(new Float32Array(CME_EVENTS * CME_PER * 3), 3));
const cmeEvt = new Float32Array(CME_EVENTS * CME_PER);
const cmeRnd = new Float32Array(CME_EVENTS * CME_PER);
for (let i = 0; i < CME_EVENTS * CME_PER; i++) {
  cmeEvt[i] = Math.floor(i / CME_PER);
  cmeRnd[i] = (i * 2654435761 >>> 0) / 4294967296;
}
cmeGeo.setAttribute("aEvt", new THREE.BufferAttribute(cmeEvt, 1));
cmeGeo.setAttribute("aRnd", new THREE.BufferAttribute(cmeRnd, 1));
const cme = new THREE.Points(cmeGeo, new THREE.ShaderMaterial({
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  uniforms: { uTime: sunUniforms.uTime,
              uColor: { value: new THREE.Color(0xff9a40) } },
  vertexShader: /* glsl */`
    attribute float aEvt; attribute float aRnd;
    uniform float uTime;
    varying float vFade; varying float vHot;
    float hh(vec2 s){ return fract(sin(dot(s, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      float e = aEvt;
      // tham số sự kiện: chu kỳ + phase từ hash; cyc đổi mỗi vòng → hướng mới
      float period = 26.0 + hh(vec2(e * 5.37, 1.7)) * 16.0;
      float start  = hh(vec2(e * 6.11, 2.3)) * period;
      float cyc = floor((uTime - start) / period);
      float life = uTime - start - cyc * period;
      vec3 dir = normalize(vec3(
        hh(vec2(e * 1.31, cyc * 0.173)) - 0.5,
        hh(vec2(e * 2.71, cyc * 0.311)) - 0.5,
        hh(vec2(e * 4.13, cyc * 0.577)) - 0.5) + vec3(0.001));
      float speed = 2.2 + hh(vec2(e * 7.93, cyc * 0.419)) * 1.2;
      float r = 3.35 + speed * life;
      // nón plasma: lệch góc từ trục, rộng dần theo r (giãn nở CME thật)
      vec3 up = abs(dir.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0);
      vec3 t1 = normalize(cross(dir, up)), t2 = cross(dir, t1);
      float ang = (aRnd - 0.5) * (0.22 + r * 0.035);
      float phz = uTime * 0.6 + aRnd * 6.2832;      // xoáy quanh trục
      vec3 pos = dir * r
        + (t1 * cos(phz) + t2 * sin(phz)) * ang * r * 0.4
        + dir * (aRnd - 0.5) * r * 0.28;            // dày theo trục
      // cửa sổ sống ~28% chu kỳ: văng ra, loãng dần rồi tan hẳn
      float w = period * 0.28;
      vFade = smoothstep(0.0, 1.2, life) * (1.0 - smoothstep(w * 0.45, w, life));
      vHot = 1.0 - smoothstep(0.0, 4.5, life);      // lõi trắng khi vừa văng
      // G5d: ẩn hạt khi nó CHIẾU TRÚNG ĐĨA Mặt Trời. Hạt nằm giữa camera và
      // Mặt Trời vẫn qua được depth test (nó ở TRƯỚC đĩa) nên sprite vuông
      // 20px hiện lên mặt đĩa thành một ô xám lạ (đúng lỗi review ảnh). CME
      // văng RA NGOÀI nên phần nằm trên đĩa không cần thiết.
      vec3 toCam = normalize(cameraPosition - pos);
      vec3 toSun = normalize(-cameraPosition);      // Mặt Trời ở gốc toạ độ
      float angP = acos(clamp(dot(toCam, toSun), -1.0, 1.0));
      float sunAng = asin(min(1.0, 3.2 / max(length(cameraPosition), 0.001)));
      vFade *= smoothstep(sunAng * 0.80, sunAng * 1.30, angP);
      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      // size base ~1px @1 unit; focal ~433px @ fov55/z=30 → ~7-17px; cap 40
      gl_PointSize = min((0.30 + aRnd * 0.45) * (1.0 + r * 0.045) * (433.0 / -mv.z), 20.0);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 uColor;
    varying float vFade; varying float vHot;
    float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec2 uv = gl_PointCoord * 2.0 - 1.0;
      float a = 1.0 - smoothstep(0.12, 1.0, length(uv));   // không đảo biên (undefined trong GLSL)
      // kết cấu plasma: vệt nhiễu đổi theo độ nóng (thời gian trong vòng đời)
      float n = h2(floor(gl_PointCoord * 5.0) + floor(vHot * 6.0) * 17.0);
      a *= 0.5 + 0.5 * n;
      a *= vFade;
      vec3 col = mix(uColor, vec3(1.0, 0.97, 0.90), vHot * 0.85);
      gl_FragColor = vec4(col * a * 1.05, a);
    }
  `,
}));
cme.frustumCulled = false;    // vị trí tính trong shader — không cull sai
scene.add(cme);

  return { sunUniforms, sun, corona, cme, sunRays, prominenceLoops };
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
  // G5d: god rays TRƯỚC bloom — gom tia từ đĩa sáng rồi mới nở quầng
  const sunFx = createSunFx(camera);
  composer.addPass(sunFx.godRays);
  // G5d: NGƯỠNG bloom 0.12 → 0.40. Ngưỡng cũ quá thấp nên cả photosphere
  // (độ sáng ~0.45) cũng bị nhoè sáng: bloom cộng thêm ~150 vào đĩa, đẩy đĩa
  // lên 201-230/255 và xoá sạch granulation + vết đen (đo: 30.622 px bão hoà).
  // Ngưỡng 0.40 chỉ cho phần thật sáng (lõi, tia, flare) phát quầng.
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(innerWidth, innerHeight), 0.40, 0.5, 0.40
  );
  composer.addPass(bloomPass);
  // lens flare SAU bloom — ghost/streak nằm trên cùng, không bị bloom làm nhoè
  composer.addPass(sunFx.lensFlare);

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
           labelRenderer, sunUniforms, sun, sunFx };
}
