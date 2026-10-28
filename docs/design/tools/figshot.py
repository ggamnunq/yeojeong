#!/usr/bin/env python3
"""Export a Figma node to a PNG on disk (so you can Read it and visually verify your work).

Usage:
  python3 figshot.py <nodeId> <out.png> [scale]      # scale default 1 (use 0.5 for big sections)
  python3 figshot.py name:<layer name> <out.png> [scale]   # first top-level/any node with that name

Keep exports under ~4000px on the long edge (Figma limit) — lower the scale for big sections.
"""
import base64, json, os, subprocess, sys

PAGE_ID = os.environ.get("FIGMA_PAGE_ID", "5c664dd9-229d-4375-93f2-1fd65f148a46")


def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(2)
    target, out = sys.argv[1], sys.argv[2]
    scale = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
    if target.startswith("name:"):
        finder = "figma.currentPage.findOne(n=>n.name===%s)" % json.dumps(target[5:])
    else:
        finder = "figma.getNodeById(%s)" % json.dumps(target)
    js = (
        "(async()=>{try{const n=%s;if(!n)throw new Error('node not found');"
        "const bytes=await n.exportAsync({format:'PNG',constraint:{type:'SCALE',value:%s}});"
        "let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));"
        "return JSON.stringify({ok:true,w:n.width,h:n.height,b64:btoa(s)})}"
        "catch(e){return JSON.stringify({ok:false,error:String(e)})}})()" % (finder, scale)
    )
    proc = subprocess.run(["orca", "eval", "--page", PAGE_ID, "--expression", js, "--json"],
                          capture_output=True, text=True)
    try:
        outer = json.loads(proc.stdout)
        inner = json.loads(outer["result"]["result"])
    except Exception:
        print("transport error:", proc.stdout[:1500], proc.stderr[:1500]); sys.exit(2)
    if not inner.get("ok"):
        print("export error:", inner.get("error")); sys.exit(1)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "wb") as f:
        f.write(base64.b64decode(inner["b64"]))
    print(f"saved {out} (node {inner['w']:.0f}x{inner['h']:.0f} @ {scale}x)")


if __name__ == "__main__":
    main()
