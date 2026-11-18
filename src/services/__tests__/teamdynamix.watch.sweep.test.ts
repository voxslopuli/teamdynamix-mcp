import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { WorkspaceWatchService } from '../teamdynamix/watch.service.js';
import { emptyLedger, loadLedger } from '../teamdynamix/watch.store.js';
import type { ReadableClient } from '../teamdynamix/watch.readonly-client.js';
import type { WatchLedger, WatchRow } from '../teamdynamix/watch.store.js';

function sweepTicket(over: Partial<Record<string, unknown>> = {}) {
  return {
    ID: 100,
    ModifiedDate: '2026-11-18T00:00:00Z',
    StatusID: 394,
    Status: 'Open',
    ResponsibleGroupID: 9,
    ResponsibleGroupName: 'HelpDesk',
    ResponsibleUid: '',
    ...over,
  };
}

function makeClient(sweepPage: Record<string, unknown>[]): ReadableClient {
  return {
    getTicket: vi.fn(async () => ({})),
    searchTickets: vi.fn(async () => sweepPage),
    getTicketFeed: vi.fn(async () => []),
  };
}

async function makeSvc(ledger: WatchLedger, client: ReadableClient, dir: string, env: Record<string, string> = {}) {
  const savedEnv = { ...process.env };
  Object.assign(process.env, env);
  const svc = new WorkspaceWatchService(ledger, `${dir}/ledger.json`, client, { usUids: ['me-uid'] });
  return {
    svc,
    cleanup: () => {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    },
  };
}

describe('workspace watch sweep + team restriction', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp('tdx-watch-sweep-test-');
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  function seededRow(id: number, modified: string): Partial<WatchRow> {
    return {
      id,
      appId: 7,
      kind: 'mine',
      status: 'Open',
      title: 'x',
      district: '',
      ball: 'us',
      ballSource: 'manual',
      nextAction: '',
      lastChecked: '',
      stateHash: { modified, lastEntryId: 0, entryCount: 0, replyCount: 0, perEntryReplies: {} },
      memory: { notes: [], observations: [] },
    };
  }

  it('queues changed ledgered tickets and new unassigned tickets', async () => {
    const ledger = emptyLedger();
    ledger.active = [seededRow(100, '2026-11-17T00:00:00Z') as WatchRow]; // page says 11-18 → changed
    const { svc, cleanup } = await makeSvc(
      ledger,
      makeClient([
        sweepTicket(), // 100 changed
        sweepTicket({ ID: 101 }), // new + unassigned
        sweepTicket({ ID: 102, ResponsibleUid: 'someone-uid' }), // new + assigned → ignored
      ]),
      dir,
    );
    const r = await svc.sweep();
    cleanup();
    expect(r.changedQueued).toBe(1);
    expect(r.newUnassignedQueued).toBe(1);
    expect(r.unassigned).toEqual([101]);
    const loaded = await loadLedger(`${dir}/ledger.json`);
    expect(loaded.pendingTriage?.map(p => p.ticketId).sort()).toEqual([100, 101]);
    expect(loaded.pendingTriage?.find(p => p.ticketId === 101)?.reason).toBe('new-unassigned');
  });

  it('restricts globally to TEAMDYNAMIX_TICKET_GROUP_IDS (client-side)', async () => {
    const ledger = emptyLedger();
    const { svc, cleanup } = await makeSvc(
      ledger,
      makeClient([
        sweepTicket({ ID: 200 }), // group 9
        sweepTicket({ ID: 201, ResponsibleGroupID: 12, ResponsibleGroupName: 'Other' }), // filtered out
        sweepTicket({ ID: 202, ResponsibleGroupID: 12, ResponsibleUid: '' }), // unassigned but wrong group
      ]),
      dir,
      { TEAMDYNAMIX_TICKET_GROUP_IDS: '9', TEAMDYNAMIX_WATCH_APP_IDS: '7' },
    );
    const r = await svc.sweep();
    cleanup();
    expect(r.swept).toBe(1);
    expect(r.unassigned).toEqual([200]);
  });

  it('dedupes pending entries and respects the queue cap', async () => {
    const ledger = emptyLedger();
    ledger.sweepMeta.maxPending = 1;
    const { svc, cleanup } = await makeSvc(
      ledger,
      makeClient([sweepTicket({ ID: 300 }), sweepTicket({ ID: 301 })]),
      dir,
      { TEAMDYNAMIX_WATCH_APP_IDS: '7' },
    );
    await svc.sweep();
    const r2 = await svc.sweep(); // second sweep: same tickets → deduped
    cleanup();
    const loaded = await loadLedger(`${dir}/ledger.json`);
    expect(loaded.pendingTriage).toHaveLength(1);
    expect(r2.deduped).toBeGreaterThanOrEqual(1);
  });

  it('markTriaged removes the entry', async () => {
    const ledger = emptyLedger();
    const { svc, cleanup } = await makeSvc(ledger, makeClient([sweepTicket({ ID: 400 })]), dir, {
      TEAMDYNAMIX_WATCH_APP_IDS: '7',
    });
    await svc.sweep();
    const removed = await svc.markTriaged(400);
    cleanup();
    expect(removed.removed).toBe(true);
    const loaded = await loadLedger(`${dir}/ledger.json`);
    expect(loaded.pendingTriage).toHaveLength(0);
  });

  it('legacy ledger without pendingTriage still loads', async () => {
    const legacy = { active: [], archived: [], sweepMeta: {} };
    await fs.writeFile(`${dir}/ledger.json`, JSON.stringify(legacy));
    const loaded = await loadLedger(`${dir}/ledger.json`);
    expect(loaded.pendingTriage).toEqual([]);
  });
});
