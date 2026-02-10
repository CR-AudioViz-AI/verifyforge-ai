'use client';
import { useState } from 'react';

export default function JavariPhase2() {
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<any>(null);

  const runTests = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/javari-phase2', { method: 'POST' });
      setResults(await res.json());
    } catch (e) {
      setResults({ error: String(e) });
    }
    setTesting(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
          Javari AI Phase 2 Testing
        </h1>
        <p className="text-xl text-gray-300 mb-8">Infrastructure Verification</p>
        
        <button 
          onClick={runTests} 
          disabled={testing}
          className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 text-white font-bold py-4 px-8 rounded-lg text-lg mb-8"
        >
          {testing ? '🔄 Running...' : '▶️ Run All Tests'}
        </button>

        {results && (
          <div className="space-y-4">
            <div className="bg-slate-800 border border-purple-500/30 rounded-lg p-6">
              <h2 className="text-2xl font-bold mb-4">Summary</h2>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-4 bg-green-900/30 border border-green-500 rounded">
                  <div className="text-3xl font-bold text-green-400">{results.passed || 0}</div>
                  <div className="text-sm text-gray-400">Passed</div>
                </div>
                <div className="text-center p-4 bg-red-900/30 border border-red-500 rounded">
                  <div className="text-3xl font-bold text-red-400">{results.failed || 0}</div>
                  <div className="text-sm text-gray-400">Failed</div>
                </div>
                <div className="text-center p-4 bg-yellow-900/30 border border-yellow-500 rounded">
                  <div className="text-3xl font-bold text-yellow-400">{results.warnings || 0}</div>
                  <div className="text-sm text-gray-400">Warnings</div>
                </div>
                <div className="text-center p-4 bg-blue-900/30 border border-blue-500 rounded">
                  <div className="text-3xl font-bold text-blue-400">{results.total_tests || 0}</div>
                  <div className="text-sm text-gray-400">Total</div>
                </div>
              </div>
              <div className="mt-4 text-center">
                <span className={`px-6 py-2 rounded-full font-bold ${results.overall_status?.includes('COMPLETE') ? 'bg-green-600' : 'bg-yellow-600'}`}>
                  {results.overall_status || 'N/A'}
                </span>
              </div>
            </div>

            {results.results?.map((r: any, i: number) => (
              <div key={i} className="bg-slate-800 border border-purple-500/30 rounded-lg p-6">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-xl font-bold text-white">{r.test}</h3>
                  <span className={`px-4 py-1 rounded-full font-bold ${
                    r.status === 'PASSED' ? 'bg-green-600' :
                    r.status === 'FAILED' ? 'bg-red-600' :
                    'bg-yellow-600'
                  }`}>{r.status}</span>
                </div>
                {r.duration_ms && <p className="text-sm text-gray-400">Duration: {r.duration_ms}ms</p>}
                {r.details && <pre className="text-xs bg-slate-900 p-3 rounded mt-2 overflow-x-auto">{JSON.stringify(r.details, null, 2)}</pre>}
                {r.error && <p className="text-red-400 mt-2">Error: {r.error}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
