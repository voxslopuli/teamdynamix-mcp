import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Workspace watch ledger: one object per ticket, memory attached to the row.
 * Read-only toward TDX by design — nothing in this module performs writes to
 * the TeamDynamix API (see watch.readonly-client.ts).
 */

export const LEDGER_VERSION = 1;
export const MAX_NOTE_LENGTH = 4000;
export const MAX_OBSERVATIONS = 20;

export interface LedgerStateHash {
  modified: string;
  lastEntryId: number;
  entryCount: number;
  replyCount: number;
  perEntryReplies: Record<string, number>;
}

export interface LedgerNote {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerObservation {
  at: string;
  seen: { status: string; modified: string };
}

export interface WatchRow {
  id: number;
  appId: number;
  title: string;
  district: string;
  kind: 'mine' | 'watching' | 'waiting-on-others';
  status: string;
  stateHash: LedgerStateHash;
  ball: 'us' | 'them';
  ballSource: 'auto' | 'manual';
  nextAction: string;
  lastChecked: string;
  memory: { notes: LedgerNote[]; observations: LedgerObservation[] };
}

export interface ArchivedRow extends WatchRow {
  outcome?: string;
}

export interface WatchLedger {
  version?: number;
  active: WatchRow[];
  archived: ArchivedRow[];
  sweepMeta: { lastSweep?: string; usUids?: string[] };
}

export class LedgerCorruptError extends Error {
  constructor(path: string, cause: unknown) {
    super(
      `Watch ledger at ${path} is corrupt or unreadable; refusing to read or write it. ` +
        `Fix or remove the file manually (state preservation is deliberate). Cause: ${String(cause)}`,
    );
    this.name = 'LedgerCorruptError';
  }
}

export function defaultLedgerPath(): string {
  return process.env['TDX_WATCH_LEDGER'] ?? path.join(process.cwd(), '.tdx-watch-ledger.json');
}

export async function loadLedger(filePath: string): Promise<WatchLedger> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (cause) {
    // Not-found / unreadable is NOT corruption — let callers fall back to a
    // fresh ledger. Corruption is failing to parse an existing file.
    throw cause instanceof Error ? cause : new Error(String(cause));
  }
  try {
    const parsed = JSON.parse(raw) as WatchLedger;
    if (!Array.isArray(parsed.active) || !Array.isArray(parsed.archived)) {
      throw new Error('missing active/archived arrays');
    }
    return parsed;
  } catch (cause) {
    throw new LedgerCorruptError(filePath, cause);
  }
}

export async function saveLedger(filePath: string, ledger: WatchLedger): Promise<void> {
  // Fail closed: never overwrite a file we could not read as a valid ledger.
  try {
    await fs.access(filePath);
    await loadLedger(filePath); // throws LedgerCorruptError if unreadable
  } catch (cause) {
    if (cause instanceof LedgerCorruptError) throw cause;
    // ENOENT etc. — fresh file is fine.
  }
  ledger.version = LEDGER_VERSION;
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

export function emptyLedger(): WatchLedger {
  return { active: [], archived: [], sweepMeta: {} };
}
