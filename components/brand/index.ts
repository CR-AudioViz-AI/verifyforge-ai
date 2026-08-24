/**
 * CR AudioViz AI Brand System
 * 
 * Export all brand components and configurations.
 * Usage: import { BrandedHeader, ThemeProvider } from '@/components/brand';
 */

// Configuration
export { default as brandConfig, BRAND_COLORS, THEME_CONFIG, TYPOGRAPHY, SPACING, LOGO_SPECS, CREDITS_CONFIG, APP_LOGO_STATUS } from './brand-config';

// Theme
export { ThemeProvider, useTheme } from './ThemeProvider';
export { ThemeToggle } from './ThemeToggle';

// Components
export { BrandedHeader } from './BrandedHeader';
export { BrandedFooter } from './BrandedFooter';
export { CreditsBar } from './CreditsBar';
export { AuthButtons } from './AuthButtons';

// 2026-08-23: `export { brandConfig as tailwindBrandConfig } from
// './tailwind.brand.config'` was removed. That module does not exist in this
// repository and nothing imports the symbol, so the line was a re-export of
// nothing that broke the type check. components/brand/ is copied across repos —
// if the file exists elsewhere, this is a divergence to reconcile upstream
// rather than a file to invent here.
