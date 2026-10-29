import { isIP } from 'node:net';
import { Injectable } from '@nestjs/common';
import {
  CONSENT_DEFINITIONS,
  CONSENT_ID_VALUES,
  type ConsentDocumentSummary,
  type ConsentId,
  type ConsentRequirement,
  type ConsentScreen,
  type ConsentStage,
  type FieldError,
} from '@yeojeong/shared';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { AuthConfig } from '../common/auth/auth-config.js';
import {
  ConsentCatalog,
  currentConsentVersion,
  type ConsentDocumentVersion,
} from '../common/auth/consent-catalog.js';
import {
  AppException,
  ValidationFailedError,
} from '../common/errors/app-exception.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { ConsentAgreementDto } from './dto/consent.dto.js';

const MAX_UA_LENGTH = 512;

/** 동의 기록에 남기는 요청 정보 */
export interface ConsentEvidence {
  ip: string;
  ua: string;
}

export function consentEvidence(req: Request): ConsentEvidence {
  // origin lock을 통과한 운영 요청이면 req.ip는 Worker가 넘긴 클라이언트 IP다
  const ip = req.ip && isIP(req.ip) ? req.ip : '0.0.0.0';
  const ua = (req.headers['user-agent'] ?? '').slice(0, MAX_UA_LENGTH);
  return { ip, ua };
}

export interface CheckedAgreements {
  /** 받아야 하는 항목의 현재 문서(동의 기록에 쓴다) */
  documents: ConsentDocumentVersion[];
  agreed: ReadonlySet<ConsentId>;
}

/**
 * 동의 문서 조회와 동의 기록(append-only). auth(가입·재동의)와 consents(연동 동의) 모듈이 함께 쓴다.
 * 판정 규칙은 common/auth/consent-catalog.ts(초안 동의는 정식본이 나오면 무효).
 */
@Injectable()
export class ConsentsService {
  constructor(
    private readonly catalog: ConsentCatalog,
    private readonly config: AuthConfig,
    private readonly audit: AuditService,
  ) {}

  async documents(stage: ConsentStage): Promise<ConsentDocumentSummary[]> {
    const docs = await this.catalog.load();
    return CONSENT_ID_VALUES.filter(
      (id) => CONSENT_DEFINITIONS[id].stage === stage,
    ).map((id) => {
      const definition = CONSENT_DEFINITIONS[id];
      const current = currentConsentVersion(id, docs);
      return {
        consentId: id,
        title: definition.title,
        required: definition.required,
        version: current.version,
        docUrl: definition.docUrl,
        hasDetail: definition.docUrl !== null,
        hidden: definition.hidden,
        summary: current.summary,
        isDraft: current.isDraft,
      };
    });
  }

  /**
   * 요청한 동의 목록을 검사한다.
   * - stage 밖의 항목, 숨긴 항목(MARKETING), 중복은 400 VALIDATION_FAILED
   * - requiredIds 중 하나라도 빠졌거나 agreed=false거나 버전이 현재와 다르면 400 TERMS_REQUIRED { missing, required }
   */
  async check(
    stage: ConsentStage,
    agreements: readonly ConsentAgreementDto[],
    requiredIds: readonly ConsentId[],
  ): Promise<CheckedAgreements> {
    const fields: FieldError[] = [];
    const seen = new Set<ConsentId>();
    agreements.forEach((item, index) => {
      const definition = CONSENT_DEFINITIONS[item.consentId];
      if (definition.stage !== stage || definition.hidden) {
        fields.push({
          path: `agreements.${index}.consentId`,
          code: 'consentStage',
          message: '이 단계에서 받을 수 없는 동의 항목이에요',
        });
      } else if (seen.has(item.consentId)) {
        fields.push({
          path: `agreements.${index}.consentId`,
          code: 'duplicate',
          message: '같은 동의 항목이 두 번 있어요',
        });
      }
      seen.add(item.consentId);
    });
    if (fields.length > 0) throw new ValidationFailedError(fields);

    const docs = await this.catalog.load();
    const documents = requiredIds.map((id) => currentConsentVersion(id, docs));
    const missing: ConsentRequirement[] = documents
      .filter((doc) => {
        const item = agreements.find((a) => a.consentId === doc.consentId);
        return !item || !item.agreed || item.version !== doc.version;
      })
      .map((doc) => ({ id: doc.consentId, version: doc.version }));
    if (missing.length > 0) {
      throw AppException.of('TERMS_REQUIRED', {
        details: { missing: missing.map((m) => m.id), required: missing },
      });
    }
    return {
      documents,
      agreed: new Set(
        agreements.filter((a) => a.agreed).map((a) => a.consentId),
      ),
    };
  }

  /**
   * 동의 이력 행을 쌓는다(append-only, 기존 행은 고치지 않는다 — 기능명세 4-10 v0.5.7).
   * - 같은 (사용자, 항목, 버전)에 유효한 행(agreed이고 철회되지 않음)이 이미 있으면 건너뛴다.
   *   DB의 부분 유니크 user_consents_active_key(WHERE agreed AND withdrawn_at IS NULL)가 skipDuplicates의 기준이라 동시 요청도 한 행만 남는다.
   * - 철회된 행만 있으면(예: 결제수단 전부 해제로 FIN_LINK·FIN_PRIVACY 철회) 새 행을 추가한다. 철회 기록(withdrawnAt)은 그대로 남아 "철회 후 3년" 보존 대상이 된다.
   * 접속 IP는 평문으로 남기지 않고 HMAC(AUDIT_HMAC_KEY)만 남긴다. 키가 없으면 ipHash도 NULL이다.
   */
  async record(
    db: Prisma.TransactionClient,
    input: {
      userId: string;
      documents: readonly ConsentDocumentVersion[];
      screen: ConsentScreen;
      method: string;
      evidence: ConsentEvidence;
    },
  ) {
    const userRefHash = this.config.userRefHash(input.userId);
    await db.userConsent.createMany({
      data: input.documents.map((doc) => ({
        userId: input.userId,
        userRefHash,
        consentId: doc.consentId,
        version: doc.version,
        agreed: true,
        ipHash: this.audit.hashIp(input.evidence.ip),
        ua: input.evidence.ua,
        screen: input.screen,
        method: input.method,
        docHash: doc.docHash,
      })),
      skipDuplicates: true,
    });
  }
}
