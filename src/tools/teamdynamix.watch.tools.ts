import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TEAMDYNAMIX_TOOL_PREFIX } from '../constants.js';
import { TeamDynamixResponseFormatSchema } from '../schemas/teamdynamix/index.js';
import { createConfiguredTeamDynamixClient } from '../services/teamdynamix/client.factory.js';
import { defaultLedgerPath, emptyLedger, loadLedger, LedgerCorruptError } from '../services/teamdynamix/watch.store.js';
import { WorkspaceWatchService } from '../services/teamdynamix/watch.service.js';
import { render } from '../services/teamdynamix/render.service.js';
import type { ResponseFormat } from '../types.js';

/**
 * Workspace watch tools (issue #19): a local, hash-diff ledger of tickets the
 * agent manages, plus local-only notes. Strictly read-only toward TDX — drafts
 * and sends stay human-owned; the write gate is untouched.
 */

const WatchKindSchema = z.enum(['mine', 'watching', 'waiting-on-others']);
const BallSchema = z.enum(['us', 'them']);

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function withService<T>(
  responseFormat: ResponseFormat,
  fn: (svc: WorkspaceWatchService) => Promise<T>,
): Promise<{
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}> {
  try {
    const client = createConfiguredTeamDynamixClient();
    const ledgerPath = defaultLedgerPath();
    let ledger;
    try {
      ledger = await loadLedger(ledgerPath);
    } catch (cause) {
      if (cause instanceof LedgerCorruptError) throw cause;
      ledger = emptyLedger();
    }
    const svc = new WorkspaceWatchService(ledger, ledgerPath, client);
    const data = await fn(svc);
    return {
      content: [{ type: 'text', text: render(data, responseFormat) }],
      structuredContent: data as Record<string, unknown>,
    };
  } catch (error) {
    return { content: [{ type: 'text', text: `Error: ${messageFromError(error)}` }], isError: true };
  }
}

export function registerTeamDynamixWatchTools(server: McpServer): void {
  const readOnly = { readOnlyHint: true, idempotentHint: false, destructiveHint: false, openWorldHint: true };

  server.registerTool(
    `${TEAMDYNAMIX_TOOL_PREFIX}_watch_check`,
    {
      title: 'Watch Check',
      description:
        'Diff pass over the watch ledger: sweeps queue searches per app, deep-fetches only changed tickets, and returns classified deltas (status, new-entry, hidden-reply, ownership, sla, hold-window).',
      inputSchema: {
        tickets: z.array(z.number().int().positive()).optional().describe('Restrict the check to these ticket IDs.'),
        response_format: TeamDynamixResponseFormatSchema,
      },
      annotations: { ...readOnly },
    },
    async ({ tickets, response_format }: { tickets?: number[]; response_format: ResponseFormat }) =>
      withService(response_format, svc => svc.check({ tickets })),
  );

  server.registerTool(
    `${TEAMDYNAMIX_TOOL_PREFIX}_watch_status`,
    {
      title: 'Watch Status',
      description:
        'Ledger summary (counts, ball-in-court, pending-triage queue, oldest freshness) without any TDX calls.',
      inputSchema: { response_format: TeamDynamixResponseFormatSchema },
      annotations: { ...readOnly, idempotentHint: true, openWorldHint: false },
    },
    async ({ response_format }: { response_format: ResponseFormat }) =>
      withService(response_format, async svc => ({
        ...(await svc.status()),
        pendingTriage: svc.pendingTriage(),
      })),
  );

  server.registerTool(
    `${TEAMDYNAMIX_TOOL_PREFIX}_watch_sweep`,
    {
      title: 'Watch Sweep',
      description:
        'Cheap sweep: one queue search per configured app, client-side team restriction (TEAMDYNAMIX_TICKET_GROUP_IDS), ledger freshness, and pending-triage queue maintenance (changed + new-unassigned tickets). No deep fetches.',
      inputSchema: { response_format: TeamDynamixResponseFormatSchema },
      annotations: { ...readOnly },
    },
    async ({ response_format }: { response_format: ResponseFormat }) =>
      withService(response_format, svc => svc.sweep()),
  );

  server.registerTool(
    `${TEAMDYNAMIX_TOOL_PREFIX}_watch_triage`,
    {
      title: 'Watch Triage Queue',
      description:
        'Local triage queue (never calls TDX). op=queue lists pending tickets needing background triage; op=done removes a ticket after the agent has reviewed it and updated notes.',
      inputSchema: {
        op: z.enum(['queue', 'done']),
        ticket_id: z.number().int().positive().optional().describe('Required for op=done.'),
        response_format: TeamDynamixResponseFormatSchema,
      },
      annotations: { ...readOnly, openWorldHint: false },
    },
    async ({
      op,
      ticket_id,
      response_format,
    }: {
      op: 'queue' | 'done';
      ticket_id?: number;
      response_format: ResponseFormat;
    }) =>
      withService<Record<string, unknown>>(response_format, async svc => {
        if (op === 'queue') return { pending: svc.pendingTriage() } as Record<string, unknown>;
        if (ticket_id === undefined) throw new Error('op=done requires ticket_id.');
        return (await svc.markTriaged(ticket_id)) as Record<string, unknown>;
      }),
  );

  server.registerTool(
    `${TEAMDYNAMIX_TOOL_PREFIX}_watch_register`,
    {
      title: 'Watch Register',
      description: 'Add/update a ledger row when a ticket is claimed, re-scoped, or swept in. Never calls TDX.',
      inputSchema: {
        app_id: z.number().int().positive().describe('Ticketing application ID.'),
        id: z.number().int().positive().describe('Ticket ID.'),
        kind: WatchKindSchema.describe('Lane: mine, watching, or waiting-on-others.'),
        title: z.string().max(200).optional().describe('Short title (stored locally only).'),
        district: z.string().max(100).optional().describe('District/lane label.'),
        ball: BallSchema.optional().describe('Manual ball-in-court override (survives auto-inference).'),
        next_action: z.string().max(500).optional().describe('Next action note.'),
        response_format: TeamDynamixResponseFormatSchema,
      },
      annotations: { ...readOnly, openWorldHint: false },
    },
    async ({
      app_id,
      id,
      kind,
      title,
      district,
      ball,
      next_action,
      response_format,
    }: {
      app_id: number;
      id: number;
      kind: 'mine' | 'watching' | 'waiting-on-others';
      title?: string;
      district?: string;
      ball?: 'us' | 'them';
      next_action?: string;
      response_format: ResponseFormat;
    }) =>
      withService(response_format, svc =>
        svc.register({ appId: app_id, id, kind, title, district, ball, nextAction: next_action }),
      ),
  );

  server.registerTool(
    `${TEAMDYNAMIX_TOOL_PREFIX}_watch_archive`,
    {
      title: 'Watch Archive',
      description: 'Move a confirmed-closed row to the archive section. Memory (notes) is preserved. Never calls TDX.',
      inputSchema: {
        id: z.number().int().positive().describe('Ticket ID.'),
        outcome: z.string().max(200).optional().describe('Resolution outcome label.'),
        response_format: TeamDynamixResponseFormatSchema,
      },
      annotations: { ...readOnly, openWorldHint: false },
    },
    async ({ id, outcome, response_format }: { id: number; outcome?: string; response_format: ResponseFormat }) =>
      withService(response_format, svc => svc.archive({ id, outcome })),
  );

  server.registerTool(
    `${TEAMDYNAMIX_TOOL_PREFIX}_watch_notes`,
    {
      title: 'Watch Notes',
      description:
        "Local-only notes attached to ledgered tickets — the server's own memory. Never written to TDX. op: add | update | delete | list.",
      inputSchema: {
        op: z.enum(['add', 'update', 'delete', 'list']),
        app_id: z.number().int().positive().optional(),
        ticket_id: z.number().int().positive().optional(),
        note_id: z.string().optional(),
        text: z.string().max(4000).optional(),
        response_format: TeamDynamixResponseFormatSchema,
      },
      annotations: { ...readOnly, openWorldHint: false },
    },
    async ({
      op,
      app_id,
      ticket_id,
      note_id,
      text,
      response_format,
    }: {
      op: 'add' | 'update' | 'delete' | 'list';
      app_id?: number;
      ticket_id?: number;
      note_id?: string;
      text?: string;
      response_format: ResponseFormat;
    }) =>
      withService(response_format, async svc => {
        switch (op) {
          case 'add':
            if (app_id === undefined || ticket_id === undefined || !text) {
              throw new Error('op=add requires app_id, ticket_id, and text.');
            }
            return svc.notesAdd({ appId: app_id, ticketId: ticket_id, text });
          case 'update':
            if (!note_id || !text) throw new Error('op=update requires note_id and text.');
            return svc.notesUpdate({ noteId: note_id, text });
          case 'delete':
            if (!note_id) throw new Error('op=delete requires note_id.');
            return svc.notesDelete({ noteId: note_id });
          case 'list':
            // structuredContent must be a record per the MCP SDK's tool-result
            // schema — arrays are rejected client-side (#21).
            return { notes: await svc.notesList({ appId: app_id, ticketId: ticket_id }) };
        }
      }),
  );
}
