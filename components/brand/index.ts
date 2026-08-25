/**
 * CR AudioViz AI Brand System — re-export from platform-sdk.
 *
 * 2026-08-29: this directory held LOCAL COPIES of all six shell components -
 * BrandedHeader, BrandedFooter, AuthButtons, CreditsBar, ThemeProvider,
 * ThemeToggle. They had ALREADY DRIFTED: BrandedHeader was 194 lines here against
 * 181 in the SDK, with different checksums. Nobody forked it on purpose; two
 * copies of one thing always diverge.
 *
 * ARCHITECTURE-CORE-VS-APP-LAW: if more than one app needs it, it is CORE and
 * there is exactly ONE of it. The shell is the most-shared thing on the platform.
 * A forked copy means this app's header stops changing when the brand changes,
 * and the customer sees two different platforms depending which page they are on.
 *
 * This barrel now RE-EXPORTS from the SDK rather than deleting the local imports,
 * so every existing `from '@/components/brand'` keeps working while there is only
 * one implementation behind it. The local .tsx files are removed in the same
 * commit.
 *
 * That duplication class has been found FOURTEEN times across this platform - two
 * rival sendEmail definitions, an unrendered OAuth provider list, nine credits
 * implementations. This is the first one caught before it cost anything.
 *
 * CR AudioViz AI, LLC · EIN 39-3646201
 */
export {
  BrandedHeader,
  BrandedFooter,
  AuthButtons,
  CreditsBar,
  ThemeProvider,
  ThemeToggle,
  // useTheme is exported by the SDK barrel and had zero callers here - kept so a
  // future consumer does not reach for a local reimplementation.
  useTheme,
} from '@craudioviz/platform-sdk';

// brand-config stays local: it holds THIS APP's identity (name, slug, accent),
// which is app-specific by definition. The law's test says so - only this app
// uses it, so it belongs to this app.
export {
  default as brandConfig,
  BRAND_COLORS,
  THEME_CONFIG,
  TYPOGRAPHY,
  SPACING,
  LOGO_SPECS,
  CREDITS_CONFIG,
  APP_LOGO_STATUS,
} from './brand-config';
