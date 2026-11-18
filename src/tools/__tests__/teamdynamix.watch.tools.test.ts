import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const registerTool = vi.fn();
const server = { registerTool } as unknown as McpServer;

vi.mock('../../services/teamdynamix/client.factory.js', () => ({
  createConfiguredTeamDynamixClient: vi.fn().mockResolvedValue({
    getTicket: vi.fn(async () => ({ ID: 1 })),
    searchTickets: vi.fn(async () => []),
    getTicketFeed: vi.fn(async () => []),
  }),
}));

vi.mock('../../services/teamdynamix/render.service.js', () => ({
  render: vi.fn((_data: unknown, _fmt: string) => 'rendered'),
}));

describe('teamdynamix watch tools registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers exactly the five watch tools', async () => {
    const { registerTeamDynamixWatchTools } = await import('../teamdynamix.watch.tools.js');
    registerTeamDynamixWatchTools(server);
    const names = registerTool.mock.calls.map((c: unknown[]) => c[0]);
    expect(names).toEqual([
      'teamdynamix_watch_check',
      'teamdynamix_watch_status',
      'teamdynamix_watch_register',
      'teamdynamix_watch_archive',
      'teamdynamix_watch_notes',
    ]);
  });

  it('register/archive/status tools declare read-only, never-mutating hints', async () => {
    const { registerTeamDynamixWatchTools } = await import('../teamdynamix.watch.tools.js');
    registerTeamDynamixWatchTools(server);
    for (const call of registerTool.mock.calls as unknown as [string, { annotations?: Record<string, unknown> }][]) {
      expect(call[1].annotations?.readOnlyHint).toBe(true);
    }
  });

  it('watch_notes validates op requirements before touching the service', async () => {
    const { registerTeamDynamixWatchTools } = await import('../teamdynamix.watch.tools.js');
    registerTeamDynamixWatchTools(server);
    const notesCall = (
      registerTool.mock.calls as unknown as [
        string,
        unknown,
        (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: { text: string }[] }>,
      ][]
    ).find(c => c[0] === 'teamdynamix_watch_notes');
    expect(notesCall).toBeDefined();
    const handler = notesCall![2];
    const missing = await handler({ op: 'add', response_format: 'json' });
    expect(missing.isError).toBe(true);
    expect(missing.content[0].text).toMatch(/requires app_id/i);
  });
});
