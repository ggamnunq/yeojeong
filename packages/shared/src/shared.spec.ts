import { describe, expect, it } from 'vitest';
import {
  CONSENT_DEFINITIONS,
  ConsentId,
  ERRORS,
  ExpenseStatus,
  FIN_LINK_REQUIRED_CONSENTS,
  SIGNUP_REQUIRED_CONSENTS,
  TRIP_STATUS_VALUES,
  TripStatus,
  formatInviteCode,
  normalizeInviteCode,
} from './index.js';

describe('enums', () => {
  it('exposes values as constants and lists', () => {
    expect(TripStatus.ONGOING).toBe('ONGOING');
    expect(TRIP_STATUS_VALUES).toEqual(['UPCOMING', 'ONGOING', 'ENDED']);
    expect(Object.keys(ExpenseStatus)).toEqual([
      'PENDING',
      'PERSONAL',
      'SHARED',
    ]);
    expect(Object.isFrozen(TripStatus)).toBe(true);
  });
});

describe('consents', () => {
  it('defines every consent ID once with the matching stage', () => {
    expect(Object.keys(CONSENT_DEFINITIONS)).toEqual(Object.keys(ConsentId));
    for (const id of SIGNUP_REQUIRED_CONSENTS) {
      expect(CONSENT_DEFINITIONS[id]).toMatchObject({
        stage: 'SIGNUP',
        required: true,
      });
    }
    for (const id of FIN_LINK_REQUIRED_CONSENTS) {
      expect(CONSENT_DEFINITIONS[id]).toMatchObject({
        stage: 'FIN_LINK',
        required: true,
      });
    }
    expect(CONSENT_DEFINITIONS.MARKETING.hidden).toBe(true);
    expect(CONSENT_DEFINITIONS.AGE14.docUrl).toBeNull();
  });
});

describe('errors', () => {
  it('keeps codes upper snake case with a Korean message', () => {
    for (const [code, definition] of Object.entries(ERRORS)) {
      expect(code).toMatch(/^[A-Z][A-Z0-9_]+$/);
      expect(definition.status).toBeGreaterThanOrEqual(400);
      expect(definition.message).toMatch(/[가-힣]/);
    }
    expect(ERRORS.CONSENT_REQUIRED.status).toBe(403);
    expect(ERRORS.NOT_LEADER.status).toBe(403);
  });
});

describe('invite code', () => {
  it('normalizes case, hyphens and spaces', () => {
    expect(normalizeInviteCode('k7m-2qx')).toBe('K7M2QX');
    expect(normalizeInviteCode(' K7M 2QX ')).toBe('K7M2QX');
  });

  it.each(['K7M2Q', 'K7M2QXX', 'O7M2QX', 'K1M2QX', 'KIM2QX', 'KLM2QX'])(
    'rejects %s',
    (code) => {
      expect(normalizeInviteCode(code)).toBeNull();
    },
  );

  it('formats as 3-3', () => {
    expect(formatInviteCode('K7M2QX')).toBe('K7M-2QX');
  });
});
