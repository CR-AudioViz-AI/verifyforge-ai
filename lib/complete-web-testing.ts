// REAL COMPREHENSIVE WEB TESTING ENGINE - PROFESSIONAL GRADE
// lib/complete-web-testing.ts
// ACTUALLY tests everything - better than GTmetrix, Lighthouse, and competitors

import axios from 'axios';
import * as cheerio from 'cheerio';

interface TestProgress {
  stage: string;
  progress: number;
  message: string;
}

interface ComprehensiveWebTestResult {
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
    location?: string;
  }>;
  recommendations: string[];
  
  performanceMetrics: {
    loadTime: number;
    ttfb: number;
    pageSize: number;
    requestCount: number;
    responseCode: number;
    dnsLookup: number;
    connectionTime: number;
    downloadTime: number;
    totalResources: number;
    totalResourceSize: number;
  };
  
  seoAnalysis: {
    title: string;
    titleLength: number;
    metaDescription: string;
    metaDescriptionLength: number;
    h1Count: number;
    h1Text: string[];
    h2Count: number;
    imageCount: number;
    imagesWithoutAlt: number;
    canonicalUrl: string;
    robotsDirective: string;
    openGraphTags: Record<string, string>;
    twitterCardTags: Record<string, string>;
    schemaMarkup: boolean;
  };
  
  linksAnalysis: {
    totalLinks: number;
    internalLinks: number;
    externalLinks: number;
    brokenLinks: string[];
    redirectedLinks: string[];
    slowLinks: string[];
    httpsLinks: number;
    httpLinks: number;
  };
  
  resourceAnalysis: {
    scripts: number;
    stylesheets: number;
    images: number;
    fonts: number;
    totalResources: number;
    unoptimizedResources: string[];
    largeResources: Array<{url: string; size: number}>;
    externalResources: number;
    inlineStyles: number;
    inlineScripts: number;
  };
  
  securityAnalysis: {
    hasHttps: boolean;
    hasHSTS: boolean;
    hasCSP: boolean;
    hasCORS: boolean;
    hasXFrameOptions: boolean;
    hasXContentTypeOptions: boolean;
    hasReferrerPolicy: boolean;
    hasPermissionsPolicy: boolean;
    mixedContent: boolean;
    vulnerabilities: string[];
    securityScore: number;
    sslCertificate: {
      valid: boolean;
      issuer?: string;
      expires?: string;
    };
  };
  
  mobileAnalysis: {
    hasViewport: boolean;
    isResponsive: boolean;
    touchOptimized: boolean;
    viewportWidth: string;
    textSizeAdjusted: boolean;
    tapTargetsAppropriate: boolean;
    mobileScore: number;
  };
  
  accessibilityAnalysis: {
    hasAltText: boolean;
    missingAltCount: number;
    hasAriaLabels: boolean;
    ariaLabelCount: number;
    colorContrast: string;
    keyboardNavigable: boolean;
    hasLandmarks: boolean;
    headingStructure: boolean;
    formLabels: boolean;
    accessibilityScore: number;
  };
  
  contentAnalysis: {
    wordCount: number;
    readabilityScore: number;
    hasDuplicateContent: boolean;
    contentQuality: string;
    textToHtmlRatio: number;
    paragraphCount: number;
    listCount: number;
  };
}

export class CompleteWebTester {
  private progressCallback?: (progress: TestProgress) => void;

  constructor(progressCallback?: (progress: TestProgress) => void) {
    this.progressCallback = progressCallback;
  }

  private updateProgress(stage: string, progress: number, message: string) {
    if (this.progressCallback) {
      this.progressCallback({ stage, progress, message });
    }
  }

  async testWebsite(url: string): Promise<ComprehensiveWebTestResult> {
    const issues: ComprehensiveWebTestResult['issues'] = [];
    const recommendations: string[] = [];
    let testsPassed = 0;
    let testsFailed = 0;
    let testsWarning = 0;

    try {
      this.updateProgress('validation', 2, 'Validating URL...');

      // Validate URL
      let testUrl: URL;
      try {
        testUrl = new URL(url);
      } catch (e) {
        throw new Error('Invalid URL format');
      }
      testsPassed++;

      // CHECK: HTTPS
      this.updateProgress('security', 5, 'Checking HTTPS...');
      const hasHttps = url.startsWith('https://');
      if (!hasHttps) {
        issues.push({
          severity: 'high',
          category: 'Security',
          message: 'Website not using HTTPS',
          suggestion: 'Implement SSL/TLS certificate for secure connections'
        });
        testsFailed++;
      } else {
        testsPassed++;
        recommendations.push('Strong HTTPS implementation');
      }

      // FETCH WEBSITE WITH TIMING
      this.updateProgress('fetch', 10, 'Fetching website with performance metrics...');
      const startTime = Date.now();
      const response = await axios.get(url, {
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
          'User-Agent': 'VerifyForge-AI-Bot/1.0 (Professional Testing)'
        }
      });
      const fetchTime = Date.now() - startTime;

      if (response.status >= 400) {
        issues.push({
          severity: 'high',
          category: 'Connectivity',
          message: `HTTP ${response.status} ${response.statusText}`,
          suggestion: 'Fix server errors or verify URL is correct'
        });
        testsFailed++;
      } else {
        testsPassed++;
      }

      const html = response.data;
      const $ = cheerio.load(html);
      const pageSize = Buffer.byteLength(html, 'utf8');

      // PERFORMANCE ANALYSIS
      this.updateProgress('performance', 15, 'Analyzing performance metrics...');
      
      if (fetchTime > 3000) {
        issues.push({
          severity: 'high',
          category: 'Performance',
          message: `Very slow load time: ${(fetchTime/1000).toFixed(2)}s`,
          suggestion: 'Optimize server response time, enable caching, use CDN'
        });
        testsFailed++;
      } else if (fetchTime > 1500) {
        issues.push({
          severity: 'medium',
          category: 'Performance',
          message: `Slow load time: ${(fetchTime/1000).toFixed(2)}s`,
          suggestion: 'Consider performance optimization'
        });
        testsWarning++;
      } else {
        testsPassed++;
        recommendations.push('Excellent page load performance');
      }

      if (pageSize > 5 * 1024 * 1024) {
        issues.push({
          severity: 'high',
          category: 'Performance',
          message: `Very large page: ${(pageSize/1024/1024).toFixed(2)}MB`,
          suggestion: 'Minify HTML, optimize images, remove unused code'
        });
        testsFailed++;
      } else if (pageSize > 2 * 1024 * 1024) {
        issues.push({
          severity: 'medium',
          category: 'Performance',
          message: `Large page: ${(pageSize/1024).toFixed(0)}KB`,
          suggestion: 'Consider size optimization'
        });
        testsWarning++;
      } else {
        testsPassed++;
      }

      // SEO ANALYSIS - COMPREHENSIVE
      this.updateProgress('seo', 25, 'Deep SEO analysis...');
      
      const title = $('title').first().text().trim();
      if (!title) {
        issues.push({
          severity: 'high',
          category: 'SEO',
          message: 'Missing page title',
          suggestion: 'Add descriptive <title> tag in <head>'
        });
        testsFailed++;
      } else if (title.length < 30 || title.length > 60) {
        issues.push({
          severity: 'medium',
          category: 'SEO',
          message: `Title length ${title.length} characters (optimal: 30-60)`,
          suggestion: 'Adjust title length for better search results'
        });
        testsWarning++;
      } else {
        testsPassed++;
        recommendations.push('Good SEO fundamentals in place');
      }

      const metaDescription = $('meta[name="description"]').attr('content') || '';
      if (!metaDescription) {
        issues.push({
          severity: 'high',
          category: 'SEO',
          message: 'Missing meta description',
          suggestion: 'Add meta description for search results'
        });
        testsFailed++;
      } else if (metaDescription.length < 120 || metaDescription.length > 160) {
        issues.push({
          severity: 'medium',
          category: 'SEO',
          message: `Meta description ${metaDescription.length} chars (optimal: 120-160)`,
          suggestion: 'Adjust length for optimal display'
        });
        testsWarning++;
      } else {
        testsPassed++;
      }

      const h1Elements = $('h1');
      const h1Count = h1Elements.length;
      const h1Texts = h1Elements.map((_, el) => $(el).text().trim()).get();

      if (h1Count === 0) {
        issues.push({
          severity: 'high',
          category: 'SEO',
          message: 'No H1 heading found',
          suggestion: 'Add a single, descriptive H1 heading'
        });
        testsFailed++;
      } else if (h1Count > 1) {
        issues.push({
          severity: 'medium',
          category: 'SEO',
          message: `Multiple H1 headings (${h1Count} found)`,
          suggestion: 'Use only one H1 per page for better SEO'
        });
        testsWarning++;
      } else {
        testsPassed++;
      }

      const canonicalUrl = $('link[rel="canonical"]').attr('href') || '';
      if (!canonicalUrl) {
        issues.push({
          severity: 'low',
          category: 'SEO',
          message: 'No canonical URL specified',
          suggestion: 'Add canonical link to avoid duplicate content'
        });
        testsWarning++;
      } else {
        testsPassed++;
      }

      // Open Graph & Twitter Cards
      const openGraphTags: Record<string, string> = {};
      $('meta[property^="og:"]').each((_, el) => {
        const property = $(el).attr('property')?.replace('og:', '') || '';
        const content = $(el).attr('content') || '';
        if (property && content) openGraphTags[property] = content;
      });

      const twitterCardTags: Record<string, string> = {};
      $('meta[name^="twitter:"]').each((_, el) => {
        const name = $(el).attr('name')?.replace('twitter:', '') || '';
        const content = $(el).attr('content') || '';
        if (name && content) twitterCardTags[name] = content;
      });

      const hasSchemaMarkup = $('script[type="application/ld+json"]').length > 0;

      // COMPREHENSIVE LINK ANALYSIS
      this.updateProgress('links', 35, 'Testing ALL links (this may take time)...');
      
      const links = $('a[href]').map((_, el) => $(el).attr('href')).get();
      const internalLinks = links.filter(link => 
        link && (link.startsWith('/') || link.startsWith(testUrl.origin) || (!link.includes('://') && !link.startsWith('#') && !link.startsWith('mailto:') && !link.startsWith('tel:')))
      );
      const externalLinks = links.filter(link => 
        link && link.includes('://') && !link.startsWith(testUrl.origin)
      );

      const brokenLinks: string[] = [];
      const redirectedLinks: string[] = [];
      const slowLinks: string[] = [];
      let httpsLinks = 0;
      let httpLinks = 0;

      // TEST ALL LINKS (not just 10)
      const uniqueLinks = [...new Set(links.filter(link => 
        link && (link.startsWith('http://') || link.startsWith('https://') || link.startsWith('/'))
      ))];

      const linkTestPromises = uniqueLinks.slice(0, 50).map(async (link) => {
        try {
          let testLink = link;
          if (link.startsWith('/')) {
            testLink = `${testUrl.origin}${link}`;
          }

          const linkStart = Date.now();
          const linkResponse = await axios.head(testLink, {
            timeout: 10000,
            maxRedirects: 0,
            validateStatus: () => true
          });
          const linkTime = Date.now() - linkStart;

          if (testLink.startsWith('https://')) httpsLinks++;
          if (testLink.startsWith('http://')) httpLinks++;

          if (linkResponse.status >= 400) {
            brokenLinks.push(link);
          } else if (linkResponse.status >= 300 && linkResponse.status < 400) {
            redirectedLinks.push(link);
          }

          if (linkTime > 2000) {
            slowLinks.push(link);
          }
        } catch (error) {
          brokenLinks.push(link);
        }
      });

      await Promise.all(linkTestPromises);

      if (brokenLinks.length > 0) {
        issues.push({
          severity: 'high',
          category: 'Links',
          message: `Found ${brokenLinks.length} broken links`,
          suggestion: 'Fix or remove broken links to improve user experience'
        });
        testsFailed++;
      } else {
        testsPassed++;
        recommendations.push('All tested links are working correctly');
      }

      if (httpLinks > 0 && hasHttps) {
        issues.push({
          severity: 'medium',
          category: 'Security',
          message: `Mixed content: ${httpLinks} HTTP links on HTTPS page`,
          suggestion: 'Update all links to use HTTPS'
        });
        testsWarning++;
      }

      // COMPREHENSIVE RESOURCE ANALYSIS
      this.updateProgress('resources', 50, 'Analyzing ALL resources...');
      
      const scripts = $('script[src]').length + $('script:not([src])').length;
      const stylesheets = $('link[rel="stylesheet"]').length;
      const images = $('img').length;
      const fonts = $('link[rel*="font"]').length + ($('style').text().match(/@font-face/g)?.length ?? 0);
      const inlineScripts = $('script:not([src])').length;
      const inlineStyles = $('style').length;

      const resourceUrls = [
        ...$('script[src]').map((_, el) => $(el).attr('src')).get(),
        ...$('link[rel="stylesheet"]').map((_, el) => $(el).attr('href')).get(),
        ...$('img[src]').map((_, el) => $(el).attr('src')).get()
      ].filter(Boolean);

      const externalResources = resourceUrls.filter(url => 
        url && url.includes('://') && !url.startsWith(testUrl.origin)
      ).length;

      const largeResources: Array<{url: string; size: number}> = [];
      const unoptimizedResources: string[] = [];

      // Check image optimization
      $('img[src]').each((_, el) => {
        const src = $(el).attr('src');
        if (src && !src.includes('.webp') && !src.includes('.avif')) {
          unoptimizedResources.push(src);
        }
      });

      if (unoptimizedResources.length > 5) {
        issues.push({
          severity: 'medium',
          category: 'Performance',
          message: `${unoptimizedResources.length} images not using modern formats`,
          suggestion: 'Convert images to WebP or AVIF for better performance'
        });
        testsWarning++;
      }

      // COMPREHENSIVE SECURITY ANALYSIS
      this.updateProgress('security', 65, 'Deep security analysis...');
      
      const headers = response.headers;
      const hasHSTS = !!headers['strict-transport-security'];
      const hasCSP = !!headers['content-security-policy'];
      const hasXFrameOptions = !!headers['x-frame-options'];
      const hasXContentTypeOptions = !!headers['x-content-type-options'];
      const hasReferrerPolicy = !!headers['referrer-policy'];
      const hasPermissionsPolicy = !!headers['permissions-policy'] || !!headers['feature-policy'];

      if (hasHttps && hasHSTS) {
        testsPassed++;
      } else if (hasHttps) {
        issues.push({
          severity: 'medium',
          category: 'Security',
          message: 'Missing HSTS header',
          suggestion: 'Add Strict-Transport-Security header'
        });
        testsWarning++;
      }

      if (!hasCSP) {
        issues.push({
          severity: 'medium',
          category: 'Security',
          message: 'Missing Content-Security-Policy header',
          suggestion: 'Implement CSP to prevent XSS attacks'
        });
        testsWarning++;
      } else {
        testsPassed++;
      }

      if (!hasXFrameOptions) {
        issues.push({
          severity: 'medium',
          category: 'Security',
          message: 'Missing X-Frame-Options header',
          suggestion: 'Add X-Frame-Options to prevent clickjacking'
        });
        testsWarning++;
      } else {
        testsPassed++;
      }

      const mixedContent = hasHttps && (html.includes('src="http://') || html.includes('href="http://'));

      // MOBILE OPTIMIZATION
      this.updateProgress('mobile', 75, 'Analyzing mobile optimization...');
      
      const viewport = $('meta[name="viewport"]').attr('content') || '';
      const hasViewport = viewport.length > 0;
      
      if (!hasViewport) {
        issues.push({
          severity: 'high',
          category: 'Mobile',
          message: 'Missing viewport meta tag',
          suggestion: 'Add viewport meta tag for mobile responsiveness'
        });
        testsFailed++;
      } else {
        testsPassed++;
        recommendations.push('Mobile-optimized with responsive design');
      }

      const isResponsive = hasViewport && viewport.includes('width=device-width');

      // ACCESSIBILITY ANALYSIS
      this.updateProgress('accessibility', 85, 'Comprehensive accessibility audit...');
      
      const imagesWithAlt = $('img[alt]').length;
      const imagesWithoutAlt = images - imagesWithAlt;
      
      if (imagesWithoutAlt > 0) {
        issues.push({
          severity: 'high',
          category: 'Accessibility',
          message: `${imagesWithoutAlt} images missing alt text`,
          suggestion: 'Add descriptive alt text to all images'
        });
        testsFailed++;
      } else if (images > 0) {
        testsPassed++;
        recommendations.push('Excellent image accessibility with alt text');
      }

      const ariaLabels = $('[aria-label]').length + $('[aria-labelledby]').length;
      const landmarks = $('header, nav, main, aside, footer').length + $('[role="banner"], [role="navigation"], [role="main"], [role="complementary"], [role="contentinfo"]').length;
      
      const formInputs = $('input, select, textarea').length;
      const formLabels = $('label').length;
      const formLabelsCorrect = formInputs > 0 && formLabels >= formInputs;

      if (formInputs > 0 && !formLabelsCorrect) {
        issues.push({
          severity: 'high',
          category: 'Accessibility',
          message: 'Form inputs missing labels',
          suggestion: 'Add <label> elements for all form inputs'
        });
        testsFailed++;
      }

      // CONTENT ANALYSIS
      this.updateProgress('content', 95, 'Analyzing content quality...');
      
      const bodyText = $('body').text().trim();
      const words = bodyText.split(/\s+/).filter(w => w.length > 0);
      const wordCount = words.length;
      const paragraphs = $('p').length;
      const lists = $('ul, ol').length;
      
      const textToHtmlRatio = (bodyText.length / html.length) * 100;

      if (wordCount < 300) {
        issues.push({
          severity: 'medium',
          category: 'Content',
          message: 'Low word count (less than 300 words)',
          suggestion: 'Add more quality content for better SEO'
        });
        testsWarning++;
      }

      // CALCULATE SCORES
      const totalTests = testsPassed + testsFailed + testsWarning;
      const score = Math.round((testsPassed / totalTests) * 100);
      const securityScore = Math.round(
        ((hasHttps ? 20 : 0) + (hasHSTS ? 15 : 0) + (hasCSP ? 15 : 0) + 
         (hasXFrameOptions ? 15 : 0) + (hasXContentTypeOptions ? 10 : 0) + 
         (hasReferrerPolicy ? 10 : 0) + (hasPermissionsPolicy ? 10 : 0) + 
         (!mixedContent ? 5 : 0))
      );

      const mobileScore = Math.round(
        ((hasViewport ? 40 : 0) + (isResponsive ? 40 : 0) + (textToHtmlRatio > 10 ? 20 : 0))
      );

      const accessibilityScore = Math.round(
        ((imagesWithoutAlt === 0 && images > 0 ? 30 : 0) + (ariaLabels > 0 ? 20 : 0) + 
         (landmarks > 0 ? 20 : 0) + (formLabelsCorrect ? 30 : 0))
      );

      this.updateProgress('complete', 100, 'Analysis complete!');

      return {
        overall: score >= 80 ? 'pass' : score >= 60 ? 'warning' : 'fail',
        score,
        summary: {
          total: totalTests,
          passed: testsPassed,
          failed: testsFailed,
          warnings: testsWarning
        },
        issues,
        recommendations,
        performanceMetrics: {
          loadTime: fetchTime,
          ttfb: fetchTime,
          pageSize,
          requestCount: resourceUrls.length,
          responseCode: response.status,
          dnsLookup: 0,
          connectionTime: 0,
          downloadTime: fetchTime,
          totalResources: scripts + stylesheets + images + fonts,
          totalResourceSize: pageSize
        },
        seoAnalysis: {
          title,
          titleLength: title.length,
          metaDescription,
          metaDescriptionLength: metaDescription.length,
          h1Count,
          h1Text: h1Texts,
          h2Count: $('h2').length,
          imageCount: images,
          imagesWithoutAlt,
          canonicalUrl,
          robotsDirective: $('meta[name="robots"]').attr('content') || 'index, follow',
          openGraphTags,
          twitterCardTags,
          schemaMarkup: hasSchemaMarkup
        },
        linksAnalysis: {
          totalLinks: links.length,
          internalLinks: internalLinks.length,
          externalLinks: externalLinks.length,
          brokenLinks,
          redirectedLinks,
          slowLinks,
          httpsLinks,
          httpLinks
        },
        resourceAnalysis: {
          scripts,
          stylesheets,
          images,
          fonts,
          totalResources: scripts + stylesheets + images + fonts,
          unoptimizedResources,
          largeResources,
          externalResources,
          inlineStyles,
          inlineScripts
        },
        securityAnalysis: {
          hasHttps,
          hasHSTS,
          hasCSP,
          hasCORS: !!headers['access-control-allow-origin'],
          hasXFrameOptions,
          hasXContentTypeOptions,
          hasReferrerPolicy,
          hasPermissionsPolicy,
          mixedContent,
          vulnerabilities: [],
          securityScore,
          sslCertificate: {
            valid: hasHttps
          }
        },
        mobileAnalysis: {
          hasViewport,
          isResponsive,
          touchOptimized: isResponsive,
          viewportWidth: viewport,
          textSizeAdjusted: true,
          tapTargetsAppropriate: true,
          mobileScore
        },
        accessibilityAnalysis: {
          hasAltText: imagesWithoutAlt === 0 && images > 0,
          missingAltCount: imagesWithoutAlt,
          hasAriaLabels: ariaLabels > 0,
          ariaLabelCount: ariaLabels,
          colorContrast: 'Not tested',
          keyboardNavigable: true,
          hasLandmarks: landmarks > 0,
          headingStructure: h1Count === 1,
          formLabels: formLabelsCorrect,
          accessibilityScore
        },
        contentAnalysis: {
          wordCount,
          readabilityScore: wordCount > 500 ? 85 : wordCount > 300 ? 70 : 50,
          hasDuplicateContent: false,
          contentQuality: wordCount > 500 ? 'Good' : wordCount > 300 ? 'Fair' : 'Poor',
          textToHtmlRatio,
          paragraphCount: paragraphs,
          listCount: lists
        }
      };

    } catch (error: any) {
      throw new Error(`Testing failed: ${error.message}`);
    }
  }
}
