import { DELETED_MEMBER_NICKNAME } from '@yeojeong/shared';
import {
  SCRUBBED_LEADER_NICKNAME,
  anonymizedMembership,
  planLeave,
  type ActiveMember,
} from './account-deletion.plan.js';

const member = (
  id: string,
  joinOrder: number,
  role: ActiveMember['role'] = 'MEMBER',
): ActiveMember => ({ id, joinOrder, role });

describe('planLeave (승계)', () => {
  // 기능명세 FR-208 수락 기준 1: 준용(그룹장, 1), 민지(2)·태현(3)·수빈(4)
  const junyong = member('junyong', 1, 'LEADER');
  const minji = member('minji', 2);
  const taehyun = member('taehyun', 3);
  const subin = member('subin', 4);

  it('passes leadership to the remaining member with the lowest joinOrder', () => {
    expect(planLeave([subin, taehyun, junyong, minji], 'junyong')).toEqual({
      wasLeader: true,
      successor: minji,
      groupBecomesEmpty: false,
    });
  });

  it('skips members who already left (only active members are passed in)', () => {
    // 민지가 먼저 나갔으면 태현
    expect(planLeave([junyong, taehyun, subin], 'junyong').successor).toBe(
      taehyun,
    );
  });

  it('does not change the leader when a member leaves', () => {
    expect(planLeave([junyong, minji, taehyun], 'taehyun')).toEqual({
      wasLeader: false,
      successor: null,
      groupBecomesEmpty: false,
    });
  });

  it('marks the group empty when the last active member leaves', () => {
    expect(planLeave([junyong], 'junyong')).toEqual({
      wasLeader: true,
      successor: null,
      groupBecomesEmpty: true,
    });
    expect(planLeave([minji], 'minji').groupBecomesEmpty).toBe(true);
  });

  it('rejects a membership that is not active in the group', () => {
    expect(() => planLeave([junyong, minji], 'subin')).toThrow();
  });
});

describe('anonymizedMembership (익명화 필드)', () => {
  const now = new Date('2026-11-15T03:00:00Z');

  it('unlinks the user and closes an active membership', () => {
    expect(anonymizedMembership(null, now)).toEqual({
      userId: null,
      leftAt: now,
      leaveReason: 'LEFT',
    });
  });

  it('only unlinks the user when the member had already left', () => {
    const leftAt = new Date('2026-11-14T00:00:00Z');
    expect(anonymizedMembership(leftAt, now)).toEqual({ userId: null });
  });

  it('replaces the nickname in leader-change toasts with the deleted-member label', () => {
    expect(SCRUBBED_LEADER_NICKNAME).toBe(DELETED_MEMBER_NICKNAME);
    expect(DELETED_MEMBER_NICKNAME).toBe('탈퇴한 멤버');
  });
});
