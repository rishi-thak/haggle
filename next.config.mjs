/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  // Keep these out of webpack's bundle — Node loads them at runtime instead.
  // Fixes optional-dep resolution failures (e.g. @x402/fetch, viem/accounts)
  // pulled in transitively by agentmail and browser-use-sdk.
  serverExternalPackages: [
    "@libsql/client",
    "@paysponge/sdk",
    "agentmail",
    "browser-use-sdk",
  ],
};
export default nextConfig;
