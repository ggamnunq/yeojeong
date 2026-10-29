import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { paths } from '../../../app/paths'
import { ErrorScreen, LoadingScreen, NotFoundScreen } from '../../../app/states'
import { Callout, Icon, ShellSub } from '../../../ds'
import { focusRing } from '../../../ds/styles'
import { CONSENT_TITLES, docForPath, LEGAL_DOCS, resolveLegalLink } from '../docs'
import { LegalBody } from '../markdown'
import { releaseCompanions, resolveLegalVersion, versionLinkLabel, versionNotice } from '../versions'

const contents = import.meta.glob<string>('../content/**/*.md', { query: '?raw', import: 'default' })

/**
 * 공개 문서(FR-903, 부록 C-7): ShellSub(‹ + 문서명) + 조문 구조 본문. 로그인 없이 열린다.
 * 판이 여럿인 문서는 지금 시각의 현행 판을 보여 주고, ?v=<버전>으로 이전·예정 판을 연다(versions.ts).
 */
export default function LegalPage() {
  const { consentId } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const id = docForPath(location.pathname, consentId)
  const doc = id ? LEGAL_DOCS[id] : null
  const resolved = doc ? resolveLegalVersion(doc.file, search.get('v')) : null
  // 판이 없는 안내 문서(준비 중 등)는 content/ 바로 아래
  const path = resolved?.shown.path ?? doc?.file
  const load = path ? contents[`../content/${path}`] : undefined

  const content = useQuery({
    queryKey: ['legal', path],
    queryFn: () => load!(),
    enabled: Boolean(load),
    staleTime: Infinity,
    meta: { silent: true },
  })

  if (!doc || !load) return <NotFoundScreen />
  const title = (consentId && CONSENT_TITLES[consentId as keyof typeof CONSENT_TITLES]) || doc.title
  // 바로 열었으면(이전 기록 없음) 뒤로 = 처음으로
  const onBack = () => (location.key === 'default' ? navigate(paths.splash()) : navigate(-1))
  const notice = resolved && versionNotice(resolved.shown)
  const others = resolved?.versions.filter((v) => v.version !== resolved.shown.version) ?? []
  // ?v=로 판을 골라 온 화면(개정 공지 링크 등): 같은 판에서 함께 바뀐 문서를 안내한다
  const companions = resolved && search.get('v') !== null ? releaseCompanions(resolved.shown.path, doc.file) : null
  const companionDocs = (companions?.docs ?? []).flatMap((c) => {
    const target = Object.values(LEGAL_DOCS).find((d) => d.file === c.file)
    return target ? [{ ...c, title: target.title, href: `${target.path}?v=${encodeURIComponent(c.version)}` }] : []
  })
  // 현행 판 주소에는 ?v를 붙이지 않는다
  const hrefOf = (version: string) =>
    version === resolved?.current.version ? location.pathname : `${location.pathname}?v=${encodeURIComponent(version)}`

  return (
    <ShellSub header={{ title, onBack }}>
      {content.isPending ? (
        <LoadingScreen inset />
      ) : content.error ? (
        <ErrorScreen error={content.error} onRetry={() => void content.refetch()} />
      ) : (
        <>
          {notice && resolved && (
            <Callout
              tone="info"
              style="tone"
              className="mb-6"
              label={notice}
              aria-label={`${notice} · 현행 버전 보기`}
              onClick={() => void navigate(hrefOf(resolved.current.version))}
            />
          )}
          {companionDocs.length > 0 && (
            <section aria-label="함께 바뀐 문서" className="mb-6 flex flex-col gap-1 rounded-md bg-subtle px-4 py-3">
              {companions?.note && <p className="text-body-s text-primary">{companions.note}</p>}
              <ul className="flex flex-col">
                {companionDocs.map((c) => (
                  <li key={c.file}>
                    <Link
                      to={c.href}
                      className={clsx('flex items-center gap-0.5 rounded-sm py-1 text-caption text-tertiary', focusRing)}
                    >
                      {c.title} {c.version}({c.effectiveDate}부터)
                      <Icon name="chevron-right" size={16} className="text-icon-subtle" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <LegalBody source={content.data ?? ''} resolveLink={resolveLegalLink} emphasis={doc.consent ? 'consent' : 'default'} />
          {others.length > 0 && resolved && (
            <nav aria-label="다른 버전" className="-mt-6 flex flex-col items-start pb-10">
              {others.map((v) => (
                <Link
                  key={v.version}
                  to={hrefOf(v.version)}
                  className={clsx('flex items-center gap-0.5 rounded-sm py-1.5 text-body-s text-tertiary', focusRing)}
                >
                  {versionLinkLabel(v, resolved.current)}
                  <Icon name="chevron-right" size={16} className="text-icon-subtle" />
                </Link>
              ))}
            </nav>
          )}
        </>
      )}
    </ShellSub>
  )
}
