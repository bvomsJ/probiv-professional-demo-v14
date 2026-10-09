#!/usr/bin/env python3
"""Static checks: JS syntax (files + inline), local links/resources, duplicate ids, DOM-id references,
function availability, dangerous HTML sinks, secrets scan, data integrity of the seed DB.
Usage: python3 tests/static_checks.py [project_dir]"""
import sys, os, re, subprocess, json, glob, tempfile
from html.parser import HTMLParser
ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), ".."))
results = []
def rec(name, ok, note=""):
    results.append((name, ok, note)); print("%-5s %s%s" % ("PASS" if ok else "FAIL", name, ("  → " + note) if note else ""))

class P(HTMLParser):
    def __init__(s): super().__init__(); s.ids = []; s.refs = []; s.scripts = []; s._in = False; s._buf = []; s._src = None
    def handle_starttag(s, tag, attrs):
        a = dict(attrs)
        if "id" in a: s.ids.append(a["id"])
        for k in ("href", "src"):
            if k in a: s.refs.append((tag, a[k]))
        if tag == "script":
            s._in = True; s._src = a.get("src"); s._buf = []
    def handle_endtag(s, tag):
        if tag == "script" and s._in:
            s._in = False
            if not s._src: s.scripts.append("".join(s._buf))
    def handle_data(s, d):
        if s._in: s._buf.append(d)

def node_check(code, label):
    f = tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8"); f.write(code); f.close()
    r = subprocess.run(["node", "--check", f.name], capture_output=True, text=True); os.unlink(f.name)
    return r.returncode == 0, r.stderr.strip().splitlines()[:2]

pages = sorted(glob.glob(os.path.join(ROOT, "*.html")))
# 1 JS files
for js in ("site.js", "data.js", "supabase-config.js", "supabase-adapter.js"):
    ok, err = node_check(open(os.path.join(ROOT, js), encoding="utf-8").read(), js); rec("JS syntax: " + js, ok, " ".join(err))
# 2 inline scripts + 3 links + 4 duplicate ids + 5 id references
all_ok = {"inline": [], "links": [], "dups": [], "refs": []}
for pg in pages:
    name = os.path.basename(pg); src = open(pg, encoding="utf-8").read(); p = P(); p.feed(src)
    for i, code in enumerate(p.scripts):
        ok, err = node_check(code, name)
        if not ok: all_ok["inline"].append("%s#%d %s" % (name, i, err))
    for tag, ref in p.refs:
        if re.match(r"^(https?:|data:|mailto:|#|javascript:)", ref) or not ref.strip(): continue
        path = ref.split("#")[0].split("?")[0]
        if path and not os.path.exists(os.path.join(ROOT, path)): all_ok["links"].append("%s -> %s" % (name, ref))
    d = {x for x in p.ids if p.ids.count(x) > 1}
    if d: all_ok["dups"].append("%s: %s" % (name, sorted(d)))
    # getElementById literals used in inline scripts must exist in the page or be created dynamically (id="..." in JS strings)
    code = "\n".join(p.scripts)
    for m in set(re.findall(r'getElementById\(\s*["\']([\w-]+)["\']\s*\)', code)):
        if m not in p.ids and ('id="%s"' % m) not in code and ("id='%s'" % m) not in code and name != "admin.html":
            all_ok["refs"].append("%s: #%s" % (name, m))
rec("Inline <script> syntax (%d pages)" % len(pages), not all_ok["inline"], "; ".join(all_ok["inline"]))
rec("Local links/resources exist (href/src)", not all_ok["links"], "; ".join(all_ok["links"][:8]))
rec("No duplicate id attributes in static HTML", not all_ok["dups"], "; ".join(all_ok["dups"]))
rec("getElementById targets exist (non-admin pages)", not all_ok["refs"], "; ".join(all_ok["refs"]))
# 6 internal link targets from JS strings (e.g. 'thread.html?id=') exist
js_all = open(os.path.join(ROOT, "site.js"), encoding="utf-8").read() + "".join(open(p, encoding="utf-8").read() for p in pages)
targets = set(re.findall(r'["\'`/]([a-z]+\.html)(?:[?"\'`#]|$)', js_all)); missing = sorted(t for t in targets if not os.path.exists(os.path.join(ROOT, t)))
rec("Page names referenced from JS/HTML all exist", not missing, ", ".join(missing))
# 7 CSS url() resources
css = open(os.path.join(ROOT, "style.css"), encoding="utf-8").read(); miss = [u for u in re.findall(r'url\(["\']?([^)"\']+)', css) if not u.startswith(("data:", "http")) and not os.path.exists(os.path.join(ROOT, u))]
rec("CSS url() resources exist", not miss, ", ".join(miss))
bg = re.search(r'background:"([^"]+)"', open(os.path.join(ROOT, "data.js"), encoding="utf-8").read()); rec("Seed background file exists (%s)" % (bg.group(1) if bg else "?"), bool(bg) and os.path.exists(os.path.join(ROOT, bg.group(1))))
# 8 sinks: every innerHTML assignment in pages should be reviewed -> flag template insertions of unescaped DB fields
risky = []
for pg in pages + [os.path.join(ROOT, "site.js")]:
    for i, line in enumerate(open(pg, encoding="utf-8").read().split("\n"), 1):
        if "innerHTML" in line and re.search(r"\$\{\s*(?:t|u|c|x|p|m|a)\.(?:title|name|text|bio|description|label|src|category|role|status)\s*\}", line):
            risky.append("%s:%d" % (os.path.basename(pg), i))
rec("No unescaped DB fields interpolated into innerHTML (public pages + site.js)", not risky, ", ".join(risky[:8]))
# 9 secrets scan
sec = []
for f in glob.glob(os.path.join(ROOT, "**/*"), recursive=True):
    if os.path.isfile(f) and f.split(".")[-1] in ("js", "html", "md", "json", "yml", "sql"):
        t = open(f, encoding="utf-8", errors="ignore").read()
        pat = r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY"
        if f.endswith((".js", ".html")): pat += r"|service_role"   # the word is fine in docs/SQL comments, never in frontend code
        if re.search(pat, t) and not f.endswith("static_checks.py"):
            sec.append(os.path.relpath(f, ROOT))
rec("No secrets / service_role keys / private keys in the repository", not sec, ", ".join(sec))
# 10 data integrity (node)
r = subprocess.run(["node", os.path.join(ROOT, "tests", "data_integrity.js"), ROOT], capture_output=True, text=True)
rec("Seed data integrity (unique IDs, authors, categories, recent/hot links)", r.returncode == 0, r.stdout.strip().replace("\n", "; ")[:300] + r.stderr.strip()[:200])
fails = [r for r in results if not r[1]]; print("\nSTATIC: %d PASS / %d FAIL" % (len(results) - len(fails), len(fails)))
json.dump([{"name": n, "status": "PASS" if o else "FAIL", "note": nt} for n, o, nt in results], open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "static_results.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
sys.exit(1 if fails else 0)
