import type { ComponentType } from 'react'

// *.catalog.tsx 파일이 default로 내보내는 값. main.tsx가 import.meta.glob으로 모아 한 페이지에 그린다.
export type CatalogEntry = {
  /** Figma 컴포넌트(세트) 이름 그대로 */
  title: string
  /** Figma 노드 ID (components.json) */
  figma?: string
  group: 'foundations' | 'components'
  /** 같은 그룹 안 정렬 순서. 없으면 이름순으로 뒤에 붙는다. */
  order?: number
  Demo: ComponentType
}

export const defineCatalog = (entry: CatalogEntry) => entry
