// =====================================================
// VERIFYFORGE AI - PRICING TIERS & CONFIGURATION
// Complete pricing structure for Free, Pro, and Enterprise
// Generated: November 22, 2025 12:50 PM EST
// =====================================================

export const PRICING_TIERS = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Perfect for trying out VerifyForge',
    price: 0,
    billingPeriod: 'forever',
    stripePrice Id: null,
    
    // Limits
    limits: {
      testsPerMonth: 10,
      apiCallsPerMonth: 0,
      teamMembers: 1,
      storageGB: 1,
      scheduledTests: 0,
      concurrentTests: 1,
    },
    
    // Features
    features: {
      // Testing Engines
      webTesting: true,
      apiTesting: true,
      documentTesting: true,
      gameTesting: true,
      mobileTesting: true,
      aiTesting: true,
      avatarTesting: true,
      toolTesting: true,
      
      // Advanced Features
      javariAutoFix: false, // Manual fixes only
      economyMode: false,
      scheduledTests: false,
      apiAccess: false,
      webhooks: false,
      customIntegrations: false,
      
      // Reports
      pdfReports: true,
      excelReports: false,
      wordReports: false,
      markdownReports: true,
      whiteLabel: false,
      customBranding: false,
      
      // Collaboration
      teamCollaboration: false,
      commentingOnTests: false,
      sharedDashboards: false,
      
      // Support
      supportLevel: 'Community (Discord)',
      responseTime: '48-72 hours',
      dedicatedSupport: false,
      slackChannel: false,
      phoneSupport: false,
      
      // Extras
      dataRetention: '30 days',
      exportHistory: false,
      auditLogs: false,
      ssoAuthentication: false,
      customDomain: false,
    },
    
    // Call to Action
    ctaText: 'Start Free',
    ctaSubtext: 'No credit card required',
    popular: false,
  },

  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'For professionals and small teams',
    price: 49,
    billingPeriod: 'month',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || 'price_pro_monthly',
    yearlyPrice: 470, // ~20% discount
    yearlyStripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRO_YEARLY_PRICE_ID || 'price_pro_yearly',
    
    // Limits
    limits: {
      testsPerMonth: 100,
      apiCallsPerMonth: 1000,
      teamMembers: 10,
      storageGB: 50,
      scheduledTests: 20,
      concurrentTests: 3,
    },
    
    // Features
    features: {
      // Testing Engines (All included)
      webTesting: true,
      apiTesting: true,
      documentTesting: true,
      gameTesting: true,
      mobileTesting: true,
      aiTesting: true,
      avatarTesting: true,
      toolTesting: true,
      
      // Advanced Features
      javariAutoFix: true, // 90%+ confidence auto-apply
      economyMode: true, // 40-60% cost savings
      scheduledTests: true,
      apiAccess: true,
      webhooks: true,
      customIntegrations: false, // Enterprise only
      
      // Reports (All formats)
      pdfReports: true,
      excelReports: true,
      wordReports: true,
      markdownReports: true,
      whiteLabel: true,
      customBranding: true,
      
      // Collaboration
      teamCollaboration: true,
      commentingOnTests: true,
      sharedDashboards: true,
      
      // Support
      supportLevel: 'Priority Email',
      responseTime: '24 hours',
      dedicatedSupport: false,
      slackChannel: false,
      phoneSupport: false,
      
      // Extras
      dataRetention: '1 year',
      exportHistory: true,
      auditLogs: true,
      ssoAuthentication: false, // Enterprise only
      customDomain: false, // Enterprise only
    },
    
    // Call to Action
    ctaText: 'Start 14-Day Trial',
    ctaSubtext: 'Cancel anytime',
    popular: true, // Most popular tier
  },

  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For large teams and organizations',
    price: 'Custom',
    billingPeriod: 'custom',
    stripePriceId: null, // Custom pricing, contact sales
    
    // Limits (Unlimited)
    limits: {
      testsPerMonth: -1, // Unlimited
      apiCallsPerMonth: -1, // Unlimited
      teamMembers: -1, // Unlimited
      storageGB: -1, // Unlimited
      scheduledTests: -1, // Unlimited
      concurrentTests: 10, // Higher concurrency
    },
    
    // Features (Everything)
    features: {
      // Testing Engines (All included)
      webTesting: true,
      apiTesting: true,
      documentTesting: true,
      gameTesting: true,
      mobileTesting: true,
      aiTesting: true,
      avatarTesting: true,
      toolTesting: true,
      
      // Advanced Features
      javariAutoFix: true,
      economyMode: true,
      scheduledTests: true,
      apiAccess: true,
      webhooks: true,
      customIntegrations: true,
      
      // Reports
      pdfReports: true,
      excelReports: true,
      wordReports: true,
      markdownReports: true,
      whiteLabel: true,
      customBranding: true,
      
      // Collaboration
      teamCollaboration: true,
      commentingOnTests: true,
      sharedDashboards: true,
      
      // Support
      supportLevel: 'Dedicated Support Manager',
      responseTime: '4 hours',
      dedicatedSupport: true,
      slackChannel: true,
      phoneSupport: true,
      
      // Extras
      dataRetention: 'Unlimited',
      exportHistory: true,
      auditLogs: true,
      ssoAuthentication: true,
      customDomain: true,
    },
    
    // Enterprise Extras
    enterpriseExtras: [
      'Custom SLA guarantees',
      'On-premise deployment option',
      'Dedicated infrastructure',
      'Custom test engine development',
      'White-glove onboarding',
      'Quarterly business reviews',
      'Priority feature requests',
      'Advanced security compliance (SOC 2, HIPAA)',
    ],
    
    // Call to Action
    ctaText: 'Contact Sales',
    ctaSubtext: 'Custom pricing for your needs',
    popular: false,
  },
} as const;

// =====================================================
// FEATURE COMPARISON FOR PRICING PAGE
// =====================================================

export const FEATURE_COMPARISON = [
  {
    category: 'Testing Capabilities',
    features: [
      {
        name: 'Web Testing (100+ checks)',
        free: true,
        pro: true,
        enterprise: true,
        tooltip: 'SEO, accessibility, performance, security, links',
      },
      {
        name: 'API Testing (40+ checks)',
        free: true,
        pro: true,
        enterprise: true,
        tooltip: 'Endpoints, auth, rate limiting, error handling',
      },
      {
        name: 'Document Testing with OCR',
        free: true,
        pro: true,
        enterprise: true,
        tooltip: 'PDFs, DOCX, XLSX, PPTX analysis',
      },
      {
        name: 'Game Testing',
        free: true,
        pro: true,
        enterprise: true,
        tooltip: 'FPS, memory, compatibility, graphics',
      },
      {
        name: 'Mobile App Testing',
        free: true,
        pro: true,
        enterprise: true,
        tooltip: 'iOS and Android app analysis',
      },
      {
        name: 'AI/Bot Testing',
        free: true,
        pro: true,
        enterprise: true,
        tooltip: 'Hallucination detection, bias, toxicity',
      },
      {
        name: '3D Avatar Testing',
        free: true,
        pro: true,
        enterprise: true,
        tooltip: 'Polygon count, textures, rigging',
      },
      {
        name: 'Software Tool Testing',
        free: true,
        pro: true,
        enterprise: true,
        tooltip: 'Functionality, usability, security',
      },
    ],
  },
  {
    category: 'Intelligent Features',
    features: [
      {
        name: 'Javari Auto-Fix',
        free: false,
        pro: true,
        enterprise: true,
        tooltip: 'AI automatically fixes 90%+ confidence issues',
      },
      {
        name: 'Economy Mode (40-60% savings)',
        free: false,
        pro: true,
        enterprise: true,
        tooltip: 'Optimized testing to reduce costs',
      },
      {
        name: 'Custom Test Profiles',
        free: false,
        pro: true,
        enterprise: true,
        tooltip: 'Save and reuse test configurations',
      },
      {
        name: 'Custom Test Engine Development',
        free: false,
        pro: false,
        enterprise: true,
        tooltip: 'We build custom testing engines for your needs',
      },
    ],
  },
  {
    category: 'Automation & Integration',
    features: [
      {
        name: 'Scheduled Tests',
        free: '0',
        pro: '20/month',
        enterprise: 'Unlimited',
        tooltip: 'Automatically run tests on a schedule',
      },
      {
        name: 'API Access',
        free: false,
        pro: '1,000 calls/month',
        enterprise: 'Unlimited',
        tooltip: 'Programmatic access to VerifyForge',
      },
      {
        name: 'Webhooks',
        free: false,
        pro: true,
        enterprise: true,
        tooltip: 'Get notified when tests complete',
      },
      {
        name: 'Custom Integrations (GitHub, Jira, etc.)',
        free: false,
        pro: false,
        enterprise: true,
        tooltip: 'Connect VerifyForge to your tools',
      },
    ],
  },
  {
    category: 'Reports & Exports',
    features: [
      {
        name: 'PDF Reports',
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        name: 'Excel Reports',
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        name: 'Word Documents',
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        name: 'Markdown & HTML',
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        name: 'White-Label Reports',
        free: false,
        pro: true,
        enterprise: true,
        tooltip: 'Add your logo and branding',
      },
      {
        name: 'Custom Report Templates',
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        name: 'Custom Domain for Reports',
        free: false,
        pro: false,
        enterprise: true,
        tooltip: 'Host reports on your own domain',
      },
    ],
  },
  {
    category: 'Team & Collaboration',
    features: [
      {
        name: 'Team Members',
        free: '1',
        pro: 'Up to 10',
        enterprise: 'Unlimited',
      },
      {
        name: 'Role-Based Access Control',
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        name: 'Shared Dashboards',
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        name: 'Commenting on Tests',
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        name: 'SSO Authentication',
        free: false,
        pro: false,
        enterprise: true,
        tooltip: 'SAML, OAuth, Active Directory',
      },
    ],
  },
  {
    category: 'Support & SLA',
    features: [
      {
        name: 'Support Level',
        free: 'Community',
        pro: 'Priority Email',
        enterprise: 'Dedicated Manager',
      },
      {
        name: 'Response Time',
        free: '48-72 hours',
        pro: '24 hours',
        enterprise: '4 hours',
      },
      {
        name: 'Phone Support',
        free: false,
        pro: false,
        enterprise: true,
      },
      {
        name: 'Dedicated Slack Channel',
        free: false,
        pro: false,
        enterprise: true,
      },
      {
        name: 'SLA Guarantees',
        free: false,
        pro: false,
        enterprise: true,
        tooltip: '99.9% uptime guarantee',
      },
    ],
  },
  {
    category: 'Data & Security',
    features: [
      {
        name: 'Data Retention',
        free: '30 days',
        pro: '1 year',
        enterprise: 'Unlimited',
      },
      {
        name: 'Export Test History',
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        name: 'Audit Logs',
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        name: 'On-Premise Deployment',
        free: false,
        pro: false,
        enterprise: true,
      },
      {
        name: 'Advanced Compliance (SOC 2, HIPAA)',
        free: false,
        pro: false,
        enterprise: true,
      },
    ],
  },
];

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Get tier configuration by ID
 */
export function getTierConfig(tierId: 'free' | 'pro' | 'enterprise') {
  return PRICING_TIERS[tierId];
}

/**
 * Check if a feature is available in a tier
 */
export function hasFeature(
  tier: 'free' | 'pro' | 'enterprise',
  featureName: keyof typeof PRICING_TIERS.pro.features
): boolean {
  const config = PRICING_TIERS[tier];
  return config.features[featureName] as boolean;
}

/**
 * Get usage limit for a tier
 */
export function getLimit(
  tier: 'free' | 'pro' | 'enterprise',
  limitName: keyof typeof PRICING_TIERS.pro.limits
): number {
  const config = PRICING_TIERS[tier];
  return config.limits[limitName] as number;
}

/**
 * Check if a tier allows unlimited usage
 */
export function isUnlimited(
  tier: 'free' | 'pro' | 'enterprise',
  limitName: keyof typeof PRICING_TIERS.pro.limits
): boolean {
  const limit = getLimit(tier, limitName);
  return limit === -1;
}

/**
 * Format price for display
 */
export function formatPrice(tier: 'free' | 'pro' | 'enterprise'): string {
  const config = PRICING_TIERS[tier];
  if (config.price === 0) return 'Free';
  if (config.price === 'Custom') return 'Custom Pricing';
  return `$${config.price}/${config.billingPeriod}`;
}

/**
 * Calculate savings for yearly billing
 */
export function calculateYearlySavings(): number {
  const monthlyTotal = PRICING_TIERS.pro.price * 12;
  const yearlyCost = PRICING_TIERS.pro.yearlyPrice!;
  return monthlyTotal - yearlyCost;
}

/**
 * Get recommended tier based on usage
 */
export function getRecommendedTier(
  testsPerMonth: number,
  teamSize: number,
  needsApi: boolean,
  needsWhiteLabel: boolean
): 'free' | 'pro' | 'enterprise' {
  if (testsPerMonth > 100 || teamSize > 10 || needsApi && testsPerMonth > 50) {
    return 'enterprise';
  }
  
  if (testsPerMonth > 10 || teamSize > 1 || needsApi || needsWhiteLabel) {
    return 'pro';
  }
  
  return 'free';
}

export default {
  PRICING_TIERS,
  FEATURE_COMPARISON,
  getTierConfig,
  hasFeature,
  getLimit,
  isUnlimited,
  formatPrice,
  calculateYearlySavings,
  getRecommendedTier,
};
