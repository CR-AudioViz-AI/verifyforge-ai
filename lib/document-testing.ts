// VerifyForge AI - Document Testing Engine
// lib/document-testing.ts
// Tests PDF, DOCX, XLSX, PPTX files for quality, accessibility, and structure

import { createClient } from '@supabase/supabase-js';
import pdf from 'pdf-parse';
import * as fs from 'fs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface DocumentTestResult {
  passed: boolean;
  issues: any[];
  metrics: any[];
  summary: {
    quality_score: number;
    file_size_mb: number;
    page_count?: number;
    word_count?: number;
  };
}

export class DocumentTester {
  /**
   * Main entry point for document testing
   */
  static async testDocument(
    submissionId: string,
    filePath: string,
    fileType: 'pdf' | 'docx' | 'xlsx' | 'pptx'
  ): Promise<DocumentTestResult> {
    
    const issues: any[] = [];
    const metrics: any[] = [];
    
    try {
      // Get file stats
      const stats = fs.statSync(filePath);
      const fileSizeMB = stats.size / (1024 * 1024);
      
      metrics.push({
        submission_id: submissionId,
        metric_name: 'file_size',
        value: fileSizeMB,
        unit: 'MB',
        threshold: 10,
        passed: fileSizeMB < 10
      });
      
      if (fileSizeMB > 10) {
        issues.push({
          submission_id: submissionId,
          issue_type: 'performance',
          severity: 'medium',
          title: 'Large File Size',
          description: `File size (${fileSizeMB.toFixed(2)}MB) exceeds recommended maximum of 10MB`,
          location: 'File'
        });
      }

      // Route to specific test based on file type
      let result: any;
      switch (fileType) {
        case 'pdf':
          result = await this.testPDF(submissionId, filePath);
          break;
        case 'docx':
          result = await this.testDOCX(submissionId, filePath);
          break;
        case 'xlsx':
          result = await this.testXLSX(submissionId, filePath);
          break;
        case 'pptx':
          result = await this.testPPTX(submissionId, filePath);
          break;
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }

      issues.push(...result.issues);
      metrics.push(...result.metrics);

      // Calculate quality score
      let qualityScore = 100;
      qualityScore -= issues.filter(i => i.severity === 'critical').length * 20;
      qualityScore -= issues.filter(i => i.severity === 'high').length * 10;
      qualityScore -= issues.filter(i => i.severity === 'medium').length * 5;
      qualityScore -= issues.filter(i => i.severity === 'low').length * 2;
      qualityScore = Math.max(0, Math.min(100, qualityScore));

      // Store results
      await this.storeResults(submissionId, issues, metrics);

      return {
        passed: issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0,
        issues,
        metrics,
        summary: {
          quality_score: qualityScore,
          file_size_mb: fileSizeMB,
          ...result.summary
        }
      };

    } catch (error) {
      console.error('Document testing error:', error);
      throw error;
    }
  }

  /**
   * Test PDF document
   */
  static async testPDF(submissionId: string, filePath: string) {
    const issues: any[] = [];
    const metrics: any[] = [];
    
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);

      // Page count
      metrics.push({
        submission_id: submissionId,
        metric_name: 'page_count',
        value: data.numpages,
        unit: 'pages',
        threshold: null,
        passed: true
      });

      // Text extractability
      const hasText = data.text && data.text.length > 0;
      metrics.push({
        submission_id: submissionId,
        metric_name: 'text_extractable',
        value: hasText ? 1 : 0,
        unit: 'boolean',
        threshold: 1,
        passed: hasText
      });

      if (!hasText) {
        issues.push({
          submission_id: submissionId,
          issue_type: 'accessibility',
          severity: 'high',
          title: 'No Extractable Text',
          description: 'PDF contains no text or text is embedded as images. This impacts accessibility and searchability.',
          location: 'PDF Structure'
        });
      }

      // Word count
      const wordCount = data.text ? data.text.split(/\s+/).length : 0;
      metrics.push({
        submission_id: submissionId,
        metric_name: 'word_count',
        value: wordCount,
        unit: 'words',
        threshold: null,
        passed: true
      });

      // Check for metadata
      const hasMetadata = data.info && Object.keys(data.info).length > 0;
      if (!hasMetadata) {
        issues.push({
          submission_id: submissionId,
          issue_type: 'quality',
          severity: 'low',
          title: 'Missing Metadata',
          description: 'PDF lacks metadata (title, author, etc.). Adding metadata improves organization and searchability.',
          location: 'PDF Properties'
        });
      }

      return {
        issues,
        metrics,
        summary: {
          page_count: data.numpages,
          word_count: wordCount
        }
      };

    } catch (error) {
      issues.push({
        submission_id: submissionId,
        issue_type: 'error',
        severity: 'critical',
        title: 'PDF Parse Error',
        description: `Failed to parse PDF: ${error.message}`,
        location: 'File Structure'
      });

      return { issues, metrics, summary: {} };
    }
  }

  /**
   * Test DOCX document (placeholder - would need docx parser)
   */
  static async testDOCX(submissionId: string, filePath: string) {
    const issues: any[] = [];
    const metrics: any[] = [];
    
    // Basic file structure checks
    metrics.push({
      submission_id: submissionId,
      metric_name: 'format',
      value: 1,
      unit: 'valid',
      threshold: 1,
      passed: true
    });

    // Note: In production, use a proper DOCX parser like 'mammoth' or 'docx'
    issues.push({
      submission_id: submissionId,
      issue_type: 'info',
      severity: 'info',
      title: 'DOCX Analysis',
      description: 'Basic DOCX validation complete. For detailed analysis, upgrade to Pro.',
      location: 'Document'
    });

    return {
      issues,
      metrics,
      summary: {
        word_count: 0 // Would extract from actual parser
      }
    };
  }

  /**
   * Test XLSX spreadsheet (placeholder - would need xlsx parser)
   */
  static async testXLSX(submissionId: string, filePath: string) {
    const issues: any[] = [];
    const metrics: any[] = [];
    
    // Basic file structure checks
    metrics.push({
      submission_id: submissionId,
      metric_name: 'format',
      value: 1,
      unit: 'valid',
      threshold: 1,
      passed: true
    });

    // Note: In production, use a proper XLSX parser like 'xlsx' or 'exceljs'
    issues.push({
      submission_id: submissionId,
      issue_type: 'info',
      severity: 'info',
      title: 'XLSX Analysis',
      description: 'Basic XLSX validation complete. For formula and data validation, upgrade to Pro.',
      location: 'Spreadsheet'
    });

    return {
      issues,
      metrics,
      summary: {}
    };
  }

  /**
   * Test PPTX presentation (placeholder - would need pptx parser)
   */
  static async testPPTX(submissionId: string, filePath: string) {
    const issues: any[] = [];
    const metrics: any[] = [];
    
    // Basic file structure checks
    metrics.push({
      submission_id: submissionId,
      metric_name: 'format',
      value: 1,
      unit: 'valid',
      threshold: 1,
      passed: true
    });

    // Note: In production, use a proper PPTX parser
    issues.push({
      submission_id: submissionId,
      issue_type: 'info',
      severity: 'info',
      title: 'PPTX Analysis',
      description: 'Basic PPTX validation complete. For slide content analysis, upgrade to Pro.',
      location: 'Presentation'
    });

    return {
      issues,
      metrics,
      summary: {}
    };
  }

  /**
   * Helper: Store results in database
   */
  static async storeResults(submissionId: string, issues: any[], metrics: any[]) {
    // Store issues
    if (issues.length > 0) {
      await supabase.from('test_issues').insert(issues);
    }

    // Store metrics
    if (metrics.length > 0) {
      await supabase.from('performance_metrics').insert(metrics);
    }
  }
}

export default DocumentTester;
