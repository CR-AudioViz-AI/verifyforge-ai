// VerifyForge AI - Enhanced Dashboard with REAL Progress Tracking
// components/SimpleDashboard.tsx
// NO MOCK DATA - Shows actual test progress

'use client';

import React, { useState, useEffect } from 'react';
import { Upload, Play, FileText, CheckCircle, AlertCircle, TrendingUp, Shield, Zap, Loader2 } from 'lucide-react';

type TestType = 'web' | 'document' | 'game' | 'ai' | 'avatar' | 'tool' | 'api' | 'mobile';
type EconomyMode = 'standard' | 'economy' | 'ultra_economy';

interface TestConfig {
  testType: TestType | null;
  targetUrl: string;
  file: File | null;
  economyMode: EconomyMode;
}

interface TestProgress {
  stage: string;
  progress: number;
  message: string;
}

interface TestResult {
  id: string;
  status: string;
  duration?: string;
  creditsCharged: number;
  usedFreeTest: boolean;
  remainingFreeTests: number;
  results: {
    overall: string;
    score: number;
    summary: {
      total: number;
      passed: number;
      failed: number;
      warnings: number;
    };
    issues: Array<{
      severity: string;
      category: string;
      message: string;
      suggestion: string;
    }>;
    recommendations: string[];
    performanceMetrics?: {
      loadTime: number;
      pageSize: number;
      requestCount: number;
      responseCode: number;
    };
    seoAnalysis?: {
      title: string;
      titleLength: number;
      metaDescription: string;
      metaDescriptionLength: number;
      h1Count: number;
      imageCount: number;
      imagesWithoutAlt: number;
    };
    linksAnalysis?: {
      totalLinks: number;
      internalLinks: number;
      externalLinks: number;
      brokenLinks: string[];
    };
    javariAutoFix?: {
      available: boolean;
      confidence: number;
      message: string;
    };
  };
}

export default function SimpleDashboard() {
  const [activeTab, setActiveTab] = useState<'wizard' | 'results'>('wizard');
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState<TestConfig>({
    testType: null,
    targetUrl: '',
    file: null,
    economyMode: 'standard'
  });
  const [submitting, setSubmitting] = useState(false);
  const [testProgress, setTestProgress] = useState<TestProgress | null>(null);
  const [currentTestId, setCurrentTestId] = useState<string | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [freeTests, setFreeTests] = useState(3);

  const testTypes = [
    { type: 'web' as TestType, icon: '🌐', label: 'Website', desc: 'Test web applications', credits: 10 },
    { type: 'document' as TestType, icon: '📄', label: 'Document', desc: 'Test PDF/DOCX/XLSX', credits: 8 },
    { type: 'game' as TestType, icon: '🎮', label: 'Game', desc: 'Test FPS & graphics', credits: 15 },
    { type: 'ai' as TestType, icon: '🤖', label: 'AI/Bot', desc: 'Test chatbots', credits: 12 },
    { type: 'avatar' as TestType, icon: '👤', label: 'Avatar', desc: 'Test 3D avatars', credits: 10 },
    { type: 'tool' as TestType, icon: '🔧', label: 'Tool', desc: 'Test capabilities', credits: 8 },
    { type: 'api' as TestType, icon: '⚡', label: 'API', desc: 'Test endpoints', credits: 5 },
    { type: 'mobile' as TestType, icon: '📱', label: 'Mobile', desc: 'Test mobile apps', credits: 12 }
  ];

  const economyOptions = [
    { mode: 'standard' as EconomyMode, label: 'Standard', desc: 'Full features', discount: 0 },
    { mode: 'economy' as EconomyMode, label: 'Economy', desc: 'Essential tests', discount: 40 },
    { mode: 'ultra_economy' as EconomyMode, label: 'Ultra', desc: 'Bare minimum', discount: 60 }
  ];

  // Poll for test progress
  useEffect(() => {
    if (!currentTestId || !submitting) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/tests/submit?action=progress&id=${currentTestId}`);
        if (response.ok) {
          const progress = await response.json();
          setTestProgress(progress);
          
          if (progress.progress >= 100 || progress.stage === 'complete') {
            clearInterval(pollInterval);
          }
        }
      } catch (error) {
        console.error('Progress polling error:', error);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [currentTestId, submitting]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setTestProgress({ stage: 'initializing', progress: 0, message: 'Starting test...' });

    try {
      const formData = new FormData();
      formData.append('test_type', config.testType!);
      formData.append('economy_mode', config.economyMode);
      
      if (config.targetUrl) {
        formData.append('target_url', config.targetUrl);
      }
      
      if (config.file) {
        formData.append('file', config.file);
      }

      const response = await fetch('/api/tests/submit', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      
      if (response.ok) {
        setCurrentTestId(data.id);
        setResult(data);
        setFreeTests(data.remainingFreeTests);
        setActiveTab('results');
        setStep(1);
        setConfig({
          testType: null,
          targetUrl: '',
          file: null,
          economyMode: 'standard'
        });
        setTestProgress(null);
        setCurrentTestId(null);
      } else {
        alert(data.error || 'Failed to submit test. Please try again.');
      }

    } catch (error) {
      console.error('Submission error:', error);
      alert('Failed to submit test. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getCredits = () => {
    const testType = testTypes.find(t => t.type === config.testType);
    if (!testType) return 0;
    
    const baseCredits = testType.credits;
    const discount = economyOptions.find(e => e.mode === config.economyMode)?.discount || 0;
    
    return Math.ceil(baseCredits * (1 - discount / 100));
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex gap-4 mb-8 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('wizard')}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'wizard'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          New Test
        </button>
        <button
          onClick={() => setActiveTab('results')}
          disabled={!result}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'results'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : result
              ? 'text-gray-500 hover:text-gray-700'
              : 'text-gray-300 cursor-not-allowed'
          }`}
        >
          Results
        </button>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-gray-600">Free Tests:</span>
          <span className="font-bold text-blue-600">{freeTests}</span>
        </div>
      </div>

      {activeTab === 'wizard' && (
        <div className="space-y-8">
          <div className="flex items-center justify-center gap-4">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                  step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'
                }`}>
                  {s}
                </div>
                {s < 3 && <div className={`w-16 h-1 ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-center mb-8">Choose Test Type</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {testTypes.map(test => (
                  <button
                    key={test.type}
                    onClick={() => {
                      setConfig({ ...config, testType: test.type });
                      setStep(2);
                    }}
                    className="p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-lg transition-all text-center"
                  >
                    <div className="text-4xl mb-2">{test.icon}</div>
                    <div className="font-semibold">{test.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{test.desc}</div>
                    <div className="text-xs text-blue-600 mt-2">{test.credits} credits</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 max-w-2xl mx-auto">
              <h2 className="text-2xl font-bold text-center mb-8">
                Configure {testTypes.find(t => t.type === config.testType)?.label} Test
              </h2>
              
              {(config.testType === 'web' || config.testType === 'api') && (
                <div>
                  <label className="block text-sm font-medium mb-2">Target URL</label>
                  <input
                    type="url"
                    value={config.targetUrl}
                    onChange={e => setConfig({ ...config, targetUrl: e.target.value })}
                    placeholder="https://example.com"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              )}

              {(config.testType === 'document' || config.testType === 'game' || config.testType === 'mobile') && (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <input
                    type="file"
                    onChange={e => setConfig({ ...config, file: e.target.files?.[0] || null })}
                    className="block w-full text-sm text-gray-500"
                  />
                  {config.file && (
                    <p className="mt-2 text-sm text-gray-600">Selected: {config.file.name}</p>
                  )}
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 px-6 py-3 border border-gray-300 rounded-lg font-semibold hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!config.targetUrl && !config.file}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-300"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 max-w-2xl mx-auto">
              <h2 className="text-2xl font-bold text-center mb-8">Economy Mode</h2>
              
              <div className="space-y-3">
                {economyOptions.map(option => (
                  <button
                    key={option.mode}
                    onClick={() => setConfig({ ...config, economyMode: option.mode })}
                    className={`w-full p-4 border-2 rounded-lg transition-all text-left ${
                      config.economyMode === option.mode
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-semibold">{option.label}</div>
                        <div className="text-sm text-gray-600">{option.desc}</div>
                      </div>
                      {option.discount > 0 && (
                        <div className="text-green-600 font-semibold">-{option.discount}%</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Credits Required:</span>
                  <span className="text-2xl font-bold text-blue-600">{getCredits()}</span>
                </div>
                {freeTests > 0 && (
                  <div className="text-sm text-green-600 mt-2">
                    ✓ This will use 1 FREE test (0 credits)
                  </div>
                )}
              </div>

              {submitting && testProgress && (
                <div className="bg-blue-50 p-6 rounded-lg border-2 border-blue-200">
                  <div className="flex items-center gap-3 mb-3">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                    <div>
                      <div className="font-semibold text-blue-900">{testProgress.message}</div>
                      <div className="text-sm text-blue-700">Stage: {testProgress.stage}</div>
                    </div>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${testProgress.progress}%` }}
                    />
                  </div>
                  <div className="text-xs text-blue-700 mt-2 text-right">{testProgress.progress}%</div>
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={() => setStep(2)}
                  disabled={submitting}
                  className="flex-1 px-6 py-3 border border-gray-300 rounded-lg font-semibold hover:bg-gray-50 disabled:bg-gray-100"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      Run Test
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'results' && result && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Test Results</h2>
              <div className={`px-4 py-2 rounded-full font-semibold ${
                result.results.overall === 'pass' 
                  ? 'bg-green-100 text-green-800'
                  : result.results.overall === 'warning'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-red-100 text-red-800'
              }`}>
                {result.results.overall.toUpperCase()}
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{result.results.score}</div>
                <div className="text-sm text-gray-600">Score</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{result.results.summary.passed}</div>
                <div className="text-sm text-gray-600">Passed</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">{result.results.summary.failed}</div>
                <div className="text-sm text-gray-600">Failed</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-600">{result.results.summary.warnings}</div>
                <div className="text-sm text-gray-600">Warnings</div>
              </div>
            </div>

            {result.duration && (
              <div className="text-sm text-gray-600 text-center">
                Test completed in {result.duration}
              </div>
            )}

            {result.usedFreeTest && (
              <div className="mt-4 bg-green-50 p-3 rounded-lg text-center">
                <span className="text-green-700 font-semibold">
                  ✓ FREE test used! {result.remainingFreeTests} free tests remaining
                </span>
              </div>
            )}
          </div>

          {result.results.performanceMetrics && result.results.performanceMetrics.loadTime > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <h3 className="text-xl font-semibold mb-4">Performance Metrics</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-gray-600">Load Time</div>
                  <div className="text-lg font-semibold">
                    {(result.results.performanceMetrics.loadTime / 1000).toFixed(2)}s
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Page Size</div>
                  <div className="text-lg font-semibold">
                    {(result.results.performanceMetrics.pageSize / 1024).toFixed(0)}KB
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Response Code</div>
                  <div className="text-lg font-semibold">
                    {result.results.performanceMetrics.responseCode}
                  </div>
                </div>
              </div>
            </div>
          )}

          {result.results.issues && result.results.issues.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <h3 className="text-xl font-semibold mb-4">Issues Found</h3>
              <div className="space-y-3">
                {result.results.issues.map((issue, idx) => (
                  <div key={idx} className="border-l-4 border-yellow-400 p-4 bg-yellow-50">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-gray-900">{issue.message}</div>
                        <div className="text-sm text-gray-600 mt-1">{issue.suggestion}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {issue.category} • {issue.severity}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.results.recommendations && result.results.recommendations.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <h3 className="text-xl font-semibold mb-4">Recommendations</h3>
              <ul className="space-y-2">
                {result.results.recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.results.javariAutoFix && result.results.javariAutoFix.available && (
            <div className="bg-purple-50 rounded-lg p-6 border-2 border-purple-200">
              <div className="flex items-center gap-3 mb-2">
                <Zap className="w-6 h-6 text-purple-600" />
                <h3 className="text-xl font-semibold text-purple-900">Javari Auto-Fix Available</h3>
              </div>
              <p className="text-purple-800 mb-3">{result.results.javariAutoFix.message}</p>
              <button className="px-6 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700">
                Apply Fixes ({result.results.javariAutoFix.confidence}% confidence)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
