// ======================================================================
//  G5d: POSTFX — hiệu ứng hậu kỳ của Mặt Trời
// ----------------------------------------------------------------------
//  Hai ShaderPass TỰ VIẾT, thuần giải tích:
//    • GodRays: tán xạ sáng hướng tâm — lấy mẫu dọc từ pixel về vị trí Mặt
//      Trời trên màn hình, chỉ gom phần rất sáng → tia sáng len qua
//    • LensFlare: vệt streak ngang + các "ghost" đĩa mờ + quầng, tất cả vẽ
//      bằng toán học (KHÔNG dùng ảnh flare), có sắc sai nhẹ
//  Lý do tự viết: vendor three r160 chỉ có jsm/postprocessing cơ bản — không
//  có Lensflare addon lẫn GodRaysPass, và dự án không thêm dependency/ảnh
//  ngoài (PWA offline + CSP 'self'). Nguồn cảm hứng: hizzd/threejs-earth-sun
//  và Tibi (three.js forum 87759) dùng god rays + lens flare hậu kỳ.
// ======================================================================
import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

const FULLSCREEN_VS = /* glsl */`
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ----------------------------------------------------------------------
//  GOD RAYS — tán xạ hướng tâm từ Mặt Trời
// ----------------------------------------------------------------------
export function createGodRaysPass(opts = {}) {
  // Số mẫu nhỏ + weight nhỏ: đây là tán xạ cộng thêm, không phải nguồn sáng.
  // Bản đầu (32 mẫu, weight .30, exposure .75) cộng dồn ~2.9× độ sáng vùng
  // sáng → cả vành khuyên bị tắm trắng (mean 40 → 166), mất hết cấu trúc tia.
  const SAMPLES = opts.samples ?? 24;
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uSunScreen: { value: new THREE.Vector2(0.5, 0.5) },  // uv [0,1]
      uVisible: { value: 0 },
      uDensity: { value: opts.density ?? 1.0 },
      uDecay: { value: opts.decay ?? 0.90 },
      uWeight: { value: opts.weight ?? 0.012 },
      uExposure: { value: opts.exposure ?? 1.0 },
    },
    vertexShader: FULLSCREEN_VS,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform vec2 uSunScreen;
      uniform float uVisible, uDensity, uDecay, uWeight, uExposure;
      varying vec2 vUv;
      const int SAMPLES = ${SAMPLES};
      void main(){
        vec4 base = texture2D(tDiffuse, vUv);
        if (uVisible <= 0.002) { gl_FragColor = base; return; }
        vec2 delta = (vUv - uSunScreen) * uDensity / float(SAMPLES);
        vec2 uv = vUv;
        vec3 acc = vec3(0.0);
        float illum = uWeight;
        for (int i = 0; i < SAMPLES; i++){
          uv -= delta;
          vec3 c = texture2D(tDiffuse, uv).rgb;
          // chỉ gom vùng RẤT sáng (đĩa + tia) → mới thành tia có hướng
          float lum = max(max(c.r, c.g), c.b);
          acc += c * smoothstep(0.78, 1.05, lum) * illum * uVisible;
          illum *= uDecay;
        }
        gl_FragColor = vec4(base.rgb + acc * uExposure, base.a);
      }
    `,
  });
}

// ----------------------------------------------------------------------
//  LENS FLARE — streak + ghost + quầng, vẽ hoàn toàn bằng toán học
// ----------------------------------------------------------------------
export function createLensFlarePass(opts = {}) {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uSunScreen: { value: new THREE.Vector2(0.5, 0.5) },
      uVisible: { value: 0 },
      uAspect: { value: 1.0 },
      uStrength: { value: opts.strength ?? 1.0 },
    },
    vertexShader: FULLSCREEN_VS,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform vec2 uSunScreen;
      uniform float uVisible, uAspect, uStrength;
      varying vec2 vUv;
      // đĩa mờ: 1 ở tâm, 0 ở rìa (bù aspect để tròn trên màn hình rộng)
      float disc(vec2 p, vec2 c, float r){
        // LƯU Ý GLSL: smoothstep(edge0, edge1, x) là UNDEFINED khi edge0 >= edge1.
        // Bản đầu viết smoothstep(r, r*0.12, d) → trên driver ANGLE/NVIDIA trả về
        // giá trị rác, phủ trắng nửa màn hình thành một khối chữ nhật (đo được
        // 66k px bão hoà ở d=14, 223 cột >50% trắng). Luôn dùng dạng chuẩn:
        float d = length((p - c) * vec2(uAspect, 1.0));
        return 1.0 - smoothstep(r * 0.12, r, d);
      }
      // vệt vuông góc: bình phương thủ công (KHÔNG dùng pow với base âm —
      // pow(x<0,y) là undefined trong GLSL)
      float gauss(float v, float s){ float e = v / s; return exp(-e * e); }
      void main(){
        vec3 col = texture2D(tDiffuse, vUv).rgb;
        if (uVisible <= 0.002) { gl_FragColor = vec4(col, 1.0); return; }
        vec2 p = vUv, sun = uSunScreen;
        vec2 axis = vec2(0.5, 0.5) - sun;      // từ Mặt Trời về tâm màn hình
        vec3 add = vec3(0.0);
        // 1) vệt ngang qua Mặt Trời (anamorphic streak)
        // vệt ngang: rộng hơn (mềm) và ngắn hơn — bản cũ là vạch cứng chạy hết
        // chiều ngang khung, trông như lỗi vẽ chứ không như loé ống kính
        add += vec3(1.00, 0.86, 0.62)
             * gauss(p.y - sun.y, 0.016) * gauss(p.x - sun.x, 0.20) * 0.20;
        // 2) ghost: đĩa mờ rải dọc trục, bên kia tâm màn hình
        for (int i = 0; i < 5; i++){
          float fi = float(i);
          vec2 c = sun + axis * (0.75 + fi * 0.72);
          float r = 0.022 + fi * 0.017;
          float w = 0.055 / (1.0 + fi * 0.9);
          add += vec3(1.00, 0.74, 0.46) * disc(p, c, r) * w;
          add += vec3(0.45, 0.72, 1.00) * disc(p, c, r * 1.5) * w * 0.34;
        }
        // 3) quầng mềm quanh Mặt Trời
        add += vec3(1.00, 0.90, 0.70) * disc(p, sun, 0.15) * 0.07;
        gl_FragColor = vec4(col + add * uVisible * uStrength, 1.0);
      }
    `,
  });
}

// ----------------------------------------------------------------------
//  createSunFx — gom 2 pass + cập nhật vị trí Mặt Trời trên màn hình
//  Pass do createScene() chèn vào composer theo đúng thứ tự.
// ----------------------------------------------------------------------
export function createSunFx(camera, opts = {}) {
  const godRays = createGodRaysPass(opts.godRays);
  const lensFlare = createLensFlarePass(opts.lensFlare);
  const sunWorld = new THREE.Vector3(0, 0, 0);   // Mặt Trời ở gốc toạ độ
  const ndc = new THREE.Vector3();

  function update() {
    ndc.copy(sunWorld).project(camera);
    const behind = ndc.z > 1.0;                  // nằm sau mặt phẳng xa / sau camera
    const u = ndc.x * 0.5 + 0.5, v = ndc.y * 0.5 + 0.5;
    godRays.uniforms.uSunScreen.value.set(u, v);
    lensFlare.uniforms.uSunScreen.value.set(u, v);
    // mờ dần khi Mặt Trời ra khỏi khung (không tắt đột ngột)
    const off = Math.max(Math.abs(ndc.x), Math.abs(ndc.y));
    const vis = behind ? 0 : 1 - THREE.MathUtils.smoothstep(off, 0.9, 1.9);
    godRays.uniforms.uVisible.value = vis;
    lensFlare.uniforms.uVisible.value = vis;
    lensFlare.uniforms.uAspect.value = camera.aspect || 1;
    return vis;
  }
  update();
  return { godRays, lensFlare, update,
           get visible() { return godRays.uniforms.uVisible.value; } };
}