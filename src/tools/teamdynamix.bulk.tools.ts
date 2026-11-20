import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { bulkAddUsersToGroup } from '@voxslopuli/teamdynamix-ts';
import { z } from 'zod';
import { getTeamDynamixConfig } from '../config.js';
import { TEAMDYNAMIX_TOOL_PREFIX } from '../constants.js';
import { TeamDynamixAppIdSchema, TeamDynamixResponseFormatSchema } from '../schemas/teamdynamix/index.js';
import {
  assertWriteToolsEnabled,
  createConfiguredTeamDynamixClient,
  type UnifiedTeamDynamixClient,
} from '../services/teamdynamix/client.service.js';
import { render } from '../services/teamdynamix/render.service.js';
import type { ResponseFormat } from '../types.js';

/**
 * Bulk tools. Caps keep every bulk call inside the deployment's rate limits;
 * per-item errors are isolated so one bad ticket never aborts the batch.
 */

const BULK_CAP = 25;
const TicketIdsSchema = z.array(z.number().int().positive()).min(1).max(BULK_CAP);

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const BULK_RESULTS_NOTE = `Per-item results: \`results\` carries \`ticketId\` plus \`ticket\` (with its inline \`feed\` unless \`include_feed: false\`) or \`error\`, keeping the input order. Capped at ${BULK_CAP} IDs per call — pass the remainder in a follow-up call.`;

export function registerTeamDynamixBulkTools(server: McpServer): void {
  server.registerTool(
    `${TEAMDYNAMIX_TOOL_PREFIX}_bulk_get_tickets`,
    {
      title: 'Bulk Get Tickets',
      description: `Reads many tickets in one round trip, each with its feed attached as a \`feed\` subfield (entries newest-first, per-entry replies expanded). ${BULK_RESULTS_NOTE}`,
      inputSchema: {
        app_id: TeamDynamixAppIdSchema,
        ticket_ids: TicketIdsSchema.describe(`Ticket IDs to read (1–${BULK_CAP}).`),
        include_feed: z
          .boolean()
          .optional()
          .default(true)
          .describe('Set false to read tickets without feed data (no feed reads).'),
        response_format: TeamDynamixResponseFormatSchema,
      },
      annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({
      app_id,
      ticket_ids,
      include_feed,
      response_format,
    }: {
      app_id: number;
      ticket_ids: number[];
      include_feed?: boolean;
      response_format: ResponseFormat;
    }) => {
      try {
        const client = (await createConfiguredTeamDynamixClient()) as UnifiedTeamDynamixClient;
        const bulk = await client.bulkGetTickets(app_id, ticket_ids, { includeFeed: include_feed });
        return {
          content: [{ type: 'text', text: render(bulk, response_format) }],
          structuredContent: bulk as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `Error: ${messageFromError(error)}` }], isError: true };
      }
    },
  );

  server.registerTool(
    `${TEAMDYNAMIX_TOOL_PREFIX}_bulk_update_tickets`,
    {
      title: 'Bulk Update Tickets',
      description: `Partially updates up to ${BULK_CAP} tickets in sequence (API patches are POST edits; sequential to respect per-IP rate limits). Updates are applied one by one and per-item failures never abort the batch. Requires the write gate.`,
      inputSchema: {
        app_id: TeamDynamixAppIdSchema,
        updates: z
          .array(
            z.object({
              ticket_id: z.number().int().positive(),
              attributes: z.record(z.string(), z.unknown()).describe('Ticket fields to patch for this ticket.'),
              comments: z.string().max(65535).optional(),
            }),
          )
          .min(1)
          .max(BULK_CAP)
          .describe(`Per-ticket patches (1–${BULK_CAP}).`),
        response_format: TeamDynamixResponseFormatSchema,
      },
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({
      app_id,
      updates,
      response_format,
    }: {
      app_id: number;
      updates: Array<{ ticket_id: number; attributes: Record<string, unknown>; comments?: string }>;
      response_format: ResponseFormat;
    }) => {
      try {
        const config = getTeamDynamixConfig();
        assertWriteToolsEnabled(config);
        const client = (await createConfiguredTeamDynamixClient()) as UnifiedTeamDynamixClient;
        const bulk = await client.bulkUpdateTickets(
          app_id,
          updates.map(u => ({ ticketId: u.ticket_id, attributes: u.attributes, comments: u.comments })),
        );
        return {
          content: [{ type: 'text', text: render(bulk, response_format) }],
          structuredContent: bulk as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `Error: ${messageFromError(error)}` }], isError: true };
      }
    },
  );

  server.registerTool(
    `${TEAMDYNAMIX_TOOL_PREFIX}_bulk_add_users_to_group`,
    {
      title: 'Bulk Add Users to Group',
      description:
        'Adds many users to a TeamDynamix group in one call (per-item failure isolation via the SDK bulk helper). Set `dry_run` to validate the batch without touching the API.',
      inputSchema: {
        group_id: z.number().int().positive().describe('Target group ID.'),
        uids: z.array(z.string().min(1)).min(1).max(BULK_CAP).describe(`User GUIDs to add (1–${BULK_CAP}).`),
        dry_run: z.boolean().optional().default(false).describe('Pretend to run, report what would be added.'),
        response_format: TeamDynamixResponseFormatSchema,
      },
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({
      group_id,
      uids,
      dry_run,
      response_format,
    }: {
      group_id: number;
      uids: string[];
      dry_run?: boolean;
      response_format: ResponseFormat;
    }) => {
      try {
        assertWriteToolsEnabled(getTeamDynamixConfig());
        const fetchClient = (await createConfiguredTeamDynamixClient()) as unknown as Parameters<
          typeof bulkAddUsersToGroup
        >[0];
        const bulk = await bulkAddUsersToGroup(fetchClient, { groupId: group_id, uids, dryRun: dry_run });
        return {
          content: [{ type: 'text', text: render(bulk, response_format) }],
          structuredContent: bulk as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `Error: ${messageFromError(error)}` }], isError: true };
      }
    },
  );
}
