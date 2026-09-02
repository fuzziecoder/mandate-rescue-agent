/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [
      { source: '/overview', destination: '/', permanent: true },
      { source: '/audit-trail', destination: '/audit', permanent: true },
      { source: '/recovery-ledger', destination: '/ledger', permanent: true },
      { source: '/nudges-preview', destination: '/nudges', permanent: true },
      { source: '/compliance', destination: '/guardrails', permanent: true },
    ];
  },
};

export default nextConfig;
