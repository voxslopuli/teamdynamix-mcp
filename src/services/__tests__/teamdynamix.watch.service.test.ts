import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { WorkspaceWatchService } from '../teamdynamix/watch.service.js';
import type { ReadableClient } from '../teamdynamix/watch.readonly-client.js';
import { emptyLedger, type WatchLedger } from '../teamdynamix/watch.store.js';

function feedEntry(over: Partial<Record<string, unknown>> = {}) {
  return {
    ID: 1,
    CreatedUid: 'them-uid',
    CreatedFullName: 'Requester',
    CreatedDate: '2026-11-01T00:00:00Z',
    RepliesCount: 0,
    Replies: [],
    ...over,
  };
}

function ticket(over: Partial<Record<string, unknown>> = {}) {
  return {
    ID: 42,
    Title: 'VPN broken',
    Status: 'Open',
    StatusID: 394,
    ModifiedDate: '2026-11-17T00:00:00Z',
    IsOnHold: false,
    ...over,
  };
}

function makeClient(over: Partial<ReadableClient> = {}): ReadableClient & { calls: Record<string, number> } {
  const calls: Record<string, number> = { getTicket: 0, searchTickets: 0, getTicketFeed: 0 };
  const wrap = <T extends (...a: never[]) => unknown>(name: keyof typeof calls, fn: T) =>
    ((...args: never[]) => {
      calls[name] += 1;
      return fn(...args);
    }) as unknown as T;
  return {
    calls,
    getTicket: wrap(
      'getTicket',
      vi.fn(async () => ticket()),
    ),
    searchTickets: wrap(
      'searchTickets',
      vi.fn(async () => [ticket()]),
    ),
    getTicketFeed: wrap(
      'getTicketFeed',
      vi.fn(async () => [feedEntry()]),
    ),
    ...over,
  } as ReadableClient & { calls: Record<string, number> };
}

describe('workspace watch service', () => {
  let dir: string;
  let ledgerPath: string;
  let ledger: WatchLedger;

  beforeEach(async () => {
    dir = await fs.mkdtemp('tdx-watch-svc-test-');
    ledgerPath = `${dir}/ledger.json`;
    ledger = emptyLedger();
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  describe('register/archive/status never call TDX', () => {
    it('register adds a row with no client calls', async () => {
      const client = makeClient();
      const svc = new WorkspaceWatchService(ledger, ledgerPath, client, { usUids: ['me-uid'] });
      await svc.register({ appId: 7, id: 42, kind: 'mine', title: 'VPN broken' });
      expect(client.calls).toEqual({ getTicket: 0, searchTickets: 0, getTicketFeed: 0 });
      const status = await svc.status();
      expect(status.activeCount).toBe(1);
    });

    it('archive moves the row (with memory) to archived, no client calls', async () => {
      const client = makeClient();
      const svc = new WorkspaceWatchService(ledger, ledgerPath, client, { usUids: ['me-uid'] });
      await svc.register({ appId: 7, id: 42, kind: 'mine', title: 'VPN broken' });
      await svc.notesAdd({ appId: 7, ticketId: 42, text: 'note A' });
      const report = await svc.archive({ id: 42, outcome: 'resolved' });
      expect(client.calls.getTicket).toBe(0);
      expect(report.archived).toBe(true);
      const status = await svc.status();
      expect(status.activeCount).toBe(0);
      expect(status.archivedCount).toBe(1);
      const archived = (await import('../teamdynamix/watch.store.js')).loadLedger;
      const loaded = await (await import('../teamdynamix/watch.store.js')).loadLedger(ledgerPath);
      expect(loaded.archived[0]?.memory.notes).toHaveLength(1);
      expect(loaded.archived[0]?.outcome).toBe('resolved');
      void archived;
    });

    it('status summarizes without TDX calls', async () => {
      const client = makeClient();
      const svc = new WorkspaceWatchService(ledger, ledgerPath, client, { usUids: ['me-uid'] });
      await svc.register({ appId: 7, id: 42, kind: 'mine', title: 'VPN broken' });
      await svc.register({ appId: 7, id: 43, kind: 'watching', title: 'x', ball: 'us' });
      const s = await svc.status();
      expect(client.calls).toEqual({ getTicket: 0, searchTickets: 0, getTicketFeed: 0 });
      expect(s.activeCount).toBe(2);
      expect(s.ballUs).toBe(2);
    });
  });

  describe('two-stage check', () => {
    it('unchanged rows produce zero deep fetches', async () => {
      const client = makeClient(); // sweep returns ticket() with modified 2026-11-17T00:00:00Z
      const svc = new WorkspaceWatchService(ledger, ledgerPath, client, { usUids: ['me-uid'] });
      await svc.register({ appId: 7, id: 42, kind: 'mine', title: 'VPN broken' });
      // register stores no stateHash; first check does deep fetch to seed
      await svc.check({});
      const deepAfterSeed = client.calls.getTicket;
      const report = await svc.check({});
      expect(report.deltas).toHaveLength(0);
      expect(client.calls.getTicket).toBe(deepAfterSeed);
    });

    it('changed rows get exactly one deep fetch and a status delta', async () => {
      const client = makeClient();
      const svc = new WorkspaceWatchService(ledger, ledgerPath, client, { usUids: ['me-uid'] });
      await svc.register({ appId: 7, id: 42, kind: 'mine', title: 'VPN broken' });
      await svc.check({});
      client.searchTickets = vi.fn(async () => [ticket({ ModifiedDate: '2026-11-18T00:00:00Z', Status: 'Resolved' })]);
      const report = await svc.check({});
      expect(report.deltas).toHaveLength(1);
      expect(report.deltas[0]?.classes).toContain('status');
    });

    it('hidden-reply delta fires when an old entry grows replies', async () => {
      const client = makeClient();
      const svc = new WorkspaceWatchService(ledger, ledgerPath, client, { usUids: ['me-uid'] });
      await svc.register({ appId: 7, id: 42, kind: 'mine', title: 'VPN broken' });
      // seed: entry 1 with 0 replies
      client.getTicketFeed = vi.fn(async () => [feedEntry({ ID: 1, RepliesCount: 0 })]);
      await svc.check({});
      // old entry (CreateDate days ago) gained replies
      client.searchTickets = vi.fn(async () => [ticket({ ModifiedDate: '2026-11-18T00:00:00Z' })]);
      client.getTicketFeed = vi.fn(async () => [
        feedEntry({ ID: 1, CreatedDate: '2026-11-01T00:00:00Z', RepliesCount: 1 }),
      ]);
      const report = await svc.check({});
      expect(report.deltas[0]?.classes).toContain('hidden-reply');
    });

    it('ball inference: last author in us -> them; not in us -> us; manual override wins', async () => {
      const client = makeClient();
      const svc = new WorkspaceWatchService(ledger, ledgerPath, client, { usUids: ['me-uid'] });
      await svc.register({ appId: 7, id: 42, kind: 'mine', title: 'x' });
      client.getTicketFeed = vi.fn(async () => [feedEntry({ ID: 1, CreatedUid: 'me-uid' })]);
      await svc.check({});
      const loaded1 = await (await import('../teamdynamix/watch.store.js')).loadLedger(ledgerPath);
      expect(loaded1.active[0]?.ball).toBe('them');

      client.searchTickets = vi.fn(async () => [ticket({ ModifiedDate: '2026-11-18T00:00:00Z' })]);
      client.getTicketFeed = vi.fn(async () => [feedEntry({ ID: 2, CreatedUid: 'them-uid' })]);
      await svc.check({});
      const loaded2 = await (await import('../teamdynamix/watch.store.js')).loadLedger(ledgerPath);
      expect(loaded2.active[0]?.ball).toBe('us');

      // manual override survives subsequent checks
      await svc.register({ id: 42, appId: 7, kind: 'mine', ball: 'them' });
      client.searchTickets = vi.fn(async () => [ticket({ ModifiedDate: '2026-11-19T00:00:00Z' })]);
      client.getTicketFeed = vi.fn(async () => [feedEntry({ ID: 3, CreatedUid: 'them-uid' })]);
      await svc.check({});
      const loaded3 = await (await import('../teamdynamix/watch.store.js')).loadLedger(ledgerPath);
      expect(loaded3.active[0]?.ball).toBe('them');
      expect(loaded3.active[0]?.ballSource).toBe('manual');
    });

    it('redacts emails and phones in echoed titles and caps report size', async () => {
      const client = makeClient();
      const svc = new WorkspaceWatchService(ledger, ledgerPath, client, { usUids: ['me-uid'] });
      await svc.register({ appId: 7, id: 42, kind: 'mine', title: 'call bob@district.org re 555-867-5309' });
      client.searchTickets = vi.fn(async () => [
        ticket({ ModifiedDate: '2026-11-18T00:00:00Z', Title: 'new title contact alice@example.com' }),
      ]);
      const report = await svc.check({});
      const json = JSON.stringify(report);
      expect(json).not.toContain('bob@district.org');
      expect(json).not.toContain('555-867-5309');
      expect(json).not.toContain('alice@example.com');
    });
  });

  describe('notes', () => {
    it('add/update/delete/list round-trip with updatedAt', async () => {
      const client = makeClient();
      const svc = new WorkspaceWatchService(ledger, ledgerPath, client, { usUids: ['me-uid'] });
      await svc.register({ appId: 7, id: 42, kind: 'mine', title: 'x' });
      const added = await svc.notesAdd({ appId: 7, ticketId: 42, text: 'first' });
      expect(added.id).toBeTruthy();
      await svc.notesUpdate({ noteId: added.id, text: 'first (edited)' });
      const listed = await svc.notesList({ appId: 7, ticketId: 42 });
      expect(listed).toHaveLength(1);
      expect(listed[0]?.text).toBe('first (edited)');
      expect(listed[0]?.updatedAt >= listed[0]?.createdAt).toBe(true);
      await svc.notesDelete({ noteId: added.id });
      expect(await svc.notesList({ appId: 7, ticketId: 42 })).toHaveLength(0);
    });

    it('caps note length and unknown id errors explicitly', async () => {
      const client = makeClient();
      const svc = new WorkspaceWatchService(ledger, ledgerPath, client, { usUids: ['me-uid'] });
      await svc.register({ appId: 7, id: 42, kind: 'mine', title: 'x' });
      const added = await svc.notesAdd({ appId: 7, ticketId: 42, text: 'x'.repeat(5000) });
      const listed = await svc.notesList({ appId: 7, ticketId: 42 });
      expect(listed[0]?.text.length).toBeLessThanOrEqual(4000);
      await expect(svc.notesUpdate({ noteId: 'nope', text: 'y' })).rejects.toThrow(/not found/i);
      expect(added).toBeDefined();
    });

    it('notes survive archive', async () => {
      const client = makeClient();
      const svc = new WorkspaceWatchService(ledger, ledgerPath, client, { usUids: ['me-uid'] });
      await svc.register({ appId: 7, id: 42, kind: 'mine', title: 'x' });
      await svc.notesAdd({ appId: 7, ticketId: 42, text: 'important context' });
      await svc.archive({ id: 42 });
      const loaded = await (await import('../teamdynamix/watch.store.js')).loadLedger(ledgerPath);
      expect(loaded.archived[0]?.memory.notes[0]?.text).toBe('important context');
    });
  });

  describe('auto-observations', () => {
    it('off by default, on when enabled, bounded to 20', async () => {
      const client = makeClient();
      const off = new WorkspaceWatchService(ledger, ledgerPath, client, { usUids: ['me-uid'] });
      await off.register({ appId: 7, id: 42, kind: 'mine', title: 'x' });
      await off.check({});
      let loaded = await (await import('../teamdynamix/watch.store.js')).loadLedger(ledgerPath);
      expect(loaded.active[0]?.memory.observations).toHaveLength(0);

      const on = new WorkspaceWatchService(ledger, ledgerPath, client, { usUids: ['me-uid'], autoObserve: true });
      client.searchTickets = vi.fn(async () => [ticket({ ModifiedDate: `2026-11-18T00:00:${String(on).length}Z` })]);
      for (let i = 0; i < 25; i++) {
        client.searchTickets = vi.fn(async () => [
          ticket({ ModifiedDate: `2026-11-18T00:00:${String(i).padStart(2, '0')}Z` }),
        ]);
        await on.check({});
      }
      loaded = await (await import('../teamdynamix/watch.store.js')).loadLedger(ledgerPath);
      expect(loaded.active[0]?.memory.observations.length).toBeLessThanOrEqual(20);
    });
  });
});
