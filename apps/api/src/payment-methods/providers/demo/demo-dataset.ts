import { toKrw, type PaymentMethodType, type TxKind } from '@yeojeong/shared';

// DEMO 어댑터의 샘플 데이터(docs/design/wireframes/screens.md "샘플 데이터 정의").
// 오사카 3박 4일: 준용(나·그룹장)·민지·태현·수빈. 날짜는 여정 시작일(D1 = dayOffset 0) 기준 상대값이라
// 어떤 날짜의 여정에도 맞춰 돌려줄 수 있다. 환율은 샘플과 같은 9.192원/엔(10원 반올림).
//
// 엣지 시나리오(기능명세 FR-405~408):
// - 준용의 토스뱅크 체크카드 결제는 연결된 토스뱅크 통장에도 원화 출금으로 한 번 더 잡힌다(동일 사용자 중복 제거)
// - 태현의 오사카 주유패스 결제와 같은 날 전액 취소(환불 묶음, 원 승인 ref 있음)
// - 수빈 10:30 · 민지 10:31 오사카성 천수각 ¥4,800(멤버 간 중복 의심, 둘 다 공동이 될 때)
// - 준용의 여정 전 결제 4건(아고다·제주항공·KKday·장기주차 — 기간 외 결제 후보, 11.11 23:50 경계 포함)

export const DEMO_JPY_RATE = '9.192';
/** 사용자에게 여정이 하나도 없을 때 쓰는 기준일(샘플 여정 시작일) */
export const DEMO_DEFAULT_ANCHOR = '2026-11-12';

export type DemoPersona = 'junyong' | 'minji' | 'taehyun' | 'subin';
export const DEMO_PERSONAS: readonly DemoPersona[] = [
  'junyong',
  'minji',
  'taehyun',
  'subin',
];
export const DEMO_PERSONA_BY_NICKNAME: Record<string, DemoPersona> = {
  준용: 'junyong',
  민지: 'minji',
  태현: 'taehyun',
  수빈: 'subin',
};

export interface DemoMethod {
  key: string;
  type: PaymentMethodType;
  institutionName: string;
  productName: string;
  maskedNumber: string;
  /** 체크카드가 출금하는 계좌의 key */
  linkedAccountKey?: string;
}

export interface DemoTransaction {
  key: string;
  methodKey: string;
  kind: TxKind;
  dayOffset: number;
  /** KST "HH:mm[:ss]" */
  time: string;
  merchantName: string;
  amount: string;
  currency: string;
  /** 취소가 가리키는 원 거래 key */
  approvalOfKey?: string;
  /** 체크카드 결제를 이 계좌에서 원화 출금으로 한 번 더 돌려준다 */
  mirrorToAccountKey?: string;
}

const TOSS_ACCOUNT: DemoMethod = {
  key: 'tossbank-account',
  type: 'ACCOUNT',
  institutionName: '토스뱅크',
  productName: '토스뱅크 통장',
  maskedNumber: '1000-12**-**21',
};

export const DEMO_METHODS: Record<DemoPersona, DemoMethod[]> = {
  junyong: [
    TOSS_ACCOUNT,
    {
      key: 'tossbank-check',
      type: 'CARD',
      institutionName: '토스뱅크',
      productName: '토스뱅크 체크카드',
      maskedNumber: '5365-****-****-1934',
      linkedAccountKey: TOSS_ACCOUNT.key,
    },
    {
      key: 'shinhan-card',
      type: 'CARD',
      institutionName: '신한카드',
      productName: '신한카드 Deep Dream',
      maskedNumber: '4518-****-****-1102',
    },
    {
      key: 'kakaobank-safebox',
      type: 'ACCOUNT',
      institutionName: '카카오뱅크',
      productName: '카카오뱅크 세이프박스',
      maskedNumber: '3333-**-****821',
    },
  ],
  minji: [
    {
      key: 'hyundai-card',
      type: 'CARD',
      institutionName: '현대카드',
      productName: '현대카드 ZERO',
      maskedNumber: '4321-****-****-5521',
    },
    {
      key: 'kakaobank-account',
      type: 'ACCOUNT',
      institutionName: '카카오뱅크',
      productName: '카카오뱅크 통장',
      maskedNumber: '3333-**-****104',
    },
  ],
  taehyun: [
    {
      key: 'samsung-card',
      type: 'CARD',
      institutionName: '삼성카드',
      productName: '삼성카드 taptap O',
      maskedNumber: '5310-****-****-7742',
    },
  ],
  subin: [
    {
      key: 'woori-card',
      type: 'CARD',
      institutionName: '우리카드',
      productName: '우리카드 카드의정석',
      maskedNumber: '9410-****-****-2290',
    },
  ],
};

const jpy = (amount: string) => ({ amount, currency: 'JPY' });
const krw = (amount: string) => ({ amount, currency: 'KRW' });

export const DEMO_TRANSACTIONS: Record<DemoPersona, DemoTransaction[]> = {
  junyong: [
    // 여정 전(기간 외 후보, WF-43)
    { key: 'agoda', methodKey: 'shinhan-card', kind: 'APPROVAL', dayOffset: -23, time: '10:12', merchantName: '아고다', ...krw('486000') },
    { key: 'jejuair', methodKey: 'shinhan-card', kind: 'APPROVAL', dayOffset: -10, time: '21:40', merchantName: '제주항공 4매', ...krw('1032400') },
    { key: 'kkday', methodKey: 'shinhan-card', kind: 'APPROVAL', dayOffset: -2, time: '15:30', merchantName: 'KKday', ...krw('412800') },
    { key: 'parking', methodKey: 'shinhan-card', kind: 'APPROVAL', dayOffset: -1, time: '23:50', merchantName: '인천공항 장기주차', ...krw('36000') },
    // 기간 내
    { key: 'ichiran', methodKey: 'tossbank-check', kind: 'APPROVAL', dayOffset: 0, time: '13:05', merchantName: '이치란 라멘 도톤보리점', ...jpy('3960'), mirrorToAccountKey: TOSS_ACCOUNT.key },
    { key: 'donki', methodKey: 'shinhan-card', kind: 'APPROVAL', dayOffset: 0, time: '17:40', merchantName: '돈키호테 도톤보리점', ...jpy('8640') },
    { key: 'familymart', methodKey: 'tossbank-check', kind: 'APPROVAL', dayOffset: 1, time: '08:50', merchantName: '패밀리마트 난바역점', ...jpy('1280'), mirrorToAccountKey: TOSS_ACCOUNT.key },
    { key: 'mktaxi', methodKey: 'tossbank-check', kind: 'APPROVAL', dayOffset: 1, time: '14:10', merchantName: 'MK택시', ...jpy('2860'), mirrorToAccountKey: TOSS_ACCOUNT.key },
    { key: 'horai', methodKey: 'tossbank-check', kind: 'APPROVAL', dayOffset: 1, time: '18:20', merchantName: '551 호라이 난바본점', ...jpy('2800'), mirrorToAccountKey: TOSS_ACCOUNT.key },
    { key: 'yakiniku', methodKey: 'shinhan-card', kind: 'APPROVAL', dayOffset: 2, time: '19:10', merchantName: '야키니쿠 와규 이치 난바점', ...jpy('24800') },
  ],
  minji: [
    { key: 'rapit', methodKey: 'hyundai-card', kind: 'APPROVAL', dayOffset: 0, time: '11:20', merchantName: '난카이 라피트 간사이공항역', ...jpy('5960') },
    { key: 'osakajo', methodKey: 'hyundai-card', kind: 'APPROVAL', dayOffset: 1, time: '10:31', merchantName: '오사카성 천수각', ...jpy('4800') },
    { key: 'umeda', methodKey: 'hyundai-card', kind: 'APPROVAL', dayOffset: 1, time: '16:40', merchantName: '우메다 스카이빌딩 공중정원', ...jpy('8000') },
    { key: 'botejyu', methodKey: 'hyundai-card', kind: 'APPROVAL', dayOffset: 3, time: '12:10', merchantName: '간사이공항 보테쥬', ...jpy('6380') },
  ],
  taehyun: [
    { key: 'kushikatsu', methodKey: 'samsung-card', kind: 'APPROVAL', dayOffset: 0, time: '19:30', merchantName: '쿠시카츠 다루마 신세카이점', ...jpy('12800') },
    { key: 'amazingpass', methodKey: 'samsung-card', kind: 'APPROVAL', dayOffset: 2, time: '09:40', merchantName: '오사카 주유패스 4매', ...jpy('13200') },
    { key: 'amazingpass-cancel', methodKey: 'samsung-card', kind: 'CANCEL', dayOffset: 2, time: '12:15', merchantName: '오사카 주유패스 4매', ...jpy('13200'), approvalOfKey: 'amazingpass' },
    { key: 'harukas', methodKey: 'samsung-card', kind: 'APPROVAL', dayOffset: 2, time: '15:00', merchantName: '아베노 하루카스 300', ...jpy('8000') },
  ],
  subin: [
    { key: 'osakajo', methodKey: 'woori-card', kind: 'APPROVAL', dayOffset: 1, time: '10:30', merchantName: '오사카성 천수각', ...jpy('4800') },
    { key: 'kuromon', methodKey: 'woori-card', kind: 'APPROVAL', dayOffset: 2, time: '12:30', merchantName: '쿠로몬 시장', ...jpy('9600') },
  ],
};

/** 샘플 원화: 엔은 9.192원/엔 10원 반올림, 원화는 그대로 */
export function demoKrwAmount(amount: string, currency: string): number {
  return currency === 'KRW' ? Number(amount) : toKrw(amount, DEMO_JPY_RATE);
}
