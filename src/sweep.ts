#!/usr/bin/env node
/**
 * Headless watch sweep for scheduled runs (cron/launchd). No LLM, no TDX
 * writes: performs the cheap stage-1 sweep, updates the ledger, and maintains
 * the pendingTriage queue. Prints a JSON summary; exits 1 on configuration or
 * ledger-corruption failure, 0 otherwise (sweep errors are best-effort).
 *
 * Schedule example (every 15 minutes, cron):
 *   cron: "0,15,30,45 * * * * tdx-watch-sweep >> /tmp/tdx-watch-sweep.log 2>&1"
 *
 * Triage trigger (harness-side, e.g. from a wrapper script):
 *   if pendingTriage is non-empty → `opencode run` with the triage prompt
 *   (scripts/triage-prompt.md).
 */
import { createConfiguredTeamDynamixClient } from './services/teamdynamix/client.service.js';
import { defaultLedgerPath, emptyLedger, LedgerCorruptError, loadLedger } from './services/teamdynamix/watch.store.js';
import { WorkspaceWatchService } from './services/teamdynamix/watch.service.js';

const ledgerPath = defaultLedgerPath();
let ledger;
try {
  ledger = await loadLedger(ledgerPath);
} catch (cause) {
  if (cause instanceof LedgerCorruptError) {
    console.error(String(cause.message));
    process.exit(1);
  }
  ledger = emptyLedger(); // fresh start on ENOENT
}

try {
  const client = await createConfiguredTeamDynamixClient();
  const svc = new WorkspaceWatchService(ledger, ledgerPath, client);
  const result = await svc.sweep();
  const pending = svc.pendingTriage();
  console.log(JSON.stringify({ ledgerPath, ...result, pendingCount: pending.length }, null, 2));
} catch (cause) {
  console.error(`Sweep failed: ${cause instanceof Error ? cause.message : String(cause)}`);
  process.exit(1);
}
