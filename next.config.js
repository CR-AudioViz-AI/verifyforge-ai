/** @type {import("next").NextConfig} */
// 2026-08-23: typescript.ignoreBuildErrors and eslint.ignoreDuringBuilds were
// removed. They were added because lib/complete-* did not compile; the repo now
// type-checks clean under strict + noUncheckedIndexedAccess +
// exactOptionalPropertyTypes across every file, so a type error fails the build
// again — which is the only way the check is worth having.
const nextConfig = { reactStrictMode: false }
module.exports = nextConfig
