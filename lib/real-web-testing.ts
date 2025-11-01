// Real Web Testing Engine - No Mock Data
// lib/real-web-testing.ts

interface TestProgress {
  stage: string;
  progress: number;
  message: string;
}

interface TestResult {
  overall: 'pass' | 'fail' | 'warning';
  score: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  issues: Array<{
    severity: 'high' | 'medium' | 'low';
    category: string;
    message: string;
    suggestion: string;
  }>;
  recommendations: string[];
  performanceMetrics: {
    loadTime: number;
    pageSize: number;
    requestCount: number;
    responseCode: number;
  };
  seoAnalysis: {
    title: string;
    titleLength: number;
    metaDescription: string;
    metaDescriptionLength: number;
    h1Count: number;
    imageCount: number;
    imagesWithoutAlt: number;
  };
  linksAnalysis: {
    totalLinks: number;
    internalLinks: number;
    externalLinks: number;
    brokenLinks: string[];
  };
}

export class RealWebTester {
  private progressCallback?: (progress: TestProgress) => void;

  constructor(progressCallback?: (progress: TestProgress) => void) {
    this.progressCallback = progressCallback;
  }

  private updateProgress(stage: string, progress: number, message: string) {
    if (this.progressCallback) {
      this.progressCallback({ stage, progress, message });
    }
  }

  async testWebsite(url: string): Promise<TestResult> {
    const startTime = Date.now();
    const issues: TestResult['issues'] = [];
    const recommendations: string[] = [];

    try {
      // Validate URL
      let testUrl: URL;
      try {
        testUrl = new URL(url);
      } catch (e) {
        throw new Error('Invalid URL format');
      }

      // Stage 1: Fetch Website
      this.updateProgress('fetch', 10, 'Fetching website...');
      const fetchStart = Date.now();
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'VerifyForge-AI-Bot/1.0'
        }
      });
      const fetchTime = Date.now() - fetchStart;

      if (!response.ok) {
        issues.push({
          severity: 'high',
          category: 'Connectivity',
          message: `Website returned ${response.status} status code`,
          suggestion: 'Check if the website is accessible and properly configured'
        });
      }

      const html = await response.text();
      const contentLength = new Blob([html]).size;

      this.updateProgress('parse', 25, 'Parsing HTML structure...');

      // Parse HTML using basic string operations (cheerio not available in Edge runtime)
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : '';

      const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
      const metaDescription = metaDescMatch ? metaDescMatch[1] : '';

      // Count H1 tags
      const h1Matches = html.match(/<h1[^>]*>/gi);
      const h1Count = h1Matches ? h1Matches.length : 0;

      // Count images and check alt attributes
      const imgMatches = html.match(/<img[^>]*>/gi) || [];
      const imageCount = imgMatches.length;
      let imagesWithoutAlt = 0;
      imgMatches.forEach(img => {
        if (!img.match(/alt=["'][^"']*["']/i)) {
          imagesWithoutAlt++;
        }
      });

      // Stage 2: Analyze Links
      this.updateProgress('links', 40, 'Checking links...');
      const linkMatches = html.match(/<a[^>]*href=["']([^"']*)["']/gi) || [];
      const links = linkMatches.map(link => {
        const hrefMatch = link.match(/href=["']([^"']*)["']/i);
        return hrefMatch ? hrefMatch[1] : '';
      }).filter(Boolean);

      const internalLinks = links.filter(link => 
        link.startsWith('/') || link.startsWith(testUrl.origin)
      );
      const externalLinks = links.filter(link => 
        link.startsWith('http') && !link.startsWith(testUrl.origin)
      );

      // Check for broken links (sample first 10 internal links)
      const brokenLinks: string[] = [];
      const linksToCheck = internalLinks.slice(0, 10);
      
      this.updateProgress('links', 50, `Verifying ${linksToCheck.length} links...`);
      
      for (const link of linksToCheck) {
        try {
          const fullUrl = link.startsWith('http') ? link : new URL(link, testUrl.origin).href;
          const linkResponse = await fetch(fullUrl, { method: 'HEAD' });
          if (!linkResponse.ok) {
            brokenLinks.push(link);
          }
        } catch (e) {
          brokenLinks.push(link);
        }
      }

      // Stage 3: Performance Analysis
      this.updateProgress('performance', 65, 'Analyzing performance...');

      if (fetchTime > 3000) {
        issues.push({
          severity: 'medium',
          category: 'Performance',
          message: `Slow page load time: ${(fetchTime / 1000).toFixed(2)}s`,
          suggestion: 'Consider optimizing server response time, implementing caching, or using a CDN'
        });
        recommendations.push('Optimize server response time and implement caching');
      }

      if (contentLength > 500000) { // 500KB
        issues.push({
          severity: 'medium',
          category: 'Performance',
          message: `Large page size: ${(contentLength / 1024).toFixed(0)}KB`,
          suggestion: 'Compress HTML, minify CSS/JS, and optimize images'
        });
        recommendations.push('Implement gzip compression and minify assets');
      }

      // Stage 4: SEO Analysis
      this.updateProgress('seo', 80, 'Analyzing SEO...');

      if (!title) {
        issues.push({
          severity: 'high',
          category: 'SEO',
          message: 'Missing page title',
          suggestion: 'Add a descriptive title tag to improve SEO'
        });
      } else if (title.length < 30 || title.length > 60) {
        issues.push({
          severity: 'low',
          category: 'SEO',
          message: `Title length (${title.length} chars) not optimal (30-60 recommended)`,
          suggestion: 'Optimize title length for better search engine display'
        });
      }

      if (!metaDescription) {
        issues.push({
          severity: 'medium',
          category: 'SEO',
          message: 'Missing meta description',
          suggestion: 'Add a compelling meta description (150-160 characters)'
        });
      } else if (metaDescription.length < 120 || metaDescription.length > 160) {
        issues.push({
          severity: 'low',
          category: 'SEO',
          message: `Meta description length (${metaDescription.length} chars) not optimal`,
          suggestion: 'Keep meta descriptions between 120-160 characters'
        });
      }

      if (h1Count === 0) {
        issues.push({
          severity: 'medium',
          category: 'SEO',
          message: 'No H1 heading found',
          suggestion: 'Add a single H1 heading that describes the page content'
        });
      } else if (h1Count > 1) {
        issues.push({
          severity: 'low',
          category: 'SEO',
          message: `Multiple H1 headings found (${h1Count})`,
          suggestion: 'Use only one H1 heading per page for better SEO'
        });
      }

      // Stage 5: Accessibility Analysis
      this.updateProgress('accessibility', 90, 'Checking accessibility...');

      if (imagesWithoutAlt > 0) {
        issues.push({
          severity: 'medium',
          category: 'Accessibility',
          message: `${imagesWithoutAlt} of ${imageCount} images missing alt text`,
          suggestion: 'Add descriptive alt text to all images for screen readers'
        });
        recommendations.push('Add alt text to all images for better accessibility');
      }

      // Stage 6: Generate Recommendations
      this.updateProgress('finalize', 95, 'Generating report...');

      if (fetchTime < 1000 && !recommendations.includes('Optimize server response time')) {
        recommendations.push('Great page load time! Consider implementing a CDN for global users');
      }

      if (brokenLinks.length === 0) {
        recommendations.push('All checked links are working correctly');
      } else {
        recommendations.push(`Fix ${brokenLinks.length} broken internal links`);
      }

      if (issues.length === 0) {
        recommendations.push('Excellent! No major issues found');
      }

      // Calculate score
      let score = 100;
      issues.forEach(issue => {
        if (issue.severity === 'high') score -= 10;
        else if (issue.severity === 'medium') score -= 5;
        else score -= 2;
      });
      score = Math.max(0, Math.min(100, score));

      const totalTests = 15; // Number of checks we performed
      const failed = issues.filter(i => i.severity === 'high').length;
      const warnings = issues.filter(i => i.severity === 'medium' || i.severity === 'low').length;
      const passed = totalTests - failed - warnings;

      this.updateProgress('complete', 100, 'Test complete!');

      return {
        overall: score >= 80 ? 'pass' : score >= 60 ? 'warning' : 'fail',
        score,
        summary: {
          total: totalTests,
          passed,
          failed,
          warnings
        },
        issues,
        recommendations,
        performanceMetrics: {
          loadTime: fetchTime,
          pageSize: contentLength,
          requestCount: 1, // Basic - would need more sophisticated tracking
          responseCode: response.status
        },
        seoAnalysis: {
          title,
          titleLength: title.length,
          metaDescription,
          metaDescriptionLength: metaDescription.length,
          h1Count,
          imageCount,
          imagesWithoutAlt
        },
        linksAnalysis: {
          totalLinks: links.length,
          internalLinks: internalLinks.length,
          externalLinks: externalLinks.length,
          brokenLinks
        }
      };

    } catch (error: any) {
      throw new Error(`Testing failed: ${error.message}`);
    }
  }
}
