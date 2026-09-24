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
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import fs from "fs";
import net from "net";
import dns from "dns";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "";
// FAIL-FAST: chặn chạy với secret thiếu hoặc bằng giá trị mặc định đã lộ
if (!JWT_SECRET || JWT_SECRET === "dev-secret-change-me" || JWT_SECRET === "doi-chuoi-nay-di") {
  console.error("FATAL: JWT_SECRET chưa đặt hoặc trùng giá trị mặc định đã lộ. " +
    "Đặt JWT_SECRET trong file .env (chuỗi ngẫu nhiên >= 32 ký tự) rồi chạy lại.");
  process.exit(1);
}
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

// rate-limit: chống brute-force login/setup + lạm dụng AI proxy
const authLimiter = rateLimit({
  windowMs: 60_000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "quá nhiều lần thử, thử lại sau" },
});
app.use("/api/setup", authLimiter);
app.use("/api/login", authLimiter);
app.use("/api/ai/chat", authLimiter);

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
    req.user = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
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
  if (SETUP_TOKEN) {
    // so sánh constant-time chống timing attack
    const given = Buffer.from(String(req.headers["x-setup-token"] || ""));
    const expect = Buffer.from(SETUP_TOKEN);
    const okLen = given.length === expect.length;
    const okEq = okLen && crypto.timingSafeEqual(given, expect);
    if (!okEq) return res.status(403).json({ error: "invalid setup token" });
  }
  const { username, password } = req.body || {};
  if (!username || !password || String(password).length < 8)
    return res.status(400).json({ error: "username + password >= 8 chars required" });
  const hash = await bcrypt.hash(password, 12);
  db.admin = { username, hash, createdAt: new Date().toISOString() };
  save();
  const token = jwt.sign({ u: username, role: "admin" }, JWT_SECRET, { expiresIn: "7d", algorithm: "HS256" });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", maxAge: 7 * 864e5 });
  res.json({ ok: true, username });
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!db.admin) return res.status(403).json({ error: "setup needed" });
  const ok = username === db.admin.username &&
    await bcrypt.compare(password || "", db.admin.hash);
  if (!ok) return res.status(401).json({ error: "wrong credentials" });
  const token = jwt.sign({ u: username, role: "admin" }, JWT_SECRET, { expiresIn: "7d", algorithm: "HS256" });
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
app.put("/api/admin/ai-config", auth, async (req, res) => {
  const { aiUrl, aiKey, aiModel } = req.body || {};
  if (aiUrl != null) {
    const v = String(aiUrl).trim();
    if (v && await isPrivateAiUrl(v))
      return res.status(400).json({
        error: "AI Base URL không hợp lệ hoặc trỏ tới địa chỉ nội bộ (SSRF guard)"
      });
    db.ai.aiUrl = v;
  }
  if (aiModel != null) db.ai.aiModel = String(aiModel).trim();
  if (aiKey != null && aiKey !== "") db.ai.aiKey = String(aiKey).trim();  // rỗng = giữ nguyên
  save();
  res.json({ ok: true, hasKey: !!db.ai.aiKey });
});

// ---------------- SSRF guard cho AI Base URL [G1-P5] ----------------
// Admin khai báo Base URL server sẽ fetch → chặn mọi URL trỏ tới địa chỉ
// nội bộ (localhost / IP private / link-local metadata / DNS nội bộ).
// Risk còn lại: DNS rebinding giữa lúc save và lúc fetch — chấp nhận được
// vì chỉ admin (đã auth) mới đặt được URL.
function isPrivateIPv4(ip) {
  const p = ip.split(".").map(Number);
  const [a, b, c] = p;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||       // CGNAT
    (a === 169 && b === 254) ||                  // link-local + AWS metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) ||         // private
    (a === 192 && b === 168) ||                  // private
    (a === 192 && b === 0 && c === 0) ||         // 192.0.0.0/24
    (a === 198 && (b === 18 || b === 19)) ||     // benchmark 198.18.0.0/15
    a >= 224;                                    // multicast + reserved
}
function isPrivateIPv6(sRaw) {
  const s = sRaw.replace(/^\[|\]$/g, "").toLowerCase();
  if (s === "::" || s === "::1") return true;    // unspecified + loopback
  const mapped = s.match(/^::ffff:(.+)$/);       // IPv4-mapped ::ffff:…/96
  if (mapped) {
    const tail = mapped[1];
    if (net.isIPv4(tail)) return isPrivateIPv4(tail);
    const groups = tail.split(":").filter(Boolean);
    if (groups.length === 2) {                    // dạng nén "7f00:1" = 127.0.0.1
      const a = parseInt(groups[0].padStart(4, "0"), 16);
      const b = parseInt(groups[1].padStart(4, "0"), 16);
      return isPrivateIPv4(`${(a >> 8) & 255}.${a & 255}.${(b >> 8) & 255}.${b & 255}`);
    }
    return true;                                  // cấu trúc mapped lạ — chặn an toàn
  }
  const first = parseInt((s.match(/^[0-9a-f]+/) || ["0"])[0], 16);
  if ((first & 0xfe00) === 0xfc00) return true;   // unique local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return true;   // link-local fe80::/10
  return false;
}
async function isPrivateAiUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return true; }   // không parse được → chặn
  if (u.protocol !== "http:" && u.protocol !== "https:") return true;
  // WHATWG URL tự chuẩn hóa IPv4 dạng lạ (0x7f.0.0.1, 0177.0.0.1, 2130706433)
  const host = u.hostname;
  const bare = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (net.isIPv4(bare)) return isPrivateIPv4(bare);
  if (bare.includes(":")) return isPrivateIPv6(host);
  if (/(^|\.)localhost$|\.local$|\.internal$/.test(bare)) return true;
  try {
    // domain thật → resolve và chặn nếu BẤT KỲ địa chỉ nào nằm nội bộ
    const addrs = await dns.promises.lookup(bare, { all: true });
    return addrs.some(a => net.isIPv4(a.address)
      ? isPrivateIPv4(a.address) : isPrivateIPv6(a.address));
  } catch { return true; }                     // DNS fail → không cho phép
}

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
