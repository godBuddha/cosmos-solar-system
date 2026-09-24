#!/usr/bin/env node
// G2 — Smoke test API (setup / login / 401 / khóa sau setup)
// Chạy: node tests/test_api_smoke.mjs   (cần npm ci trong server/ trước)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = 3210;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(os.tmpdir(), `cosmos-smoke-${process.pid}.json`);
let failed = 0;
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}${cond ? "" : " " + extra}`);
  if (!cond) failed++;
};

const proc = spawn("node", ["server/index.js"], {
  env: {
    ...process.env, PORT: String(PORT),
    JWT_SECRET: "ci-smoke-secret-g2-32-chars-ok",
    DATA_FILE: DATA, SETUP_TOKEN: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let boot = "";
proc.stdout.on("data", d => (boot += d));
proc.stderr.on("data", d => (boot += d));

async function waitReady() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("server không lên được:\n" + boot);
}

try {
  await waitReady();

  let r = await fetch(`${BASE}/api/health`);
  let h = await r.json();
  ok("health 200 + setupNeeded:true", r.status === 200 && h.ok && h.setupNeeded === true);

  r = await fetch(`${BASE}/api/setup`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "short" }),
  });
  ok("setup mật khẩu < 8 ký tự → 400", r.status === 400);

  r = await fetch(`${BASE}/api/setup`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "long-enough-pass" }),
  });
  const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  ok("setup đúng → 200 + cookie cosmos_token",
     r.status === 200 && cookie.startsWith("cosmos_token="), `got ${r.status}, cookie=${cookie}`);

  h = (await (await fetch(`${BASE}/api/health`)).json());
  ok("health setupNeeded:false sau setup", h.setupNeeded === false);

  r = await fetch(`${BASE}/api/setup`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "again", password: "long-enough-pass" }),
  });
  ok("setup lần 2 bị khóa → 403", r.status === 403);

  r = await fetch(`${BASE}/api/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "wrong-pass" }),
  });
  ok("login sai → 401", r.status === 401);

  r = await fetch(`${BASE}/api/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "long-enough-pass" }),
  });
  ok("login đúng → 200", r.status === 200);

  r = await fetch(`${BASE}/api/me`);
  ok("/api/me không cookie → 401", r.status === 401);

  r = await fetch(`${BASE}/api/me`, { headers: { cookie } });
  ok("/api/me có cookie → 200", r.status === 200 && (await r.json()).username === "admin");

  r = await fetch(`${BASE}/api/admin/ai-config`, {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ aiUrl: "https://api.openai.com/v1" }),
  });
  ok("PUT ai-config không auth → 401", r.status === 401);

  ok("data.json tồn tại sau setup", fs.existsSync(DATA));
} catch (e) {
  console.error("✗ FAIL exception:", e.message, "\n", boot);
  failed++;
} finally {
  proc.kill();
  try { fs.unlinkSync(DATA); } catch {}
}
console.log(failed ? `\n${failed} test FAIL` : "\ntất cả test pass");
process.exit(failed ? 1 : 0);
