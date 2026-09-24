# COSMOS — Hệ Mặt Trời 3D Self-Hosted

![Overview](screenshots/01_overview.png)

*Hệ mặt trời đầy đủ: 8 hành tinh quỹ đạo Kepler, asteroid belt, vành Sao Thổ particle*

| | |
|---|---|
| ![Inner](screenshots/02_inner_system.png) | ![Sun](screenshots/05_sun_closeup.png) |
| *Hệ trong + asteroid belt* | *Mặt Trời shader FBM + moons Galilean* |

Hệ mặt trời Three.js với quỹ đạo Kepler nghiêm ngặt, chạy trong Docker, sẵn sàng gắn tên miền.

## Cấu trúc

```
cosmos-solar-system/
├── build_catalog.py        # docs/bodies/*.md -> public/data/catalog.json (fail-fast)
├── fetch_jpl.py            # fetch elements J2000 từ JPL SBDB (retry + guard)
├── docs/bodies/*.md        # 116 thiên thể — single source of truth (tên 3 ngôn ngữ + elements + mô tả)
├── docker-compose.yml      # cosmos (nginx) + api (node) + cloudflared (tùy chọn, token từ .env)
├── Dockerfile              # nginx + COPY conf/site vào image (bất biến, version được)
├── nginxconf/default.conf  # gzip, cache 7d, security headers, limit_req /api/
├── public/
│   ├── index.html          # app chính (Three.js, GPU particles, search, tour, AI panel)
│   ├── admin.html          # one-time admin setup + AI gateway config (self-host only)
│   ├── data/catalog.json   # catalog do build_catalog.py sinh ra
│   └── vendor/three/       # Three.js 0.160.0 self-hosted
├── server/                 # API (Express + JWT + AI proxy + SSRF guard) — self-host only
└── .env.example            # template JWT_SECRET / SETUP_TOKEN / CF_TUNNEL_TOKEN
```

## Chạy

```bash
git clone https://github.com/godBuddha/cosmos-solar-system.git
cd cosmos-solar-system
cp .env.example .env
# đặt JWT_SECRET (BẮT BUỘC — thiếu hoặc trùng mặc định stack sẽ từ chối khởi động):
#   openssl rand -base64 32
docker compose up -d --build
docker compose ps   # kiểm tra: phải thấy (healthy)
```

> ⚠️ `cosmos` bind `127.0.0.1:8090:80` — web KHÔNG mở ra ngoài. Truy cập qua
> SSH tunnel: `ssh -L 8090:127.0.0.1:8090 user@server` rồi mở
> `http://localhost:8090`, hoặc qua Cloudflare Tunnel (mục dưới).

Lần đầu truy cập `/admin.html` hiện form **tạo tài khoản quản trị** (one-time,
khóa sau khi tạo). Nếu đặt `SETUP_TOKEN` trong `.env` thì còn phải gửi kèm
header `x-setup-token` khi setup.

## Gắn tên miền

### Cách 1: Cloudflare Tunnel (khuyến nghị — không cần mở port, không cần cert tự quản)

Tạo tunnel trên Cloudflare Zero Trust dashboard (hoặc `cloudflared tunnel login`),
lấy token, thêm service `cloudflared` vào compose (đã có sẵn block mẫu trong
`docker-compose.yml`, token đọc từ `.env`), rồi trên dashboard cấu hình
**Public Hostname**:

| Trường | Giá trị |
|---|---|
| Subdomain / Domain | `solar` / `tenmiencuaban.com` |
| Service | **HTTP** `cosmos-web:80` (đúng kiểu HTTP — nginx phục vụ HTTP thuần) |

TLS do Cloudflare edge đảm nhiệm; tunnel nối vào cùng docker network nên gọi
theo tên service được. Lưu ý: nếu chọn kiểu **HTTPS** sẽ lỗi
`tls: first record does not look like a TLS handshake`.

### Cách 2: Nginx proxy + Let's Encrypt (truyền thống)

#### 1. Trỏ DNS
```
Type: A    Name: cosmos (hoặc @)    Value: <IP public server>    TTL: 300
```
Kiểm tra: `dig +short cosmos.tenmiencuaban.com` → phải ra đúng IP.

#### 2. Bật proxy + certbot
Mở `docker-compose.yml`, uncomment block `cosmos-proxy` và `certbot`.
`ports` của service `cosmos` giữ nguyên `127.0.0.1:8090:80` — proxy chiếm 80/443 riêng.

**Bootstrap: chỉ bắt đầu với server HTTP (port 80) cho ACME webroot** — chưa
cần block 443, vì cert chưa có thì nginx với block 443 sẽ từ chối khởi động.
Tạo `nginxconf/proxy.conf`:

```nginx
server {
    listen 80;
    server_name cosmos.tenmiencuaban.com;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }  # bỏ dòng này trong lúc bootstrap
}
```

```bash
docker compose up -d cosmos-proxy
```

#### 3. Cấp chứng chỉ lần đầu

Service `certbot` trong compose có `entrypoint` riêng (vòng lặp renew) — khi
gọi lệnh cấp cert phải **ghi đè bằng `--entrypoint certbot`**, nếu không lệnh
sẽ bị nuốt bởi vòng lặp:

```bash
docker compose run --rm --entrypoint certbot certbot certonly --webroot \
  -w /var/www/certbot \
  -d cosmos.tenmiencuaban.com --email email@ban.com --agree-tos --no-eff-email
```

Xong thêm block `listen 443 ssl` vào `proxy.conf` (chứng chỉ giờ đã có ở
`/etc/letsencrypt/live/...`) rồi `docker compose restart cosmos-proxy`.

#### 4. Gia hạn + reload

Vòng lặp trong service `certbot` tự chạy `certbot renew` mỗi 12h, nhưng
**nginx không tự nạp cert mới** (certbot nằm trong container riêng). Thêm
cron trên host, ví dụ mỗi tuần:

```cron
0 4 * * 1 cd /duong/dan/cosmos-solar-system && docker compose exec cosmos-proxy nginx -s reload
```

#### 5. Kiểm tra
```bash
curl -I https://cosmos.tenmiencuaban.com        # HTTP/2 200
docker compose run --rm --entrypoint certbot certbot renew --dry-run
```

## Bảo trì

| Việc | Lệnh |
|---|---|
| Cập nhật app (sửa public/) | `docker compose up -d --build` |
| Backup mã nguồn + config | `tar czf cosmos-backup.tar.gz --exclude=.env .` |
| **Backup dữ liệu (tài khoản admin + AI key)** | `docker run --rm -v cosmos-app_api_data:/d -v "$PWD":/b alpine tar czf /b/cosmos-api-data-$(date +%F).tar.gz -C /d .` |
| Xem tài nguyên | `docker stats cosmos-web` |
| Cập nhật Three.js | Tải tgz mới từ registry.npmjs.org, thay `public/vendor/three/` |

> Tên volume là `<project>_api_data` — xem đúng tên bằng `docker volume ls`.
> Dữ liệu người dùng chỉ nằm ở volume này; tar thư mục **không chứa** nó.

## Ghi chú kỹ thuật

- **Tỷ lệ nghệ thuật**: khoảng cách nén theo `d = 11·a^0.55` — không phải tỷ lệ thật (đã ghi trong code)
- **Quỹ đạo Kepler**: giải `M = E − e·sin E` bằng Newton–Raphson — catalog sinh từ JPL SBDB
- **Performance**: toàn bộ particle tính Kepler trên GPU (vertex shader); Kuiper 50k,
  asteroid belt 6k, vành Saturn 9k, comet trail 900, mưa sao băng 40 vệt — CPU chỉ set
  uniform thời gian mỗi frame. Có auto-detect giảm tải trên máy yếu + toggle Bloom trong Settings.
- **Offline**: trang tĩnh (Three.js self-hosted) chạy không cần mạng. Riêng **AI panel** cần
  một endpoint OpenAI-compatible (Ollama local, hoặc provider cloud) — không thể offline hoàn toàn.
- **Security**: JWT ghim HS256 + JWT_SECRET fail-fast; SETUP_TOKEN so sánh constant-time;
  rate-limit 10 req/phút (app) + limit_req nginx cho `/api/`; SSRF guard chặn AI Base URL
  trỏ tới địa chỉ nội bộ; api container `read_only` + `cap_drop` + non-root.

## Nguồn dữ liệu thiên thể
Mỗi file `.md` chứa frontmatter meta (Keplerian elements J2000 + vật lý) + mô tả VI/EN/ZH.
**Thêm thiên thể mới**: viết file .md theo template → `python3 build_catalog.py` → commit.
Script fail-fast: sai range (`e >= 1`, `a <= 0`, thiếu khóa, id trùng…) sẽ thoát với exit 1
và **không ghi** catalog — thiên thể không bao giờ biến mất im lặng.

## AI (OpenAI-compatible)
- **GitHub Pages**: người dùng tự nhập Base URL + API Key + Model trong ⚙️ Settings (lưu localStorage máy họ)
- **Self-host**: admin cấu hình tại `/admin.html` — key nằm trên server, browser không bao giờ thấy
- Base URL được validate khi lưu: chặn localhost, IP private/link-local/metadata, IPv6 local,
  và domain resolve về IP nội bộ (SSRF guard)
- Ưu tiên server gateway nếu đăng nhập; fallback về key user
