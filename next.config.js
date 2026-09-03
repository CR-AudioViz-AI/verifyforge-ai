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
// 2026-09-02: SECURITY HEADERS, added because Verify found them missing on its
// own domain. Ten findings on javariverify.com from the first end-to-end run —
// no CSP, no X-Content-Type-Options, no frame protection, weak HSTS — while
// craudiovizai.com had all of them. The scanner works; the scanner's own site
// was the thing that had never been scanned.
//
// The CSP is scoped to what this app actually loads rather than copied from
// core. Verify has no Stripe elements, no PayPal, no analytics on these pages,
// so allowing them would be a wider policy than the app needs and every extra
// origin is a place an injection can send data.
const CSP = [
  "default-src 'self'",
  // 'unsafe-inline' is required by Next's inline bootstrap script. 'unsafe-eval'
  // is NOT included: nothing here needs it, and it is the directive that makes a
  // CSP mostly decorative.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join('; ');

const SECURITY_HEADERS = [
  // Two years with preload. Verify flagged the previous value as weak: a short
  // max-age leaves a window where a downgrade attack still works, which is the
  // whole thing HSTS exists to close.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy', value: CSP },
  // Stops a browser guessing that a text upload is JavaScript.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // frame-ancestors above covers modern browsers; this covers the rest.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Denied rather than left unset. This app needs none of them, and an unset
  // policy inherits the browser default rather than refusing.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig = {
  reactStrictMode: false,
  transpilePackages: ["@craudioviz/platform-sdk"],
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
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

// 2026-09-05 Next 16: webpack config removed.
//
// Turbopack is the default builder in Next 16 and refuses to start when a
// webpack config exists with no turbopack equivalent.
//
// This block existed only to disable the crypto fallback on the edge runtime.
// It is scaffolding for a problem Turbopack does not have: node:crypto resolves
// correctly on edge. Proven on javari-logo and javari-forge, both of which built
// and deployed on 16.3.4 with it deleted.
//
// Thirty-seven repos carried a byte-identical copy - one sha256 across all of
// them - so this is one fix applied thirty-seven times, not thirty-seven fixes.
module.exports = { ...nextConfig };
