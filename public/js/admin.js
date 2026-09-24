const $ = id => document.getElementById(id);
const msg = (t, ok) => { $("msg").textContent = t; $("msg").className = "msg " + (ok ? "ok" : "err"); };

async function init() {
  const h = await (await fetch("/api/health")).json();
  if (h.setupNeeded) {
    $("mode").textContent = "Lần đầu triển khai — tạo tài khoản quản trị (chỉ 1 lần)";
    $("setupForm").classList.remove("hidden");
  } else {
    const me = await fetch("/api/me");
    if (me.ok) { showDash((await me.json()).username); }
    else { $("mode").textContent = "Đăng nhập quản trị"; $("loginForm").classList.remove("hidden"); }
  }
}
function showDash(username) {
  ["setupForm","loginForm"].forEach(i => $(i).classList.add("hidden"));
  $("dash").classList.remove("hidden");
  $("mode").textContent = "Đã đăng nhập";
  $("whoami").textContent = username;
  fetch("/api/admin/ai-config").then(r => r.json()).then(c => {
    $("aiUrl").value = c.aiUrl || "";
    $("aiModel").value = c.aiModel || "";
  });
}
$("btnSetup").addEventListener("click", async () => {
  const r = await fetch("/api/setup", { method:"POST",
    headers: { "content-type":"application/json" },
    body: JSON.stringify({ username: $("su").value, password: $("sp").value }) });
  const j = await r.json();
  if (j.ok) showDash(j.username); else msg(j.error || "Lỗi", false);
});
$("btnLogin").addEventListener("click", async () => {
  const r = await fetch("/api/login", { method:"POST",
    headers: { "content-type":"application/json" },
    body: JSON.stringify({ username: $("lu").value, password: $("lp").value }) });
  const j = await r.json();
  if (j.ok) showDash(j.username); else msg(j.error || "Sai thông tin", false);
});
$("btnSaveAI").addEventListener("click", async () => {
  const r = await fetch("/api/admin/ai-config", { method:"PUT",
    headers: { "content-type":"application/json" },
    body: JSON.stringify({ aiUrl: $("aiUrl").value, aiModel: $("aiModel").value, aiKey: $("aiKey").value }) });
  const j = await r.json();
  msg(j.ok ? "Đã lưu cấu hình AI ✓" : (j.error || "Lỗi"), j.ok);
  if (j.ok) $("aiKey").value = "";
});
$("btnLogout").addEventListener("click", async () => {
  await fetch("/api/logout", { method:"POST" });
  location.reload();
});
init();
