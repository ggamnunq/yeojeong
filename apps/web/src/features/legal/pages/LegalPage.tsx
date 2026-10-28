import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router'
import { paths } from '../../../app/paths'
import { ErrorScreen, LoadingScreen, NotFoundScreen } from '../../../app/states'
import { ShellSub } from '../../../ds'
import { CONSENT_TITLES, docForPath, LEGAL_DOCS, resolveLegalLink } from '../docs'
import { Markdown } from '../markdown'

const contents = import.meta.glob<string>('../content/*.md', { query: '?raw', import: 'default' })

/** 공개 문서(FR-903, 부록 C-7): ShellSub(‹ + 문서명) + 마크다운 본문. 로그인 없이 열린다 */
export default function LegalPage() {
  const { consentId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const id = docForPath(location.pathname, consentId)
  const doc = id ? LEGAL_DOCS[id] : null
  const load = doc ? contents[`../content/${doc.file}`] : undefined

  const content = useQuery({
    queryKey: ['legal', doc?.file],
    queryFn: () => load!(),
    enabled: Boolean(load),
    staleTime: Infinity,
    meta: { silent: true },
  })

  if (!doc || !load) return <NotFoundScreen />
  const title = (consentId && CONSENT_TITLES[consentId as keyof typeof CONSENT_TITLES]) || doc.title
  // 바로 열었으면(이전 기록 없음) 뒤로 = 처음으로
  const onBack = () => (location.key === 'default' ? navigate(paths.splash()) : navigate(-1))

  return (
    <ShellSub header={{ title, onBack }}>
      {content.isPending ? (
        <LoadingScreen inset />
      ) : content.error ? (
        <ErrorScreen error={content.error} onRetry={() => void content.refetch()} />
      ) : (
        <Markdown source={content.data ?? ''} resolveLink={resolveLegalLink} />
      )}
    </ShellSub>
  )
}
