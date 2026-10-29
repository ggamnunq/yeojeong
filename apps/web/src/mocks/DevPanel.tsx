import { useState } from 'react'
import { readScenario, writeScenario, type MockEdge, type MockPerspective } from './scenario'

// 목 시나리오 패널(개발 서버 + 목 모드 + ?mockPanel=1일 때만, browser.ts가 띄운다). 앱 화면 밖 별도 루트라 앱 상태와 섞이지 않는다.
// 시점을 바꾸면 새로고침(쿼리 캐시를 새로 시작), 엣지는 다음 요청 한 번에 걸린다.

const PERSPECTIVES: { value: MockPerspective; label: string }[] = [
  { value: 'leader', label: '그룹장(준용)' },
  { value: 'member', label: '멤버(민지)' },
  { value: 'other', label: '다른 사용자(하늘)' },
]
const EDGES: { value: MockEdge | null; label: string }[] = [
  { value: null, label: '없음' },
  { value: '409', label: '409' },
  { value: '429', label: '429' },
  { value: '404', label: '404' },
]

// 개발 도구라 디자인 토큰 밖의 어두운 반투명 면을 쓴다(화면 캡처에 섞이지 않게 기본은 꺼져 있다)
const BOX = 'fixed bottom-2 left-2 z-[60] rounded-md text-[11px] leading-4'
const BOX_STYLE = { background: 'rgb(20 20 24 / 0.85)', color: 'rgb(255 255 255)' }

export function DevPanel() {
  const [open, setOpen] = useState(false)
  const [scenario, setScenario] = useState(readScenario)
  const update = (patch: Parameters<typeof writeScenario>[0]) => {
    writeScenario(patch)
    setScenario(readScenario())
  }

  if (!open) {
    return (
      <button type="button" className={`${BOX} px-2 py-1`} style={BOX_STYLE} onClick={() => setOpen(true)}>
        MOCK · {scenario.as}
        {scenario.edge ? ` · ${scenario.edge}` : ''}
      </button>
    )
  }
  return (
    <div className={`${BOX} flex w-56 flex-col gap-2 p-2`} style={BOX_STYLE}>
      <fieldset className="flex flex-col gap-1">
        <legend>시점(새로고침)</legend>
        {PERSPECTIVES.map((p) => (
          <label key={p.value} className="flex items-center gap-1">
            <input
              type="radio"
              name="mock-as"
              checked={scenario.as === p.value}
              onChange={() => {
                update({ as: p.value })
                window.location.reload()
              }}
            />
            {p.label}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-1">
        <legend>다음 요청 한 번</legend>
        <div className="flex gap-2">
          {EDGES.map((e) => (
            <label key={e.label} className="flex items-center gap-1">
              <input type="radio" name="mock-edge" checked={scenario.edge === e.value} onChange={() => update({ edge: e.value })} />
              {e.label}
            </label>
          ))}
        </div>
        <input
          className="rounded-sm px-1 py-0.5"
          style={{ background: 'rgb(255 255 255 / 0.15)', color: 'inherit' }}
          placeholder="경로 포함 글자(예: /settlement)"
          value={scenario.edgePath ?? ''}
          onChange={(event) => update({ edgePath: event.target.value || null })}
        />
      </fieldset>
      <button type="button" className="self-end underline" onClick={() => setOpen(false)}>
        닫기
      </button>
    </div>
  )
}
