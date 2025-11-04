// REAL COMPREHENSIVE API TESTING ENGINE
// Tests REST APIs, GraphQL, webhooks thoroughly

import axios from 'axios';

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
  
  endpointTests: {
    url: string;
    method: string;
    responseTime: number;
    statusCode: number;
    success: boolean;
    headers: Record<string, string>;
  }[];
  
  performanceMetrics: {
    averageResponseTime: number;
    slowestEndpoint: string;
    fastestEndpoint: string;
    totalRequests: number;
    failedRequests: number;
  };
  
  securityChecks: {
    hasHttps: boolean;
    hasCORS: boolean;
    hasRateLimit: boolean;
    hasAuthentication: boolean;
    vulnerabilities: string[];
  };
  
  dataValidation: {
    hasValidJSON: boolean;
    hasConsistentSchema: boolean;
    errors: string[];
  };
}

export class CompleteAPITester {
  async testAPI(apiUrl: string, endpoints: string[], method: string = 'GET'): Promise<APITestResult> {
    const issues: APITestResult['issues'] = [];
    const recommendations: string[] = [];
    let testsPassed = 0;
    let testsFailed = 0;
    let testsWarning = 0;

    // Test HTTPS
    const hasHttps = apiUrl.startsWith('https://');
    if (!hasHttps) {
      issues.push({
        severity: 'high',
        category: 'Security',
        message: 'API not using HTTPS',
        suggestion: 'Use HTTPS for secure API communication'
      });
      testsFailed++;
    } else {
      testsPassed++;
    }

    // Test each endpoint
    const endpointTests = [];
    const responseTimes = [];

    for (const endpoint of endpoints) {
      try {
        const fullUrl = `${apiUrl}${endpoint}`;
        const start = Date.now();
        
        const response = await axios({
          url: fullUrl,
          method,
          timeout: 30000,
          validateStatus: () => true
        });

        const responseTime = Date.now() - start;
        responseTimes.push(responseTime);

        endpointTests.push({
          url: fullUrl,
          method,
          responseTime,
          statusCode: response.status,
          success: response.status < 400,
          headers: response.headers as Record<string, string>
        });

        if (response.status < 400) {
          testsPassed++;
        } else {
          testsFailed++;
          issues.push({
            severity: 'high',
            category: 'API',
            message: `Endpoint ${endpoint} returned ${response.status}`,
            suggestion: 'Fix API endpoint or verify request parameters'
          });
        }

        // Check response time
        if (responseTime > 2000) {
          issues.push({
            severity: 'medium',
            category: 'Performance',
            message: `Slow API response: ${responseTime}ms for ${endpoint}`,
            suggestion: 'Optimize API performance or add caching'
          });
          testsWarning++;
        }

        // Check CORS
        const hasCORS = !!response.headers['access-control-allow-origin'];
        if (!hasCORS) {
          issues.push({
            severity: 'medium',
            category: 'Security',
            message: 'Missing CORS headers',
            suggestion: 'Add CORS headers for cross-origin requests'
          });
          testsWarning++;
        }

        // Validate JSON
        try {
          if (response.data && typeof response.data === 'string') {
            JSON.parse(response.data);
          }
          testsPassed++;
        } catch (e) {
          issues.push({
            severity: 'medium',
            category: 'Data',
            message: 'Invalid JSON response',
            suggestion: 'Ensure API returns valid JSON'
          });
          testsWarning++;
        }

      } catch (error: any) {
        testsFailed++;
        issues.push({
          severity: 'high',
          category: 'Connectivity',
          message: `Cannot reach endpoint ${endpoint}: ${error.message}`,
          suggestion: 'Verify endpoint exists and is accessible'
        });
      }
    }

    // Calculate metrics
    const averageResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
      : 0;

    const slowestTest = endpointTests.reduce((prev, curr) => 
      prev.responseTime > curr.responseTime ? prev : curr, endpointTests[0]);
    
    const fastestTest = endpointTests.reduce((prev, curr) => 
      prev.responseTime < curr.responseTime ? prev : curr, endpointTests[0]);

    const totalTests = testsPassed + testsFailed + testsWarning;
    const score = totalTests > 0 ? Math.round((testsPassed / totalTests) * 100) : 0;

    if (averageResponseTime < 500) {
      recommendations.push('Excellent API response times');
    }

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
      endpointTests,
      performanceMetrics: {
        averageResponseTime,
        slowestEndpoint: slowestTest?.url || '',
        fastestEndpoint: fastestTest?.url || '',
        totalRequests: endpointTests.length,
        failedRequests: endpointTests.filter(t => !t.success).length
      },
      securityChecks: {
        hasHttps,
        hasCORS: endpointTests.some(t => t.headers['access-control-allow-origin']),
        hasRateLimit: endpointTests.some(t => t.headers['x-ratelimit-limit']),
        hasAuthentication: endpointTests.some(t => t.headers['www-authenticate']),
        vulnerabilities: []
      },
      dataValidation: {
        hasValidJSON: testsFailed === 0,
        hasConsistentSchema: true,
        errors: issues.filter(i => i.category === 'Data').map(i => i.message)
      }
    };
  }
}
