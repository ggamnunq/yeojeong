import { useState } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '../../app/paths'
import { BottomSheet, ListItem, type IconName } from '../../ds'
import { startFlowState } from '../card-import/flow'
import { useCardImportEnabled } from '../card-import/hooks'
import { COPY } from './copy'
import { useFileImportProviders } from './hooks'
import { PROVIDERS } from './providers'

// HF-65 "내역 불러오기" 시트: 지갑(HF-49) 헤더 "불러오기" · 빈 상태(HF-49b) "내역 불러오기"가 연다.
// 행: 카드 내역 불러오기(features.cardImport) · 위챗페이 · 알리페이 파일 가져오기(features.fileImportProviders에 있는 공급자만, PROVIDERS 순서).
// 켜진 줄이 하나뿐이면 시트 없이 바로 그 흐름으로 간다.

type Option = { key: string; title: string; icon: IconName; go: () => void }

export function useImportEntry() {
  const navigate = useNavigate()
  const card = useCardImportEnabled()
  const fileProviders = useFileImportProviders()
  const [open, setOpen] = useState(false)

  const options: Option[] = []
  if (card) options.push({ key: 'card', title: COPY.menuCard, icon: 'card', go: () => navigate(paths.walletImport(), { state: startFlowState() }) })
  for (const info of Object.values(PROVIDERS)) {
    if (fileProviders.includes(info.provider)) {
      options.push({ key: info.slug, title: info.title, icon: 'file', go: () => navigate(paths.walletFileImport(info.slug), { state: { fromWallet: true } }) })
    }
  }

  const start = () => {
    if (options.length === 1) options[0].go()
    else if (options.length > 1) setOpen(true)
  }

  const sheet = (
    <BottomSheet open={open} title={COPY.menuTitle} onClose={() => setOpen(false)}>
      {/* ListItem이 자체 좌우 20을 가져 시트 본문 여백을 상쇄한다(아이콘이 제목과 같은 선) */}
      <ul className="-mx-5 flex flex-col pb-2">
        {options.map((option) => (
          <li key={option.key}>
            <ListItem
              title={option.title}
              leadingIcon={option.icon}
              onClick={() => {
                setOpen(false)
                option.go()
              }}
            />
          </li>
        ))}
      </ul>
    </BottomSheet>
  )

  return { available: options.length > 0, start, sheet }
}
