#!/usr/bin/env node
// G3 — Test kiến trúc module + bảo mật front-end:
//   1. KHÔNG còn innerHTML ở bất kỳ đâu trong front-end (XSS DOM-safe)
//   2. CSP hash của importmap trong nginx khớp với index.html thực tế
//   3. Mọi import relative trong public/js/*.mjs đều tồn tại + syntax OK
//   4. admin.html KHÔNG còn inline script (chỉ <script src>)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PUB = path.join(ROOT, "public");
let failed = 0;
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}${cond ? "" : " " + extra}`);
  if (!cond) failed++;
};

// ---- 1. DOM-safe: không innerHTML ----
const files = [
  ...fs.readdirSync(path.join(PUB, "js")).filter(f => f.endsWith(".mjs") || f.endsWith(".js"))
      .map(f => path.join(PUB, "js", f)),
  path.join(PUB, "index.html"),
  path.join(PUB, "admin.html"),
];
for (const f of files) {
  const txt = fs.readFileSync(f, "utf8");
  ok(`không innerHTML: ${path.relative(ROOT, f)}`, !txt.includes("innerHTML"));
}

// ---- 2. CSP hash khớp importmap ----
const idx = fs.readFileSync(path.join(PUB, "index.html"), "utf8");
const im = idx.match(/<script type="importmap">(.*?)<\/script>/s);
ok("index.html có importmap inline", !!im);
if (im) {
  const want = "sha256-" + createHash("sha256").update(im[1]).digest("base64");
  const conf = fs.readFileSync(path.join(ROOT, "nginxconf", "security-headers.conf"), "utf8");
  const hashes = [...conf.matchAll(/script-src 'self' '(sha256-[A-Za-z0-9+/=]{40,60})'/g)].map(m => m[1]);
  ok("CSP hash trong nginx khớp importmap (security-headers.conf)",
     hashes.length >= 1 && hashes.every(h => h === want),
     `want ${want} got [${hashes.join(", ")}]`);
}

// ---- 3. imports resolve + syntax ----
const jsDir = path.join(PUB, "js");
for (const f of fs.readdirSync(jsDir).filter(f => f.endsWith(".mjs"))) {
  const full = path.join(jsDir, f);
  const r = spawnSync("node", ["--check", full], { encoding: "utf8" });
  ok(`node --check ${f}`, r.status === 0, r.stderr?.split("\n")[0] || "");
  const txt = fs.readFileSync(full, "utf8");
  const bad = [...txt.matchAll(/from\s+["'](\.[^"']+)["']/g)]
    .map(m => m[1])
    .filter(spec => !fs.existsSync(path.resolve(jsDir, spec)));
  ok(`import resolve: ${f}`, bad.length === 0, "thiếu " + bad.join(","));
}

// ---- 4. admin.html không inline script ----
const adm = fs.readFileSync(path.join(PUB, "admin.html"), "utf8");
ok("admin.html: chỉ <script src> (không inline)",
   !/<script>(?![\s\S]*src=)/.test(adm) && /<script src="\.\/js\/admin\.mjs"><\/script>/.test(adm));

// ---- 5. index shell nạp main.mjs ----
ok("index.html nạp ./js/main.mjs", idx.includes('<script type="module" src="./js/main.mjs">'));

// ---- 6. clean view: nút toggle + CSS + marker AI busy ----
ok("index.html có nút #uiToggle", idx.includes('id="uiToggle"'));
ok("CSS có body.ui-clean (clean view)", /body\.ui-clean #panel/.test(idx) && /body\.ui-clean #aiPanel\[data-busy/.test(idx));
ok("ui.mjs có logic clean view", fs.readFileSync(path.join(PUB, "js", "ui.mjs"), "utf8").includes("cosmos_clean_view"));
ok("ai.mjs đánh dấu data-busy khi stream",
   /dataset\.busy = "1"/.test(fs.readFileSync(path.join(PUB, "js", "ai.mjs"), "utf8")));
for (const lang of ["vi", "en", "zh"]) {
  ok(`i18n[${lang}] có key clean view`,
     fs.readFileSync(path.join(PUB, "js", "i18n.mjs"), "utf8").includes("cleanHide"));
}

// ---- 7. PWA: sw.mjs + manifest + icon — precache list phải trỏ file thật ----
const swTxt = fs.readFileSync(path.join(PUB, "sw.mjs"), "utf8");
ok("sw.mjs có install/activate/fetch handlers",
   swTxt.includes("addEventListener(\"install\"") &&
   swTxt.includes("addEventListener(\"activate\"") &&
   swTxt.includes("addEventListener(\"fetch\""));
const listed = [...swTxt.matchAll(/"\.\/([^"]+)"/g)].map(m => m[1]);
const missing = listed.filter(rel => !fs.existsSync(path.join(PUB, rel)));
ok(`sw.mjs precache ${listed.length} file đều tồn tại`, missing.length === 0, "thiếu " + missing.join(","));
ok("sw.mjs bỏ qua /api/", swTxt.includes("/api/"));
ok("main.mjs đăng ký service worker",
   fs.readFileSync(path.join(PUB, "js", "main.mjs"), "utf8").includes("serviceWorker.register"));
let manifestOk = false, iconOk = false;
try {
  const mf = JSON.parse(fs.readFileSync(path.join(PUB, "manifest.webmanifest"), "utf8"));
  manifestOk = !!mf.name && Array.isArray(mf.icons) && mf.icons.length >= 1;
  iconOk = fs.existsSync(path.join(PUB, mf.icons[0].src.replace("./", "")));
} catch { /* manifest hỏng JSON */ }
ok("manifest.webmanifest hợp lệ + icon tồn tại", manifestOk && iconOk);
const conf = fs.readFileSync(path.join(ROOT, "nginxconf", "default.conf"), "utf8");
ok("nginx: /sw.mjs no-cache (exact match + đuôi .mjs thoát cache CF)", /location = \/sw\.mjs/.test(conf));
ok("nginx: .mjs no-cache (chống bug cache immutable JS cũ)",
   /location ~ \\.mjs\$[\s\S]{0,300}no-cache/.test(conf));
ok("CSP có manifest-src 'self'", fs.readFileSync(path.join(ROOT, "nginxconf", "security-headers.conf"), "utf8").includes("manifest-src 'self'"));

console.log(failed ? `\n${failed} test FAIL` : "\ntất cả test pass");
process.exit(failed ? 1 : 0);
