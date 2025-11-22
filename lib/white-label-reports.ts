// =====================================================
// VERIFYFORGE AI - WHITE-LABEL REPORT GENERATOR
// Customized reports with customer branding
// Generated: November 22, 2025 12:52 PM EST
// =====================================================

import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Organization } from './organization-middleware';

// =====================================================
// TYPES
// =====================================================

interface ReportData {
  submission_id: string;
  target_url?: string;
  target_type: string;
  test_engines: string[];
  
  summary: {
    quality_score: number;
    total_tests: number;
    passed_tests: number;
    failed_tests: number;
    warnings: number;
    total_issues: number;
    critical_issues: number;
    high_issues: number;
    medium_issues: number;
    low_issues: number;
    fixed_issues: number;
    execution_time_ms: number;
  };
  
  results: Array<{
    test_suite: string;
    test_name: string;
    status: 'passed' | 'failed' | 'warning' | 'skipped';
    severity?: string;
    message?: string;
    execution_time_ms?: number;
  }>;
  
  issues: Array<{
    title: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    location?: string;
    fix_status: string;
    fix_confidence?: number;
    recommendations?: string[];
  }>;
  
  metadata: {
    tested_at: string;
    tested_by?: string;
    organization_name: string;
    economy_mode?: boolean;
  };
}

interface ReportCustomization {
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  footer_text?: string;
  header_text?: string;
  show_branding?: boolean;
  custom_styles?: {
    fontFamily?: string;
    fontSize?: number;
    headerColor?: string;
    linkColor?: string;
  };
}

// =====================================================
// WHITE-LABEL PDF GENERATOR
// =====================================================

export class WhiteLabelReportGenerator {
  private pdf: jsPDF;
  private organization: Organization;
  private customization: ReportCustomization;
  private currentY: number = 20;
  private pageHeight: number = 280; // A4 page height minus margins
  private primaryColor: string;
  private secondaryColor: string;
  
  constructor(organization: Organization, customization?: ReportCustomization) {
    this.pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    
    this.organization = organization;
    this.customization = customization || {};
    
    // Set colors (default to brand colors if not customized)
    this.primaryColor = customization?.primary_color || organization.primary_color || '#3b82f6';
    this.secondaryColor = customization?.secondary_color || '#10b981';
  }

  /**
   * Generate complete PDF report
   */
  async generateReport(data: ReportData): Promise<Buffer> {
    // Header with logo
    await this.addHeader(data.metadata.organization_name);
    
    // Title
    this.addTitle(data);
    
    // Executive Summary
    this.addExecutiveSummary(data.summary);
    
    // Quality Score Card
    this.addQualityScoreCard(data.summary);
    
    // Test Results Summary
    this.addTestResultsSummary(data.results);
    
    // Detailed Issues
    if (data.issues.length > 0) {
      this.addDetailedIssues(data.issues);
    }
    
    // Recommendations
    this.addRecommendations(data);
    
    // Footer
    this.addFooter(data.metadata.tested_at);
    
    // Convert to buffer
    const pdfOutput = this.pdf.output('arraybuffer');
    return Buffer.from(pdfOutput);
  }

  /**
   * Add header with optional logo
   */
  private async addHeader(organizationName: string): Promise<void> {
    const showBranding = this.customization.show_branding !== false;
    
    // Add logo if provided
    if (showBranding && this.organization.logo_url) {
      try {
        // In production, fetch and add the logo image
        // For now, just reserve space
        this.currentY += 15;
      } catch (error) {
        console.error('Error loading logo:', error);
      }
    }
    
    // Organization name
    this.pdf.setFontSize(18);
    this.pdf.setFont('helvetica', 'bold');
    this.setColor(this.primaryColor);
    this.pdf.text(organizationName, 20, this.currentY);
    
    this.currentY += 10;
    
    // Horizontal line
    this.setColor(this.primaryColor);
    this.pdf.setLineWidth(0.5);
    this.pdf.line(20, this.currentY, 190, this.currentY);
    
    this.currentY += 10;
  }

  /**
   * Add report title
   */
  private addTitle(data: ReportData): void {
    this.pdf.setFontSize(24);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.setTextColor(0, 0, 0);
    this.pdf.text('Testing Report', 20, this.currentY);
    
    this.currentY += 10;
    
    // Target information
    this.pdf.setFontSize(12);
    this.pdf.setFont('helvetica', 'normal');
    this.pdf.setTextColor(100, 100, 100);
    
    if (data.target_url) {
      this.pdf.text(`Target: ${data.target_url}`, 20, this.currentY);
      this.currentY += 6;
    }
    
    this.pdf.text(`Type: ${this.capitalizeFirst(data.target_type)}`, 20, this.currentY);
    this.currentY += 6;
    
    this.pdf.text(`Tests Run: ${data.test_engines.join(', ')}`, 20, this.currentY);
    this.currentY += 12;
  }

  /**
   * Add executive summary
   */
  private addExecutiveSummary(summary: any): void {
    this.addSectionHeader('Executive Summary');
    
    this.pdf.setFontSize(11);
    this.pdf.setFont('helvetica', 'normal');
    this.pdf.setTextColor(0, 0, 0);
    
    const summaryText = [
      `This comprehensive testing report analyzes your application across ${summary.total_tests} different test cases.`,
      ``,
      `Key Findings:`,
      `• ${summary.passed_tests} tests passed successfully (${Math.round((summary.passed_tests / summary.total_tests) * 100)}%)`,
      `• ${summary.failed_tests} tests failed requiring attention`,
      `• ${summary.total_issues} issues discovered (${summary.critical_issues} critical, ${summary.high_issues} high priority)`,
      `• ${summary.fixed_issues} issues automatically fixed by Javari AI`,
      ``,
      `Overall Quality Score: ${summary.quality_score}/100`,
    ];
    
    summaryText.forEach(line => {
      this.checkPageBreak();
      this.pdf.text(line, 20, this.currentY);
      this.currentY += 5;
    });
    
    this.currentY += 5;
  }

  /**
   * Add quality score card with visual indicators
   */
  private addQualityScoreCard(summary: any): void {
    this.checkPageBreak(40);
    
    this.addSectionHeader('Quality Metrics');
    
    const metrics = [
      { label: 'Overall Score', value: `${summary.quality_score}/100`, color: this.getScoreColor(summary.quality_score) },
      { label: 'Pass Rate', value: `${Math.round((summary.passed_tests / summary.total_tests) * 100)}%`, color: this.getScoreColor(Math.round((summary.passed_tests / summary.total_tests) * 100)) },
      { label: 'Critical Issues', value: summary.critical_issues.toString(), color: summary.critical_issues > 0 ? '#ef4444' : '#10b981' },
      { label: 'Auto-Fixed', value: summary.fixed_issues.toString(), color: '#3b82f6' },
    ];
    
    // Draw metric cards
    const cardWidth = 40;
    const cardHeight = 25;
    let startX = 20;
    
    metrics.forEach((metric, index) => {
      const x = startX + (index * (cardWidth + 5));
      
      // Card background
      this.pdf.setFillColor(245, 245, 245);
      this.pdf.rect(x, this.currentY, cardWidth, cardHeight, 'F');
      
      // Value
      this.pdf.setFontSize(20);
      this.pdf.setFont('helvetica', 'bold');
      this.setColor(metric.color);
      this.pdf.text(metric.value, x + cardWidth / 2, this.currentY + 12, { align: 'center' });
      
      // Label
      this.pdf.setFontSize(9);
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.setTextColor(100, 100, 100);
      this.pdf.text(metric.label, x + cardWidth / 2, this.currentY + 20, { align: 'center' });
    });
    
    this.currentY += cardHeight + 10;
  }

  /**
   * Add test results summary table
   */
  private addTestResultsSummary(results: any[]): void {
    this.checkPageBreak(40);
    
    this.addSectionHeader('Test Results Summary');
    
    // Group results by test suite
    const suiteGroups = results.reduce((acc, result) => {
      if (!acc[result.test_suite]) {
        acc[result.test_suite] = { passed: 0, failed: 0, warnings: 0, total: 0 };
      }
      acc[result.test_suite].total++;
      if (result.status === 'passed') acc[result.test_suite].passed++;
      if (result.status === 'failed') acc[result.test_suite].failed++;
      if (result.status === 'warning') acc[result.test_suite].warnings++;
      return acc;
    }, {} as any);
    
    const tableData = Object.entries(suiteGroups).map(([suite, stats]: [string, any]) => [
      suite,
      stats.total,
      stats.passed,
      stats.failed,
      stats.warnings,
      `${Math.round((stats.passed / stats.total) * 100)}%`,
    ]);
    
    // @ts-ignore - jspdf-autotable types
    this.pdf.autoTable({
      startY: this.currentY,
      head: [['Test Suite', 'Total', 'Passed', 'Failed', 'Warnings', 'Pass Rate']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: this.hexToRgb(this.primaryColor),
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 10,
      },
    });
    
    // @ts-ignore
    this.currentY = this.pdf.lastAutoTable.finalY + 10;
  }

  /**
   * Add detailed issues section
   */
  private addDetailedIssues(issues: any[]): void {
    this.checkPageBreak(40);
    
    this.addSectionHeader('Discovered Issues');
    
    // Sort by severity
    const sortedIssues = issues.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity as keyof typeof severityOrder] - severityOrder[b.severity as keyof typeof severityOrder];
    });
    
    sortedIssues.forEach((issue, index) => {
      this.checkPageBreak(30);
      
      // Issue number and severity badge
      this.pdf.setFontSize(12);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.setTextColor(0, 0, 0);
      this.pdf.text(`${index + 1}. ${issue.title}`, 20, this.currentY);
      
      // Severity badge
      const badgeX = 180;
      const severityColor = this.getSeverityColor(issue.severity);
      this.pdf.setFillColor(...this.hexToRgb(severityColor));
      this.pdf.roundedRect(badgeX, this.currentY - 4, 25, 6, 2, 2, 'F');
      this.pdf.setFontSize(9);
      this.pdf.setTextColor(255, 255, 255);
      this.pdf.text(issue.severity.toUpperCase(), badgeX + 12.5, this.currentY, { align: 'center' });
      
      this.currentY += 7;
      
      // Description
      this.pdf.setFontSize(10);
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.setTextColor(80, 80, 80);
      const descLines = this.pdf.splitTextToSize(issue.description, 170);
      descLines.forEach((line: string) => {
        this.checkPageBreak();
        this.pdf.text(line, 25, this.currentY);
        this.currentY += 5;
      });
      
      // Category and location
      if (issue.category || issue.location) {
        this.pdf.setFontSize(9);
        this.pdf.setTextColor(120, 120, 120);
        const details = [];
        if (issue.category) details.push(`Category: ${issue.category}`);
        if (issue.location) details.push(`Location: ${issue.location}`);
        this.pdf.text(details.join(' | '), 25, this.currentY);
        this.currentY += 5;
      }
      
      // Fix status
      if (issue.fix_status === 'fixed') {
        this.pdf.setFontSize(9);
        this.setColor('#10b981');
        this.pdf.text(`✓ Automatically fixed by Javari AI (${issue.fix_confidence}% confidence)`, 25, this.currentY);
        this.currentY += 5;
      }
      
      this.currentY += 3;
    });
  }

  /**
   * Add recommendations section
   */
  private addRecommendations(data: ReportData): void {
    this.checkPageBreak(40);
    
    this.addSectionHeader('Recommendations');
    
    this.pdf.setFontSize(11);
    this.pdf.setFont('helvetica', 'normal');
    this.pdf.setTextColor(0, 0, 0);
    
    const recommendations = [
      `1. Address ${data.summary.critical_issues} critical issues immediately to prevent security or functionality problems.`,
      `2. Review and resolve ${data.summary.high_issues} high-priority issues within the next sprint.`,
      `3. ${data.summary.fixed_issues} issues were automatically fixed by Javari AI. Review these changes before deployment.`,
      `4. Consider enabling scheduled testing to catch issues before they reach production.`,
      `5. Set up webhooks or notifications to be alerted when critical issues are discovered.`,
    ];
    
    recommendations.forEach(rec => {
      this.checkPageBreak();
      const lines = this.pdf.splitTextToSize(rec, 170);
      lines.forEach((line: string) => {
        this.pdf.text(line, 20, this.currentY);
        this.currentY += 5;
      });
      this.currentY += 2;
    });
  }

  /**
   * Add section header
   */
  private addSectionHeader(title: string): void {
    this.pdf.setFontSize(16);
    this.pdf.setFont('helvetica', 'bold');
    this.setColor(this.primaryColor);
    this.pdf.text(title, 20, this.currentY);
    this.currentY += 8;
  }

  /**
   * Add footer to every page
   */
  private addFooter(testedAt: string): void {
    const totalPages = this.pdf.getNumberOfPages();
    
    for (let i = 1; i <= totalPages; i++) {
      this.pdf.setPage(i);
      
      // Footer text
      const footerText = this.customization.footer_text || 
                        this.organization.report_footer_text || 
                        'Generated by VerifyForge AI - The Ultimate Testing Platform';
      
      this.pdf.setFontSize(8);
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.setTextColor(150, 150, 150);
      this.pdf.text(footerText, 20, 287);
      
      // Date and page number
      this.pdf.text(`Generated: ${new Date(testedAt).toLocaleDateString()}`, 105, 287, { align: 'center' });
      this.pdf.text(`Page ${i} of ${totalPages}`, 190, 287, { align: 'right' });
    }
  }

  /**
   * Check if we need a page break
   */
  private checkPageBreak(requiredSpace: number = 20): void {
    if (this.currentY + requiredSpace > this.pageHeight) {
      this.pdf.addPage();
      this.currentY = 20;
    }
  }

  /**
   * Set text/draw color from hex
   */
  private setColor(hex: string): void {
    const rgb = this.hexToRgb(hex);
    this.pdf.setTextColor(...rgb);
    this.pdf.setDrawColor(...rgb);
  }

  /**
   * Convert hex color to RGB
   */
  private hexToRgb(hex: string): [number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result 
      ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
      : [0, 0, 0];
  }

  /**
   * Get color based on score
   */
  private getScoreColor(score: number): string {
    if (score >= 80) return '#10b981'; // Green
    if (score >= 60) return '#f59e0b'; // Orange
    return '#ef4444'; // Red
  }

  /**
   * Get color based on severity
   */
  private getSeverityColor(severity: string): string {
    const colors = {
      critical: '#dc2626',
      high: '#ea580c',
      medium: '#f59e0b',
      low: '#3b82f6',
    };
    return colors[severity as keyof typeof colors] || '#6b7280';
  }

  /**
   * Capitalize first letter
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

// =====================================================
// EXPORT FUNCTIONS
// =====================================================

/**
 * Generate white-label PDF report
 */
export async function generateWhiteLabelReport(
  organization: Organization,
  reportData: ReportData,
  customization?: ReportCustomization
): Promise<Buffer> {
  const generator = new WhiteLabelReportGenerator(organization, customization);
  return await generator.generateReport(reportData);
}

/**
 * Generate report with default branding
 */
export async function generateStandardReport(
  reportData: ReportData
): Promise<Buffer> {
  // Create a default organization object for standard reports
  const defaultOrg: Organization = {
    id: 'default',
    name: 'VerifyForge AI',
    slug: 'verifyforge',
    subscription_tier: 'enterprise',
    monthly_test_limit: -1,
    api_calls_limit: -1,
    tests_used_this_month: 0,
    api_calls_used_this_month: 0,
    status: 'active',
    primary_color: '#3b82f6',
  };
  
  const generator = new WhiteLabelReportGenerator(defaultOrg, { show_branding: false });
  return await generator.generateReport(reportData);
}

export default {
  WhiteLabelReportGenerator,
  generateWhiteLabelReport,
  generateStandardReport,
};
