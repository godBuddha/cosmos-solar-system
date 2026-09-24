#!/usr/bin/env python3
"""Fetch thiên thể từ JPL SBDB Query API -> docs/bodies/*.md

Chỉ chạy khi cần cập nhật catalog. Kết quả: 100 numbered asteroids + TNO nổi tiếng
đã có sẵn file .md riêng (không đè).
"""
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "docs" / "bodies"
# các file thủ công chất lượng cao — KHÔNG BAO GIỜ ghi đè
MANUAL = {"mercury","venus","earth","mars","jupiter","saturn","uranus","neptune",
          "pluto","eris","haumea","makemake","ceres","quaoar","orcus","gonggong",
          "sedna","vesta","pallas","hygiea","juno"}
EXISTING = {f.stem.lower() for f in OUT_DIR.glob("*.md")}


def fetch_jpl(url):
    req = urllib.request.Request(url, headers={"User-Agent": "cosmos-catalog/1.0"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read())


def slug(name):
    # "5 Astraea (A845 XA)" -> "astraea"
    n = name.strip().split(" (")[0]
    parts = n.split(" ", 1)
    return (parts[1] if len(parts) > 1 else parts[0]).lower().replace(" ", "-")


TPL = """# {en} — {vi} — {zh}

```meta
id: {sid}
a: {a}
e: {e}
i: {i}
T: {T}
rot: 0.5
tilt: 0
r: {r}
col: "{col}"
col2: "{col2}"
M0: {M0}
om: {om}
node: {node}
dwarf: {dwarf}
mass: {mass}
temp: {temp}
moons: 0
dia: {dia}
```

## Mô tả (VI)

{en} — tiểu hành tinh số {num} của vành đai chính. Phần tử quỹ đạo J2000 lấy trực tiếp từ JPL SBDB (đúng vị trí theo ngày thực).

## Description (EN)

{en} — asteroid number {num} of the main belt (JPL SBDB), spectral class {klass}.

## 描述 (ZH)

{en}——主带第{num}号小行星（JPL SBDB），光谱类型 {klass}。

## Nguồn / Sources

- JPL SBDB Query API (elements J2000, được fetch {date})
"""


def main():
    print("Fetching 100 numbered asteroids từ JPL SBDB…")
    q = ("https://ssd-api.jpl.nasa.gov/sbdb_query.api"
         "?fields=full_name,a,e,i,per,om,w,ma,H&sb-kind=a&limit=130")
    data = fetch_jpl(q)
    rows = data["data"]
    # lọc: chỉ giữ tên dạng "N Name (prov)" — numbered asteroid chính thức
    picked = []
    for row in rows:
        fn = row[0].strip()
        if not fn[0].isdigit():
            continue
        num, rest = fn.split(" ", 1)
        name = rest.split(" (")[0].strip()
        # row: [full_name, a, e, i, per, om, w, ma, H]
        picked.append((int(num), name, row))
        if len(picked) >= 100:
            break

    added, skipped = 0, 0
    for num, name, row in picked:
        sid = slug(name)
        if sid in MANUAL:
            skipped += 1
            continue
        # asteroid JPL: CHO PHÉP ghi đè để cập nhật elements thật (om/w/ma)
        _, a, e, i, per, om_jpl, w_jpl, ma_jpl, H = row
        a, e, i, per = float(a), float(e), float(i), float(per)
        om_jpl = float(om_jpl); w_jpl = float(w_jpl); ma_jpl = float(ma_jpl)
        H = float(H) if H else 18.0
        # kích thước hiển thị: từ H (độ sáng tuyệt đối) → ước lượng bán kính km
        # D(km) ≈ 1329 / sqrt(albedo 0.14) * 10^(-H/5)
        dia_km = 1329 / math.sqrt(0.14) * 10 ** (-(H) / 5) if H else 20
        r_scene = max(0.06, min(0.35, (dia_km / 1000) * 0.5 + 0.06))
        # màu: lớp C tối, S sáng hơn theo H ngẫu nhiên ổn định
        h = (num * 37) % 100 / 100
        col = "#%02x%02x%02x" % (int(140+60*h), int(130+50*h), int(115+45*h))
        col2 = "#%02x%02x%02x" % (int(95+40*h), int(88+35*h), int(76+30*h))
        mass = 1e-9  # không quan trọng với asteroid nhỏ
        temp = 170
        # elements góc THẬT từ JPL (không còn hash xấp xỉ)
        # app dùng: om = longitude of perihelion ϖ = Ω + ω (JPL trả riêng om=Ω, w=ω)
        om = round((om_jpl + w_jpl) % 360, 2)
        node = round(om_jpl % 360, 2)
        M0 = round(ma_jpl % 360, 2)
        content = TPL.format(
            en=name.capitalize(), vi=name.capitalize(), zh=name.capitalize(),
            sid=sid, a=a, e=e, i=i, T=round(per, 1), r=round(r_scene, 3),
            col=col, col2=col2, M0=M0, om=om, node=node,
            dwarf="true" if dia_km > 800 else "false",
            mass=mass, temp=temp, dia=round(dia_km), num=num,
            klass="main-belt", date="2026-10")
        (OUT_DIR / f"{sid}.md").write_text(content, encoding="utf-8")
        EXISTING.add(sid)
        added += 1

    print(f"added: {added} | skipped (đã có): {skipped}")
    print(f"tổng file: {len(list(OUT_DIR.glob('*.md')))}")


import math
if __name__ == "__main__":
    main()
