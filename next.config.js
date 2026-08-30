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

// 2026-08-30: Next 15 compiles instrumentation.ts for the EDGE runtime as well
// as node, so the vault env-shim's `crypto` import is pulled into an edge
// bundle even though register() returns early off nodejs. Marking it
// unavailable for the edge compilation is what stops it. The import must stay
// a BARE `crypto` specifier: webpack rejects the `node:` scheme before
// resolve.fallback is ever consulted, so `node:crypto` fails here too.
const _edgeCryptoOff = (config, { nextRuntime }) => {
  if (nextRuntime === "edge") {
    config.resolve = config.resolve || {};
    config.resolve.fallback = { ...(config.resolve.fallback || {}), crypto: false };
  }
  return config;
};

module.exports = { ...nextConfig, webpack: _edgeCryptoOff };
