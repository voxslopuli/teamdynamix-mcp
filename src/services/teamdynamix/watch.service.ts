import {
  loadLedger,
  saveLedger,
  type WatchLedger,
  type WatchRow,
  type LedgerNote,
  type PendingTriageItem,
  MAX_NOTE_LENGTH,
  MAX_OBSERVATIONS,
} from './watch.store.js';
import type { ReadableClient } from './watch.readonly-client.js';
import { parseIdListEnv } from './client.factory.js';

/**
 * Diff engine + ledger maintenance for the workspace watch feature (issue #19).
 * Strictly read-only toward TDX; drafts and sends stay human-owned.
 */

const REPORT_MAX_CHARS = 8000;
const TITLE_MAX_CHARS = 200;
const US_UIDS_ENV = 'TEAMDYNAMIX_US_UIDS';
const GROUP_IDS_ENV = 'TEAMDYNAMIX_TICKET_GROUP_IDS';
const STATUS_IDS_ENV = 'TEAMDYNAMIX_WATCH_STATUS_IDS';
const DEFAULT_MAX_PENDING = 25;
const UNASSIGNED_SENTINELS = new Set(['', 'unassigned']);

export interface WatchDelta {
  id: number;
  appId: number;
  classes: string[];
  status?: string;
  modified?: string;
  ball?: 'us' | 'them';
}

export interface WatchCheckReport {
  checked: number;
  deltas: WatchDelta[];
  errors: string[];
}

interface FeedEntryLike {
  ID?: number;
  CreatedUid?: string;
  RepliesCount?: number;
}

function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[redacted-email]')
    .replace(/\b(?:\d{3}[-.\s]?){2}\d{4}\b/g, '[redacted-phone]');
}

function cap(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function sanitizeForReport(value: unknown): unknown {
  if (typeof value === 'string') return cap(redact(value), TITLE_MAX_CHARS);
  return value;
}

function computeHash(entries: readonly FeedEntryLike[]) {
  const perEntryReplies: Record<string, number> = {};
  let replyCount = 0;
  let lastEntryId = 0;
  for (const e of entries) {
    const id = e.ID ?? 0;
    const rc = e.RepliesCount ?? 0;
    perEntryReplies[String(id)] = rc;
    replyCount += rc;
    lastEntryId = Math.max(lastEntryId, id);
  }
  return { lastEntryId, entryCount: entries.length, replyCount, perEntryReplies };
}

function hashGrewHiddenReplies(prev: WatchRow['stateHash'], entries: readonly FeedEntryLike[]): boolean {
  for (const e of entries) {
    const id = String(e.ID ?? 0);
    const now = e.RepliesCount ?? 0;
    const before = prev.perEntryReplies[id];
    if (before !== undefined && now > before) return true;
  }
  return false;
}

export interface WorkspaceWatchOptions {
  usUids?: string[];
  autoObserve?: boolean;
}

export class WorkspaceWatchService {
  private readonly client: ReadableClient;
  private readonly ledgerPath: string;
  private readonly usUids: Set<string>;
  private readonly autoObserve: boolean;

  constructor(
    private ledger: WatchLedger,
    ledgerPath: string,
    client: ReadableClient,
    opts: WorkspaceWatchOptions = {},
  ) {
    this.ledgerPath = ledgerPath;
    this.client = client;
    const envUids = (process.env[US_UIDS_ENV] ?? '').split(/[,\s]+/).filter(Boolean);
    this.usUids = new Set([...envUids, ...(opts.usUids ?? [])]);
    this.autoObserve = opts.autoObserve ?? process.env['TEAMDYNAMIX_AUTO_OBSERVE'] === 'true';
  }

  private usUidsFor(): Set<string> {
    const ledgerUids = this.ledger.sweepMeta.usUids ?? [];
    return new Set([...this.usUids, ...ledgerUids]);
  }

  private groupIds(): number[] {
    return this.ledger.sweepMeta.groupIds ?? parseIdListEnv(process.env[GROUP_IDS_ENV]);
  }

  private statusIds(): number[] {
    return this.ledger.sweepMeta.statusIds ?? parseIdListEnv(process.env[STATUS_IDS_ENV]);
  }

  private maxPending(): number {
    return this.ledger.sweepMeta.maxPending ?? DEFAULT_MAX_PENDING;
  }

  private pushPending(item: PendingTriageItem): 'queued' | 'deduped' | 'full' {
    const queue = (this.ledger.pendingTriage ??= []);
    if (queue.some(p => p.ticketId === item.ticketId)) return 'deduped';
    if (queue.length >= this.maxPending()) return 'full';
    queue.push(item);
    return 'queued';
  }

  /**
   * Cheap sweep (stage 1 only): one queue search per app, client-side team
   * filtering (GroupIDs is not applied server-side on queue searches), stateHash
   * freshness, new-unassigned detection, and pendingTriage queue maintenance.
   * Deep fetches / reply expansion are the agent's job via check() / triage.
   */
  async sweep(): Promise<{
    swept: number;
    changedQueued: number;
    newUnassignedQueued: number;
    deduped: number;
    queueFull: number;
    unassigned: number[];
  }> {
    const result = {
      swept: 0,
      changedQueued: 0,
      newUnassignedQueued: 0,
      deduped: 0,
      queueFull: 0,
      unassigned: [] as number[],
    };
    const rows = this.ledger.active;
    const byApp = new Map<number, WatchRow[]>();
    for (const row of rows) {
      const list = byApp.get(row.appId) ?? [];
      list.push(row);
      byApp.set(row.appId, list);
    }
    // Apps to sweep: ledgered rows plus any configured explicitly, so
    // new-unassigned discovery works even with an empty ledger.
    const appIds = new Set([...byApp.keys(), ...parseIdListEnv(process.env['TEAMDYNAMIX_WATCH_APP_IDS'])]);
    const groupFilter = this.groupIds();
    const statusFilter = this.statusIds();
    const queue: PendingTriageItem[] = (this.ledger.pendingTriage ??= []);
    const ledgeredIds = new Set(rows.map(r => r.id));

    for (const appId of appIds) {
      const appRows = byApp.get(appId) ?? [];
      let page: ReadonlyArray<Record<string, unknown>>;
      try {
        page = (await this.client.searchTickets(appId, { MaxResults: 500 })) as ReadonlyArray<Record<string, unknown>>;
      } catch {
        continue; // sweep is best-effort; check() reports errors properly
      }

      for (const t of page) {
        const id = Number(t['ID']);
        if (!Number.isFinite(id)) continue;
        // Client-side team restriction
        if (groupFilter.length > 0) {
          const gid = Number(t['ResponsibleGroupID']);
          if (!groupFilter.includes(gid)) continue;
        }
        if (statusFilter.length > 0 && !statusFilter.includes(Number(t['StatusID']))) continue;
        result.swept += 1;

        const row = appRows.find(r => r.id === id);
        const modified = String(t['ModifiedDate'] ?? '');
        if (row && row.stateHash.modified !== '' && modified !== row.stateHash.modified) {
          const outcome = this.pushPending({ ticketId: id, appId, reason: 'changed', at: new Date().toISOString() });
          if (outcome === 'queued') result.changedQueued += 1;
          else if (outcome === 'deduped') result.deduped += 1;
          else result.queueFull += 1;
        }

        // New unassigned tickets in the team's queues (client-side: ownership
        // surfaces are unreliable — treat empty or "Unassigned" as unassigned)
        if (!ledgeredIds.has(id)) {
          const responsible = String(t['ResponsibleUid'] ?? '').trim();
          if (UNASSIGNED_SENTINELS.has(responsible.toLowerCase())) {
            result.unassigned.push(id);
            const outcome = this.pushPending({
              ticketId: id,
              appId,
              reason: 'new-unassigned',
              at: new Date().toISOString(),
              detail: `group=${String(t['ResponsibleGroupName'] ?? '')}`,
            });
            if (outcome === 'queued') result.newUnassignedQueued += 1;
            else if (outcome === 'deduped') result.deduped += 1;
            else result.queueFull += 1;
          }
        }
      }

      // Refresh hashes for ledgered rows seen on the page (cheap freshness)
      for (const row of appRows) {
        const t = page.find(x => Number(x['ID']) === row.id);
        if (t) row.stateHash.modified = String(t['ModifiedDate'] ?? row.stateHash.modified);
      }
    }
    this.ledger.sweepMeta.lastSweep = new Date().toISOString();
    await this.persist();
    return result;
  }

  pendingTriage(): readonly PendingTriageItem[] {
    return this.ledger.pendingTriage ?? [];
  }

  async markTriaged(ticketId: number): Promise<{ removed: boolean }> {
    const queue = this.ledger.pendingTriage ?? [];
    const before = queue.length;
    this.ledger.pendingTriage = queue.filter(p => p.ticketId !== ticketId);
    await this.persist();
    return { removed: this.ledger.pendingTriage.length < before };
  }

  private async persist(): Promise<void> {
    await saveLedger(this.ledgerPath, this.ledger);
    this.ledger = await loadLedger(this.ledgerPath);
  }

  private findRow(id: number): WatchRow | undefined {
    return this.ledger.active.find(r => r.id === id);
  }

  async register(input: {
    appId: number;
    id: number;
    kind: WatchRow['kind'];
    title?: string;
    district?: string;
    ball?: 'us' | 'them';
    nextAction?: string;
  }): Promise<WatchRow> {
    const existing = this.findRow(input.id);
    if (existing) {
      existing.kind = input.kind;
      if (input.title !== undefined) existing.title = cap(redact(input.title), TITLE_MAX_CHARS);
      if (input.district !== undefined) existing.district = input.district;
      if (input.nextAction !== undefined) existing.nextAction = input.nextAction;
      if (input.ball !== undefined) {
        existing.ball = input.ball;
        existing.ballSource = 'manual';
      }
      await this.persist();
      return existing;
    }
    const row: WatchRow = {
      id: input.id,
      appId: input.appId,
      title: cap(redact(input.title ?? ''), TITLE_MAX_CHARS),
      district: input.district ?? '',
      kind: input.kind,
      status: '',
      stateHash: { modified: '', lastEntryId: 0, entryCount: 0, replyCount: 0, perEntryReplies: {} },
      ball: input.ball ?? 'us',
      ballSource: input.ball !== undefined ? 'manual' : 'auto',
      nextAction: input.nextAction ?? '',
      lastChecked: '',
      memory: { notes: [], observations: [] },
    };
    this.ledger.active.push(row);
    await this.persist();
    return row;
  }

  async archive(input: { id: number; outcome?: string }): Promise<{ archived: boolean }> {
    const idx = this.ledger.active.findIndex(r => r.id === input.id);
    if (idx === -1) return { archived: false };
    const [row] = this.ledger.active.splice(idx, 1);
    this.ledger.archived.push({ ...row, outcome: input.outcome });
    await this.persist();
    return { archived: true };
  }

  async status(): Promise<{
    activeCount: number;
    archivedCount: number;
    ballUs: number;
    ballThem: number;
    oldestChecked: string;
  }> {
    const active = this.ledger.active;
    const oldestChecked =
      active
        .map(r => r.lastChecked)
        .filter(Boolean)
        .sort()[0] ?? '';
    return {
      activeCount: active.length,
      archivedCount: this.ledger.archived.length,
      ballUs: active.filter(r => r.ball === 'us').length,
      ballThem: active.filter(r => r.ball === 'them').length,
      oldestChecked,
    };
  }

  async check(input: { tickets?: number[] } = {}): Promise<WatchCheckReport> {
    const report: WatchCheckReport = { checked: 0, deltas: [], errors: [] };
    const rows = this.ledger.active.filter(r => (input.tickets ? input.tickets.includes(r.id) : true));
    const byApp = new Map<number, WatchRow[]>();
    for (const row of rows) {
      const list = byApp.get(row.appId) ?? [];
      list.push(row);
      byApp.set(row.appId, list);
    }

    for (const [appId, appRows] of byApp) {
      // Stage 1: one sweep per appId; rows whose Modified moved get deep fetches.
      let sweep: ReadonlyArray<Record<string, unknown>>;
      try {
        sweep = (await this.client.searchTickets(appId, { MaxResults: 500 })) as ReadonlyArray<Record<string, unknown>>;
      } catch (cause) {
        report.errors.push(`sweep failed for appId ${appId}: ${String(cause)}`);
        continue;
      }
      const sweepById = new Map(sweep.map(t => [Number(t['ID']), t]));

      for (const row of appRows) {
        report.checked += 1;
        const sweepTicket = sweepById.get(row.id);
        const sweepModified = sweepTicket ? String(sweepTicket['ModifiedDate'] ?? '') : '';
        const seeded = row.stateHash.modified !== '';
        const needsDeep = !seeded || sweepModified !== row.stateHash.modified;
        if (seeded && !needsDeep) continue;

        const classes = new Set<string>();
        try {
          // Full ticket objects arrive on the sweep; deep-fetch only when the row
          // is missing from the sweep (closed or beyond the default page).
          const t = sweepTicket ?? ((await this.client.getTicket(appId, row.id)) as Record<string, unknown>);
          const feed = (await this.client.getTicketFeed(appId, row.id)) as readonly FeedEntryLike[];
          const modified = String(t['ModifiedDate'] ?? '');
          const status = String(t['Status'] ?? t['StatusID'] ?? '');
          const isOnHold = Boolean(t['IsOnHold']);

          if (seeded && status !== row.status) classes.add('status');
          if (seeded && Boolean(t['IsOnHold']) !== row.status.startsWith('hold:')) {
            // hold-window is tracked via the seeded hash below; classify on transitions
          }
          if (seeded && modified !== row.stateHash.modified) classes.add('new-entry');

          const prevHash = row.stateHash;
          const newHash = { modified, ...computeHash(feed) };
          if (seeded && hashGrewHiddenReplies(prevHash, feed)) classes.add('hidden-reply');
          if (seeded && newHash.entryCount > prevHash.entryCount) classes.add('new-entry');
          if (seeded && isOnHold !== (row as WatchRow & { wasOnHold?: boolean }).wasOnHold) {
            classes.add('hold-window');
          }
          // sla: only classifiable when the deployment returns an SLA date field
          const slaDate = t['SlaCompleteByDate'];
          if (seeded && typeof slaDate === 'string' && slaDate !== (row as WatchRow & { slaDate?: string }).slaDate) {
            classes.add('sla');
            (row as WatchRow & { slaDate?: string }).slaDate = slaDate;
          }
          (row as WatchRow & { wasOnHold?: boolean }).wasOnHold = isOnHold;

          // Ball inference from last feed-entry authorship
          if (row.ballSource === 'auto' && feed.length > 0) {
            const last = feed[0]; // newest-first
            const author = String(last?.CreatedUid ?? '');
            if (author) row.ball = this.usUidsFor().has(author) ? 'them' : 'us';
          }

          row.stateHash = newHash;
          row.status = status;
          if (typeof t['Title'] === 'string' && row.title === '') {
            row.title = cap(redact(t['Title']), TITLE_MAX_CHARS);
          }
          row.lastChecked = new Date().toISOString();

          if (this.autoObserve) {
            row.memory.observations.push({ at: row.lastChecked, seen: { status, modified } });
            if (row.memory.observations.length > MAX_OBSERVATIONS) {
              row.memory.observations = row.memory.observations.slice(-MAX_OBSERVATIONS);
            }
          }

          if (classes.size > 0) {
            report.deltas.push({
              id: row.id,
              appId,
              classes: [...classes],
              status: sanitizeForReport(status) as string,
              modified,
              ball: row.ball,
            });
          }
        } catch (cause) {
          report.errors.push(`deep fetch failed for ticket ${row.id}: ${String(cause)}`);
        }
      }
    }
    this.ledger.sweepMeta.lastSweep = new Date().toISOString();
    await this.persist();
    return this.capReport(report);
  }

  private capReport(report: WatchCheckReport): WatchCheckReport {
    let json = JSON.stringify(report);
    if (json.length > REPORT_MAX_CHARS) {
      report.deltas = report.deltas.slice(0, Math.max(1, Math.floor(report.deltas.length / 2)));
      json = JSON.stringify(report);
      if (json.length > REPORT_MAX_CHARS) report.deltas = [];
    }
    return report;
  }

  //
  // Notes (local-only memory; never written to TDX)
  //

  async notesAdd(input: { appId: number; ticketId: number; text: string }): Promise<LedgerNote> {
    const row = this.rowForNote(input.appId, input.ticketId);
    const now = new Date().toISOString();
    const note: LedgerNote = {
      id: `n-${now}-${Math.random().toString(36).slice(2, 8)}`,
      text: cap(redact(input.text), MAX_NOTE_LENGTH),
      createdAt: now,
      updatedAt: now,
    };
    row.memory.notes.unshift(note);
    await this.persist();
    return note;
  }

  async notesUpdate(input: { noteId: string; text: string }): Promise<LedgerNote> {
    const { row, note } = this.noteById(input.noteId);
    note.text = cap(redact(input.text), MAX_NOTE_LENGTH);
    note.updatedAt = new Date().toISOString();
    await this.persist();
    return note;
  }

  async notesDelete(input: { noteId: string }): Promise<{ deleted: boolean }> {
    const { row } = this.noteById(input.noteId);
    row.memory.notes = row.memory.notes.filter(n => n.id !== input.noteId);
    await this.persist();
    return { deleted: true };
  }

  async notesList(input: { appId?: number; ticketId?: number }): Promise<readonly LedgerNote[]> {
    const rows = this.ledger.active.filter(
      r =>
        (input.appId === undefined || r.appId === input.appId) &&
        (input.ticketId === undefined || r.id === input.ticketId),
    );
    return rows.flatMap(r => r.memory.notes);
  }

  private rowForNote(appId: number, ticketId: number): WatchRow {
    const row = this.ledger.active.find(r => r.id === ticketId && r.appId === appId);
    if (!row) throw new Error(`No active watch row for ticket ${ticketId} in app ${appId}; register it first.`);
    return row;
  }

  private noteById(noteId: string): { row: WatchRow; note: LedgerNote } {
    for (const row of [...this.ledger.active, ...this.ledger.archived]) {
      const note = row.memory.notes.find(n => n.id === noteId);
      if (note) return { row, note };
    }
    throw new Error(`Note ${noteId} not found.`);
  }
}
