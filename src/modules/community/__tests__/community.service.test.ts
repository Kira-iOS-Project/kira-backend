/**
 * The community service over a repository double: curation order passes through, Gabung Grup
 * needs the current rules, and each report outcome becomes its problem.
 */

import { describe, expect, test } from 'bun:test';
import {
  COMMUNITY_CATEGORY,
  COMMUNITY_PLATFORM,
  COMMUNITY_REPORT_REASON,
  COMMUNITY_RULES_VERSION,
  COMMUNITY_SUSPENSION_REPORTERS,
  COMMUNITY_SUSPENSION_WINDOW_MS,
} from '../../../lib/constants/community.ts';
import {
  CommunityGroupNotFoundError,
  CommunityLinkUnavailableError,
  CommunityReportDuplicateError,
  CommunityRulesNotAcceptedError,
} from '../community.errors.ts';
import type { CommunityRepository } from '../community.repository.ts';
import { acceptRules, getGroup, joinGroup, listGroups, reportGroup } from '../community.service.ts';
import { createCommunityRepositoryMock, GROUP_ID, groupRow, NOW, USER_ID } from './helpers.ts';

const now = () => NOW;

describe('listGroups', () => {
  test('answers the categories and the groups in the order the repository gives', async () => {
    const asked: unknown[] = [];
    const repository = createCommunityRepositoryMock({
      listCategories: async () => [{ key: COMMUNITY_CATEGORY.debtFree, label: 'Bebas Hutang' }],
      listActiveGroups: async (category) => {
        asked.push(category);
        return [groupRow({ name: 'B' }), groupRow({ name: 'A', memberCount: 9000 })];
      },
    });

    const result = await listGroups({ category: COMMUNITY_CATEGORY.debtFree }, { repository });

    expect(asked).toEqual([COMMUNITY_CATEGORY.debtFree]);
    expect(result.categories).toEqual([
      { key: COMMUNITY_CATEGORY.debtFree, label: 'Bebas Hutang' },
    ]);
    expect(result.groups.map((group) => group.name)).toEqual(['B', 'A']);
    expect(Object.keys(result.groups[0] ?? {})).not.toContain('inviteUrl');
  });
});

describe('getGroup', () => {
  test('answers the detail with the admin month and the rules consent', async () => {
    const versions: string[] = [];
    const repository = createCommunityRepositoryMock({
      findActiveGroup: async () => groupRow(),
      hasAcceptedRules: async (_userId, version) => {
        versions.push(version);
        return true;
      },
    });

    const group = await getGroup(USER_ID, GROUP_ID, { repository });

    expect(versions).toEqual([COMMUNITY_RULES_VERSION]);
    expect(group.admin).toEqual({ name: 'Rani A.', initials: 'RA', verifiedSince: '2026-03' });
    expect(group).toMatchObject({ linkCheckedOn: '2026-10-12', rulesAccepted: true });
    expect(Object.keys(group)).not.toContain('inviteUrl');
  });

  test('says nothing of a link check while the group has no verified invite', async () => {
    const repository = createCommunityRepositoryMock({
      findActiveGroup: async () => groupRow({ inviteUrl: null }),
    });

    const group = await getGroup(USER_ID, GROUP_ID, { repository });

    expect(group).toMatchObject({ linkCheckedOn: null, adminUnchanged: null });
  });

  test('refuses a group that is missing or suspended', async () => {
    const repository = createCommunityRepositoryMock();
    await expect(getGroup(USER_ID, GROUP_ID, { repository })).rejects.toThrow(
      CommunityGroupNotFoundError,
    );
  });
});

describe('acceptRules', () => {
  test('stores the consent for the person and the version', async () => {
    const stored: string[][] = [];
    const repository = createCommunityRepositoryMock({
      acceptRules: async (userId, version) => void stored.push([userId, version]),
    });

    await acceptRules(USER_ID, COMMUNITY_RULES_VERSION, { repository });

    expect(stored).toEqual([[USER_ID, COMMUNITY_RULES_VERSION]]);
  });
});

describe('joinGroup', () => {
  test('hands out the invite and records the join once the rules are accepted', async () => {
    const joins: string[][] = [];
    const repository = createCommunityRepositoryMock({
      findActiveGroup: async () => groupRow(),
      hasAcceptedRules: async () => true,
      recordJoin: async (userId, groupId) => void joins.push([userId, groupId]),
    });

    const join = await joinGroup(USER_ID, GROUP_ID, { repository });

    expect(join).toEqual({
      inviteUrl: 'https://invite.example/lunas-bareng-jakarta',
      platform: COMMUNITY_PLATFORM.whatsapp,
      linkCheckedOn: '2026-10-12',
    });
    expect(joins).toEqual([[USER_ID, GROUP_ID]]);
  });

  test('refuses before the rules are accepted, and records nothing', async () => {
    let recorded = false;
    const repository = createCommunityRepositoryMock({
      findActiveGroup: async () => groupRow(),
      recordJoin: async () => void (recorded = true),
    });

    await expect(joinGroup(USER_ID, GROUP_ID, { repository })).rejects.toThrow(
      CommunityRulesNotAcceptedError,
    );
    expect(recorded).toBe(false);
  });

  test('refuses a group with no verified, dated link yet, and records nothing', async () => {
    let recorded = false;
    for (const row of [groupRow({ inviteUrl: null }), groupRow({ linkCheckedOn: null })]) {
      const repository = createCommunityRepositoryMock({
        findActiveGroup: async () => row,
        hasAcceptedRules: async () => true,
        recordJoin: async () => void (recorded = true),
      });
      await expect(joinGroup(USER_ID, GROUP_ID, { repository })).rejects.toThrow(
        CommunityLinkUnavailableError,
      );
    }
    expect(recorded).toBe(false);
  });

  test('refuses a missing group', async () => {
    const repository = createCommunityRepositoryMock({ hasAcceptedRules: async () => true });
    await expect(joinGroup(USER_ID, GROUP_ID, { repository })).rejects.toThrow(
      CommunityGroupNotFoundError,
    );
  });
});

describe('reportGroup', () => {
  function capture(outcome: Awaited<ReturnType<CommunityRepository['fileReport']>>) {
    const inputs: Parameters<CommunityRepository['fileReport']>[0][] = [];
    const repository = createCommunityRepositoryMock({
      fileReport: async (input) => {
        inputs.push(input);
        return outcome;
      },
    });
    return { inputs, repository };
  }

  test('files the report with the trimmed story, the 24-hour window and five people', async () => {
    const { inputs, repository } = capture({ kind: 'filed', id: 'report-9', suspended: false });

    const result = await reportGroup(
      USER_ID,
      GROUP_ID,
      { reason: COMMUNITY_REPORT_REASON.other, story: '  ajakan galbay  ' },
      { repository, now },
    );

    expect(result).toEqual({ id: 'report-9' });
    expect(inputs).toEqual([
      {
        userId: USER_ID,
        groupId: GROUP_ID,
        reason: COMMUNITY_REPORT_REASON.other,
        story: 'ajakan galbay',
        since: new Date(NOW.getTime() - COMMUNITY_SUSPENSION_WINDOW_MS),
        threshold: COMMUNITY_SUSPENSION_REPORTERS,
      },
    ]);
  });

  test('stores a blank or missing story as none, and still answers a take-down', async () => {
    const { inputs, repository } = capture({ kind: 'filed', id: 'report-5', suspended: true });

    await reportGroup(
      USER_ID,
      GROUP_ID,
      { reason: COMMUNITY_REPORT_REASON.scam, story: ' \u200B\uFEFF ' },
      { repository },
    );
    await reportGroup(USER_ID, GROUP_ID, { reason: COMMUNITY_REPORT_REASON.scam }, { repository });

    expect(inputs.map((input) => input.story)).toEqual([null, null]);
  });

  test('turns a duplicate and a missing group into their problems', async () => {
    const duplicate = capture({ kind: 'duplicate' }).repository;
    const missing = capture({ kind: 'missing' }).repository;
    const body = { reason: COMMUNITY_REPORT_REASON.inappropriate };

    await expect(reportGroup(USER_ID, GROUP_ID, body, { repository: duplicate })).rejects.toThrow(
      CommunityReportDuplicateError,
    );
    await expect(reportGroup(USER_ID, GROUP_ID, body, { repository: missing })).rejects.toThrow(
      CommunityGroupNotFoundError,
    );
  });
});
