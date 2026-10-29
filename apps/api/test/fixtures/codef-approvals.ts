import type { CodefApprovalRow } from '../../src/card-import/approval-normalizer.js';

// CODEF 개인 카드 승인내역(KR_CD_P_002) 테스트 fixture. 실제 네트워크 호출 없이 이 값으로 HTTP를 흉내 낸다.
// - SANDBOX_APPROVAL_RESPONSE: 샌드박스(sandbox.codef.io)가 입력과 무관하게 돌려주는 고정 응답의 형태(값은 샌드박스가 마스킹해 준다).
//   connectedId는 자리표시자로 바꿨다. 결과가 한 건이면 data가 객체다.
// - DOC_SAMPLE_ROW: 공식 문서 출력 예시(admin.codef.io/dev-guide-menu/sample/KR_CD_P_002/out)의 값. 카드번호·승인번호는 문서 예시 값이다.
// 그 밖의 줄은 출력부 안내(취소 표시 resCancelYN, KB 음수 취소 전표, 해외 resKRWAmt)를 바탕으로 만든 가짜 값이다.

export const SANDBOX_APPROVAL_RESPONSE = {
  result: {
    code: 'CF-00000',
    extraMessage: '',
    message: '성공',
    transactionId: 'sandbox-fixed-transaction',
  },
  data: {
    resUsedDate: '********',
    resUsedTime: '********',
    resCardNo: '****',
    resCardNo1: '',
    resMemberStoreName: '********',
    resUsedAmount: '****',
    resPaymentType: '1',
    resInstallmentMonth: '',
    resApprovalNo: '****',
    resPaymentDueDate: '',
    resMemberStoreCorpNo: '',
    resMemberStoreType: '',
    resMemberStoreAddr: '',
    resMemberStoreTelNo: '',
    resAccountCurrency: 'KRW',
    resHomeForeignType: '1',
    resCancelYN: '0',
    resCancelAmount: '',
    resVAT: '',
    resCashBack: '',
    resKRWAmt: '',
    resMemberStoreNo: '********',
    resCardName: '',
    commStartDate: '********',
    commEndDate: '********',
  },
  connectedId: 'sandbox-connected-id-placeholder',
};

/** 공식 문서 출력 예시 한 줄 */
export const DOC_SAMPLE_ROW: CodefApprovalRow & Record<string, string> = {
  resUsedDate: '20190620',
  resUsedTime: '120117',
  resCardNo: '5361481234560000',
  resCardNo1: '',
  resCardName: '',
  resMemberStoreName: '온라인예매',
  resUsedAmount: '22000',
  resPaymentType: '1',
  resInstallmentMonth: '',
  resAccountCurrency: 'KRW',
  resApprovalNo: '69331111',
  resPaymentDueDate: '',
  resHomeForeignType: '1',
  resMemberStoreCorpNo: '',
  resMemberStoreType: '',
  resMemberStoreTelNo: '',
  resMemberStoreAddr: '서울시 어딘가 123',
  resMemberStoreNo: '158364905|Rz1Ag6pRqgU9CbCtWaIWFw==',
  resCancelYN: '0',
  resCancelAmount: '',
  resVAT: '',
  resCashBack: '',
  resKRWAmt: '',
  commStartDate: '20200208',
  commEndDate: '20200211',
  commSession: '',
};

const row = (over: CodefApprovalRow): CodefApprovalRow => ({
  resCardNo: '1234********1934',
  resAccountCurrency: 'KRW',
  resHomeForeignType: '1',
  resCancelYN: '0',
  resCancelAmount: '',
  resKRWAmt: '',
  ...over,
});

/** 여러 경우를 섞은 응답 data(여러 건이면 배열) */
export function mixedRows(day: string): CodefApprovalRow[] {
  const d = day.replaceAll('-', '');
  return [
    // 해외 승인(엔화) + 카드사 원화
    row({
      resUsedDate: d,
      resUsedTime: '141000',
      resUsedAmount: '2860',
      resAccountCurrency: 'JPY',
      resHomeForeignType: '2',
      resKRWAmt: '26,290',
      resApprovalNo: 'A0001',
      resMemberStoreName: '  이치란 라멘\n도톤보리점 ',
    }),
    // 전액 취소(원 승인 줄에 취소 표시)
    row({
      resUsedDate: d,
      resUsedTime: '120000',
      resUsedAmount: '15000',
      resApprovalNo: 'A0002',
      resCancelYN: '1',
      resMemberStoreName: '편의점',
    }),
    // 부분 취소(KB식 음수 취소 전표 줄)
    row({
      resUsedDate: d,
      resUsedTime: '100000',
      resUsedAmount: '30000',
      resApprovalNo: 'A0003',
      resMemberStoreName: '면세점',
    }),
    row({
      resUsedDate: d,
      resUsedTime: '110000',
      resUsedAmount: '-12000',
      resApprovalNo: 'A0003',
      resMemberStoreName: '면세점',
    }),
    // 원 승인이 기간 밖인 취소 줄
    row({
      resUsedDate: d,
      resUsedTime: '090000',
      resUsedAmount: '-5000',
      resApprovalNo: 'A0099',
      resMemberStoreName: '카페',
    }),
    // 거절(빼야 한다)
    row({
      resUsedDate: d,
      resUsedTime: '080000',
      resUsedAmount: '9900',
      resApprovalNo: 'A0004',
      resCancelYN: '3',
      resMemberStoreName: '거절된 가맹점',
    }),
  ];
}
