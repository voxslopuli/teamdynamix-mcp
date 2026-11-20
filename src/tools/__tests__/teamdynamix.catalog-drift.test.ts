import { describe, expect, it, vi, beforeAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Docs-drift guard: every registered tool name must appear in both catalog
 * files. The catalogs went stale once (#18-#23 era) — this keeps them honest.
 */
vi.mock('../../client/sdk-client.factory.js', () => ({
  createMcpSdkClient: vi.fn(async () => ({ GET: vi.fn(), POST: vi.fn() })),
}));

const MODULES = [
  'teamdynamix.assets.tools.js',
  'teamdynamix.bulk.tools.js',
  'teamdynamix.cmdb.tools.js',
  'teamdynamix.discovery.tools.js',
  'teamdynamix.domain-gateways.tools.js',
  'teamdynamix.enumeration.tools.js',
  'teamdynamix.kb.tools.js',
  'teamdynamix.people.tools.js',
  'teamdynamix.services.tools.js',
  'teamdynamix.ticket-tasks.tools.js',
  'teamdynamix.tickets.tools.js',
  'teamdynamix.watch.tools.js',
] as const;

const docPaths = [
  path.resolve(process.cwd(), 'docs/reference/tools.md'),
  path.resolve(process.cwd(), 'skills/teamdynamix/references/tool-catalog.md'),
];

describe('tool catalog docs stay in sync with the registered surface', () => {
  const registerTool = vi.fn();
  const names: string[] = [];

  beforeAll(async () => {
    const server = { registerTool } as unknown as McpServer;
    for (const mod of MODULES) {
      const imported = await import(`../${mod}`);
      for (const [name, value] of Object.entries(imported)) {
        if (typeof value === 'function' && name.startsWith('register')) {
          (value as (server: McpServer) => void)(server);
        }
      }
    }
    names.push(...(registerTool.mock.calls as unknown as Array<[string]>).map(c => c[0]));
  });

  it('registers a known surface size', () => {
    expect(names.length).toBeGreaterThan(60);
    expect(new Set(names).size).toBe(names.length); // no duplicate registrations
  });

  it('every registered tool name appears in the catalogs', async () => {
    for (const docPath of docPaths) {
      const doc = await fs.readFile(docPath, 'utf8');
      const missing = names.filter(name => !doc.includes(name));
      expect(missing, `${docPath} is missing: ${missing.join(', ')}`).toEqual([]);
    }
  });
});
