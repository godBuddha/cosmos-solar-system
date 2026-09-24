#!/usr/bin/env python3
"""Build catalog.json từ các file docs/bodies/*.md (single source of truth).

Chạy: python3 build_catalog.py  ->  public/data/catalog.json
Thêm thiên thể mới: viết file .md theo template rồi chạy lại script này.

Fail-fast [G1-P3]: mọi file lỗi / thiếu khóa / sai range đều làm script
thoát với exit 1 và in TẤT CẢ các lỗi — thiên thể không bao giờ biến
mất im lặng khỏi catalog.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BODIES_DIR = ROOT / "docs" / "bodies"
OUT = ROOT / "public" / "data" / "catalog.json"

META_KEYS = ["a", "e", "i", "T", "rot", "tilt", "r", "M0", "om", "node",
             "mass", "temp", "moons", "dia"]
FLOAT_KEYS = set(META_KEYS) - {"moons"}
BOOL_KEYS = {"dwarf"}
STR_KEYS = {"col", "col2", "id"}


def validate(body: dict, name: str) -> list[str]:
    """Kiểm tra bất biến vật lý + khóa bắt buộc. Trả về danh sách lỗi."""
    errs: list[str] = []
    for k in META_KEYS:
        if k not in body:
            errs.append(f"{name}: thiếu khóa bắt buộc `{k}`")
    if errs:                       # thiếu khóa thì không range-check tiếp
        return errs
    a, e, T, r = body["a"], body["e"], body["T"], body["r"]
    if a <= 0:
        errs.append(f"{name}: a={a} phải > 0")
    if not (0 <= e < 1):
        errs.append(f"{name}: e={e} phải nằm trong [0, 1) — e>=1 là quỹ đạo thoát, không phải ellipse Kepler")
    if T <= 0:
        errs.append(f"{name}: T={T} phải > 0")
    if r <= 0:
        errs.append(f"{name}: r={r} phải > 0")
    if not (0 <= body["i"] <= 180):
        errs.append(f"{name}: i={body['i']} phải nằm trong [0°, 180°]")
    if not (0 <= body["tilt"] <= 180):
        errs.append(f"{name}: tilt={body['tilt']} phải nằm trong [0°, 180°]")
    if body["moons"] < 0:
        errs.append(f"{name}: moons={body['moons']} phải >= 0")
    if body["temp"] < 0:
        errs.append(f"{name}: temp={body['temp']} (Kelvin) phải >= 0")
    if body["mass"] <= 0:
        errs.append(f"{name}: mass={body['mass']} phải > 0")
    if body["dia"] <= 0:
        errs.append(f"{name}: dia={body['dia']} phải > 0")
    for k in ("col", "col2"):
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", body[k]):
            errs.append(f"{name}: {k}=`{body[k]}` phải là mã hex #rrggbb")
    return errs


def parse_body(path: Path) -> dict:
    # universal newlines không đụng được qua read_text khi file CRLF lẫn
    # ký tự \r lẻ — chuẩn hóa thủ công để regex meta/section luôn ăn khớp
    text = path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
    meta = {}
    m = re.search(r"```meta\n(.*?)```", text, re.S)
    if not m:
        raise ValueError(f"{path.name}: thiếu block ```meta```")
    for line in m.group(1).strip().splitlines():
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        k, v = k.strip(), v.strip().strip('"')
        if k in STR_KEYS:
            meta[k] = v
        elif k in BOOL_KEYS:
            meta[k] = v.lower() in ("true", "yes", "1")
        elif k in FLOAT_KEYS:
            meta[k] = float(v)
        elif k == "moons":
            meta[k] = int(v)

    # tiêu đề dòng đầu: # EN — VI — ZH
    head = re.match(r"#\s*(.+?)\s*—\s*(.+?)\s*—\s*(.+)", text.splitlines()[0])
    names = {"en": head.group(1).strip(), "vi": head.group(2).strip(),
             "zh": head.group(3).strip()} if head else {"en": path.stem}

    # mô tả theo section ngôn ngữ
    def grab(h):
        mm = re.search(rf"## {h}\n\n(.+?)(?=\n## |\Z)", text, re.S)
        return mm.group(1).strip() if mm else ""
    desc = {"vi": grab("Mô tả \\(VI\\)"), "en": grab("Description \\(EN\\)"),
            "zh": grab("描述 \\(ZH\\)")}

    body = {"id": meta.pop("id"), "names": names, "desc": desc, **meta}
    errs = validate(body, path.name)
    if errs:
        raise ValueError("\n  ".join(errs))
    return body


def main() -> int:
    if not BODIES_DIR.is_dir():
        print(f"FATAL: không tìm thấy thư mục {BODIES_DIR}", file=sys.stderr)
        return 1
    catalog, errors = [], []
    for f in sorted(BODIES_DIR.glob("*.md")):
        try:
            catalog.append(parse_body(f))
        except Exception as exc:            # gom đủ hết rồi mới fail
            errors.append(str(exc))

    seen = {}
    for b in catalog:
        if b["id"] in seen:
            errors.append(f"id trùng `{b['id']}`: {seen[b['id']]} và {b['names'].get('en', b['id'])}")
        seen[b["id"]] = b["names"].get("en", b["id"])

    if errors:
        print(f"FATAL: {len(errors)} lỗi khi build catalog — SỬA trước khi deploy:",
              file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=1),
                   encoding="utf-8")
    print(f"catalog.json: {len(catalog)} bodies, {OUT.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
