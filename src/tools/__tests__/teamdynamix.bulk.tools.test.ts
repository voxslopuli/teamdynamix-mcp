import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const registerTool = vi.fn();
const server = { registerTool } as unknown as McpServer;

const bulkClient = {
  bulkGetTickets: vi.fn(async (_appId: number, ids: number[], opts?: { includeFeed?: boolean }) => ({
    requested: ids.length,
    truncated: false,
    cap: 25,
    results: ids.map(ticketId => ({
      ticketId,
      ticket: opts?.includeFeed === false ? { ID: ticketId } : { ID: ticketId, feed: [{ ID: 1 }] },
    })),
  })),
  bulkUpdateTickets: vi.fn(async (_appId: number, updates: Array<{ ticketId: number; attributes: unknown }>) => ({
    requested: updates.length,
    succeeded: updates.length,
    failed: 0,
    results: updates.map(u => ({ ticketId: u.ticketId, result: { ID: u.ticketId, updated: true } })),
  })),
};

vi.mock('../../services/teamdynamix/client.service.js', () => ({
  createConfiguredTeamDynamixClient: vi.fn(async () => bulkClient),
  assertWriteToolsEnabled: vi.fn((cfg: { enableWriteTools?: boolean }) => {
    if (!cfg?.enableWriteTools) throw new Error('Write tools are disabled for this deployment.');
  }),
  assertDeleteToolsEnabled: vi.fn(),
  assertAdminToolsEnabled: vi.fn(),
  getTeamDynamixConfig: vi.fn(() => ({
    enableWriteTools: true,
    baseUrl: 'https://x/TDWebApi',
    authMode: 'standard',
    username: 'a',
    password: 'b',
    timeoutMs: 1,
    maxRetries: 1,
    enableDeleteTools: false,
  })),
  redactTeamDynamixConfig: vi.fn((cfg: unknown) => cfg),
}));

vi.mock('../../services/teamdynamix/render.service.js', () => ({
  render: vi.fn(() => 'rendered'),
}));

vi.mock('../../config.js', () => ({
  getTeamDynamixConfig: vi.fn(() => ({
    enableWriteTools: true,
    baseUrl: 'https://x/TDWebApi',
    authMode: 'standard',
    username: 'a',
    password: 'b',
    timeoutMs: 1,
    maxRetries: 1,
    enableDeleteTools: false,
  })),
}));

describe('teamdynamix bulk tools', () => {
  let handler: Record<
    string,
    (args: Record<string, unknown>) => Promise<{ structuredContent?: Record<string, unknown>; isError?: boolean }>
  >;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { registerTeamDynamixBulkTools } = await import('../teamdynamix.bulk.tools.js');
    registerTool.mockClear();
    registerTeamDynamixBulkTools(server);
    handler = Object.fromEntries(
      (
        registerTool.mock.calls as unknown as Array<
          [
            string,
            unknown,
            (
              args: Record<string, unknown>,
            ) => Promise<{ structuredContent?: Record<string, unknown>; isError?: boolean }>,
          ]
        >
      ).map(c => [c[0], c[2]]),
    );
  });

  it('registers exactly the three bulk tools', () => {
    expect(Object.keys(handler).sort()).toEqual([
      'teamdynamix_bulk_add_users_to_group',
      'teamdynamix_bulk_get_tickets',
      'teamdynamix_bulk_update_tickets',
    ]);
  });

  it('bulk_get_tickets passes include_feed through and reports per-item results', async () => {
    const res = await handler['teamdynamix_bulk_get_tickets']({
      app_id: 7,
      ticket_ids: [1, 2, 3],
      include_feed: false,
    });
    expect(res.structuredContent).toMatchObject({ requested: 3, truncated: false, cap: 25 });
    expect((res.structuredContent?.results as unknown[])[0]).toHaveProperty('ticket');
    expect(bulkClient.bulkGetTickets).toHaveBeenCalledWith(7, [1, 2, 3], { includeFeed: false });
  });

  it('bulk_update_tickets enforces the write gate', async () => {
    const { getTeamDynamixConfig } = (await import('../../config.js')) as unknown as {
      getTeamDynamixConfig: ReturnType<typeof vi.fn>;
    };
    getTeamDynamixConfig.mockReturnValueOnce({ enableWriteTools: false, baseUrl: '', authMode: 'standard' });
    const res = await handler['teamdynamix_bulk_update_tickets']({
      app_id: 7,
      updates: [{ ticket_id: 1, attributes: { StatusID: 2 } }],
    });
    expect(res.isError).toBe(true);
    expect(res.structuredContent).toBeUndefined();
    expect(bulkClient.bulkUpdateTickets).not.toHaveBeenCalled();
  });

  it('bulk_update_tickets applies per-item results', async () => {
    const res = await handler['teamdynamix_bulk_update_tickets']({
      app_id: 7,
      updates: [
        { ticket_id: 1, attributes: { StatusID: 2 } },
        { ticket_id: 2, attributes: { PriorityID: 3 }, comments: 'patched' },
      ],
    });
    expect(res.structuredContent).toMatchObject({ requested: 2, succeeded: 2, failed: 0 });
    expect(bulkClient.bulkUpdateTickets).toHaveBeenCalled();
  });
});
