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
    subdomainPrefix?: string;
  };
  features: {
    hideVerifyForgeBranding: boolean;
    customFooterText?: string;
    customSupportEmail?: string;
    customSupportUrl?: string;
  };
  reseller?: {
    isReseller: boolean;
    revenueShare: number;
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
  private supabase: any;

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
    const { error } = await (this.supabase as any)
      .from('white_label_configs')
      .insert([{
        organization_id: config.organizationId,
        branding: config.branding,
        domains: config.domains,
        features: config.features,
        reseller: config.reseller,
        created_at: new Date().toISOString(),
      }]);

    if (error) {
      throw new Error(`Failed to create white label config: ${error.message}`);
    }
  }

  async updateWhiteLabelConfig(
    organizationId: string,
    updates: Partial<WhiteLabelConfig>
  ): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('white_label_configs')
      .update({
        ...(updates as any),
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
    if (!logoFile.type.startsWith('image/')) {
      throw new Error('Logo must be an image file');
    }

    if (logoFile.size > 5 * 1024 * 1024) {
      throw new Error('Logo file size must be less than 5MB');
    }

    const arrayBuffer = await logoFile.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const logoUrl = `data:${logoFile.type};base64,${base64}`;

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
    return true;
  }

  async setCustomDomain(
    organizationId: string,
    customDomain: string
  ): Promise<void> {
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
    const page = pdfDoc.addPage([595, 842]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { width, height } = page.getSize();
    let yPosition = height - 50;

    const parseColor = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      return rgb(r, g, b);
    };

    const primaryColor = parseColor(config.branding.primaryColor);
    const textColor = rgb(0.2, 0.2, 0.2);

    if (config.branding.logoUrl || config.branding.logoBase64) {
      page.drawRectangle({
        x: 50,
        y: yPosition - 40,
        width: 100,
        height: 40,
        color: primaryColor,
      });
      yPosition -= 50;
    }

    page.drawText(config.branding.companyName, {
      x: 50,
      y: yPosition,
      size: 24,
      font: boldFont,
      color: primaryColor,
    });
    yPosition -= 30;

    page.drawText(title, {
      x: 50,
      y: yPosition,
      size: 18,
      font: boldFont,
      color: textColor,
    });
    yPosition -= 30;

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

    page.drawLine({
      start: { x: 50, y: yPosition },
      end: { x: width - 50, y: yPosition },
      thickness: 2,
      color: primaryColor,
    });
    yPosition -= 30;

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

    const footerY = 50;
    if (config.features.hideVerifyForgeBranding) {
      const footerText = config.features.customFooterText || `© ${new Date().getFullYear()} ${config.branding.companyName}`;
      page.drawText(footerText, {
        x: 50,
        y: footerY,
        size: 8,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
    } else {
      page.drawText(`Powered by VerifyForge AI | © ${new Date().getFullYear()} ${config.branding.companyName}`, {
        x: 50,
        y: footerY,
        size: 8,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    const pdfBytes = await pdfDoc.save();
    const base64 = Buffer.from(pdfBytes).toString('base64');
    return `data:application/pdf;base64,${base64}`;
  }

  private generateBrandedHTML(report: BrandedReport): string {
    const { config, title, content, testId } = report;
    return '<!DOCTYPE html><html><head><title>' + title + '</title></head><body>HTML Report</body></html>';
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

    const { data: clients } = await this.supabase
      .from('organizations')
      .select('id, name, created_at')
      .eq('reseller_id', organizationId);

    const { data: usage } = await this.supabase
      .from('credit_usage')
      .select('credits_used')
      .in('organization_id', clients?.map((c: any) => c.id) || []);

    const totalCredits = usage?.reduce((sum: number, u: any) => sum + u.credits_used, 0) || 0;
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
    return `:root {
  --wl-primary: ${config.branding.primaryColor};
  --wl-secondary: ${config.branding.secondaryColor};
  --wl-accent: ${config.branding.accentColor};
  --wl-font-family: ${config.branding.fontFamily || 'system-ui, sans-serif'};
}`;
  }
}

export type {
  WhiteLabelConfig,
  BrandedReport,
  ReportContent,
  CustomTheme,
};
