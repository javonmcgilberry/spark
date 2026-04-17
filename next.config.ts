import type {NextConfig} from 'next';
import {initOpenNextCloudflareForDev} from '@opennextjs/cloudflare';

// Deployed to Webflow Cloud as a "New domain" app — serves at the root of
// a dedicated subdomain, so no basePath/assetPrefix needed. If we ever
// switch to "Existing site" and mount under a parent path, add both
// basePath and assetPrefix back and prefix every client-side fetch to
// /api/* routes with that path.
const config: NextConfig = {
  reactStrictMode: true,
};

// Wires `next dev` up to the same binding resolver (getCloudflareContext)
// we use in prod, so local and preview read env from the same API. No-op
// in production. See opennext.js.org/cloudflare/get-started §12.
initOpenNextCloudflareForDev();

export default config;
