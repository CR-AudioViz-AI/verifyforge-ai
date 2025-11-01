/**
 * VerifyForge AI - White Label System
 * 
 * Enterprise white-labeling features:
 * - Custom branding (logo, colors, company name)
 * - Branded PDF reports
 * - Custom domain whitelisting
 * - Reseller dashboards
 * - Client-specific configurations
 * 
 * @version 1.0.0
 * @date 2025-11-01
 */

import { createClient } from '@supabase/supabase-js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface WhiteLabelConfig {
  organizationId: string;
  branding: {
    companyName: string;
    logoUrl?: string;
    logoBase64?: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    fontFamily?: string;
  };
  domains: {
    allowedDomains: string[];
    customDomain?: string;
    subdomainPrefix?: string; // e.g., 'acme' for acme.verifyforge.ai
  };
  features: {
    hideVerifyForgeBranding: boolean;
    customFooterText?: string;
    customSupportEmail?: string;
    customSupportUrl?: string;
  };
  reseller?: {
    isReseller: boolean;
    revenueShare: number; // percentage (e.g., 30 for 30%)
    clientCount: number;
    monthlyQuota: number;
  };
}

interface BrandedReport {
  testId: string;
  config: WhiteLabelConfig;
  title: string;
  content: ReportContent;
  format: 'pdf' | 'html' | 'json';
}

interface ReportContent {
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    duration: number;
    credits: number;
  };
  issues: any[];
  performance: any;
  recommendations: string[];
  timestamp: string;
}

interface CustomTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  logoUrl?: string;
}

// ============================================================================
// WHITE LABEL MANAGER
// ============================================================================

export class WhiteLabelManager {
  private supabase: ReturnType<typeof createClient>;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  // ============================================================================
  // CONFIGURATION MANAGEMENT
  // ============================================================================

  async getWhiteLabelConfig(organizationId: string): Promise<WhiteLabelConfig | null> {
    const { data, error } = await this.supabase
      .from('white_label_configs')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      organizationId: data.organization_id,
      branding: data.branding,
      domains: data.domains,
      features: data.features,
      reseller: data.reseller,
    };
  }

  async createWhiteLabelConfig(config: WhiteLabelConfig): Promise<void> {
    const { error } = await this.supabase
      .from('white_label_configs')
      .insert({
        organization_id: config.organizationId,
        branding: config.branding,
        domains: config.domains,
        features: config.features,
        reseller: config.reseller,
        created_at: new Date().toISOString(),
      });

    if (error) {
      throw new Error(`Failed to create white label config: ${error.message}`);
    }
  }

  async updateWhiteLabelConfig(
    organizationId: string,
    updates: Partial<WhiteLabelConfig>
  ): Promise<void> {
    const { error } = await this.supabase
      .from('white_label_configs')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', organizationId);

    if (error) {
      throw new Error(`Failed to update white label config: ${error.message}`);
    }
  }

  async deleteWhiteLabelConfig(organizationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('white_label_configs')
      .delete()
      .eq('organization_id', organizationId);

    if (error) {
      throw new Error(`Failed to delete white label config: ${error.message}`);
    }
  }

  // ============================================================================
  // LOGO MANAGEMENT
  // ============================================================================

  async uploadLogo(
    organizationId: string,
    logoFile: File
  ): Promise<string> {
    // Validate file
    if (!logoFile.type.startsWith('image/')) {
      throw new Error('Logo must be an image file');
    }

    if (logoFile.size > 5 * 1024 * 1024) { // 5MB limit
      throw new Error('Logo file size must be less than 5MB');
    }

    // Convert to base64
    const arrayBuffer = await logoFile.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const logoUrl = `data:${logoFile.type};base64,${base64}`;

    // Update config with logo
    await this.updateWhiteLabelConfig(organizationId, {
      branding: {
        logoUrl,
        logoBase64: base64,
      } as any,
    });

    return logoUrl;
  }

  async deleteLogo(organizationId: string): Promise<void> {
    const config = await this.getWhiteLabelConfig(organizationId);
    if (!config) {
      throw new Error('White label config not found');
    }

    await this.updateWhiteLabelConfig(organizationId, {
      branding: {
        ...config.branding,
        logoUrl: undefined,
        logoBase64: undefined,
      },
    });
  }

  // ============================================================================
  // DOMAIN MANAGEMENT
  // ============================================================================

  async addAllowedDomain(organizationId: string, domain: string): Promise<void> {
    const config = await this.getWhiteLabelConfig(organizationId);
    if (!config) {
      throw new Error('White label config not found');
    }

    // Validate domain format
    const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,6}$/i;
    if (!domainRegex.test(domain)) {
      throw new Error('Invalid domain format');
    }

    const updatedDomains = [...config.domains.allowedDomains, domain];

    await this.updateWhiteLabelConfig(organizationId, {
      domains: {
        ...config.domains,
        allowedDomains: updatedDomains,
      },
    });
  }

  async removeAllowedDomain(organizationId: string, domain: string): Promise<void> {
    const config = await this.getWhiteLabelConfig(organizationId);
    if (!config) {
      throw new Error('White label config not found');
    }

    const updatedDomains = config.domains.allowedDomains.filter(d => d !== domain);

    await this.updateWhiteLabelConfig(organizationId, {
      domains: {
        ...config.domains,
        allowedDomains: updatedDomains,
      },
    });
  }

  async verifyDomain(domain: string): Promise<boolean> {
    // In production, implement DNS verification
    // Check for TXT record with verification token
    return true;
  }

  async setCustomDomain(
    organizationId: string,
    customDomain: string
  ): Promise<void> {
    // Validate domain ownership
    const verified = await this.verifyDomain(customDomain);
    if (!verified) {
      throw new Error('Domain ownership verification failed');
    }

    await this.updateWhiteLabelConfig(organizationId, {
      domains: {
        customDomain,
      } as any,
    });
  }

  // ============================================================================
  // BRANDED REPORT GENERATION
  // ============================================================================

  async generateBrandedReport(report: BrandedReport): Promise<string> {
    switch (report.format) {
      case 'pdf':
        return await this.generateBrandedPDF(report);
      case 'html':
        return this.generateBrandedHTML(report);
      case 'json':
        return this.generateBrandedJSON(report);
      default:
        throw new Error(`Unsupported format: ${report.format}`);
    }
  }

  private async generateBrandedPDF(report: BrandedReport): Promise<string> {
    const { config, title, content, testId } = report;
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { width, height } = page.getSize();
    let yPosition = height - 50;

    // Helper function to parse hex color
    const parseColor = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      return rgb(r, g, b);
    };

    const primaryColor = parseColor(config.branding.primaryColor);
    const textColor = rgb(0.2, 0.2, 0.2);

    // Header with logo and company name
    if (config.branding.logoUrl || config.branding.logoBase64) {
      // In production, embed actual logo image
      // For now, draw a placeholder
      page.drawRectangle({
        x: 50,
        y: yPosition - 40,
        width: 100,
        height: 40,
        color: primaryColor,
      });
      yPosition -= 50;
    }

    // Company name
    page.drawText(config.branding.companyName, {
      x: 50,
      y: yPosition,
      size: 24,
      font: boldFont,
      color: primaryColor,
    });
    yPosition -= 30;

    // Report title
    page.drawText(title, {
      x: 50,
      y: yPosition,
      size: 18,
      font: boldFont,
      color: textColor,
    });
    yPosition -= 30;

    // Test ID and timestamp
    page.drawText(`Test ID: ${testId}`, {
      x: 50,
      y: yPosition,
      size: 10,
      font,
      color: textColor,
    });
    yPosition -= 15;

    page.drawText(`Generated: ${content.timestamp}`, {
      x: 50,
      y: yPosition,
      size: 10,
      font,
      color: textColor,
    });
    yPosition -= 30;

    // Divider line
    page.drawLine({
      start: { x: 50, y: yPosition },
      end: { x: width - 50, y: yPosition },
      thickness: 2,
      color: primaryColor,
    });
    yPosition -= 30;

    // Summary section
    page.drawText('Test Summary', {
      x: 50,
      y: yPosition,
      size: 16,
      font: boldFont,
      color: textColor,
    });
    yPosition -= 25;

    const summaryItems = [
      `Total Tests: ${content.summary.totalTests}`,
      `Passed: ${content.summary.passed}`,
      `Failed: ${content.summary.failed}`,
      `Duration: ${(content.summary.duration / 1000).toFixed(2)}s`,
      `Credits Used: ${content.summary.credits}`,
    ];

    for (const item of summaryItems) {
      page.drawText(item, {
        x: 70,
        y: yPosition,
        size: 12,
        font,
        color: textColor,
      });
      yPosition -= 20;
    }

    yPosition -= 20;

    // Issues section
    if (content.issues.length > 0) {
      page.drawText('Issues Found', {
        x: 50,
        y: yPosition,
        size: 16,
        font: boldFont,
        color: textColor,
      });
      yPosition -= 25;

      const criticalCount = content.issues.filter(i => i.severity === 'critical').length;
      const highCount = content.issues.filter(i => i.severity === 'high').length;
      const mediumCount = content.issues.filter(i => i.severity === 'medium').length;

      page.drawText(`Critical: ${criticalCount}`, {
        x: 70,
        y: yPosition,
        size: 12,
        font,
        color: rgb(0.8, 0.1, 0.1),
      });
      yPosition -= 18;

      page.drawText(`High: ${highCount}`, {
        x: 70,
        y: yPosition,
        size: 12,
        font,
        color: rgb(0.9, 0.5, 0.1),
      });
      yPosition -= 18;

      page.drawText(`Medium: ${mediumCount}`, {
        x: 70,
        y: yPosition,
        size: 12,
        font,
        color: rgb(0.9, 0.7, 0.1),
      });
      yPosition -= 30;
    }

    // Footer
    const footerY = 50;
    if (config.features.hideVerifyForgeBranding) {
      // Custom footer
      const footerText = config.features.customFooterText || `© ${new Date().getFullYear()} ${config.branding.companyName}`;
      page.drawText(footerText, {
        x: 50,
        y: footerY,
        size: 8,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
    } else {
      // VerifyForge branding
      page.drawText(`Powered by VerifyForge AI | © ${new Date().getFullYear()} ${config.branding.companyName}`, {
        x: 50,
        y: footerY,
        size: 8,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    // Convert to base64
    const pdfBytes = await pdfDoc.save();
    const base64 = Buffer.from(pdfBytes).toString('base64');
    return `data:application/pdf;base64,${base64}`;
  }

  private generateBrandedHTML(report: BrandedReport): string {
    const { config, title, content, testId } = report;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${config.branding.fontFamily || 'system-ui, -apple-system, sans-serif'};
      color: #333;
      background: #f5f5f5;
      padding: 40px 20px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: ${config.branding.primaryColor};
      color: white;
      padding: 40px;
    }
    .logo {
      height: 50px;
      margin-bottom: 20px;
    }
    .company-name {
      font-size: 28px;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .report-title {
      font-size: 20px;
      opacity: 0.9;
    }
    .content {
      padding: 40px;
    }
    .meta {
      color: #666;
      font-size: 14px;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid ${config.branding.primaryColor};
    }
    .section {
      margin-bottom: 30px;
    }
    .section-title {
      font-size: 20px;
      font-weight: bold;
      color: ${config.branding.primaryColor};
      margin-bottom: 15px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    .summary-item {
      background: #f8f8f8;
      padding: 15px;
      border-radius: 6px;
      border-left: 4px solid ${config.branding.accentColor};
    }
    .summary-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .summary-value {
      font-size: 24px;
      font-weight: bold;
      color: #333;
      margin-top: 5px;
    }
    .issue-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: bold;
      margin-right: 10px;
    }
    .critical { background: #fee; color: #c00; }
    .high { background: #fed; color: #c60; }
    .medium { background: #ffd; color: #960; }
    .footer {
      background: #f8f8f8;
      padding: 20px 40px;
      text-align: center;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${config.branding.logoUrl ? `<img src="${config.branding.logoUrl}" alt="Logo" class="logo">` : ''}
      <div class="company-name">${config.branding.companyName}</div>
      <div class="report-title">${title}</div>
    </div>

    <div class="content">
      <div class="meta">
        <div>Test ID: ${testId}</div>
        <div>Generated: ${content.timestamp}</div>
      </div>

      <div class="section">
        <div class="section-title">Test Summary</div>
        <div class="summary-grid">
          <div class="summary-item">
            <div class="summary-label">Total Tests</div>
            <div class="summary-value">${content.summary.totalTests}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Passed</div>
            <div class="summary-value">${content.summary.passed}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Failed</div>
            <div class="summary-value">${content.summary.failed}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Duration</div>
            <div class="summary-value">${(content.summary.duration / 1000).toFixed(1)}s</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Credits</div>
            <div class="summary-value">${content.summary.credits}</div>
          </div>
        </div>
      </div>

      ${content.issues.length > 0 ? `
      <div class="section">
        <div class="section-title">Issues Found</div>
        <div>
          <span class="issue-badge critical">Critical: ${content.issues.filter((i: any) => i.severity === 'critical').length}</span>
          <span class="issue-badge high">High: ${content.issues.filter((i: any) => i.severity === 'high').length}</span>
          <span class="issue-badge medium">Medium: ${content.issues.filter((i: any) => i.severity === 'medium').length}</span>
        </div>
      </div>
      ` : ''}

      ${content.recommendations.length > 0 ? `
      <div class="section">
        <div class="section-title">Recommendations</div>
        <ul>
          ${content.recommendations.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
      </div>
      ` : ''}
    </div>

    <div class="footer">
      ${config.features.hideVerifyForgeBranding
        ? (config.features.customFooterText || `© ${new Date().getFullYear()} ${config.branding.companyName}`)
        : `Powered by VerifyForge AI | © ${new Date().getFullYear()} ${config.branding.companyName}`
      }
      ${config.features.customSupportEmail ? ` | Support: ${config.features.customSupportEmail}` : ''}
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  private generateBrandedJSON(report: BrandedReport): string {
    return JSON.stringify({
      branding: report.config.branding,
      testId: report.testId,
      title: report.title,
      content: report.content,
      timestamp: new Date().toISOString(),
    }, null, 2);
  }

  // ============================================================================
  // RESELLER MANAGEMENT
  // ============================================================================

  async enableReseller(
    organizationId: string,
    revenueShare: number,
    monthlyQuota: number
  ): Promise<void> {
    if (revenueShare < 0 || revenueShare > 100) {
      throw new Error('Revenue share must be between 0 and 100');
    }

    await this.updateWhiteLabelConfig(organizationId, {
      reseller: {
        isReseller: true,
        revenueShare,
        clientCount: 0,
        monthlyQuota,
      },
    });
  }

  async disableReseller(organizationId: string): Promise<void> {
    await this.updateWhiteLabelConfig(organizationId, {
      reseller: {
        isReseller: false,
        revenueShare: 0,
        clientCount: 0,
        monthlyQuota: 0,
      },
    });
  }

  async getResellerStats(organizationId: string): Promise<any> {
    const config = await this.getWhiteLabelConfig(organizationId);
    if (!config || !config.reseller?.isReseller) {
      throw new Error('Not a reseller organization');
    }

    // Get client usage stats
    const { data: clients } = await this.supabase
      .from('organizations')
      .select('id, name, created_at')
      .eq('reseller_id', organizationId);

    // Get total revenue
    const { data: usage } = await this.supabase
      .from('credit_usage')
      .select('credits_used')
      .in('organization_id', clients?.map(c => c.id) || []);

    const totalCredits = usage?.reduce((sum, u) => sum + u.credits_used, 0) || 0;
    const revenueShare = (totalCredits * config.reseller.revenueShare) / 100;

    return {
      clientCount: clients?.length || 0,
      totalCredits,
      revenueShare,
      monthlyQuota: config.reseller.monthlyQuota,
      quotaUsed: totalCredits,
      quotaRemaining: Math.max(0, config.reseller.monthlyQuota - totalCredits),
    };
  }

  // ============================================================================
  // THEME UTILITIES
  // ============================================================================

  getCustomTheme(config: WhiteLabelConfig): CustomTheme {
    return {
      primaryColor: config.branding.primaryColor,
      secondaryColor: config.branding.secondaryColor,
      accentColor: config.branding.accentColor,
      fontFamily: config.branding.fontFamily || 'system-ui, sans-serif',
      logoUrl: config.branding.logoUrl,
    };
  }

  generateCSSVariables(config: WhiteLabelConfig): string {
    return `
:root {
  --wl-primary: ${config.branding.primaryColor};
  --wl-secondary: ${config.branding.secondaryColor};
  --wl-accent: ${config.branding.accentColor};
  --wl-font-family: ${config.branding.fontFamily || 'system-ui, sans-serif'};
}
    `.trim();
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export type {
  WhiteLabelConfig,
  BrandedReport,
  ReportContent,
  CustomTheme,
};
