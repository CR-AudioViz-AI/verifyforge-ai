/** @type {import("next").NextConfig} */
// 2026-08-23: typescript.ignoreBuildErrors and eslint.ignoreDuringBuilds were
// removed. They were added because lib/complete-* did not compile; the repo now
// type-checks clean under strict + noUncheckedIndexedAccess +
// exactOptionalPropertyTypes across every file, so a type error fails the build
// again — which is the only way the check is worth having.
// 2026-08-28: transpilePackages is REQUIRED for @craudioviz/platform-sdk.
// The SDK ships raw TypeScript (package.json main is index.ts), and Next does
// not run node_modules through SWC by default. Importing anything from it that
// carries a `type` re-export fails the build with
//   Module parse failed: Unexpected token — > type KeyGeneration,
// This repo built fine before only because it imported the brand barrel, which
// has no type exports. Any consumer of the Supabase key accessor needs this.
const nextConfig = {
  reactStrictMode: false,
  transpilePackages: ["@craudioviz/platform-sdk"],
}
module.exports = nextConfig
