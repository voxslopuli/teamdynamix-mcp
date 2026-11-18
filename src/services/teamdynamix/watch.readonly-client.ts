/**
 * Structural leak guard: watch/notes code may ONLY read from TeamDynamix.
 * This type exposes no mutating methods, so a feed-write or ticket-write call
 * from watch code is a compile error. UnifiedTeamDynamixClient satisfies it
 * structurally.
 */
export interface ReadableClient {
  getTicket(appId: number, ticketId: number): Promise<unknown>;
  searchTickets(appId: number, body: Record<string, unknown>): Promise<readonly unknown[]>;
  getTicketFeed(appId: number, ticketId: number, opts?: { repliesEntryLimit?: number }): Promise<readonly unknown[]>;
}
