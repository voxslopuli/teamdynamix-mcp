#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { LOG_LEVEL, SERVER_NAME_OVERRIDE, SERVER_VERSION_OVERRIDE, getTeamDynamixConfig } from './config.js';
import { SERVER_NAME, SERVER_VERSION } from './constants.js';
import { registerTeamDynamixResources } from './resources/teamdynamix.resources.js';
import { redactTeamDynamixConfig } from './services/teamdynamix/core.service.js';
import { registerTeamDynamixDomainGatewayTools } from './tools/teamdynamix.domain-gateways.tools.js';
import { registerTeamDynamixWatchTools } from './tools/teamdynamix.watch.tools.js';
import { registerTeamDynamixBulkTools } from './tools/teamdynamix.bulk.tools.js';

const server = new McpServer({
  name: SERVER_NAME_OVERRIDE ?? SERVER_NAME,
  version: SERVER_VERSION_OVERRIDE ?? SERVER_VERSION,
});

registerTeamDynamixDomainGatewayTools(server);
registerTeamDynamixWatchTools(server);
registerTeamDynamixBulkTools(server);
registerTeamDynamixResources(server);

async function main(): Promise<void> {
  console.error(`[teamdynamix-mcp] log level: ${LOG_LEVEL}`);
  if (LOG_LEVEL === 'debug') {
    const config = getTeamDynamixConfig();
    console.error(`[teamdynamix-mcp] sanitized config: ${JSON.stringify(redactTeamDynamixConfig(config))}`);
  }
  startWatchSweepTimer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/**
 * Optional in-session watch sweep (cheap stage-1 pass; no LLM, no TDX writes).
 * Runs only while this server process is alive — always-on scheduling belongs
 * on the harness side via the `tdx-watch-sweep` CLI (see scripts/). Disabled
 * unless TEAMDYNAMIX_WATCH_SWEEP_SECS is set to a positive number.
 */
function startWatchSweepTimer(): void {
  const secs = Number(process.env['TEAMDYNAMIX_WATCH_SWEEP_SECS'] ?? 0);
  if (!Number.isFinite(secs) || secs <= 0) return;
  const timer = setInterval(() => {
    import('./services/teamdynamix/watch.store.js')
      .then(async ({ loadLedger, saveLedger, emptyLedger, defaultLedgerPath, LedgerCorruptError }) => {
        const { createConfiguredTeamDynamixClient } = await import('./services/teamdynamix/client.service.js');
        const { WorkspaceWatchService } = await import('./services/teamdynamix/watch.service.js');
        const ledgerPath = defaultLedgerPath();
        let ledger;
        try {
          ledger = await loadLedger(ledgerPath);
        } catch (cause) {
          if (cause instanceof LedgerCorruptError) throw cause;
          ledger = emptyLedger();
        }
        const client = await createConfiguredTeamDynamixClient();
        const svc = new WorkspaceWatchService(ledger, ledgerPath, client);
        const result = await svc.sweep();
        console.error(`[teamdynamix-mcp] watch sweep: ${JSON.stringify(result)}`);
      })
      .catch((cause: unknown) => {
        console.error(
          `[teamdynamix-mcp] watch sweep failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      });
  }, secs * 1000);
  timer.unref();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Server startup failed: ${message}`);
  process.exit(1);
});
