import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { BottomSheet, Input, ListItem } from '../../../ds'
import { placesQuery } from '../api'
import { useDebouncedValue } from '../hooks'
import type { Place, PlaceInput } from '../types'

// 장소 검색 시트(화면명세 부록 C-8): 검색 Input + 결과 ListItem(도시명 / 국가명). 고르면 닫고 입력란을 채운다. 자유 입력은 없다.
export type PlaceSheetProps = {
  open: boolean
  selected: PlaceInput | null
  /** currency: 고른 장소의 통화(만들기 요청의 currency로 보낸다) */
  onSelect: (place: PlaceInput, currency: string) => void
  onClose: () => void
}

export function PlaceSheet({ open, selected, onSelect, onClose }: PlaceSheetProps) {
  return (
    <BottomSheet open={open} title="장소" onClose={onClose}>
      {open && <PlaceSearch selected={selected} onSelect={onSelect} />}
    </BottomSheet>
  )
}

const isSelected = (place: Place, selected: PlaceInput | null) =>
  selected !== null && place.countryCode === selected.countryCode && place.label === selected.label

function PlaceSearch({ selected, onSelect }: Pick<PlaceSheetProps, 'selected' | 'onSelect'>) {
  const [query, setQuery] = useState('')
  const term = useDebouncedValue(query.trim(), 200)
  const places = useQuery({ ...placesQuery(term), placeholderData: keepPreviousData })
  const items = places.data ?? []

  return (
    <div className="flex flex-col gap-2">
      <Input
        label="도시 검색"
        className="[&>label]:sr-only"
        type="search"
        placeholder="도시 검색"
        enterKeyHint="search"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onClear={() => setQuery('')}
      />
      {places.isSuccess && items.length === 0 ? (
        <p role="status" className="py-6 text-center text-body-s text-tertiary">
          검색 결과가 없어요
        </p>
      ) : (
        <ul aria-busy={places.isFetching} className="-mx-5">
          {items.map((place) => (
            <li key={`${place.countryCode}-${place.label}`}>
              <ListItem
                type={isSelected(place, selected) ? 'selected' : 'value'}
                title={place.city ?? place.label}
                subtitle={place.countryName}
                onClick={() => onSelect({ countryCode: place.countryCode, city: place.city, label: place.label }, place.currency)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
