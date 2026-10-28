import { defineCatalog } from '../../catalog/catalog'
import { ME, MINJI, SUBIN, TAEHYUN } from '../../catalog/people'
import { Sub } from '../../catalog/ui'
import { RowMemberAmount } from './MemberAmount'

export default defineCatalog({
  title: 'Row/MemberAmount',
  figma: '24:61297',
  group: 'components',
  order: 74,
  Demo: function RowMemberAmountCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title="Figma 기본 · Me(350 폭, 거터 블록 안)">
          <div className="w-[350px] bg-surface">
            <RowMemberAmount person={ME} amount={94770} />
          </div>
        </Sub>
        <Sub title="멤버별 부담 · 나 먼저 → 가입 순 · 나간 멤버(spec C-08)">
          <div className="flex w-[350px] flex-col bg-surface">
            <RowMemberAmount person={ME} amount={94770} />
            <RowMemberAmount person={MINJI} amount={81200} />
            <RowMemberAmount person={TAEHYUN} amount={77640} />
            <RowMemberAmount person={{ ...SUBIN, left: true }} amount={65020} />
            <RowMemberAmount person={TAEHYUN} amount="¥12,800" name="태현 (엔화)" />
          </div>
        </Sub>
      </div>
    )
  },
})
