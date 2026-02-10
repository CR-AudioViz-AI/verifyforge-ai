'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface TestResult {
  test: string;
  status: 'PASSED' | 'FAILED' | 'WARNING' | 'RUNNING';
  duration_ms?: number;
  details?: any;
  error?: string;
}

export default function JavariPhase2TestPage() {
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [summary, setSummary] = useState<any>(null);

  const runTests = async () => {
    setTesting(true);
    setResults([]);
    setSummary(null);

    try {
      const response = await fetch('/api/test/javari-phase2', {
        method: 'POST'
      });

      const data = await response.json();
      
      setResults(data.results || []);
      setSummary({
        passed: data.passed,
        failed: data.failed,
        warnings: data.warnings,
        total: data.total_tests,
        status: data.overall_status
      });
    } catch (error) {
      setResults([{
        test: 'System Error',
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error'
      }]);
    } finally {
      setTesting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PASSED': return 'bg-green-500';
      case 'FAILED': return 'bg-red-500';
      case 'WARNING': return 'bg-yellow-500';
      case 'RUNNING': return 'bg-blue-500 animate-pulse';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Javari AI - Phase 2 Testing</h1>
          <p className="text-gray-600">
            Automated infrastructure and functionality verification
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Test Suite Controls</CardTitle>
            <CardDescription>
              Run comprehensive tests on Javari AI Phase 2 infrastructure
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={runTests} 
              disabled={testing}
              size="lg"
              className="w-full"
            >
              {testing ? '🔄 Running Tests...' : '▶️ Run All Tests'}
            </Button>
          </CardContent>
        </Card>

        {summary && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Test Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">{summary.passed}</div>
                  <div className="text-sm text-gray-600">Passed</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-600">{summary.failed}</div>
                  <div className="text-sm text-gray-600">Failed</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-yellow-600">{summary.warnings}</div>
                  <div className="text-sm text-gray-600">Warnings</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold">{summary.total}</div>
                  <div className="text-sm text-gray-600">Total</div>
                </div>
              </div>
              <div className="mt-4 text-center">
                <Badge 
                  className={summary.status === '✅ PHASE 2 COMPLETE' ? 'bg-green-600' : 'bg-yellow-600'}
                >
                  {summary.status}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {results.map((result, index) => (
            <Card key={index}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{result.test}</CardTitle>
                  <Badge className={getStatusColor(result.status)}>
                    {result.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {result.duration_ms && (
                  <p className="text-sm text-gray-600 mb-2">
                    Duration: {result.duration_ms}ms
                  </p>
                )}
                {result.details && (
                  <pre className="text-xs bg-gray-100 p-3 rounded overflow-x-auto">
                    {JSON.stringify(result.details, null, 2)}
                  </pre>
                )}
                {result.error && (
                  <p className="text-sm text-red-600 mt-2">
                    Error: {result.error}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {results.length === 0 && !testing && (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              Click "Run All Tests" to begin Phase 2 verification
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
