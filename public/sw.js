// ======================================================================
//  G4f: SERVICE WORKER — PWA offline
//  • precache shell (html/js/vendor/icon/manifest) — addAll all-or-nothing
//  • vendor (three.js): cache-first (gần như bất biến, đổi nội dung thì
//    bump CACHE_VERSION) · còn lại: network-first, offline fallback cache
//  • /api/* luôn đi mạng (auth/AI không bao giờ cache)
//  • HTML hiện no-cache ở nginx → mỗi lần online luôn dùng bản mới nhất
// ======================================================================
const CACHE_VERSION = "cosmos-v1";

const PRECACHE = [
  "./",
  "./manifest.webmanifest",
  "./icon.svg",
  "./admin.html",
  "./js/admin.js",
  "./js/data.mjs",
  "./js/kepler.mjs",
  "./js/scene.mjs",
  "./js/bodies.mjs",
  "./js/particles.mjs",
  "./js/probes.mjs",
  "./js/time.mjs",
  "./js/i18n.mjs",
  "./js/ui.mjs",
  "./js/ai.mjs",
  "./js/main.mjs",
  "./vendor/three/build/three.module.js",
  "./vendor/three/jsm/controls/OrbitControls.js",
  "./vendor/three/jsm/renderers/CSS2DRenderer.js",
  "./vendor/three/jsm/postprocessing/EffectComposer.js",
  "./vendor/three/jsm/postprocessing/RenderPass.js",
  "./vendor/three/jsm/postprocessing/UnrealBloomPass.js",
  "./vendor/three/jsm/postprocessing/Pass.js",
  "./vendor/three/jsm/postprocessing/ShaderPass.js",
  "./vendor/three/jsm/postprocessing/MaskPass.js",
  "./vendor/three/jsm/shaders/CopyShader.js",
  "./vendor/three/jsm/shaders/LuminosityHighPassShader.js",
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    // dọn cache phiên bản cũ
    for (const name of await caches.keys()) {
      if (name !== CACHE_VERSION) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // beacon/analytics — bỏ qua
  if (url.pathname.startsWith("/api/")) return;      // auth + AI: luôn mạng

  // vendor three.js: cache-first — nặng (600KB+) và gần như bất biến
  if (url.pathname.startsWith("/vendor/")) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      const hit = await cache.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) cache.put(req, r.clone());
      return r;
    })());
    return;
  }

  // còn lại (html/js/mjs/manifest): network-first — online luôn bản mới,
  // offline trả từ cache shell
  e.respondWith((async () => {
    try {
      const r = await fetch(req);
      if (r.ok) {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, r.clone());
      }
      return r;
    } catch {
      const cache = await caches.open(CACHE_VERSION);
      return await cache.match(req, { ignoreSearch: true })
          || await cache.match("./")
          || Response.error();
    }
  })());
});
