import type {NextConfig} from 'next';

// Deployed to Webflow Cloud as a "New domain" app — serves at the root of
// a dedicated subdomain, so no basePath/assetPrefix needed. If we ever
// switch to "Existing site" and mount under a parent path, add both
// basePath and assetPrefix back and prefix every client-side fetch to
// /api/* routes with that path.
const config: NextConfig = {
  reactStrictMode: true,
};

export default config;
