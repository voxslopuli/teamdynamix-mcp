import { describe, expect, it } from 'vitest';
import { createTeamDynamixSdk } from '@voxslopuli/teamdynamix-ts';

/**
 * SDK surface contract (regression net for the silent runtime break fixed in
 * v0.5.3): SdkReadDomain has an index signature, so TypeScript accepts ANY
 * method name on a domain object even though the SDK only defines the routes
 * in its generated manifest. Calling a method that does not exist fails at
 * runtime, not at compile time.
 *
 * This test instantiates the REAL SDK client surface (with a stub fetch
 * client — no network) and asserts that every (domain, method) pair the
 * MCP's UnifiedTeamDynamixClient invokes actually exists.
 *
 * When the factory gains a new SDK call, add it here; when the SDK is
 * regenerated, this test fails loudly if a name drifted.
 */
const stubFetchClient = {
  GET: async () => ({ data: [], error: undefined }),
  POST: async () => ({ data: [], error: undefined }),
  PUT: async () => ({ data: [], error: undefined }),
  PATCH: async () => ({ data: [], error: undefined }),
  DELETE: async () => ({ data: [], error: undefined }),
} as never;

const usedSdkMethods: Array<[keyof ReturnType<typeof createTeamDynamixSdk> | string, string]> = [
  // discovery
  ['discovery', 'authGetuser'],
  ['discovery', 'applications'],
  // tickets
  ['tickets', 'appIdTicketsId'],
  ['tickets', 'appIdTicketsSearch'],
  ['tickets', 'appIdTicketsIdFeed'],
  ['tickets', 'appIdTicketsTypes'],
  ['tickets', 'appIdTicketsPriorities'],
  ['tickets', 'appIdTicketsUrgencies'],
  ['tickets', 'appIdTicketsImpacts'],
  ['tickets', 'appIdTicketsSources'],
  ['tickets', 'createTicket'],
  ['tickets', 'updateTicket'],
  ['tickets', 'addTicketComment'],
  // ticketRelationships
  ['ticketRelationships', 'appIdTicketsTicketIdTasks'],
  ['ticketRelationships', 'appIdTicketsIdAssets'],
  ['ticketRelationships', 'appIdTicketsIdContacts'],
  ['ticketRelationships', 'createTicketTask'],
  ['ticketRelationships', 'addTicketAsset'],
  ['ticketRelationships', 'removeTicketAsset'],
  ['ticketRelationships', 'addTicketContact'],
  ['ticketRelationships', 'removeTicketContact'],
  // knowledgeBase
  ['knowledgeBase', 'appIdKnowledgebaseId'],
  ['knowledgeBase', 'appIdKnowledgebaseCategories'],
  ['knowledgeBase', 'appIdKnowledgebaseSearch'],
  ['knowledgeBase', 'createArticle'],
  ['knowledgeBase', 'updateArticle'],
  // people
  ['people', 'peopleUid'],
  ['people', 'peopleLookup'],
  ['people', 'peopleSearch'],
  ['people', 'groupsId'],
  ['people', 'groupsIdMembers'],
  ['people', 'searchGroups'],
  // projects
  ['projects', 'appIdProjectsId'],
  ['projects', 'appIdProjectsFeed'],
  ['referenceData', 'appIdProjectsTypes'],
  ['projects', 'appIdProjectsProjectIDPlansPlanID'],
  ['projects', 'appIdProjectsProjectIdIssuesCategories'],
  ['projects', 'appIdProjectsProjectIdRisksCategories'],
  ['projects', 'createIssue'],
  ['projects', 'createRisk'],
  // assets / cmdb / services / referenceData / time
  ['assets', 'appIdAssetsId'],
  ['assets', 'appIdAssetsFeed'],
  ['assets', 'appIdAssetsStatuses'],
  ['assets', 'appIdAssetsModels'],
  ['cmdb', 'appIdAssetsVendors'], // vendors routes are bucketed under cmdb
  ['assets', 'deleteAsset'],
  ['cmdb', 'appIdCmdbId'],
  ['cmdb', 'appIdCmdbSearches'],
  ['cmdb', 'appIdCmdbTypes'],
  ['cmdb', 'appIdCmdbRelationshiptypes'],
  ['cmdb', 'deleteConfigurationItem'],
  ['services', 'appIdServices'],
  ['services', 'appIdServicesId'],
  ['services', 'appIdServicesCategories'],
  ['services', 'deleteService'],
  ['services', 'deleteServiceCategory'],
  ['referenceData', 'accounts'],
  ['referenceData', 'accountsId'],
  ['referenceData', 'locations'],
  ['referenceData', 'securityrolesPermissions'],
  ['referenceData', 'attributesCustom'],
  ['referenceData', 'appIdTicketsStatuses'],
  ['time', 'timeId'],
  ['time', 'timeTypes'],
  ['time', 'deleteTimeEntry'],
  ['helpers', 'findUserByEmail'],
];

describe('SDK surface contract', () => {
  it('exposes every method the MCP client factory invokes', async () => {
    const sdk = createTeamDynamixSdk(stubFetchClient);
    const missing: string[] = [];
    for (const [domain, method] of usedSdkMethods) {
      // @ts-expect-error probing the real runtime surface deliberately
      const bucket = sdk[domain];
      if (!bucket || typeof bucket[method] !== 'function') {
        missing.push(`${domain}.${method}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
