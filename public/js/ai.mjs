// ======================================================================
//  G3: AI ASSISTANT — ưu tiên server gateway (self-host), fallback key user
//  Streaming SSE + JSON action (fly_to / set_speed / show_orbits / show_labels)
// ======================================================================
import { PLANETS, CATALOG_DESC } from "./data.mjs";
import { T, getLang } from "./i18n.mjs";
import { ST } from "./time.mjs";
import { loadSettings } from "./ui.mjs";

let aiMode = null;   // "server" | "user" | null
let planetObjs = null, flyToBodyRef = null;

async function detectAI() {
  try {
    const r = await fetch("/api/health", { signal: AbortSignal.timeout(2500) });
    if (r.ok) {
      const h = await r.json();
      if (h.ok && !h.setupNeeded) {
        const me = await fetch("/api/me");
        if (me.ok) { aiMode = "server"; console.info("AI mode: server"); return; }
      }
    }
  } catch (e) { /* không có backend (Pages) — bỏ qua */ }
  // fallback: key user trong Settings (localStorage)
  const s = loadSettings();
  aiMode = (s.aiUrl && s.aiModel) ? "user" : null;
  // defensive: nếu aiMode vẫn null mà settings có đủ -> ép user mode
  if (!aiMode && s.aiUrl && s.aiModel) aiMode = "user";
  console.info("AI mode:", aiMode, "| url:", s.aiUrl || "(trống)", "| model:", s.aiModel || "(trống)");
}
function aiOpen() {
  const p = document.getElementById("aiPanel");
  p.classList.toggle("open");
  // quy ước: mobile chỉ 1 panel cùng lúc — mở AI thì đóng info
  if (p.classList.contains("open") && window.innerWidth <= 768) {
    const ip = document.getElementById("infopanel");
    ip.classList.remove("open", "sheet-peek", "sheet-full");
  }
  if (p.classList.contains("open")) detectAI().then(() => {
    const t = T();
    const head = document.querySelector("#aiHead .t-ai2");
    if (head) head.textContent = t.aiTitle;
    const msgs = document.getElementById("aiMsgs");
    if (!msgs.children.length) {
      // DOM-safe: textContent — phản hồi/struct AI không bao giờ thành HTML
      const hello = document.createElement("div");
      hello.className = "a";
      hello.textContent = aiMode
        ? (aiMode === "server" ? t.aiReadyServer : t.aiReadyUser)
        : t.aiNone;
      msgs.appendChild(hello);
    }
  });
}

// ---- G4.2: parse + thực thi JSON action từ AI ----
function executeAIActions(content, msgEl) {
  const m = content.match(/^\s*(\[\s*\{[\s\S]*?\}\s*\]|\{[\s\S]*?\})/m);
  if (!m) return null;
  let actions;
  try {
    const parsed = JSON.parse(m[1]);
    actions = Array.isArray(parsed) ? parsed : [parsed];
  } catch { return null; }
  const done = [];
  for (const act of actions) {
    try {
      if (act.action === "fly_to" && act.body) {
        const target = planetObjs.find(po =>
          po.data.name.toLowerCase() === String(act.body).toLowerCase());
        if (target) { flyToBodyRef(target); done.push("fly_to " + act.body); }
      }
      else if (act.action === "set_speed" && isFinite(act.days_per_sec)) {
        const v = Math.max(-2, Math.min(3, Math.log10(Math.max(1e-3, act.days_per_sec))));
        ST.speedExp = v;
        const slider = document.getElementById("speed");
        if (slider) slider.value = v;
        done.push("speed " + act.days_per_sec + "d/s");
      }
      else if (act.action === "show_orbits") {
        ST.showOrbits = !!act.on;
        PLANETS.forEach(p => p._orbitLine && (p._orbitLine.visible = ST.showOrbits));
        document.getElementById("orbits").textContent = T().orbits(ST.showOrbits);
        done.push("orbits " + ST.showOrbits);
      }
      else if (act.action === "show_labels") {
        ST.showLabels = !!act.on;
        planetObjs.forEach(o => o.lblObj.visible = ST.showLabels);
        document.getElementById("labels").textContent = T().labels(ST.showLabels);
        done.push("labels " + ST.showLabels);
      }
    } catch (e) { console.warn("AI action lỗi:", e); }
  }
  if (done.length) console.info("AI actions:", done);
  // làm sạch: bỏ JSON action khỏi text hiển thị cho người dùng
  const cleaned = content.replace(m[0], "").trim();
  return { done, cleaned };
}

async function aiAsk(question) {
  const msgs = document.getElementById("aiMsgs");
  const q = document.createElement("div");
  q.className = "q"; q.textContent = "👤 " + question;
  msgs.appendChild(q);
  const a = document.createElement("div");
  a.className = "a"; a.textContent = "…";
  msgs.appendChild(a);
  msgs.scrollTop = msgs.scrollHeight;

  // ngữ cảnh: catalog rút gọn của thiên thể đang chọn + câu hỏi
  const t = T();
  const ctxBodies = PLANETS.map(o =>
    `${o.name} (${t.names[o.name] || ""}): a=${o.a}AU e=${o.e} T=${o.T}d` +
    ` mass=${o.info.mass}xE temp=${o.info.temp}K moons=${o.info.moons} dia=${o.info.dia}km` +
    (CATALOG_DESC[o.name.toLowerCase()] ? " — " + CATALOG_DESC[o.name.toLowerCase()][getLang()] : "")
  ).join("\n");
  const sys = { role: "system", content:
    "Bạn là trợ lý thiên văn của ứng dụng mô phỏng hệ mặt trời. Trả lời ngắn gọn, chính xác, bằng ngôn ngữ '" +
    getLang() + "'." + "\n\n" +
    "QUAN TRỌNG — điều khiển app: nếu người dùng yêu cầu xem/di chuyển/thay đổi tốc độ, " +
    "HÃY BẮT ĐẦU câu trả lời bằng đúng 1 dòng JSON (không thêm gì trước nó), sau đó có thể viết giải thích:" + "\n" +
    '{"action":"fly_to","body":"<id>"} — bay tới thiên thể (id = tên EN thường, vd "saturn","vesta")' + "\n" +
    '{"action":"set_speed","days_per_sec":<số>}' + "\n" +
    '{"action":"show_orbits","on":true|false}' + "\n" +
    '{"action":"show_labels","on":true|false}' + "\n" +
    "Có thể kết hợp nhiều action trong 1 JSON array. Nếu không cần hành động thì KHÔNG trả JSON." + "\n\n" +
    "Dữ liệu hiện tại:\n" + ctxBodies };

  try {
    if (aiMode === "server") {
      const r = await fetch("/api/ai/chat", { method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [sys, { role: "user", content: question }], stream: true })});
      const ct = r.headers.get("content-type") || "";
      if (r.ok && ct.includes("text/event-stream")) {
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "", full = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") continue;
            try {
              const j = JSON.parse(payload);
              const piece = j?.choices?.[0]?.delta?.content || "";
              if (piece) { full += piece; a.textContent = full; msgs.scrollTop = msgs.scrollHeight; }
            } catch {}
          }
        }
        const res = executeAIActions(full, a);
        if (res && res.cleaned) a.textContent = res.cleaned;
        else if (full) a.textContent = full;
      } else {
        const j = await r.json();
        const res = j.content ? executeAIActions(j.content, a) : null;
        a.textContent = (res && res.cleaned) ? res.cleaned
                      : (j.content || ("Lỗi: " + (j.error || "unknown")));
        if (j.error) a.classList.add("err");
      }
    } else if (aiMode === "user") {
      const s = loadSettings();
      const r = await fetch(s.aiUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json",
                   ...(s.aiKey ? { authorization: "Bearer " + s.aiKey } : {}) },
        body: JSON.stringify({ model: s.aiModel, temperature: 0.6,
          messages: [sys, { role: "user", content: question }] })});
      const j = await r.json();
      const uc = j?.choices?.[0]?.message?.content;
      if (!j?.choices) {
        a.textContent = "Lỗi: " + (j.error?.message || "unknown");
        a.classList.add("err");
      } else {
        // STREAM với key user (OpenRouter/OpenAI đều hỗ trợ)
        const r2 = await fetch(s.aiUrl.replace(/\/$/, "") + "/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json",
                     ...(s.aiKey ? { authorization: "Bearer " + s.aiKey } : {}) },
          body: JSON.stringify({ model: s.aiModel, temperature: 0.6, stream: true,
            messages: [sys, { role: "user", content: question }] })});
        const ct2 = r2.headers.get("content-type") || "";
        if (r2.ok && ct2.includes("text/event-stream")) {
          const reader = r2.body.getReader();
          const dec = new TextDecoder();
          let buf2 = "", full2 = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf2 += dec.decode(value, { stream: true });
            const lines2 = buf2.split("\n");
            buf2 = lines2.pop();
            for (const line of lines2) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") continue;
              try {
                const jj = JSON.parse(payload);
                const piece = jj?.choices?.[0]?.delta?.content || "";
                if (piece) { full2 += piece; a.textContent = full2; msgs.scrollTop = msgs.scrollHeight; }
              } catch {}
            }
          }
          const res = executeAIActions(full2, a);
          if (res && res.cleaned) a.textContent = res.cleaned;
          else if (full2) a.textContent = full2;
        } else {
          const j = await r2.json();
          const uc2 = j?.choices?.[0]?.message?.content;
          const res = uc2 ? executeAIActions(uc2, a) : null;
          a.textContent = (res && res.cleaned) ? res.cleaned : (uc2 || ("Lỗi: " + (j.error?.message || "unknown")));
          if (!j?.choices) a.classList.add("err");
        }
      }
    } else {
      a.textContent = t.aiNone;
      a.classList.add("err");
    }
  } catch (e) {
    a.textContent = "Lỗi kết nối: " + e.message;
    a.classList.add("err");
  }
  msgs.scrollTop = msgs.scrollHeight;
}
function aiSendNow() {
  const inp = document.getElementById("aiIn");
  const v = inp.value.trim();
  if (!v) return;
  inp.value = "";
  aiAsk(v);
}

export function initAI({ planetObjs: po, flyToBody }) {
  planetObjs = po;
  flyToBodyRef = flyToBody;
  document.getElementById("btnAI").addEventListener("click", aiOpen);
  document.getElementById("aiClose").addEventListener("click",
    () => document.getElementById("aiPanel").classList.remove("open"));
  document.getElementById("aiSend").addEventListener("click", aiSendNow);
  document.getElementById("aiIn").addEventListener("keydown", e => {
    if (e.key === "Enter") aiSendNow();
  });
}
