import type {EnvConfig} from '../config/env.js';
import {DOC_PAGE_IDS, getDocDefinitions} from '../onboarding/catalog.js';
import type {DocLink, RoleTrack} from '../onboarding/types.js';

export class ConfluenceDocsService {
  constructor(private readonly env: EnvConfig) {}

  getDocsForTrack(roleTrack: RoleTrack): DocLink[] {
    const baseUrl = this.env.confluenceBaseUrl ?? null;

    return getDocDefinitions(roleTrack).map((doc) => ({
      ...doc,
      url: baseUrl
        ? `${baseUrl}/spaces/ENG/pages/${DOC_PAGE_IDS[doc.id]}`
        : null,
    }));
  }
}
