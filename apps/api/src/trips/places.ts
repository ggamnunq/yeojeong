import type { Place } from '@yeojeong/shared';

// 여정 만들기(WF-10) 장소 목록. 통화는 사용자가 고르지 않고 국가로 정한다(FR-201).
// 국가 표는 통화 판정의 기준이라 목록에 없는 도시도 국가만 맞으면 만들 수 있다.

interface Country {
  name: string;
  /** ISO 4217 */
  currency: string;
}

export const COUNTRIES: Readonly<Record<string, Country>> = {
  KR: { name: '대한민국', currency: 'KRW' },
  JP: { name: '일본', currency: 'JPY' },
  CN: { name: '중국', currency: 'CNY' },
  TW: { name: '대만', currency: 'TWD' },
  HK: { name: '홍콩', currency: 'HKD' },
  MO: { name: '마카오', currency: 'MOP' },
  MN: { name: '몽골', currency: 'MNT' },
  VN: { name: '베트남', currency: 'VND' },
  TH: { name: '태국', currency: 'THB' },
  PH: { name: '필리핀', currency: 'PHP' },
  SG: { name: '싱가포르', currency: 'SGD' },
  MY: { name: '말레이시아', currency: 'MYR' },
  ID: { name: '인도네시아', currency: 'IDR' },
  KH: { name: '캄보디아', currency: 'KHR' },
  LA: { name: '라오스', currency: 'LAK' },
  IN: { name: '인도', currency: 'INR' },
  NP: { name: '네팔', currency: 'NPR' },
  MV: { name: '몰디브', currency: 'MVR' },
  AE: { name: '아랍에미리트', currency: 'AED' },
  TR: { name: '튀르키예', currency: 'TRY' },
  US: { name: '미국', currency: 'USD' },
  GU: { name: '괌', currency: 'USD' },
  MP: { name: '사이판', currency: 'USD' },
  CA: { name: '캐나다', currency: 'CAD' },
  MX: { name: '멕시코', currency: 'MXN' },
  AU: { name: '호주', currency: 'AUD' },
  NZ: { name: '뉴질랜드', currency: 'NZD' },
  GB: { name: '영국', currency: 'GBP' },
  FR: { name: '프랑스', currency: 'EUR' },
  DE: { name: '독일', currency: 'EUR' },
  IT: { name: '이탈리아', currency: 'EUR' },
  ES: { name: '스페인', currency: 'EUR' },
  PT: { name: '포르투갈', currency: 'EUR' },
  NL: { name: '네덜란드', currency: 'EUR' },
  AT: { name: '오스트리아', currency: 'EUR' },
  GR: { name: '그리스', currency: 'EUR' },
  CZ: { name: '체코', currency: 'CZK' },
  HU: { name: '헝가리', currency: 'HUF' },
  HR: { name: '크로아티아', currency: 'EUR' },
  CH: { name: '스위스', currency: 'CHF' },
  DK: { name: '덴마크', currency: 'DKK' },
  NO: { name: '노르웨이', currency: 'NOK' },
  SE: { name: '스웨덴', currency: 'SEK' },
  FI: { name: '핀란드', currency: 'EUR' },
  IS: { name: '아이슬란드', currency: 'ISK' },
  EG: { name: '이집트', currency: 'EGP' },
};

/** 국가 → 통화. 표에 없는 국가면 null(여정을 만들 수 없다) */
export function currencyOf(countryCode: string): string | null {
  return COUNTRIES[countryCode]?.currency ?? null;
}

// [국가, 도시] — 도시가 null이면 국가 전체
const CITIES: readonly (readonly [string, string | null])[] = [
  ['KR', '서울'],
  ['KR', '부산'],
  ['KR', '제주'],
  ['KR', '강릉'],
  ['KR', '속초'],
  ['KR', '여수'],
  ['KR', '경주'],
  ['KR', '전주'],
  ['KR', '통영'],
  ['KR', '인천'],
  ['KR', '대구'],
  ['KR', '광주'],
  ['KR', '대전'],
  ['KR', '포항'],
  ['KR', '가평'],
  ['KR', '남해'],
  ['JP', null],
  ['JP', '도쿄'],
  ['JP', '오사카'],
  ['JP', '교토'],
  ['JP', '후쿠오카'],
  ['JP', '삿포로'],
  ['JP', '오키나와'],
  ['JP', '나고야'],
  ['JP', '요코하마'],
  ['JP', '고베'],
  ['JP', '나라'],
  ['JP', '히로시마'],
  ['JP', '마쓰야마'],
  ['JP', '가고시마'],
  ['CN', '상하이'],
  ['CN', '베이징'],
  ['CN', '칭다오'],
  ['CN', '장자제'],
  ['TW', '타이베이'],
  ['TW', '가오슝'],
  ['TW', '타이중'],
  ['HK', null],
  ['MO', null],
  ['MN', '울란바토르'],
  ['VN', '다낭'],
  ['VN', '하노이'],
  ['VN', '호치민'],
  ['VN', '나트랑'],
  ['VN', '푸꾸옥'],
  ['VN', '달랏'],
  ['TH', '방콕'],
  ['TH', '치앙마이'],
  ['TH', '푸켓'],
  ['TH', '파타야'],
  ['PH', '세부'],
  ['PH', '보라카이'],
  ['PH', '보홀'],
  ['PH', '마닐라'],
  ['SG', null],
  ['MY', '쿠알라룸푸르'],
  ['MY', '코타키나발루'],
  ['MY', '페낭'],
  ['ID', '발리'],
  ['ID', '자카르타'],
  ['KH', '씨엠립'],
  ['LA', '비엔티안'],
  ['LA', '루앙프라방'],
  ['IN', '뉴델리'],
  ['NP', '카트만두'],
  ['MV', null],
  ['AE', '두바이'],
  ['TR', '이스탄불'],
  ['US', '뉴욕'],
  ['US', '로스앤젤레스'],
  ['US', '샌프란시스코'],
  ['US', '라스베이거스'],
  ['US', '하와이'],
  ['GU', null],
  ['MP', null],
  ['CA', '밴쿠버'],
  ['CA', '토론토'],
  ['MX', '칸쿤'],
  ['AU', '시드니'],
  ['AU', '멜버른'],
  ['NZ', '오클랜드'],
  ['GB', '런던'],
  ['FR', '파리'],
  ['FR', '니스'],
  ['DE', '베를린'],
  ['DE', '뮌헨'],
  ['IT', '로마'],
  ['IT', '피렌체'],
  ['IT', '베네치아'],
  ['IT', '밀라노'],
  ['ES', '바르셀로나'],
  ['ES', '마드리드'],
  ['PT', '리스본'],
  ['PT', '포르투'],
  ['NL', '암스테르담'],
  ['AT', '빈'],
  ['GR', '아테네'],
  ['CZ', '프라하'],
  ['HU', '부다페스트'],
  ['HR', '두브로브니크'],
  ['CH', '인터라켄'],
  ['CH', '취리히'],
  ['DK', '코펜하겐'],
  ['NO', '오슬로'],
  ['SE', '스톡홀름'],
  ['FI', '헬싱키'],
  ['IS', '레이캬비크'],
  ['EG', '카이로'],
];

export const PLACES: readonly Place[] = CITIES.map(([countryCode, city]) => {
  const country = COUNTRIES[countryCode];
  // 국내와 도시 국가는 도시 이름만, 해외는 "국가 도시"
  const label =
    city === null
      ? country.name
      : countryCode === 'KR'
        ? city
        : `${country.name} ${city}`;
  return {
    countryCode,
    countryName: country.name,
    city,
    label,
    currency: country.currency,
  };
});

export const PLACE_SEARCH_LIMIT = 20;

/** 이름(국가·도시·표시 이름) 부분 일치. 검색어가 비면 앞에서부터 */
export function searchPlaces(query: string | undefined): Place[] {
  const q = (query ?? '').replace(/\s+/g, '').toLowerCase();
  const matched = q
    ? PLACES.filter((place) =>
        [place.label, place.countryName, place.city ?? '', place.countryCode]
          .map((s) => s.replace(/\s+/g, '').toLowerCase())
          .some((s) => s.includes(q)),
      )
    : PLACES;
  return matched.slice(0, PLACE_SEARCH_LIMIT);
}
