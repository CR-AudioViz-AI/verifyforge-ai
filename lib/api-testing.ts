// REAL API TESTING ENGINE - NO MOCK DATA
// lib/api-testing.ts
// Tests actual REST and GraphQL APIs

interface APITestResult {
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
  endpointAnalysis: {
    url: string;
    method: string;
    statusCode: number;
    responseTime: number;
    responseSize: number;
    isReachable: boolean;
    hasSSL: boolean;
    apiType: 'REST' | 'GraphQL' | 'SOAP' | 'Unknown';
  };
  securityAnalysis: {
    requiresAuth: boolean;
    hasRateLimiting: boolean;
    hasCORS: boolean;
    vulnerabilities: string[];
  };
  performanceMetrics: {
    averageResponseTime: number;
    throughput: number;
    errorRate: number;
  };
}

interface TestProgress {
  stage: string;
  progress: number;
  message: string;
}

export class APITester {
  private progressCallback?: (progress: TestProgress) => void;

  constructor(progressCallback?: (progress: TestProgress) => void) {
    this.progressCallback = progressCallback;
  }

  private updateProgress(stage: string, progress: number, message: string) {
    if (this.progressCallback) {
      this.progressCallback({ stage, progress, message });
    }
  }

  async testAPI(url: string, method: string = 'GET'): Promise<APITestResult> {
    const issues: APITestResult['issues'] = [];
    const recommendations: string[] = [];
    const vulnerabilities: string[] = [];

    try {
      this.updateProgress('initialize', 10, 'Initializing API test...');

      // Validate URL
      let testUrl: URL;
      try {
        testUrl = new URL(url);
      } catch (e) {
        throw new Error('Invalid URL format');
      }

      this.updateProgress('connect', 20, 'Connecting to API endpoint...');

      // Test endpoint reachability
      const startTime = Date.now();
      const response = await fetch(url, {
        method: method.toUpperCase(),
        headers: {
          'User-Agent': 'VerifyForge-API-Tester/1.0'
        }
      });
      const responseTime = Date.now() - startTime;

      this.updateProgress('analyze', 40, 'Analyzing API response...');

      const responseText = await response.text();
      const responseSize = new Blob([responseText]).size;

      // Detect API type
      let apiType: 'REST' | 'GraphQL' | 'SOAP' | 'Unknown' = 'Unknown';
      if (responseText.includes('"data"') && responseText.includes('"errors"')) {
        apiType = 'GraphQL';
      } else if (responseText.includes('<soap:') || responseText.includes('<SOAP:')) {
        apiType = 'SOAP';
      } else if (response.headers.get('content-type')?.includes('json')) {
        apiType = 'REST';
      }

      this.updateProgress('security', 60, 'Checking security headers...');

      // Security analysis
      const hasSSL = testUrl.protocol === 'https:';
      if (!hasSSL) {
        issues.push({
          severity: 'high',
          category: 'Security',
          message: 'API endpoint does not use HTTPS',
          suggestion: 'Implement SSL/TLS encryption to secure data transmission'
        });
        vulnerabilities.push('No HTTPS - data transmitted in plaintext');
      }

      // Check for CORS headers
      const hasCORS = response.headers.has('access-control-allow-origin');
      
      // Check rate limiting
      const hasRateLimiting = 
        response.headers.has('x-ratelimit-limit') ||
        response.headers.has('ratelimit-limit') ||
        response.headers.has('x-rate-limit-limit');

      if (!hasRateLimiting) {
        issues.push({
          severity: 'medium',
          category: 'Security',
          message: 'No rate limiting headers detected',
          suggestion: 'Implement rate limiting to prevent abuse and DDoS attacks'
        });
      }

      // Check authentication requirements
      const requiresAuth = response.status === 401 || response.status === 403;

      this.updateProgress('performance', 75, 'Testing API performance...');

      // Performance checks
      if (responseTime > 2000) {
        issues.push({
          severity: 'high',
          category: 'Performance',
          message: `Slow response time: ${responseTime}ms`,
          suggestion: 'Optimize database queries, add caching, or use a CDN'
        });
      } else if (responseTime > 1000) {
        issues.push({
          severity: 'medium',
          category: 'Performance',
          message: `Moderate response time: ${responseTime}ms`,
          suggestion: 'Consider performance optimization for better user experience'
        });
      }

      if (responseSize > 1024 * 1024) { // 1MB
        issues.push({
          severity: 'medium',
          category: 'Performance',
          message: `Large response size: ${(responseSize / 1024).toFixed(0)}KB`,
          suggestion: 'Implement pagination, compression, or reduce payload size'
        });
      }

      // Check for common security headers
      const securityHeaders = [
        'strict-transport-security',
        'x-content-type-options',
        'x-frame-options',
        'x-xss-protection'
      ];

      const missingHeaders = securityHeaders.filter(h => !response.headers.has(h));
      if (missingHeaders.length > 0) {
        issues.push({
          severity: 'low',
          category: 'Security',
          message: `Missing security headers: ${missingHeaders.join(', ')}`,
          suggestion: 'Add security headers to protect against common attacks'
        });
      }

      this.updateProgress('validate', 85, 'Validating API response...');

      // Status code analysis
      if (response.status >= 500) {
        issues.push({
          severity: 'high',
          category: 'Availability',
          message: `Server error: ${response.status}`,
          suggestion: 'Check server logs and fix internal errors'
        });
      } else if (response.status >= 400) {
        issues.push({
          severity: 'medium',
          category: 'Availability',
          message: `Client error: ${response.status}`,
          suggestion: 'Verify request parameters and authentication'
        });
      }

      this.updateProgress('finalize', 95, 'Generating recommendations...');

      // Generate recommendations
      if (hasSSL && hasRateLimiting && responseTime < 1000) {
        recommendations.push('API follows security and performance best practices');
      }

      if (apiType === 'REST') {
        recommendations.push('Consider implementing API versioning for backward compatibility');
      }

      if (hasCORS) {
        recommendations.push('CORS is configured - ensure it\'s not too permissive');
      }

      // Calculate score
      let score = 100;
      issues.forEach(issue => {
        if (issue.severity === 'high') score -= 20;
        else if (issue.severity === 'medium') score -= 10;
        else score -= 5;
      });
      score = Math.max(0, Math.min(100, score));

      const totalTests = 12;
      const failed = issues.filter(i => i.severity === 'high').length;
      const warnings = issues.filter(i => i.severity === 'medium' || i.severity === 'low').length;
      const passed = totalTests - failed - warnings;

      this.updateProgress('complete', 100, 'API testing complete!');

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
        endpointAnalysis: {
          url,
          method: method.toUpperCase(),
          statusCode: response.status,
          responseTime,
          responseSize,
          isReachable: response.ok,
          hasSSL,
          apiType
        },
        securityAnalysis: {
          requiresAuth,
          hasRateLimiting,
          hasCORS,
          vulnerabilities
        },
        performanceMetrics: {
          averageResponseTime: responseTime,
          throughput: responseSize / (responseTime / 1000),
          errorRate: response.ok ? 0 : 100
        }
      };

    } catch (error: any) {
      throw new Error(`API testing failed: ${error.message}`);
    }
  }
}

export default APITester;
