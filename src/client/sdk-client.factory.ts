import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTeamDynamixClient, loginWithPassword, loginWithServiceAccount } from '@voxslopuli/teamdynamix-ts';
import type { TeamDynamixClientConfig, TeamDynamixSdk } from '@voxslopuli/teamdynamix-ts';
import type { TeamDynamixConfig } from '../types.js';

/** Merged SDK + fetch client (domain helpers plus the raw openapi-fetch POST/GET surface). */
export type McpSdkClient = TeamDynamixSdk & Awaited<ReturnType<typeof createTeamDynamixClient>>['client'];

// ponytail: resolve spec from installed SDK package, not process.cwd() — host cwd is
// C:\Windows\System32 under Raycast/MCP hosts. Remove when SDK ships module-relative defaultSpecPath.
let cachedSpecPath: string | undefined;
function resolveSdkSpecPath(): string | undefined {
  const override = process.env['TEAMDYNAMIX_SPEC_PATH']?.trim();
  if (override) return override;
  if (cachedSpecPath) return cachedSpecPath;
  try {
    const require = createRequire(fileURLToPath(import.meta.url));
    // Resolve the package entry point (exported) rather than package.json (not exported
    // via the SDK's exports map — ERR_PACKAGE_PATH_NOT_EXPORTED in published installs).
    const entryPath = require.resolve('@voxslopuli/teamdynamix-ts');
    const pkgRoot = dirname(entryPath);
    const candidates = [
      resolve(pkgRoot, 'dist/generated/openapi.json'),
      resolve(pkgRoot, 'generated/openapi.json'),
      resolve(pkgRoot, 'src/generated/openapi.json'),
    ];
    cachedSpecPath = candidates.find(p => existsSync(p));
    return cachedSpecPath;
  } catch {
    return undefined;
  }
}
/**
 * Creates a token provider for the SDK client.
 *
 * Supports two auth modes:
 * - Standard: username/password
 * - Admin: BEID/WebServicesKey
 */
function createTokenProvider(config: TeamDynamixConfig, tenant: string): () => string | Promise<string> {
  // Pass the full baseUrl (including any /TDWebApi path prefix) so auth hits the right
  // origin — a bare tenant/FQDN cannot express path-mounted deployments (issue #15).
  if (config.authMode === 'admin') {
    if (!config.beid || !config.webServicesKey) {
      throw new Error('BEID and WebServicesKey are required for admin authentication');
    }

    return loginWithServiceAccount({
      tenant,
      baseUrl: config.baseUrl,
      beid: config.beid,
      webServicesKey: config.webServicesKey,
    });
  }

  if (!config.username || !config.password) {
    throw new Error('Username and password are required for standard authentication');
  }

  return loginWithPassword({
    tenant,
    baseUrl: config.baseUrl,
    username: config.username,
    password: config.password,
  });
}

/**
 * Extracts the tenant from a baseUrl.
 *
 * Examples:
 * - "https://mytenant.teamdynamix.com/TDWebApi" → "mytenant"
 * - "https://td.myuniversity.edu/TDWebApi" → "td.myuniversity.edu"
 */
function extractTenant(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '').replace(/\/TDWebApi$/, '');
  const withoutProtocol = normalized.replace(/^https?:\/\//, '');
  const parts = withoutProtocol.split('/');
  return parts[0] ?? '';
}

/**
 * Builds an SDK client config from the MCP server config.
 */
function buildSdkConfig(
  config: TeamDynamixConfig,
  tenant: string,
  tokenProvider: () => string | Promise<string>,
): TeamDynamixClientConfig {
  return {
    tenant,
    tokenProvider,
    environment: config.baseUrl?.includes('sandbox') ? 'sandbox' : 'production',
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
    runtimeValidationMode: 'fail-open',
    ...(resolveSdkSpecPath() ? { specPath: resolveSdkSpecPath() as string } : {}),
    retryPolicy: {
      maxRetries: config.maxRetries,
    },
  };
}

/**
 * Creates an SDK client from MCP config.
 * Returns the TeamDynamix SDK client with full domain access.
 */
export async function createMcpSdkClient(config: TeamDynamixConfig): Promise<McpSdkClient> {
  const tenant = extractTenant(config.baseUrl ?? '');
  const tokenProvider = createTokenProvider(config, tenant);
  const sdkConfig = buildSdkConfig(config, tenant, tokenProvider);
  const { client } = await createTeamDynamixClient(sdkConfig);
  return client;
}
