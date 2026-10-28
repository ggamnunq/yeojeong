/**
 * 공동 결제를 부담 인원으로 나눈다(docs/spec 용어: perPersonKrw · remainderKrw).
 * 1인 = 금액 ÷ 인원을 원 단위로 내림, 나머지는 결제자가 부담한다("결제자 +N원").
 * 예: 26,290 ÷ 4 → 1인 6,572 · 나머지 2
 */
export function splitEvenly(amount: number, count: number) {
  const won = Math.round(amount)
  if (count <= 0) return { perPerson: 0, remainder: 0 }
  const perPerson = Math.floor(won / count)
  return { perPerson, remainder: won - perPerson * count }
}

type ConsentCheck = { checked: boolean; required?: boolean }

/** 전체 동의 체크 = 행이 하나 이상이고 모두 체크(SheetContent/Consent) */
export const consentAllChecked = (items: readonly ConsentCheck[]) => items.length > 0 && items.every((i) => i.checked)

/** CTA 활성 = 행이 하나 이상이고 필수(required 기본 true) 행이 모두 체크 */
export const consentRequiredDone = (items: readonly ConsentCheck[]) =>
  items.length > 0 && items.every((i) => i.checked || i.required === false)
