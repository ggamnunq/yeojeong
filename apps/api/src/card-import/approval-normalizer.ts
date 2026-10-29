import type { CardCancelState } from '@yeojeong/shared';
import {
  MANUAL_DEFAULT_MERCHANT_NAME,
  MANUAL_MEMO_MAX_LENGTH,
} from '@yeojeong/shared';
import {
  cleanMemo,
  cleanMemoForImportKeyV1,
  merchantNameOf,
} from '../expenses/manual-input.js';
import { formatScaled, krwAmountOf, parseScaled } from '../fx/convert.js';

// CODEF 개인 카드 승인내역(KR_CD_P_002) 응답 → 화면에 보낼 최소 필드. DB·시계·네트워크 없는 순수 함수(단위 테스트 대상).
// 출력 필드 이름: admin.codef.io/dev-guide-menu/api-output-param/KR_CD_P_002
//   resUsedDate(yyyyMMdd) · resUsedTime(HHmmss) · resUsedAmount · resAccountCurrency(ISO 4217) · resKRWAmt ·
//   resCancelYN("0" 정상 · "1" 취소 · "2" 부분취소 · "3" 거절) · resCancelAmount · resHomeForeignType("1" 국내 · "2" 해외) ·
//   resCardNo(마스킹 — 같은 카드 판정·승인번호 없는 줄의 키 재료로만, 응답에 넣지 않음) · resApprovalNo · resMemberStoreName.
// KB국민카드는 "취소 전표 매입" 줄을 음수 resUsedAmount로 준다(출력부 안내). NH농협 해외 승인은 승인번호가 빌 수 있다.
// 이 밖의 필드(가맹점 주소·전화·사업자번호·가맹점 번호 등)는 읽지 않고 버린다.

/** 읽는 필드만. 값은 모두 문자열(없으면 빈 문자열이나 undefined) */
export interface CodefApprovalRow {
  resUsedDate?: string;
  resUsedTime?: string;
  resUsedAmount?: string;
  resAccountCurrency?: string;
  resKRWAmt?: string;
  resCancelYN?: string;
  resCancelAmount?: string;
  resHomeForeignType?: string;
  resCardNo?: string;
  resApprovalNo?: string;
  resMemberStoreName?: string;
}

/** 정리한 승인 한 줄(아직 지갑 상태·환율 추정 전) */
export interface NormalizedApproval {
  importKey: string;
  approvedAt: Date;
  /** decimal(소수 끝 0 제거). 취소 줄은 음수 */
  amount: string;
  currency: string;
  krwAmount: number | null;
  merchantName: string;
  overseas: boolean;
  cancelState: CardCancelState;
  partialCancelAmount: string | null;
}

export interface NormalizeResult {
  items: NormalizedApproval[];
  /** 형식이 깨져 버린 줄 수(날짜·금액을 읽을 수 없음). 거절 줄은 세지 않는다 */
  dropped: number;
}

/** importKey를 만드는 함수(서버 HMAC). 입력은 "card-import:v1|…" 원문이고 결과만 밖으로 나간다 */
export type ImportKeyFn = (material: string) => string;

const SCALE = 4;
const AMOUNT = /^-?\d+(\.\d+)?$/;
const DATE = /^(\d{4})(\d{2})(\d{2})$/;
const TIME = /^(\d{2})(\d{2})(\d{2})?$/;
const CURRENCY = /^[A-Z]{3}$/;
const graphemes = new Intl.Segmenter('ko', { granularity: 'grapheme' });

interface ParsedRow {
  index: number;
  approvedAt: Date;
  /** yyyyMMddHHmmss(키 재료) */
  stamp: string;
  /** 부호 포함 scale 4 */
  amount: bigint;
  currency: string;
  krwAmount: number | null;
  cancelYN: string;
  cancelAmount: bigint;
  overseas: boolean;
  cardKey: string;
  /** 승인번호가 없는 줄의 키 재료로만 쓴다(응답에 넣지 않는다) */
  cardLast4: string | null;
  approvalNo: string;
  merchantName: string;
  /** importKey 재료(승인번호 없는 줄만) — 옛 정리 규칙. 응답에 넣지 않는다 */
  merchantKeyMaterial: string;
}

const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

/** "1,234.50" → 12345000n(scale 4). 읽을 수 없으면 null */
function parseAmount(value: unknown): bigint | null {
  const raw = text(value).replace(/[,\s]/g, '');
  if (!AMOUNT.test(raw)) return null;
  try {
    return parseScaled(raw, SCALE);
  } catch {
    // 소수 4자리를 넘는 값
    return null;
  }
}

/** 원화(양수)에 금액 부호를 붙인다 */
const signed = (amount: bigint, krw: number | null) =>
  krw === null ? null : amount < 0n ? -krw : krw;

/** scale 4 → 부호 없이 소수 끝 0을 뺀 decimal("22000", "12.5") */
function formatAmount(value: bigint): string {
  const formatted = formatScaled(value < 0n ? -value : value, SCALE);
  return formatted.replace(/\.?0+$/, '') || '0';
}

/** yyyyMMdd + HHmmss(KST) → Date. 시각이 비면 00:00:00 */
function parseKst(date: string, time: string): Date | null {
  const d = DATE.exec(date);
  const t = TIME.exec(time || '000000');
  if (!d || !t) return null;
  const [, y, mo, da] = d;
  const [, h, mi, s = '00'] = t;
  const result = new Date(`${y}-${mo}-${da}T${h}:${mi}:${s}+09:00`);
  if (Number.isNaN(result.getTime())) return null;
  // 2월 30일처럼 넘어간 날짜는 버린다
  const back = new Date(result.getTime() + 9 * 3_600_000);
  if (back.getUTCDate() !== Number(da)) return null;
  return result;
}

/** 정리 → 40자 자르기(지갑 메모 규칙). 비면 "결제" */
export function merchantNameFor(raw: unknown): string {
  return merchantNameOf(first40(cleanMemo(text(raw))));
}

/**
 * importKey 재료용 가맹점(승인번호 없는 줄만): **옛 정리 규칙 고정**(cleanMemoForImportKeyV1 — 서식 문자를 지우지 않는다).
 * 표시 이름(merchantNameFor)과 정리 규칙이 달라도 키는 예전과 같다
 */
export function merchantKeyMaterialV1(raw: unknown): string {
  // 옛 merchantNameOf와 같다: 정리 → 40자 → 다시 정리, 비면 "결제"
  const value = cleanMemoForImportKeyV1(
    first40(cleanMemoForImportKeyV1(text(raw))),
  );
  return value.length > 0 ? value : MANUAL_DEFAULT_MERCHANT_NAME;
}

/** 보이는 글자(grapheme) 40개까지 */
function first40(cleaned: string): string {
  let out = '';
  let count = 0;
  for (const { segment } of graphemes.segment(cleaned)) {
    if (count >= MANUAL_MEMO_MAX_LENGTH) break;
    out += segment;
    count += 1;
  }
  return out;
}

function parseRow(row: CodefApprovalRow, index: number): ParsedRow | null {
  const date = text(row.resUsedDate);
  const time = text(row.resUsedTime);
  const approvedAt = parseKst(date, time);
  const amount = parseAmount(row.resUsedAmount);
  if (!approvedAt || amount === null || amount === 0n) return null;
  const currencyRaw = text(row.resAccountCurrency).toUpperCase();
  const currency = CURRENCY.test(currencyRaw) ? currencyRaw : 'KRW';
  const krwRaw = parseAmount(row.resKRWAmt);
  const cardNo = text(row.resCardNo);
  const last4 = /(\d{4})$/.exec(cardNo)?.[1] ?? null;
  return {
    index,
    approvedAt,
    stamp: `${date}${(time || '000000').padEnd(6, '0')}`,
    amount,
    currency,
    krwAmount:
      krwRaw !== null && krwRaw !== 0n
        ? krwAmountOf(formatScaled(krwRaw < 0n ? -krwRaw : krwRaw, SCALE))
        : null,
    cancelYN: text(row.resCancelYN),
    cancelAmount: (() => {
      const v = parseAmount(row.resCancelAmount);
      return v === null ? 0n : v < 0n ? -v : v;
    })(),
    overseas: text(row.resHomeForeignType) === '2',
    // 같은 카드 판정: 마스킹 번호 그대로(카드사가 같은 형식으로 준다). 응답에는 넣지 않는다
    cardKey: cardNo,
    cardLast4: last4,
    approvalNo: text(row.resApprovalNo),
    merchantName: merchantNameFor(row.resMemberStoreName),
    merchantKeyMaterial: merchantKeyMaterialV1(row.resMemberStoreName),
  };
}

/**
 * 승인내역 줄 → 화면 줄. 거절("3")은 뺀다.
 * 취소 짝짓기(같은 카드 + 같은 승인번호): 전액 취소면 승인·취소 줄 모두 CANCELLED, 부분 취소면 승인 한 줄로 합쳐 순액 + partialCancelAmount,
 * 원 승인 없는 취소 줄은 ORPHAN_CANCEL. 승인번호가 없는 줄은 짝짓지 않는다.
 * importKey = keyFn("card-import:v1|사용자|기관|승인번호|승인일시|원 승인금액|통화[|카드 끝4|가맹점 — 승인번호가 없을 때]")
 */
export function normalizeApprovals(
  rows: readonly CodefApprovalRow[],
  context: { userId: string; organization: string; keyFn: ImportKeyFn },
): NormalizeResult {
  let dropped = 0;
  const groups = new Map<string, ParsedRow[]>();
  rows.forEach((row, index) => {
    if (text(row.resCancelYN) === '3') return;
    const parsed = parseRow(row, index);
    if (!parsed) {
      dropped += 1;
      return;
    }
    const key = parsed.approvalNo
      ? `${parsed.cardKey}|${parsed.approvalNo}`
      : `#${index}`;
    const group = groups.get(key) ?? [];
    group.push(parsed);
    groups.set(key, group);
  });

  const keyOf = (row: ParsedRow, kind: string) => {
    const parts = [
      'card-import:v1',
      context.userId,
      context.organization,
      row.approvalNo,
      row.stamp,
      formatAmount(row.amount),
      row.currency,
    ];
    if (!row.approvalNo)
      parts.push(row.cardLast4 ?? '', row.merchantKeyMaterial);
    if (kind !== 'APPROVAL') parts.push(kind);
    return context.keyFn(parts.join('|'));
  };
  const item = (
    row: ParsedRow,
    state: CardCancelState,
    kind: string,
    amount: bigint = row.amount,
    partial: bigint | null = null,
  ): NormalizedApproval => ({
    importKey: keyOf(row, kind),
    approvedAt: row.approvedAt,
    // 취소 줄(음수)은 음수로 보인다("−₩58,830"). 승인·부분 취소 순액은 양수
    amount: (amount < 0n ? '-' : '') + formatAmount(amount),
    currency: row.currency,
    krwAmount: signed(
      amount,
      row.currency === 'KRW'
        ? krwAmountOf(formatScaled(amount < 0n ? -amount : amount, SCALE))
        : partial === null
          ? row.krwAmount
          : null,
    ),
    merchantName: row.merchantName,
    overseas: row.overseas,
    cancelState: state,
    partialCancelAmount: partial === null ? null : formatAmount(partial),
  });

  const items: NormalizedApproval[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.approvedAt.getTime() - b.approvedAt.getTime());
    const approvals = group.filter((r) => r.amount > 0n);
    const cancels = group.filter((r) => r.amount < 0n);
    const kindOf = (r: ParsedRow) => (r.amount < 0n ? 'CANCEL' : 'APPROVAL');

    if (group.some((r) => r.cancelYN === '1')) {
      group.forEach((r, i) =>
        items.push(
          item(r, 'CANCELLED', i === 0 ? kindOf(r) : `${kindOf(r)}:${i}`),
        ),
      );
      continue;
    }
    if (approvals.length === 0) {
      cancels.forEach((r, i) =>
        items.push(
          item(r, 'ORPHAN_CANCEL', i === 0 ? 'CANCEL' : `CANCEL:${i}`),
        ),
      );
      continue;
    }
    const [base, ...extra] = approvals;
    // 취소 줄 합계와 승인 줄의 취소액(부분취소 표시)이 같은 취소를 두 번 말할 수 있어 큰 쪽을 쓴다
    const fromRows = cancels.reduce((sum, r) => sum - r.amount, 0n);
    const fromBase = base.cancelYN === '2' ? base.cancelAmount : 0n;
    const cancelled = fromRows > fromBase ? fromRows : fromBase;
    if (cancelled >= base.amount) {
      items.push(item(base, 'CANCELLED', 'APPROVAL'));
      cancels.forEach((r, i) =>
        items.push(item(r, 'CANCELLED', `CANCEL:${i}`)),
      );
    } else if (cancelled > 0n) {
      items.push(
        item(base, 'PARTIAL', 'APPROVAL', base.amount - cancelled, cancelled),
      );
    } else {
      // 부분 취소 표시인데 취소액을 모르면 금액은 그대로 두고 PARTIAL만 알린다
      items.push(
        base.cancelYN === '2'
          ? { ...item(base, 'PARTIAL', 'APPROVAL'), partialCancelAmount: null }
          : item(base, 'NONE', 'APPROVAL'),
      );
    }
    // 같은 승인번호의 다른 승인 줄(드묾)은 따로 보인다
    extra.forEach((r, i) => items.push(item(r, 'NONE', `APPROVAL:${i + 1}`)));
  }
  items.sort((a, b) => b.approvedAt.getTime() - a.approvedAt.getTime());
  return { items, dropped };
}

/** CODEF data(한 건이면 객체, 여러 건이면 배열 — 출력부 안내) → 배열 */
export function approvalRowsOf(data: unknown): CodefApprovalRow[] {
  if (Array.isArray(data)) {
    return data.filter(
      (r): r is CodefApprovalRow => typeof r === 'object' && r !== null,
    );
  }
  if (typeof data === 'object' && data !== null) {
    // 빈 객체(내역 없음)는 0건
    return Object.keys(data).length > 0 ? [data as CodefApprovalRow] : [];
  }
  return [];
}
