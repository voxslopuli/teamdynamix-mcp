import { describe, expect, it, vi, beforeEach } from 'vitest';
import { UnifiedTeamDynamixClient } from '../teamdynamix/client.factory.js';
import { createMcpSdkClient } from '../../client/sdk-client.factory.js';
import type { TeamDynamixConfig } from '../../types.js';

vi.mock('../../client/sdk-client.factory.js', () => ({
  createMcpSdkClient: vi.fn().mockResolvedValue({
    GET: vi.fn().mockResolvedValue({ data: null, error: undefined }),
    POST: vi.fn().mockResolvedValue({ data: [], error: undefined }),
    people: {
      peopleSearch: vi.fn().mockResolvedValue({ data: [{ UID: 'abc', FullName: 'Alice' }], error: undefined }),
      searchGroups: vi.fn().mockResolvedValue([{ ID: 1, Name: 'Group' }]),
    },
    knowledgeBase: {
      appIdKnowledgebaseSearch: vi.fn().mockResolvedValue({ data: [{ ID: 55 }], error: undefined }),
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

    it('throws a clear error when the search route returns an error', async () => {
      const sdk = await createMcpSdkClient(baseConfig);
      vi.mocked(sdk.knowledgeBase.appIdKnowledgebaseSearch).mockResolvedValueOnce({
        data: null,
        error: { message: 'denied' },
      } as never);
      await expect(client.searchKbArticles(42, { SearchText: 'vpn' })).rejects.toThrow(/KB search/i);
    });
  });
});
