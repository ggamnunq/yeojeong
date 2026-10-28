#!/usr/bin/env python3
"""Download PNG icons from Icons8 and emit a JS snippet `const ICONS = {...}` (base64) for figrun scripts.

Usage:
  python3 icons8.py out.js [--style ios-glyphs] [--size 96] [--color 6B7280] name1 name2 ...
  python3 icons8.py out.js --style fluency --size 96 wallet home user

Then in your script:  (paste/concat out.js before your code, e.g. `cat icons.js body.js > run.js`)
  imageNode(ICONS['home'], {w:24, parent: someFrame, name:'icon/home'})

Icon names are Icons8 slugs (kebab-case): home, wallet, user, settings, plus, search, chevron-right,
back, menu, calendar, map-pin / marker, group, copy, receipt, pie-chart, bar-chart, checkmark, close,
share, bell, logout, link, qr-code, airplane-take-off, money-bag, coins, bank, credit-card, ...
Styles worth using: ios-glyphs (solid mono), ios (thin outline mono), material-outlined, material-rounded,
fluency-systems-regular (outline), fluency-systems-filled, fluency (color), color (color).
Color is a hex without '#' and only applies to mono styles. 404 means wrong slug — try another name.
Free Icons8 PNGs require a link back to icons8.com in the product; fine for this mockup.
"""
import base64, os, subprocess, sys, json

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".icon_cache")


def fetch(name, style, size, color):
    os.makedirs(CACHE, exist_ok=True)
    fn = os.path.join(CACHE, f"{style}_{size}_{color}_{name}.png")
    if not os.path.exists(fn):
        url = f"https://img.icons8.com/{style}/{size}/{color}/{name}.png" if color else f"https://img.icons8.com/{style}/{size}/{name}.png"
        r = subprocess.run(["curl", "-sL", "-o", fn, "-w", "%{http_code} %{content_type}", url], capture_output=True, text=True)
        code = r.stdout.split()[0] if r.stdout else "000"
        if code != "200" or "image/png" not in r.stdout:
            if os.path.exists(fn): os.remove(fn)
            return None, url
    with open(fn, "rb") as f:
        return base64.b64encode(f.read()).decode(), fn


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__); sys.exit(2)
    out = args.pop(0)
    style, size, color = "ios-glyphs", "96", "6B7280"
    names = []
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--style": style = args[i + 1]; i += 2; continue
        if a == "--size": size = args[i + 1]; i += 2; continue
        if a == "--color": color = args[i + 1].lstrip('#'); i += 2; continue
        names.append(a); i += 1
    if style in ("fluency", "color", "emoji", "3d-fluency", "doodle", "plasticine", "clouds", "bubbles"):
        color = ""
    icons, missing = {}, []
    for n in names:
        b64, info = fetch(n, style, size, color)
        if b64: icons[n] = b64
        else: missing.append((n, info))
    with open(out, "w") as f:
        f.write("const ICONS = " + json.dumps(icons) + ";\n")
    print(f"wrote {out}: {len(icons)} icons ({style}/{size}/{color or 'color'})")
    for n, url in missing:
        print(f"  MISSING {n}  <- {url}")


if __name__ == "__main__":
    main()
