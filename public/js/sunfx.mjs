// ======================================================================
//  G5d: SUNFX — tia sáng (rays) + vòng plasma (prominence loops) của Mặt Trời
// ----------------------------------------------------------------------
//  Kỹ thuật dựa trên bản "Realistic Sun with noise and rays" của Tibi
//  (three.js forum thread 87759), tác giả công khai cho dùng tự do:
//    • tia = ribbon (dải) billboard vươn thẳng ra ngoài từ một hướng trên cầu,
//      uốn lượn bằng "twisted sine noise", màu theo dải quang phổ, alpha mềm
//    • loop = ribbon nối 2 điểm trên mặt cầu, phồng ra theo sin(phase·π),
//      mọc/tàn theo chu kỳ riêng, màu theo bảng cosine
//    • che khuất: tia/loop ở phía sau đĩa bị mờ đi theo hướng so với camera
//  Khác bản gốc: không dùng cubemap/simplex — tất cả tính trong shader, và
//  cameraPosition là uniform dựng sẵn của three nên không cần cập nhật mỗi
//  frame ngoài uTime (dùng chung ref với bề mặt Mặt Trời).
// ======================================================================
import * as THREE from "three";

// PRNG có hạt giống — hình dạng tia/loop ổn định giữa các lần tải trang
function makeRng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// vector đơn vị ngẫu nhiên đều trên mặt cầu
function randomDir(rnd) {
  const z = rnd() * 2 - 1, t = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
  return [r * Math.cos(t), r * Math.sin(t), z];
}

// Khối GLSL dùng chung: nhiễu sin xoắn (rẻ, đặc trưng của bản gốc)
// LƯU Ý GLSL: #define phải nằm trên MỘT dòng (hoặc nối dòng bằng "\").
// Bản gốc viết ma trận trải nhiều dòng có "\" nối — nếu bỏ sẽ lỗi
// "syntax error" ở dòng bắt đầu bằng "-0.80" và cả lớp tia/loop không vẽ gì.
const TWIST_NOISE = /* glsl */`
  #define TWIST_M4 mat4(0.00, 0.80, 0.60, -0.4, -0.80, 0.36, -0.48, -0.5, -0.60, -0.48, 0.64, 0.2, 0.40, 0.30, 0.20, 0.4)
  vec4 twistNoise(vec4 q, float falloff){
    float a = 1.0, f = 1.0;
    vec4 sum = vec4(0.0);
    for (int i = 0; i < 4; i++){
      q = TWIST_M4 * q;
      vec4 s = sin(q.ywxz * f) * a;
      q += s;
      sum += s;
      a *= falloff;
      f /= falloff;
    }
    return sum;
  }
`;

// ----------------------------------------------------------------------
//  TIA SÁNG — mỗi "dây" là một dải ribbon vươn từ rìa Mặt Trời ra ngoài
// ----------------------------------------------------------------------
export function createSunRays(scene, radius, uTime, opts = {}) {
  const WIRES = opts.wires ?? 260;
  const SEGS = opts.segments ?? 9;
  const rnd = makeRng(opts.seed ?? 20260927);
  const vertsPerWire = SEGS * 2;
  const nVert = WIRES * vertsPerWire;
  const aPos = new Float32Array(nVert * 3);
  const aPos0 = new Float32Array(nVert * 3);
  const aWire = new Float32Array(nVert * 4);
  const idx = new Uint32Array(WIRES * (SEGS - 1) * 6);
  let ip = 0, i0 = 0, iw = 0, ii = 0;
  // CHÙM: giữ 1 hướng cho ~10 dây liền rồi mới đổi (như bản gốc: đổi ~10% số
  // dây). Nếu mỗi dây một hướng ngẫu nhiên thì 700 dây rải đều → cộng lại thành
  // quầng tròn đều, MẤT cấu trúc tia (đo được: cấu trúc vành chỉ 21%).
  let held = randomDir(rnd);
  for (let w = 0; w < WIRES; w++) {
    if (rnd() < 0.10 || w === 0) held = randomDir(rnd);
    // lệch nhỏ quanh hướng giữ → chùm tia có bề rộng
    const jitter = 0.055;
    const d = [
      held[0] + (rnd() * 2 - 1) * jitter,
      held[1] + (rnd() * 2 - 1) * jitter,
      held[2] + (rnd() * 2 - 1) * jitter,
    ];
    const L = Math.hypot(d[0], d[1], d[2]) || 1;
    d[0] /= L; d[1] /= L; d[2] /= L;
    const r4 = [rnd(), rnd(), rnd(), rnd()];
    for (let s = 0; s < SEGS; s++) {
      for (let side = 0; side <= 1; side++) {
        aPos[ip++] = (s + 0.5) / SEGS;          // vị trí dọc dải 0..1
        aPos[ip++] = (w + 0.5) / WIRES;         // chỉ số dây (dự phòng)
        aPos[ip++] = side * 2 - 1;              // -1 / +1: mép dải
        aPos0[i0++] = d[0] * radius;
        aPos0[i0++] = d[1] * radius;
        aPos0[i0++] = d[2] * radius;
        aWire[iw++] = r4[0]; aWire[iw++] = r4[1]; aWire[iw++] = r4[2]; aWire[iw++] = r4[3];
      }
      if (s < SEGS - 1) {
        const b = (w * SEGS + s) * 2;
        idx[ii++] = b; idx[ii++] = b + 1; idx[ii++] = b + 2;
        idx[ii++] = b + 2; idx[ii++] = b + 1; idx[ii++] = b + 3;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("aPos", new THREE.BufferAttribute(aPos, 3));
  geo.setAttribute("aPos0", new THREE.BufferAttribute(aPos0, 3));
  geo.setAttribute("aWire", new THREE.BufferAttribute(aWire, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, premultipliedAlpha: true,
    uniforms: {
      uTime,
      uLength: { value: opts.length ?? radius * 1.7 },  // tia dài ~1.7 bán kính
      uWidth: { value: opts.width ?? radius * 0.062 },
      uOpacity: { value: opts.opacity ?? 0.26 },
      uNoiseFreq: { value: 6.0 },
      uNoiseAmp: { value: 0.30 },
      uRadius: { value: radius },
    },
    vertexShader: /* glsl */`
      attribute vec3 aPos; attribute vec3 aPos0; attribute vec4 aWire;
      uniform float uTime, uLength, uWidth, uOpacity, uNoiseFreq, uNoiseAmp, uRadius;
      varying float vEdge; varying float vFade; varying vec3 vColor;
      ${TWIST_NOISE}
      // Bảng màu ẤM cho tia: cam đỏ ở gốc → vàng ngà ở đuôi. Bản trước dùng
      // dải "quang phổ" đạt đỉnh G/B riêng nên có tia ra XANH LỤC — sai màu
      // Mặt Trời (thấy rõ khi soi ảnh render).
      vec3 rayColor(float v){
        return mix(vec3(1.00, 0.40, 0.10), vec3(1.00, 0.88, 0.62), clamp(v, 0.0, 1.0));
      }
      void main(){
        vec3 dir = normalize(aPos0);
        float size = 0.45 + aWire.z;                       // mỗi tia dài ngắn khác nhau
        float d = aPos.x * uLength * size;
        vec3 p = aPos0 + dir * d;
        // uốn lượn — thêm thời gian để tia "sống", chảy
        float t = uTime * 0.35 + aWire.x * 6.2832;
        p += twistNoise(vec4(dir * uNoiseFreq, t), 0.707).xyz * (d * uNoiseAmp);
        // ribbon billboard theo hướng nhìn
        vec3 dirW = normalize(p - aPos0 + dir * 1e-4);
        vec3 vW = normalize(p - cameraPosition);
        vec3 sideW = cross(vW, dirW);
        float sl = length(sideW);
        sideW = sl > 1e-5 ? sideW / sl : normalize(cross(vec3(0.0, 1.0, 0.0), dirW));
        float width = uWidth * aPos.z * (1.0 - aPos.x * 0.82) * (0.6 + aWire.w * 0.8);
        p += sideW * width;
        vEdge = aPos.z;
        // mờ dần về đuôi; dài ngắn theo từng tia
        vFade = (1.0 - smoothstep(0.20, 0.92, aPos.x)) * (0.35 + 0.65 * aWire.w);
        vFade *= uOpacity;
        // phía sau đĩa (quay lưng camera) → ẩn; VÀ tia chĩa gần như thẳng vào
        // camera cũng ẩn: nó chiếu trúng đĩa, hiện thành vệt nguệch ngoạc trắng
        // vắt ngang bề mặt (đúng lỗi nhìn thấy khi review ảnh).
        float toward = dot(dir, normalize(cameraPosition));
        vFade *= smoothstep(-0.05, 0.35, toward);
        // Chỉ giữ tia ở DẢI RÌA (|dot| < ~0.35, tức trong ~20° quanh mặt phẳng
        // rìa). Tia nghiêng 45° vẫn chiếu vào trong đĩa (điểm chiếu ~0.7R) và
        // hiện thành vệt nguệch ngoạc vắt ngang mặt — đúng lỗi review ảnh vòng 2.
        vFade *= 1.0 - smoothstep(0.30, 0.55, abs(toward));
        // chỉ vẽ phần NGOÀI đĩa
        vFade *= smoothstep(uRadius * 0.98, uRadius * 1.10, length(p));
        vColor = rayColor(aWire.w);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying float vEdge; varying float vFade; varying vec3 vColor;
      void main(){
        float a = 1.0 - smoothstep(0.0, 1.0, abs(vEdge));
        a *= a;                       // mép dải mềm
        a *= vFade;
        gl_FragColor = vec4(vColor * a, a);   // premultiplied
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

// ----------------------------------------------------------------------
//  VÒNG PLASMA (prominence) — cung nối 2 điểm trên mặt cầu, mọc rồi tàn
// ----------------------------------------------------------------------
export function createProminenceLoops(scene, radius, uTime, opts = {}) {
  const LOOPS = opts.loops ?? 90;
  const SEGS = opts.segments ?? 18;
  const rnd = makeRng(opts.seed ?? 777001);
  const nVert = LOOPS * SEGS * 2;
  const aPos = new Float32Array(nVert * 3);
  const aP0 = new Float32Array(nVert * 3);
  const aP1 = new Float32Array(nVert * 3);
  const aWire = new Float32Array(nVert * 4);
  const idx = new Uint32Array(LOOPS * (SEGS - 1) * 6);
  let ip = 0, i0 = 0, i1 = 0, iw = 0, ii = 0;
  for (let l = 0; l < LOOPS; l++) {
    // chân thứ nhất, rồi chân thứ hai lệch ~12°..30° → cung nhỏ như thật
    const a = randomDir(rnd);
    const b = randomDir(rnd);
    const k = 0.22 + rnd() * 0.30;                 // độ "ôm" của cung
    const d = [
      a[0] * (1 - k) + b[0] * k,
      a[1] * (1 - k) + b[1] * k,
      a[2] * (1 - k) + b[2] * k,
    ];
    const L = Math.hypot(d[0], d[1], d[2]) || 1;
    d[0] /= L; d[1] /= L; d[2] /= L;
    const p0 = [a[0] * radius, a[1] * radius, a[2] * radius];
    const p1 = [d[0] * radius, d[1] * radius, d[2] * radius];
    const r4 = [rnd(), rnd(), rnd(), rnd()];
    for (let s = 0; s < SEGS; s++) {
      for (let side = 0; side <= 1; side++) {
        aPos[ip++] = (s + 0.5) / SEGS;
        aPos[ip++] = (l + 0.5) / LOOPS;
        aPos[ip++] = side * 2 - 1;
        aP0[i0++] = p0[0]; aP0[i0++] = p0[1]; aP0[i0++] = p0[2];
        aP1[i1++] = p1[0]; aP1[i1++] = p1[1]; aP1[i1++] = p1[2];
        aWire[iw++] = r4[0]; aWire[iw++] = r4[1]; aWire[iw++] = r4[2]; aWire[iw++] = r4[3];
      }
      if (s < SEGS - 1) {
        const bse = (l * SEGS + s) * 2;
        idx[ii++] = bse; idx[ii++] = bse + 1; idx[ii++] = bse + 2;
        idx[ii++] = bse + 2; idx[ii++] = bse + 1; idx[ii++] = bse + 3;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("aPos", new THREE.BufferAttribute(aPos, 3));
  geo.setAttribute("aP0", new THREE.BufferAttribute(aP0, 3));
  geo.setAttribute("aP1", new THREE.BufferAttribute(aP1, 3));
  geo.setAttribute("aWire", new THREE.BufferAttribute(aWire, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, premultipliedAlpha: true,
    uniforms: {
      uTime,
      uWidth: { value: opts.width ?? radius * 0.055 },
      uAmp: { value: opts.amp ?? 0.42 },
      uOpacity: { value: opts.opacity ?? 1.0 },
      uNoiseFreq: { value: 3.5 },
      uNoiseAmp: { value: 0.22 },
      uRadius: { value: radius },
      uSpeed: { value: opts.speed ?? 0.16 },
    },
    vertexShader: /* glsl */`
      attribute vec3 aPos; attribute vec3 aP0; attribute vec3 aP1; attribute vec4 aWire;
      uniform float uTime, uWidth, uAmp, uOpacity, uNoiseFreq, uNoiseAmp, uRadius, uSpeed;
      varying float vEdge; varying float vFade; varying vec3 vColor;
      ${TWIST_NOISE}
      // bảng màu cosine → cam/đỏ/hồng như prominence thật
      vec3 huePalette(float v){
        // Đỏ → cam → vàng nhạt. Bản cosine cũ cho R và B cùng cao nên ra HỒNG
        // (nhìn như sợi dây), không phải màu plasma thật.
        return v < 0.5 ? mix(vec3(0.90, 0.14, 0.05), vec3(1.00, 0.45, 0.12), v * 2.0)
                       : mix(vec3(1.00, 0.45, 0.12), vec3(1.00, 0.80, 0.45), (v - 0.5) * 2.0);
      }
      void main(){
        float phase = aPos.x;
        // chu kỳ mọc/tàn riêng cho từng vòng
        float anim = fract(uTime * uSpeed * (0.4 + aWire.y * 0.9) + aWire.x);
        vec3 base = mix(aP0, aP1, phase);
        vec3 nOut = normalize(aP0 + aP1);           // hướng phồng ra ngoài
        float size = length(aP1 - aP0);
        float amp = sin(phase * 3.14159265) * size * uAmp * anim;
        vec3 p = base + nOut * amp;
        float t = uTime * 0.5 + aWire.z * 6.2832;
        p += twistNoise(vec4(normalize(base) * uNoiseFreq, t), 0.707).xyz * (amp * uNoiseAmp);
        // ribbon billboard
        vec3 dirW = normalize(mix(aP1 - aP0, nOut, 0.35));
        vec3 vW = normalize(p - cameraPosition);
        vec3 sideW = cross(vW, dirW);
        float sl = length(sideW);
        sideW = sl > 1e-5 ? sideW / sl : normalize(cross(vec3(0.0, 1.0, 0.0), dirW));
        p += sideW * (uWidth * aPos.z * (1.0 - abs(phase * 2.0 - 1.0) * 0.55));
        vEdge = aPos.z;
        // mọc lên rồi tàn: đỉnh ở giữa chu kỳ
        float life = sin(anim * 3.14159265);
        vFade = life * life * uOpacity * (0.5 + 0.5 * aWire.w);
        // Che khuất theo hướng CHÂN cung: vòng nằm phía sau đĩa thì ẩn, và vòng
        // ngay trước mặt đĩa cũng ẩn — nó chiếu trúng bề mặt thành vệt màu hồng
        // nguệch ngoạc (lỗi thấy rõ khi review ảnh). Giữ lại dải RÌA (|dot| nhỏ)
        // — đúng nơi prominence hiện thành cung plasma.
        // Cũng chỉ giữ dải rìa: vòng ở 50-60° khỏi trục camera vẫn chiếu lên
        // MẶT đĩa (review vòng 3 vẫn thấy vệt hồng trên mặt) → siết về 0.30-0.55.
        float toward = dot(normalize(base), normalize(cameraPosition));
        vFade *= 1.0 - smoothstep(0.30, 0.55, abs(toward));
        vColor = huePalette(aWire.w * 0.25);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying float vEdge; varying float vFade; varying vec3 vColor;
      void main(){
        float a = 1.0 - smoothstep(0.0, 1.0, abs(vEdge));
        a *= a;
        a *= vFade;
        gl_FragColor = vec4(vColor * a, a);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}