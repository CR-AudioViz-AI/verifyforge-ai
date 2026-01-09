/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    CR AUDIOVIZ AI - BRAND CONFIGURATION                      ║
 * ║                                                                               ║
 * ║  A Henderson Platform Production - Cindy & Roy Henderson                      ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                               ║
 * ║  This file defines the OFFICIAL brand standards for all apps.                ║
 * ║  All colors, typography, and design tokens MUST come from here.              ║
 * ║                                                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 * 
 * @version 1.0.0
 * @date January 9, 2026
 */

// ============================================================================
// BRAND COLORS - OFFICIAL PALETTE
// ============================================================================

export const BRAND_COLORS = {
  // Primary - Cyan (main accent)
  primary: {
    50: '#ecfeff',
    100: '#cffafe',
    200: '#a5f3fc',
    300: '#67e8f9',
    400: '#22d3ee',
    500: '#06b6d4',
    600: '#0891b2', // PRIMARY BRAND COLOR
    700: '#0e7490',
    800: '#155e75',
    900: '#164e63',
    950: '#083344',
  },
  
  // Neutral - Slate (text, borders)
  neutral: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569', // PRIMARY TEXT COLOR
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
  
  // Background - Gray
  background: {
    light: '#ffffff',
    lightAlt: '#f9fafb',
    lightCard: '#ffffff',
    dark: '#0f172a',
    darkAlt: '#1e293b',
    darkCard: '#1e293b',
  },
  
  // Semantic Colors
  error: '#dc2626',    // Red-600 - ONLY for errors
  warning: '#f59e0b',  // Amber-500 - Low credit warnings
  success: '#10b981',  // Emerald-500 - Success states
  info: '#0891b2',     // Cyan-600 - Info states
  
  // Special - Henderson Red (ONLY for "Cindy & Roy")
  hendersonRed: '#dc2626',
} as const;

// ============================================================================
// DARK MODE CONFIGURATION
// ============================================================================

export const THEME_CONFIG = {
  light: {
    background: BRAND_COLORS.background.light,
    backgroundAlt: BRAND_COLORS.background.lightAlt,
    card: BRAND_COLORS.background.lightCard,
    text: BRAND_COLORS.neutral[900],
    textMuted: BRAND_COLORS.neutral[600],
    border: BRAND_COLORS.neutral[200],
    primary: BRAND_COLORS.primary[600],
    primaryHover: BRAND_COLORS.primary[700],
  },
  dark: {
    background: BRAND_COLORS.background.dark,
    backgroundAlt: BRAND_COLORS.background.darkAlt,
    card: BRAND_COLORS.background.darkCard,
    text: BRAND_COLORS.neutral[50],
    textMuted: BRAND_COLORS.neutral[400],
    border: BRAND_COLORS.neutral[700],
    primary: BRAND_COLORS.primary[400],
    primaryHover: BRAND_COLORS.primary[300],
  },
} as const;

// ============================================================================
// TYPOGRAPHY
// ============================================================================

export const TYPOGRAPHY = {
  fontFamily: {
    sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
    mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'monospace'],
  },
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px - MINIMUM for body
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem', // 36px
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,     // MINIMUM for body text
    relaxed: 1.75,
  },
} as const;

// ============================================================================
// SPACING & SIZING
// ============================================================================

export const SPACING = {
  // Tap targets - MINIMUM 44px for mobile
  tapTarget: '44px',
  tapTargetMin: 44,
  
  // Mobile breakpoints
  breakpoints: {
    mobile: 375,
    tablet: 768,
    desktop: 1024,
    wide: 1280,
  },
  
  // Component spacing
  headerHeight: '60px',
  creditsBarHeight: '40px',
  footerMinHeight: '200px',
} as const;

// ============================================================================
// LOGO SPECIFICATIONS
// ============================================================================

export const LOGO_SPECS = {
  // 3D-style gradient effect
  gradient: {
    primary: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 50%, #22d3ee 100%)',
    hover: 'linear-gradient(135deg, #0e7490 0%, #0891b2 50%, #06b6d4 100%)',
  },
  
  // Shadow for 3D effect
  shadow: {
    light: '0 4px 14px 0 rgba(8, 145, 178, 0.39)',
    dark: '0 4px 14px 0 rgba(6, 182, 212, 0.25)',
  },
  
  // Standard sizes
  sizes: {
    favicon: 32,
    navIcon: 40,
    header: 48,
    hero: 120,
    splash: 200,
  },
  
  // Required files per app
  requiredFiles: [
    'favicon.ico',
    'favicon.png',       // 32x32
    'icon-192.png',      // PWA
    'icon-512.png',      // PWA
    'apple-touch-icon.png', // 180x180
    'logo.svg',          // Vector
    'logo-dark.svg',     // Dark mode vector
  ],
} as const;

// ============================================================================
// CREDIT BAR CONFIGURATION
// ============================================================================

export const CREDITS_CONFIG = {
  warningThreshold: 10,
  criticalThreshold: 5,
  
  plans: {
    free: { name: 'Free', credits: 50, price: 0 },
    pro: { name: 'Pro', credits: 500, price: 19 },
    business: { name: 'Business', credits: 5000, price: 99 },
  },
  
  topUpPacks: [
    { credits: 100, price: 5 },
    { credits: 500, price: 20 },
    { credits: 1000, price: 35 },
  ],
} as const;

// ============================================================================
// APP REGISTRY WITH LOGO STATUS
// ============================================================================

export const APP_LOGO_STATUS = {
  hasLogo: [
    'javariverse-hub',
    'javari-ai',
    'javari-market',
    'javari-realty',
    'javari-news',
    'market-oracle-app',
    'mortgage-rate-monitor',
  ],
  needsLogo: [
    'crochet-platform',
    'knitting-platform',
    'machineknit-platform',
    'javari-invoice',
    'javari-pdf-tools',
    'javari-travel',
    'javari-games-hub',
    'javari-ebook',
    'javari-cards',
    'javari-disney-vault',
    'javari-comic-crypt',
    'javari-card-vault',
    'javari-coin-cache',
    'javari-vinyl-vault',
    'javari-watch-works',
    'javari-spirits',
    'javari-scrapbook',
    'javari-merch',
    'javari-first-responders',
    'javari-veterans-connect',
    'javari-faith-communities',
    'javari-animal-rescue',
    'javari-presentation-maker',
    'javari-resume-builder',
    'javari-cover-letter',
    'javari-email-templates',
    'javari-social-posts',
    'javari-video-analysis',
    'javari-movie',
    'javari-game-studio',
    'javari-music',
    'javari-games',
    'javari-arena',
    'javari-health',
    'javari-fitness',
    'javari-dating',
    'javari-family',
    'javari-shopping',
    'javari-entertainment',
    'javari-education',
    'javari-legal',
    'javari-insurance',
    'javari-business-formation',
    'javari-home-services',
    'javari-construction',
    'javari-hr-workforce',
    'javari-supply-chain',
    'javari-manufacturing',
    'javari-orlando',
    'javari-property',
    'javari-property-hub',
    'javari-partners',
    // Infrastructure (may not need public logos)
    'javari-admin',
    'javari-dashboard',
    'javari-builder',
    'javari-forge',
    'javari-ops',
    'javari-analytics',
    'javari-auth',
    'javari-portal',
  ],
} as const;

export default {
  BRAND_COLORS,
  THEME_CONFIG,
  TYPOGRAPHY,
  SPACING,
  LOGO_SPECS,
  CREDITS_CONFIG,
  APP_LOGO_STATUS,
};
