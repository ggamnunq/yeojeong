import { clsx } from 'clsx'
import type { RefObject } from 'react'
import { Checkbox, DateHeader, EmptyState, Icon, IllustEmptyTrip, RowPick, ShellSub, type ScreenCtaValue } from '../../ds'
import { focusRing } from '../../ds/styles'
import { CenterStatus } from '../card-import/components'
import { COPY } from './copy'
import type { ExcludedCounts, StatementErrorKind } from './parsers/types'
import type { ProviderInfo } from './providers'
import { groupRows, isSelectable, rowAmounts, rowChip, rowMeta, selectAllState, type ResultRow } from './rules'

// HF-66~68 단계 화면(겉모습). 상태·파일 읽기·서버 호출은 FilePage가 쥔다.
// 디자인(Figma)이 오면 이 파일의 컴포넌트만 바꾼다.

/** 숨긴 파일 입력. 같은 파일을 다시 골라도 change가 오도록 고른 뒤 값을 비운다(FilePage) */
export function FileInput({ inputRef, accept, onFile }: { inputRef: RefObject<HTMLInputElement | null>; accept: string; onFile: (file: File) => void }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      className="hidden"
      data-testid="file-import-input"
      onChange={(e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (file) onFile(file)
      }}
    />
  )
}

/** HF-66 내보내는 방법(Figma 167:17190 · 알리페이 HF-66a 176:18199): 번호 단계(Row/Step — 중국어 메뉴명 괄호·보조색, 보조 줄) · 사실 줄 · CTA "파일 선택" */
export function GuideStep({ info, onBack, onPick }: { info: ProviderInfo; onBack: () => void; onPick: () => void }) {
  return (
    <ShellSub header={{ title: info.title, onBack }} cta={{ label: COPY.pick, onClick: onPick }}>
      <ol className="mt-2 flex flex-col gap-4">
        {info.steps.map((step, index) => (
          <li key={index} className="flex items-start gap-3">
            <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-subtle text-caption text-secondary">
              {index + 1}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5 pt-px">
              <span className="text-body-m break-keep text-primary">
                {step.parts.map((part, i) =>
                  'zh' in part ? (
                    <span key={i} className="whitespace-nowrap">
                      {part.before}
                      <span lang="zh-CN" className="text-tertiary">
                        ({part.zh})
                      </span>
                    </span>
                  ) : (
                    <span key={i}>{part.text}</span>
                  ),
                )}
              </span>
              {step.note && <span className="text-caption text-tertiary">{step.note}</span>}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-8 flex items-center gap-3.5 text-body-m whitespace-pre-line text-primary">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-subtle">
          <Icon name="lock" size={20} className="text-icon-default" />
        </span>
        <span>
          {COPY.fact.before}
          <strong className="font-semibold">{COPY.fact.strong}</strong>
          {COPY.fact.after}
        </span>
      </p>
    </ShellSub>
  )
}

/** HF-67 읽는 중(Figma 169:17396, HF-55 패턴): 헤더 제목 없음 · "파일 읽는 중" + 파일 이름 · "취소" */
export function ReadingStep({ fileName, onCancel }: { fileName: string; onCancel: () => void }) {
  return (
    <ShellSub header={{ onBack: onCancel }}>
      <CenterStatus phase="pending" title={COPY.reading} sub={<span className="break-all">{fileName}</span>} live />
      <button
        type="button"
        onClick={onCancel}
        className={clsx('mx-auto mb-6 rounded-sm px-4 py-2.5 text-body-m-strong text-brand active:opacity-70', focusRing)}
      >
        {COPY.cancel}
      </button>
    </ShellSub>
  )
}

/** HF-66b 형식 다름(169:17266, 알리페이 66ab 176:18220) · 66c 압축·암호(169:17340, 66ac 176:18235) · 66d 너무 큼(176:18250, 공통 — 헤더만 공급자 이름). CTA "다른 파일 선택" */
export function FileErrorStep({ info, kind, onBack, onPick }: { info: ProviderInfo; kind: StatementErrorKind; onBack: () => void; onPick: () => void }) {
  const [title, sub] =
    kind === 'archive'
      ? [COPY.archiveTitle, info.archiveSub]
      : kind === 'tooLarge'
        ? [COPY.tooLargeTitle, COPY.tooLargeSub]
        : [COPY.formatTitle(info.name), info.formatSub]
  return (
    <ShellSub header={{ title: info.name, onBack }} cta={{ label: COPY.otherFile, onClick: onPick }}>
      <CenterStatus phase="before" title={<span className="whitespace-pre-line">{title}</span>} sub={sub} />
    </ShellSub>
  )
}

/** HF-68 결과(170:17343 · 68s 170:18102 · 알리페이 68a 176:18265, HF-56 구조) — 가맹점 이름은 중국어 원문 그대로: 전체 선택 + 제외 Caption · 날짜 묶음 RowPick · CTA "N건 추가" */
export function ResultStep({
  info,
  rows,
  excluded,
  selected,
  tripName,
  saving,
  onToggle,
  onToggleAll,
  onBack,
  onAdd,
}: {
  info: ProviderInfo
  rows: readonly ResultRow[]
  excluded: ExcludedCounts
  selected: ReadonlySet<string>
  tripName: (tripId: string) => string | undefined
  saving: boolean
  onToggle: (key: string) => void
  onToggleAll: () => void
  onBack: () => void
  onAdd: () => void
}) {
  const all = selectAllState(rows, selected)
  return (
    <ShellSub
      header={{ title: COPY.resultTitle(info.name, rows.length), onBack }}
      gutter={false}
      cta={{ label: COPY.add(all.count), onClick: () => all.count > 0 && !saving && onAdd(), state: saving ? 'loading' : all.count > 0 ? 'default' : 'disabled' }}
    >
      <fieldset disabled={saving} className="flex min-w-0 flex-col">
        <div className="flex items-center justify-between px-gutter py-1">
          <Checkbox label={COPY.selectAll} checked={all.checked} indeterminate={all.indeterminate} disabled={all.total === 0} onChange={onToggleAll} />
          <span className="text-caption text-secondary">{COPY.selectCount(all.total, all.count)}</span>
        </div>
        {excluded.transfer > 0 && <p className="px-gutter pb-1 text-caption text-tertiary">{info.excludedTransfer(excluded.transfer)}</p>}
        {groupRows(rows).map((group, index) => (
          <section key={group.localDate} aria-label={group.label} className={clsx(index > 0 ? 'pt-4' : 'pt-1')}>
            <DateHeader style="plain" date={group.label} />
            {group.items.map((row) => {
              const disabled = !isSelectable(row)
              return (
                <RowPick
                  key={row.txnDigest}
                  // bdi: 이름 안 양방향 문자가 메타·금액 줄 배치를 바꾸지 못하게(서버도 서식 문자를 지운다)
                  title={<bdi lang="zh-CN">{row.merchantName}</bdi>}
                  meta={rowMeta(row, tripName)}
                  chip={rowChip(row)}
                  {...rowAmounts(row)}
                  checked={!disabled && selected.has(row.txnDigest)}
                  disabled={disabled}
                  onChange={() => onToggle(row.txnDigest)}
                />
              )
            })}
          </section>
        ))}
        <div className="h-6" />
      </fieldset>
    </ShellSub>
  )
}

/** HF-68b 0건(170:18169, 헤더 공급자 이름): "가져올 결제가 없어요" + 가로 "직접 추가" · "다른 파일 선택" */
export function EmptyStep({ info, onBack, onManual, onPick }: { info: ProviderInfo; onBack: () => void; onManual: () => void; onPick: () => void }) {
  const cta: ScreenCtaValue = {
    layout: 'horizontal',
    secondary: { label: COPY.manual, onClick: onManual },
    primary: { label: COPY.otherFile, onClick: onPick },
  }
  return (
    <ShellSub header={{ title: info.name, onBack }} cta={cta}>
      <EmptyState type="illust" illust={<IllustEmptyTrip size={144} />} title={COPY.empty} className="flex-1 justify-center break-keep" />
    </ShellSub>
  )
}
