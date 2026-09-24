/**
 * COSMOS API — backend cho bản self-host Docker (không chạy trên GitHub Pages).
 *
 * Chức năng:
 *  - One-time admin setup: lần đầu truy cập khi chưa có admin -> tạo tài khoản
 *    (nếu env SETUP_TOKEN được đặt, phải gửi header x-setup-token khớp)
 *  - Đăng nhập JWT (cookie httpOnly)
 *  - Cấu hình AI gateway (Base URL / Key / Model) lưu server-side — key KHÔNG
 *    bao giờ xuống browser
 *  - Proxy chat OpenAI-compatible (/api/ai/chat) dùng key server
 *
 * Storage: file JSON (đơn giản, không native deps). Schema sẵn sàng nâng
 * cấp lên Postgres/SQLite khi cần (xem docs).
 */
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const SETUP_TOKEN = process.env.SETUP_TOKEN || "";   // optional: bảo vệ lần setup đầu
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");
const COOKIE = "cosmos_token";

// ---------------- storage (JSON file, atomic write) ----------------
const db = { admin: null, ai: { aiUrl: "", aiKey: "", aiModel: "" } };
try { Object.assign(db, JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))); } catch {}
function save() {
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DATA_FILE);
}

// ---------------- helpers ----------------
const app = express();
app.use(express.json({ limit: "1mb" }));

function cookieParse(req) {
  const h = req.headers.cookie || "";
  for (const part of h.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return v.join("=");
  }
  return null;
}
function auth(req, res, next) {
  const token = cookieParse(req);
  if (!token) return res.status(401).json({ error: "unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "invalid token" });
  }
}

// ---------------- health + setup ----------------
app.get("/api/health", (req, res) => {
  res.json({ ok: true, setupNeeded: !db.admin, service: "cosmos-api" });
});

app.post("/api/setup", async (req, res) => {
  if (db.admin) return res.status(403).json({ error: "admin already exists" });
  if (SETUP_TOKEN && req.headers["x-setup-token"] !== SETUP_TOKEN)
    return res.status(403).json({ error: "invalid setup token" });
  const { username, password } = req.body || {};
  if (!username || !password || String(password).length < 8)
    return res.status(400).json({ error: "username + password >= 8 chars required" });
  const hash = await bcrypt.hash(password, 12);
  db.admin = { username, hash, createdAt: new Date().toISOString() };
  save();
  const token = jwt.sign({ u: username, role: "admin" }, JWT_SECRET, { expiresIn: "7d" });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", maxAge: 7 * 864e5 });
  res.json({ ok: true, username });
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!db.admin) return res.status(403).json({ error: "setup needed" });
  const ok = username === db.admin.username &&
    await bcrypt.compare(password || "", db.admin.hash);
  if (!ok) return res.status(401).json({ error: "wrong credentials" });
  const token = jwt.sign({ u: username, role: "admin" }, JWT_SECRET, { expiresIn: "7d" });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", maxAge: 7 * 864e5 });
  res.json({ ok: true, username });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

app.get("/api/me", auth, (req, res) => res.json({ username: req.user.u }));

// ---------------- admin: AI gateway config ----------------
app.get("/api/admin/ai-config", auth, (req, res) => {
  res.json({ aiUrl: db.ai.aiUrl, aiModel: db.ai.aiModel, hasKey: !!db.ai.aiKey });
});
app.put("/api/admin/ai-config", auth, (req, res) => {
  const { aiUrl, aiKey, aiModel } = req.body || {};
  if (aiUrl != null) db.ai.aiUrl = String(aiUrl).trim();
  if (aiModel != null) db.ai.aiModel = String(aiModel).trim();
  if (aiKey != null && aiKey !== "") db.ai.aiKey = String(aiKey).trim();  // rỗng = giữ nguyên
  save();
  res.json({ ok: true, hasKey: !!db.ai.aiKey });
});

// ---------------- AI chat proxy (OpenAI-compatible, hỗ trợ stream) ----------------
app.post("/api/ai/chat", auth, async (req, res) => {
  const { messages, stream } = req.body || {};
  if (!Array.isArray(messages) || !messages.length)
    return res.status(400).json({ error: "messages required" });
  const { aiUrl, aiKey, aiModel } = db.ai;
  if (!aiUrl || !aiModel)
    return res.status(400).json({ error: "AI gateway chưa được cấu hình (admin)" });
  try {
    const upstream = await fetch(aiUrl.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(aiKey ? { authorization: "Bearer " + aiKey } : {}),
      },
      body: JSON.stringify({ model: aiModel, messages, temperature: 0.6, stream: !!stream }),
    });
    if (!upstream.ok) {
      const txt = await upstream.text();
      return res.status(502).json({ error: "upstream " + upstream.status, detail: txt.slice(0, 300) });
    }
    if (stream && upstream.headers.get("content-type")?.includes("event-stream")) {
      // forward SSE nguyên vẹn
      res.setHeader("content-type", "text/event-stream");
      res.setHeader("cache-control", "no-cache");
      res.setHeader("connection", "keep-alive");
      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      return res.end();
    }
    const data = await upstream.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    res.json({ content });
  } catch (e) {
    res.status(502).json({ error: "AI gateway unreachable", detail: String(e).slice(0, 200) });
  }
});

app.listen(PORT, () => console.log(`cosmos-api on :${PORT} (setupNeeded=${!db.admin})`));
