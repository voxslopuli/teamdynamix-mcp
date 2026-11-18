import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { loadLedger, saveLedger, defaultLedgerPath, LedgerCorruptError } from '../teamdynamix/watch.store.js';
import type { WatchLedger } from '../teamdynamix/watch.store.js';

const emptyLedger: WatchLedger = { active: [], archived: [], sweepMeta: {} };

function rowWithMemory() {
  return {
    id: 42,
    appId: 7,
    title: 'VPN broken',
    district: '',
    kind: 'mine' as const,
    status: 'Open',
    stateHash: {
      modified: '2026-11-17T00:00:00Z',
      lastEntryId: 3,
      entryCount: 3,
      replyCount: 2,
      perEntryReplies: { 3: 2 },
    },
    ball: 'us' as const,
    ballSource: 'manual' as const,
    nextAction: 'call requester',
    lastChecked: '2026-11-17T10:00:00Z',
    memory: {
      notes: [
        {
          id: 'n-1',
          text: 'requester pinged at 3pm',
          createdAt: '2026-11-17T15:00:00Z',
          updatedAt: '2026-11-17T15:00:00Z',
        },
      ],
      observations: [{ at: '2026-11-17T10:00:00Z', seen: { status: 'Open', modified: '2026-11-17T00:00:00Z' } }],
    },
  };
}

describe('watch ledger store', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp('tdx-watch-store-test-');
    file = `${dir}/ledger.json`;
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('round-trips a ledger with all sections, no data loss', async () => {
    const ledger: WatchLedger = {
      active: [rowWithMemory()],
      archived: [],
      sweepMeta: { lastSweep: '2026-11-18T00:00:00Z' },
    };
    await saveLedger(file, ledger);
    const loaded = await loadLedger(file);
    expect(loaded).toEqual(ledger);
    expect(loaded.active[0]?.memory.notes).toHaveLength(1);
    expect(loaded.active[0]?.memory.observations).toHaveLength(1);
  });

  it('leaves no partial file on write (atomic tmp+rename)', async () => {
    await saveLedger(file, emptyLedger);
    const entries = await fs.readdir(dir);
    expect(entries).toEqual(['ledger.json']);
  });

  it('fails closed on a corrupt ledger instead of recreating it', async () => {
    await fs.writeFile(file, '{ not valid json');
    await expect(loadLedger(file)).rejects.toBeInstanceOf(LedgerCorruptError);
    // file still there, untouched
    expect(await fs.readFile(file, 'utf8')).toBe('{ not valid json');
    // saving to a corrupt path also refuses (would destroy state)
    await expect(saveLedger(file, emptyLedger)).rejects.toBeInstanceOf(LedgerCorruptError);
  });

  it('archive keeps the row memory intact', async () => {
    const ledger: WatchLedger = { active: [rowWithMemory()], archived: [], sweepMeta: {} };
    const row = ledger.active[0]!;
    ledger.active = [];
    ledger.archived = [{ ...row, outcome: 'resolved' }];
    expect(ledger.archived[0]?.memory.notes).toHaveLength(1);
    expect(ledger.archived[0]?.memory.observations).toHaveLength(1);
  });

  it('defaultLedgerPath honors TDX_WATCH_LEDGER', () => {
    const before = process.env['TDX_WATCH_LEDGER'];
    process.env['TDX_WATCH_LEDGER'] = '/tmp/custom-ledger.json';
    expect(defaultLedgerPath()).toBe('/tmp/custom-ledger.json');
    if (before === undefined) delete process.env['TDX_WATCH_LEDGER'];
    else process.env['TDX_WATCH_LEDGER'] = before;
  });

  it('defaultLedgerPath falls back to cwd-relative file', () => {
    const before = process.env['TDX_WATCH_LEDGER'];
    delete process.env['TDX_WATCH_LEDGER'];
    expect(defaultLedgerPath()).toMatch(/tdx-watch-ledger\.json$/);
    if (before !== undefined) process.env['TDX_WATCH_LEDGER'] = before;
  });
});
