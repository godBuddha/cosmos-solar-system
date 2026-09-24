#!/usr/bin/env python3
"""Build catalog.json từ các file docs/bodies/*.md (single source of truth).

Chạy: python3 build_catalog.py  ->  public/data/catalog.json
Thêm thiên thể mới: viết file .md theo template rồi chạy lại script này.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BODIES_DIR = ROOT / "docs" / "bodies"
OUT = ROOT / "public" / "data" / "catalog.json"

META_KEYS = ["a", "e", "i", "T", "rot", "tilt", "r", "M0", "om", "node",
             "mass", "temp", "moons", "dia"]
FLOAT_KEYS = set(META_KEYS) - {"moons"}
BOOL_KEYS = {"dwarf"}
STR_KEYS = {"col", "col2", "id"}


def parse_body(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
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

    return {"id": meta.pop("id"), "names": names, "desc": desc, **meta}


def main():
    catalog = []
    for f in sorted(BODIES_DIR.glob("*.md")):
        try:
            catalog.append(parse_body(f))
        except Exception as e:
            print(f"SKIP {f.name}: {e}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=1),
                   encoding="utf-8")
    print(f"catalog.json: {len(catalog)} bodies, {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
