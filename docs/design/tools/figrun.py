#!/usr/bin/env python3
"""Run a JS file inside the Figma tab (Orca built-in browser) with the Figma Plugin API.

Usage:
  python3 figrun.py script.js            # prelude.js prepended (helpers: font/text/frame/... see prelude.js)
  python3 figrun.py --no-prelude script.js
  python3 figrun.py -e "return figma.currentPage.children.length"

The script body is the inside of an async function: use `await` freely and `return` any
JSON-serializable value. Thrown errors are caught and printed with a stack.
Exit code 0 on success, 1 on JS error, 2 on orca/transport error.
"""
import json, os, subprocess, sys

PAGE_ID = os.environ.get("FIGMA_PAGE_ID", "5c664dd9-229d-4375-93f2-1fd65f148a46")
HERE = os.path.dirname(os.path.abspath(__file__))
PRELUDE = os.path.join(HERE, "prelude.js")


def main():
    args = sys.argv[1:]
    use_prelude = True
    if "--no-prelude" in args:
        use_prelude = False
        args.remove("--no-prelude")
    if not args:
        print(__doc__)
        sys.exit(2)
    if args[0] == "-e":
        body = " ".join(args[1:])
    else:
        with open(args[0], encoding="utf-8") as f:
            body = f.read()
    prelude = ""
    if use_prelude:
        with open(PRELUDE, encoding="utf-8") as f:
            prelude = f.read()
    wrapped = (
        "(async()=>{try{" + prelude + "\nconst __r=await (async()=>{\n" + body +
        "\n})();return JSON.stringify({ok:true,value:__r===undefined?null:__r})}"
        "catch(e){return JSON.stringify({ok:false,error:String(e),stack:String(e&&e.stack||'')})}})()"
    )
    proc = subprocess.run(
        ["orca", "eval", "--page", PAGE_ID, "--expression", wrapped, "--json"],
        capture_output=True, text=True,
    )
    raw = proc.stdout.strip()
    try:
        outer = json.loads(raw)
    except Exception:
        print("ORCA TRANSPORT ERROR (non-JSON):", raw[:2000], proc.stderr[:2000])
        sys.exit(2)
    if not outer.get("ok"):
        print("ORCA ERROR:", json.dumps(outer, ensure_ascii=False)[:3000])
        sys.exit(2)
    inner_raw = outer.get("result", {}).get("result")
    try:
        inner = json.loads(inner_raw)
    except Exception:
        print("UNPARSEABLE RESULT:", str(inner_raw)[:3000])
        sys.exit(2)
    if inner.get("ok"):
        v = inner.get("value")
        print(json.dumps(v, ensure_ascii=False, indent=1) if isinstance(v, (dict, list)) else v)
        sys.exit(0)
    print("JS ERROR:", inner.get("error"))
    print(inner.get("stack", "")[:3000])
    sys.exit(1)


if __name__ == "__main__":
    main()
