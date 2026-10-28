#!/bin/bash
# usage: wf/run.sh wf/NN_xxx.js   — icons.js + lib.js + script 를 이어붙여 실행하고, 반환된 {key:id} 를 ids.json 에 누적
D="$(cd "$(dirname "$0")" && pwd)"
cat "$D/icons.js" "$D/lib.js" "$1" > "$D/_run.js"
OUT=$(python3 "$D/../tools/figrun.py" "$D/_run.js"); RC=$?
echo "$OUT"
if [ $RC -eq 0 ]; then
python3 - "$D/ids.json" <<PY
import json,sys,os
p=sys.argv[1]
try: out=json.loads('''$OUT''')
except Exception: out=None
if isinstance(out,dict):
    d=json.load(open(p)) if os.path.exists(p) else {}
    d.update(out); json.dump(d,open(p,'w'),ensure_ascii=False,indent=1)
    print('ids.json +%d (total %d)'%(len(out),len(d)))
PY
fi
exit $RC
