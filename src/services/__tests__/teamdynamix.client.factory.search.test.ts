import { describe, expect, it, vi, beforeEach } from 'vitest';
import { UnifiedTeamDynamixClient } from '../teamdynamix/client.factory.js';
import { createMcpSdkClient } from '../../client/sdk-client.factory.js';
import type { TeamDynamixConfig } from '../../types.js';

vi.mock('../../client/sdk-client.factory.js', () => ({
  createMcpSdkClient: vi.fn().mockResolvedValue({
    GET: vi.fn().mockResolvedValue({ data: null, error: undefined }),
    POST: vi.fn().mockResolvedValue({ data: [], error: undefined }),
    people: {
      peopleSearch: vi.fn().mockResolvedValue([{ UID: 'abc', FullName: 'Alice' }]),
      searchGroups: vi.fn().mockResolvedValue([{ ID: 1, Name: 'Group' }]),
    },
    tickets: {
      appIdTicketsSearch: vi.fn().mockResolvedValue([{ ID: 42, Title: 'VPN down' }]),
    },
    knowledgeBase: {
      appIdKnowledgebaseSearch: vi.fn().mockResolvedValue([{ ID: 55 }]),
      appIdKnowledgebaseCategories: vi.fn().mockResolvedValue([]),
    },
  }),
}));

const baseConfig: TeamDynamixConfig = {
  baseUrl: 'https://example.teamdynamix.com/TDWebApi',
  authMode: 'standard',
  username: 'demo@example.com',
  password: 'secret',
  timeoutMs: 30_000,
  maxRetries: 3,
  enableWriteTools: true,
  enableAdminTools: false,
  enableDeleteTools: true,
};

describe('gateway search correctness (#18 and related)', () => {
  let client: UnifiedTeamDynamixClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new UnifiedTeamDynamixClient(baseConfig);
  });

  describe('searchUsers', () => {
    it('routes through POST /api/people/search, not GET peopleLookup', async () => {
      await client.searchUsers({ SearchText: 'alice' });
      const sdk = await createMcpSdkClient(baseConfig);
      expect(sdk.people.peopleSearch).toHaveBeenCalledTimes(1);
    });

    it('passes the sanitized UserSearch body through', async () => {
      await client.searchUsers({ SearchText: 'alice', IsActive: false });
      const sdk = await createMcpSdkClient(baseConfig);
      expect(sdk.people.peopleSearch).toHaveBeenCalledWith({
        body: { SearchText: 'alice', IsActive: false },
      });
    });

    it('drops keys unknown to the live UserSearch schema', async () => {
      await client.searchUsers({ SearchText: 'alice', AppID: 7, Bogus: 'x' });
      const sdk = await createMcpSdkClient(baseConfig);
      const arg = (vi.mocked(sdk.people.peopleSearch).mock.calls[0] as [{ body: Record<string, unknown> }])[0];
      expect(arg.body).toEqual({ SearchText: 'alice' });
      expect(arg.body).not.toHaveProperty('AppID');
      expect(arg.body).not.toHaveProperty('Bogus');
    });

    it('does not call peopleLookup', async () => {
      await client.searchUsers({ SearchText: 'alice' });
      const sdk = await createMcpSdkClient(baseConfig);
      expect(sdk.people.peopleSearch).toHaveBeenCalledTimes(1);
    });
  });

  describe('searchGroups', () => {
    it('passes sanitized GroupSearch filters through instead of an empty body', async () => {
      await client.searchGroups({ NameLike: 'help', IsActive: true });
      const sdk = await createMcpSdkClient(baseConfig);
      expect(sdk.people.searchGroups).toHaveBeenCalledWith({
        body: { NameLike: 'help', IsActive: true },
      });
    });

    it('drops keys unknown to the live GroupSearch schema', async () => {
      await client.searchGroups({ NameLike: 'help', AppID: 5 });
      const sdk = await createMcpSdkClient(baseConfig);
      const arg = (vi.mocked(sdk.people.searchGroups).mock.calls[0] as [{ body: Record<string, unknown> }])[0];
      expect(arg.body).toEqual({ NameLike: 'help' });
      expect(arg.body).not.toHaveProperty('AppID');
    });
  });

  describe('searchKbArticles', () => {
    it('calls the real KB search route instead of fetching article id 0', async () => {
      await client.searchKbArticles(42, { SearchText: 'vpn' });
      const sdk = await createMcpSdkClient(baseConfig);
      expect(sdk.knowledgeBase.appIdKnowledgebaseSearch).toHaveBeenCalledWith({
        params: { path: { appId: 42 } },
        body: expect.objectContaining({ SearchText: 'vpn' }),
      });
    });

    it('drops keys unknown to the live ArticleSearch schema', async () => {
      await client.searchKbArticles(42, { SearchText: 'vpn', MaxResults: 10 });
      const sdk = await createMcpSdkClient(baseConfig);
      const arg = (
        vi.mocked(sdk.knowledgeBase.appIdKnowledgebaseSearch).mock.calls[0] as [{ body: Record<string, unknown> }]
      )[0];
      expect(arg.body).toEqual({ SearchText: 'vpn' });
      expect(arg.body).not.toHaveProperty('MaxResults');
    });

    it('errors surface as thrown SDK transport errors, not empty arrays (domain client contract)', async () => {
      // Domain methods have no { data, error } envelope: transport/API errors
      // are thrown by executeSdkRoute itself (tested in the SDK suite). The
      // MCP factory therefore has no dead error check to exercise here — any
      // thrown TeamDynamixClientError propagates to the tool error path.
      const sdk = await createMcpSdkClient(baseConfig);
      vi.mocked(sdk.knowledgeBase.appIdKnowledgebaseSearch).mockRejectedValueOnce(new Error('denied'));
      await expect(client.searchKbArticles(42, { SearchText: 'vpn' })).rejects.toThrow(/denied/);
    });

    it('returns the domain payload verbatim — non-empty rows when the API returns tickets (#23)', async () => {
      const articles = await client.searchKbArticles(42, { SearchText: 'vpn' });
      expect(articles).toEqual([{ ID: 55 }]);
    });
  });

  describe('searchTickets returns domain payloads, not envelope-destructured undefined (#23)', () => {
    it('returns non-empty rows when the API returns tickets', async () => {
      const tickets = (await client.searchTickets(7, {})) as readonly unknown[];
      expect(tickets).toEqual([{ ID: 42, Title: 'VPN down' }]);
    });

    it('returns rows even when the domain result is a bare array (no envelope destructure)', async () => {
      const sdk = await createMcpSdkClient(baseConfig);
      vi.mocked(sdk.tickets.appIdTicketsSearch).mockResolvedValueOnce([{ ID: 99 }]);
      const tickets = (await client.searchTickets(7, { StatusIDs: [394] })) as readonly unknown[];
      expect(tickets).toEqual([{ ID: 99 }]);
      const lastCall = vi.mocked(sdk.tickets.appIdTicketsSearch).mock.lastCall as unknown as [
        { params: { path: { appId: number } }; body: Record<string, unknown> },
      ];
      expect(lastCall?.[0]?.params?.path?.appId).toBe(7);
      expect(lastCall?.[0]?.body).toEqual({ StatusIDs: [394] });
    });
  });
});
