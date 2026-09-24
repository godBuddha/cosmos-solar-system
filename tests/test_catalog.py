#!/usr/bin/env python3
"""G2 — Test build_catalog: round-trip byte-identical + fail-fast + invariant catalog.

Chạy: python3 tests/test_catalog.py
"""
import contextlib
import importlib.util
import io
import json
import py_compile
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("bc", ROOT / "build_catalog.py")
bc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bc)

fails = []
def ok(name, cond, extra=""):
    print(("✓ " if cond else "✗ FAIL ") + name + ("" if cond else f"  {extra}"))
    if not cond:
        fails.append(name)

# TEST 1: syntax cả 2 script
for f in ("build_catalog.py", "fetch_jpl.py"):
    try:
        py_compile.compile(str(ROOT / f), doraise=True)
        ok(f"py_compile {f}", True)
    except Exception as e:
        ok(f"py_compile {f}", False, str(e))

# TEST 2: round-trip — build từ docs/bodies phải byte-identical với catalog committed
with tempfile.TemporaryDirectory() as td:
    bc.OUT = Path(td) / "catalog.json"
    rc = bc.main()
    ok("round-trip exit 0", rc == 0)
    ok("round-trip byte-identical với catalog.json committed",
       bc.OUT.read_bytes() == (ROOT / "public/data/catalog.json").read_bytes())

# TEST 3: catalog committed thỏa invariant (kiểm tra độc lập với build script)
cat = json.loads((ROOT / "public/data/catalog.json").read_text())
ok("catalog >= 100 bodies", len(cat) >= 100, f"got {len(cat)}")
ok("id unique", len({b["id"] for b in cat}) == len(cat))
bad = []
for b in cat:
    if not (0 <= b["e"] < 1):
        bad.append(f"{b['id']} e={b['e']}")
    if b["a"] <= 0:
        bad.append(f"{b['id']} a={b['a']}")
    if b["T"] <= 0:
        bad.append(f"{b['id']} T={b['T']}")
    for k in ("col", "col2"):
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", b[k]):
            bad.append(f"{b['id']} {k}={b[k]}")
ok("invariant 0<=e<1, a>0, T>0, hex màu", not bad, "; ".join(bad[:5]))

# TEST 4: file lỗi → exit 1, báo FATAL, KHÔNG ghi catalog (bản cũ giữ nguyên)
TPL_ERR = """# {en} — {en} — {en}
## Mô tả (VI)

test
## Meta
```meta
id: {sid}
a: {a}
e: {e}
i: 5
T: 100
rot: 1
tilt: 0
r: 0.3
col: "#aa8866"
col2: "#775544"
M0: 10
om: 10
node: 10
mass: 0.001
temp: 150
moons: 0
dia: 200
```
"""
with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    bodies = td / "bodies"
    bodies.mkdir()
    (bodies / "esc.md").write_text(TPL_ERR.format(en="Esc", sid="esc", a=2.0, e=1.05))
    (bodies / "miss.md").write_text(TPL_ERR.format(en="Miss", sid="miss", a=2.0, e=0.1)
                                    .replace("a: 2.0\n", "", 1))
    out = td / "out.json"
    bc.BODIES_DIR = bodies
    bc.OUT = out
    err = io.StringIO()
    with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
        rc = bc.main()
    ok("2 file lỗi → exit 1", rc == 1)
    ok("stderr báo FATAL + tên file + lý do",
       all(s in err.getvalue() for s in ("FATAL", "esc.md", "miss.md", "phải")))
    ok("KHÔNG ghi catalog khi lỗi", not out.exists())
    # sửa 1 file → vẫn exit 1 vì file còn lại lỗi (không âm thầm qua nốt)
    (bodies / "esc.md").write_text(TPL_ERR.format(en="Esc", sid="esc", a=2.0, e=0.05))
    err = io.StringIO()
    with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
        rc = bc.main()
    ok("sửa 1/2 file → vẫn exit 1 (báo đủ)", rc == 1 and "miss.md" in err.getvalue())

print(f"\n{len(fails)} FAIL" if fails else "\ntất cả test pass")
sys.exit(1 if fails else 0)
