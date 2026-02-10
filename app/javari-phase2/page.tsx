'use client';

import { useState } from 'react';

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
            Javari AI - Phase 2 Testing
          </h1>
          <p className="text-xl text-gray-300">
            Automated infrastructure and functionality verification
          </p>
        </div>

        <div className="bg-slate-800 rounded-lg p-6 mb-6 border border-purple-500/30">
          <h2 className="text-2xl font-bold mb-4">Test Suite Controls</h2>
          <button 
            onClick={runTests} 
            disabled={testing}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-lg text-lg transition-all"
          >
            {testing ? '🔄 Running Tests...' : '▶️ Run All Tests'}
          </button>
        </div>

        {summary && (
          <div className="bg-slate-800 rounded-lg p-6 mb-6 border border-purple-500/30">
            <h2 className="text-2xl font-bold mb-4">Test Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-green-900/30 border border-green-500 rounded p-4 text-center">
                <div className="text-4xl font-bold text-green-400">{summary.passed}</div>
                <div className="text-sm text-gray-400">Passed</div>
              </div>
              <div className="bg-red-900/30 border border-red-500 rounded p-4 text-center">
                <div className="text-4xl font-bold text-red-400">{summary.failed}</div>
                <div className="text-sm text-gray-400">Failed</div>
              </div>
              <div className="bg-yellow-900/30 border border-yellow-500 rounded p-4 text-center">
                <div className="text-4xl font-bold text-yellow-400">{summary.warnings}</div>
                <div className="text-sm text-gray-400">Warnings</div>
              </div>
              <div className="bg-blue-900/30 border border-blue-500 rounded p-4 text-center">
                <div className="text-4xl font-bold text-blue-400">{summary.total}</div>
                <div className="text-sm text-gray-400">Total</div>
              </div>
            </div>
            <div className="text-center">
              <span className={`inline-block px-6 py-2 rounded-full text-lg font-bold ${
                summary.status === '✅ PHASE 2 COMPLETE' ? 'bg-green-600' : 'bg-yellow-600'
              }`}>
                {summary.status}
              </span>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {results.map((result, index) => (
            <div key={index} className="bg-slate-800 rounded-lg p-6 border border-purple-500/30">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xl font-bold">{result.test}</h3>
                <span className={`px-4 py-1 rounded-full font-bold ${
                  result.status === 'PASSED' ? 'bg-green-600' :
                  result.status === 'FAILED' ? 'bg-red-600' :
                  result.status === 'WARNING' ? 'bg-yellow-600' :
                  'bg-blue-600 animate-pulse'
                }`}>
                  {result.status}
                </span>
              </div>
              {result.duration_ms && (
                <p className="text-sm text-gray-400 mb-2">
                  Duration: {result.duration_ms}ms
                </p>
              )}
              {result.details && (
                <pre className="text-xs bg-slate-900 p-4 rounded overflow-x-auto border border-slate-700">
                  {JSON.stringify(result.details, null, 2)}
                </pre>
              )}
              {result.error && (
                <p className="text-sm text-red-400 mt-2">
                  Error: {result.error}
                </p>
              )}
            </div>
          ))}
        </div>

        {results.length === 0 && !testing && (
          <div className="bg-slate-800 rounded-lg p-12 text-center text-gray-400 border border-purple-500/30">
            Click "Run All Tests" to begin Phase 2 verification
          </div>
        )}
      </div>
    </div>
  );
}
