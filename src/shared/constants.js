/**
 * Meshy Downloader - Shared Constants
 */

export const STORAGE_KEYS = {
  OUTPUT_STATE: 'meshyOutputState',
  ENTITLEMENT: 'meshyEntitlement',
  COMMUNITY_STATE: 'meshyCommunityState',
  PENDING_DOWNLOADS: 'meshyPendingDownloads',
  PENDING_CONSUMPTIONS: 'meshyPendingConsumptions',
  INSTALLATION_ID: 'meshyInstallationId',
  IDENTITY: 'meshyIdentity'
};

export const TASK_STATUS_REGEX = /\/meshyd-api\/web\/(?:public\/)?v\d+\/tasks\/([^/]+)\/status(?:\?|$)/;
export const TASK_V2_REGEX = /\/meshyd-api\/web\/(?:public\/)?v\d+\/tasks\/([^/?#]+)(?:[?#].*)?$/;
export const COMMUNITY_POST_REGEX = /\/meshyd-api\/web\/v\d+\/community\/posts\/([^/?#]+)(?:[?#].*)?$/;
export const PUBLIC_POST_REGEX = /\/meshyd-api\/web\/v\d+\/posts\/([^/?#]+)(?:[?#].*)?$/;

export const DEFAULT_OUTPUT_STATE = {
  active: false,
  activeUrl: null,
  activeSince: null,
  activeTaskId: null,
  current: null,
  lastSuccessful: null,
  tasksById: {}
};

export const DEFAULT_COMMUNITY_STATE = {
  activePost: null,
  status: 'idle',
  error: null,
  updatedAt: new Date().toISOString()
};

export const UNLIMITED_ENTITLEMENT = {
  exists: true,
  userId: 'open-source-user',
  email: 'unlimited@meshy-downloader.dev',
  isPaid: true,
  plan: 'lifetime',
  freeDownloadsUsed: 0,
  freeDownloadsRemaining: null,
  communityModelsUsed: 0,
  communityModelsRemaining: null,
  communityModelsLimit: null,
  textureDownloadsUsed: 0,
  textureDownloadsRemaining: null,
  subscriptionStatus: 'active',
  accountSlots: 999,
  linkedAccountsCount: 1,
  linkedAccountsRemaining: 998,
  accountType: 'unlimited',
  paidAt: new Date().toISOString(),
  syncedAt: new Date().toISOString()
};

export function isValidAssetUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('https://')) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      host.endsWith('.meshy.ai') ||
      host.includes('meshy.ai') ||
      host.includes('amazonaws.com') ||
      host.includes('cloudfront.net')
    );
  } catch {
    return false;
  }
}
