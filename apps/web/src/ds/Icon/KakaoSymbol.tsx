import type { ImgHTMLAttributes } from 'react'
// 카카오 공식 로그인 버튼 리소스(developers.kakao.com/tool/resource/login)에서 가져온 심볼.
// Figma Brand/KakaoSymbol은 이미지(PNG 192px)라 벡터로 내보낼 수 없어 원본 PNG를 data URI로 싣는다.
import kakaoSymbol from './kakao-symbol.png?inline'

export type KakaoSymbolProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width' | 'height'> & {
  size?: 16 | 20 | 24
}

export function KakaoSymbol({ size = 24, alt = '', ...rest }: KakaoSymbolProps) {
  return <img src={kakaoSymbol} width={size} height={size} alt={alt} draggable={false} {...rest} />
}
