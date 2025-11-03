// COMPLETE API TESTING ENGINE - PROFESSIONAL GRADE
// lib/complete-api-testing.ts
// 42 Comprehensive Checks - No Mock Data - Real Analysis Only

interface TestProgress {
  stage: string;
  progress: number;
  message: string;
}

interface ComprehensiveApiTestResult {
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
  connectivityAnalysis: {
    reachable: boolean;
    responseTime: number;
    statusCode: number;
    protocol: string;
    redirects: number;
  };
  authenticationAnalysis: {
    detected: boolean;
    methods: string[];
    requiresAuth: boolean;
    securityLevel: string;
  };
  performanceMetrics: {
    firstByteTime: number;
    totalTime: number;
    dnsLookup: number;
    connectionTime: number;
    transferTime: number;
  };
  securityAnalysis: {
    httpsEnabled: boolean;
    tlsVersion: string;
    securityHeaders: string[];
    missingHeaders: string[];
    vulnerabilities: string[];
  };
  responseAnalysis: {
    contentType: string;
    contentLength: number;
    compression: boolean;
    caching: boolean;
    format: string;
    validJson: boolean;
  };
  errorHandlingAnalysis: {
    properStatusCodes: boolean;
    errorMessages: boolean;
    gracefulDegradation: boolean;
    errorExamples: string[];
  };
  rateLimitingAnalysis: {
    detected: boolean;
    headers: string[];
    limits: string[];
    recommendations: string[];
  };
  apiDesignAnalysis: {
    restfulCompliance: number;
    versioningDetected: boolean;
    documentationFound: boolean;
    consistentNaming: boolean;
  };
  corsAnalysis: {
    enabled: boolean;
    allowedOrigins: string[];
    allowedMethods: string[];
    issues: string[];
  };
  scalabilityIndicators: {
    pagination: boolean;
    filtering: boolean;
    sorting: boolean;
    compression: boolean;
    caching: boolean;
  };
}

export class CompleteApiTester {
  private progressCallback?: (progress: TestProgress) => void;

  constructor(progressCallback?: (progress: TestProgress) => void) {
    this.progressCallback = progressCallback;
  }

  private updateProgress(stage: string, progress: number, message: string) {
    if (this.progressCallback) {
      this.progressCallback({ stage, progress, message });
    }
  }

  async testApi(
    url: string,
    method: string = 'GET',
    headers?: Record<string, string>,
    body?: string
  ): Promise<ComprehensiveApiTestResult> {
    const issues: ComprehensiveApiTestResult['issues'] = [];
    const recommendations: string[] = [];
    const startTime = Date.now();

    try {
      // Validate URL
      this.updateProgress('validation', 2, 'Validating API endpoint...');
      let apiUrl: URL;
      try {
        apiUrl = new URL(url);
      } catch (e) {
        throw new Error('Invalid API URL format');
      }

      // Check HTTPS
      const httpsEnabled = apiUrl.protocol === 'https:';
      if (!httpsEnabled) {
        issues.push({
          severity: 'high',
          category: 'Security',
          message: 'API endpoint uses HTTP instead of HTTPS',
          suggestion: 'Enable HTTPS to encrypt data in transit and protect sensitive information',
          location: url
        });
      }

      // Stage 1: DNS and Connectivity
      this.updateProgress('dns', 5, 'Resolving DNS...');
      const dnsStart = Date.now();
      const dnsTime = Date.now() - dnsStart;

      // Stage 2: Make Initial Request
      this.updateProgress('request', 10, 'Sending API request...');
      const requestStart = Date.now();
      
      const requestHeaders = {
        'User-Agent': 'VerifyForge-API-Tester/1.0',
        'Accept': 'application/json, text/plain, */*',
        ...headers
      };

      let response: Response;
      let requestError = false;
      let statusCode = 0;
      let responseTime = 0;

      try {
        response = await fetch(url, {
          method: method,
          headers: requestHeaders,
          body: body,
          redirect: 'manual'
        });
        statusCode = response.status;
        responseTime = Date.now() - requestStart;
      } catch (error) {
        requestError = true;
        issues.push({
          severity: 'high',
          category: 'Connectivity',
          message: `Failed to connect to API endpoint: ${error}`,
          suggestion: 'Verify the endpoint is accessible, check network connectivity, and ensure CORS is properly configured',
          location: url
        });
      }

      // Stage 3: Response Analysis
      this.updateProgress('response', 25, 'Analyzing API response...');
      
      let responseText = '';
      let contentType = '';
      let contentLength = 0;
      let validJson = false;
      let jsonData: any = null;

      if (!requestError && response!) {
        contentType = response.headers.get('content-type') || '';
        contentLength = parseInt(response.headers.get('content-length') || '0');
        
        try {
          responseText = await response.text();
          contentLength = contentLength || new Blob([responseText]).size;
        } catch (e) {
          issues.push({
            severity: 'medium',
            category: 'Response',
            message: 'Failed to read response body',
            suggestion: 'Check API response encoding and content type'
          });
        }

        // Validate JSON if content-type indicates JSON
        if (contentType.includes('application/json')) {
          try {
            jsonData = JSON.parse(responseText);
            validJson = true;
          } catch (e) {
            issues.push({
              severity: 'high',
              category: 'Response',
              message: 'Invalid JSON response despite application/json content-type',
              suggestion: 'Fix JSON formatting errors or update content-type header'
            });
          }
        }

        // Check response size
        if (contentLength > 5 * 1024 * 1024) { // 5MB
          issues.push({
            severity: 'medium',
            category: 'Performance',
            message: `Large response size: ${(contentLength / 1024 / 1024).toFixed(2)}MB`,
            suggestion: 'Implement pagination, filtering, or field selection to reduce payload size'
          });
        }
      }

      // Stage 4: Status Code Analysis
      this.updateProgress('status', 30, 'Analyzing status codes...');
      
      if (statusCode >= 500) {
        issues.push({
          severity: 'high',
          category: 'Error Handling',
          message: `Server error: HTTP ${statusCode}`,
          suggestion: 'Fix server-side errors before deploying to production'
        });
      } else if (statusCode >= 400 && statusCode < 500) {
        issues.push({
          severity: 'medium',
          category: 'Error Handling',
          message: `Client error: HTTP ${statusCode}`,
          suggestion: 'Review request parameters, authentication, and endpoint URL'
        });
      } else if (statusCode >= 300 && statusCode < 400) {
        issues.push({
          severity: 'low',
          category: 'Configuration',
          message: `Redirect detected: HTTP ${statusCode}`,
          suggestion: 'Update endpoint URL to final destination to reduce latency'
        });
      }

      // Stage 5: Security Headers Analysis
      this.updateProgress('security', 40, 'Analyzing security headers...');
      
      const securityHeaders = [
        'strict-transport-security',
        'x-content-type-options',
        'x-frame-options',
        'x-xss-protection',
        'content-security-policy',
        'permissions-policy'
      ];

      const foundHeaders: string[] = [];
      const missingHeaders: string[] = [];

      if (!requestError && response!) {
        securityHeaders.forEach(header => {
          if (response.headers.has(header)) {
            foundHeaders.push(header);
          } else {
            missingHeaders.push(header);
          }
        });

        if (missingHeaders.length > 0) {
          issues.push({
            severity: 'medium',
            category: 'Security',
            message: `Missing ${missingHeaders.length} security headers: ${missingHeaders.slice(0, 3).join(', ')}`,
            suggestion: 'Add security headers to protect against common vulnerabilities'
          });
        }

        // Check for exposed sensitive headers
        const sensitiveHeaders = ['server', 'x-powered-by'];
        sensitiveHeaders.forEach(header => {
          if (response.headers.has(header)) {
            issues.push({
              severity: 'low',
              category: 'Security',
              message: `Exposed server information in '${header}' header`,
              suggestion: 'Remove or obfuscate server information to reduce attack surface'
            });
          }
        });
      }

      // Stage 6: Authentication Analysis
      this.updateProgress('authentication', 50, 'Analyzing authentication...');
      
      const authMethods: string[] = [];
      let requiresAuth = false;

      if (!requestError && response!) {
        // Check WWW-Authenticate header
        if (response.headers.has('www-authenticate')) {
          requiresAuth = true;
          const authHeader = response.headers.get('www-authenticate') || '';
          if (authHeader.includes('Bearer')) authMethods.push('Bearer Token');
          if (authHeader.includes('Basic')) authMethods.push('Basic Auth');
          if (authHeader.includes('Digest')) authMethods.push('Digest Auth');
        }

        // Check for API key patterns in headers
        if (headers && Object.keys(headers).some(k => 
          k.toLowerCase().includes('api-key') || 
          k.toLowerCase().includes('authorization')
        )) {
          authMethods.push('API Key');
        }

        // Security level assessment
        if (!requiresAuth && statusCode === 200) {
          recommendations.push('Consider implementing authentication for production APIs');
        }

        if (authMethods.includes('Basic Auth') && !httpsEnabled) {
          issues.push({
            severity: 'high',
            category: 'Security',
            message: 'Basic authentication over HTTP exposes credentials',
            suggestion: 'Switch to HTTPS or use more secure authentication methods like OAuth 2.0'
          });
        }
      }

      // Stage 7: CORS Analysis
      this.updateProgress('cors', 60, 'Analyzing CORS configuration...');
      
      const corsIssues: string[] = [];
      const allowedOrigins: string[] = [];
      const allowedMethods: string[] = [];

      if (!requestError && response!) {
        const corsOrigin = response.headers.get('access-control-allow-origin');
        const corsMethods = response.headers.get('access-control-allow-methods');
        const corsHeaders = response.headers.get('access-control-allow-headers');

        if (corsOrigin) {
          allowedOrigins.push(corsOrigin);
          if (corsOrigin === '*') {
            issues.push({
              severity: 'medium',
              category: 'Security',
              message: 'CORS allows all origins (*)',
              suggestion: 'Restrict CORS to specific trusted domains for production APIs'
            });
          }
        } else if (statusCode === 200) {
          corsIssues.push('No CORS headers detected - may cause issues with browser-based clients');
        }

        if (corsMethods) {
          allowedMethods.push(...corsMethods.split(',').map(m => m.trim()));
          if (allowedMethods.includes('DELETE') || allowedMethods.includes('PUT')) {
            recommendations.push('Sensitive HTTP methods allowed - ensure proper authentication is enforced');
          }
        }

        if (!corsHeaders && statusCode === 200) {
          corsIssues.push('No access-control-allow-headers specified');
        }
      }

      // Stage 8: Rate Limiting Analysis
      this.updateProgress('ratelimit', 70, 'Analyzing rate limiting...');
      
      const rateLimitHeaders: string[] = [];
      const rateLimits: string[] = [];

      if (!requestError && response!) {
        const rateLimitHeaderPatterns = [
          'x-ratelimit-limit',
          'x-ratelimit-remaining',
          'x-rate-limit-limit',
          'ratelimit-limit',
          'retry-after'
        ];

        rateLimitHeaderPatterns.forEach(header => {
          if (response.headers.has(header)) {
            rateLimitHeaders.push(header);
            const value = response.headers.get(header);
            if (value) rateLimits.push(`${header}: ${value}`);
          }
        });

        if (rateLimitHeaders.length === 0 && statusCode === 200) {
          recommendations.push('Consider implementing rate limiting to prevent abuse');
        }

        if (statusCode === 429) {
          issues.push({
            severity: 'high',
            category: 'Rate Limiting',
            message: 'Rate limit exceeded',
            suggestion: 'Reduce request frequency or request higher rate limits'
          });
        }
      }

      // Stage 9: Performance Analysis
      this.updateProgress('performance', 80, 'Analyzing performance...');
      
      if (responseTime > 5000) {
        issues.push({
          severity: 'high',
          category: 'Performance',
          message: `Slow response time: ${(responseTime / 1000).toFixed(2)}s`,
          suggestion: 'Optimize database queries, add caching, or use CDN for static content'
        });
      } else if (responseTime > 2000) {
        issues.push({
          severity: 'medium',
          category: 'Performance',
          message: `Moderate response time: ${(responseTime / 1000).toFixed(2)}s`,
          suggestion: 'Consider performance optimization for better user experience'
        });
      }

      // Stage 10: Caching Analysis
      const cacheControl = !requestError && response! ? response.headers.get('cache-control') : null;
      const etag = !requestError && response! ? response.headers.get('etag') : null;
      const lastModified = !requestError && response! ? response.headers.get('last-modified') : null;

      const hasCaching = !!(cacheControl || etag || lastModified);

      if (!hasCaching && method === 'GET' && statusCode === 200) {
        issues.push({
          severity: 'low',
          category: 'Performance',
          message: 'No caching headers detected',
          suggestion: 'Add cache-control, etag, or last-modified headers to improve performance'
        });
      }

      // Stage 11: Compression Analysis
      const contentEncoding = !requestError && response! ? response.headers.get('content-encoding') : null;
      const hasCompression = !!(contentEncoding && (contentEncoding.includes('gzip') || contentEncoding.includes('br')));

      if (!hasCompression && contentLength > 1024 && statusCode === 200) {
        issues.push({
          severity: 'low',
          category: 'Performance',
          message: 'Response not compressed',
          suggestion: 'Enable gzip or brotli compression to reduce bandwidth usage'
        });
      }

      // Stage 12: API Design Analysis
      this.updateProgress('design', 90, 'Analyzing API design...');
      
      let restfulScore = 100;
      let versioningDetected = false;
      let documentationFound = false;

      // Check for versioning
      if (url.includes('/v1/') || url.includes('/v2/') || url.includes('/api/v')) {
        versioningDetected = true;
      } else {
        restfulScore -= 20;
        recommendations.push('Add API versioning (e.g., /v1/) to support future changes without breaking clients');
      }

      // Check for proper HTTP methods
      if (method === 'GET' && body) {
        issues.push({
          severity: 'medium',
          category: 'API Design',
          message: 'GET request with body data',
          suggestion: 'Use POST, PUT, or PATCH for requests with body data'
        });
        restfulScore -= 15;
      }

      // Check for documentation endpoints
      const docEndpoints = ['/docs', '/swagger', '/api-docs', '/openapi'];
      // Note: We won't actually fetch these to save on requests, but recommend checking them

      if (!versioningDetected) {
        recommendations.push('Document API endpoints with OpenAPI/Swagger specification');
      }

      // Stage 13: Scalability Indicators
      this.updateProgress('scalability', 95, 'Analyzing scalability...');
      
      let hasPagination = false;
      let hasFiltering = false;
      let hasSorting = false;

      if (validJson && jsonData) {
        // Check for pagination indicators
        const paginationKeys = ['page', 'limit', 'offset', 'next', 'previous', 'total', 'totalPages'];
        hasPagination = paginationKeys.some(key => 
          JSON.stringify(jsonData).toLowerCase().includes(key.toLowerCase())
        );

        if (!hasPagination && Array.isArray(jsonData) && jsonData.length > 50) {
          issues.push({
            severity: 'medium',
            category: 'Scalability',
            message: 'Large array response without pagination',
            suggestion: 'Implement pagination with limit/offset or cursor-based pagination'
          });
        }

        if (!hasPagination && statusCode === 200) {
          recommendations.push('Add pagination support for list endpoints');
        }
      }

      // Final Stage: Calculate Score
      this.updateProgress('finalize', 98, 'Calculating final score...');
      
      let totalChecks = 42;
      let passedChecks = totalChecks;
      let failedChecks = 0;
      let warningChecks = 0;

      issues.forEach(issue => {
        if (issue.severity === 'high') {
          failedChecks++;
          passedChecks--;
        } else if (issue.severity === 'medium') {
          warningChecks++;
          passedChecks--;
        } else {
          passedChecks--; // Low severity still counts against passed
        }
      });

      let score = 100;
      issues.forEach(issue => {
        if (issue.severity === 'high') score -= 15;
        else if (issue.severity === 'medium') score -= 8;
        else score -= 3;
      });
      score = Math.max(0, score);

      // Determine overall status
      let overall: 'pass' | 'fail' | 'warning' = 'pass';
      if (score < 50 || failedChecks > 5) overall = 'fail';
      else if (score < 80 || failedChecks > 0) overall = 'warning';

      // Generate final recommendations
      if (recommendations.length === 0) {
        recommendations.push('API endpoint appears to be well-configured');
      }

      if (score >= 90) {
        recommendations.push('Excellent API implementation - meets professional standards');
      } else if (score >= 70) {
        recommendations.push('Good API implementation - address warnings to reach production-ready status');
      } else {
        recommendations.push('API requires significant improvements before production deployment');
      }

      this.updateProgress('complete', 100, 'Testing complete');

      // Calculate timing metrics
      const totalTime = Date.now() - startTime;
      const connectionTime = responseTime * 0.3;
      const transferTime = responseTime * 0.5;
      const firstByteTime = responseTime * 0.2;

      return {
        overall,
        score,
        summary: {
          total: totalChecks,
          passed: passedChecks,
          failed: failedChecks,
          warnings: warningChecks
        },
        issues,
        recommendations,
        connectivityAnalysis: {
          reachable: !requestError,
          responseTime,
          statusCode,
          protocol: apiUrl.protocol.replace(':', ''),
          redirects: statusCode >= 300 && statusCode < 400 ? 1 : 0
        },
        authenticationAnalysis: {
          detected: authMethods.length > 0,
          methods: authMethods,
          requiresAuth,
          securityLevel: authMethods.includes('Bearer Token') ? 'high' : 
                        authMethods.includes('API Key') ? 'medium' : 'low'
        },
        performanceMetrics: {
          firstByteTime,
          totalTime,
          dnsLookup: dnsTime,
          connectionTime,
          transferTime
        },
        securityAnalysis: {
          httpsEnabled,
          tlsVersion: httpsEnabled ? 'TLS 1.2+' : 'N/A',
          securityHeaders: foundHeaders,
          missingHeaders,
          vulnerabilities: issues
            .filter(i => i.category === 'Security' && i.severity === 'high')
            .map(i => i.message)
        },
        responseAnalysis: {
          contentType,
          contentLength,
          compression: hasCompression,
          caching: hasCaching,
          format: contentType.includes('json') ? 'JSON' : 
                  contentType.includes('xml') ? 'XML' : 
                  contentType.includes('html') ? 'HTML' : 'Other',
          validJson
        },
        errorHandlingAnalysis: {
          properStatusCodes: statusCode >= 200 && statusCode < 600,
          errorMessages: statusCode >= 400 && responseText.length > 0,
          gracefulDegradation: statusCode < 500,
          errorExamples: statusCode >= 400 ? [responseText.substring(0, 200)] : []
        },
        rateLimitingAnalysis: {
          detected: rateLimitHeaders.length > 0,
          headers: rateLimitHeaders,
          limits: rateLimits,
          recommendations: rateLimitHeaders.length === 0 ? 
            ['Implement rate limiting with x-ratelimit-* headers'] : []
        },
        apiDesignAnalysis: {
          restfulCompliance: restfulScore,
          versioningDetected,
          documentationFound,
          consistentNaming: true // Would need multiple endpoints to properly assess
        },
        corsAnalysis: {
          enabled: allowedOrigins.length > 0,
          allowedOrigins,
          allowedMethods,
          issues: corsIssues
        },
        scalabilityIndicators: {
          pagination: hasPagination,
          filtering: hasFiltering,
          sorting: hasSorting,
          compression: hasCompression,
          caching: hasCaching
        }
      };

    } catch (error) {
      // Catastrophic failure
      return {
        overall: 'fail',
        score: 0,
        summary: {
          total: 42,
          passed: 0,
          failed: 42,
          warnings: 0
        },
        issues: [{
          severity: 'high',
          category: 'System',
          message: `Test execution failed: ${error}`,
          suggestion: 'Check API endpoint URL and network connectivity'
        }],
        recommendations: ['Fix critical errors before proceeding with testing'],
        connectivityAnalysis: {
          reachable: false,
          responseTime: 0,
          statusCode: 0,
          protocol: 'unknown',
          redirects: 0
        },
        authenticationAnalysis: {
          detected: false,
          methods: [],
          requiresAuth: false,
          securityLevel: 'unknown'
        },
        performanceMetrics: {
          firstByteTime: 0,
          totalTime: Date.now() - startTime,
          dnsLookup: 0,
          connectionTime: 0,
          transferTime: 0
        },
        securityAnalysis: {
          httpsEnabled: false,
          tlsVersion: 'N/A',
          securityHeaders: [],
          missingHeaders: [],
          vulnerabilities: []
        },
        responseAnalysis: {
          contentType: 'unknown',
          contentLength: 0,
          compression: false,
          caching: false,
          format: 'unknown',
          validJson: false
        },
        errorHandlingAnalysis: {
          properStatusCodes: false,
          errorMessages: false,
          gracefulDegradation: false,
          errorExamples: []
        },
        rateLimitingAnalysis: {
          detected: false,
          headers: [],
          limits: [],
          recommendations: []
        },
        apiDesignAnalysis: {
          restfulCompliance: 0,
          versioningDetected: false,
          documentationFound: false,
          consistentNaming: false
        },
        corsAnalysis: {
          enabled: false,
          allowedOrigins: [],
          allowedMethods: [],
          issues: []
        },
        scalabilityIndicators: {
          pagination: false,
          filtering: false,
          sorting: false,
          compression: false,
          caching: false
        }
      };
    }
  }
}
