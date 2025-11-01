// VerifyForge AI - Enhanced Dashboard with Results Tab
// components/SimpleDashboard.tsx

'use client';

import React, { useState } from 'react';
import { Upload, Play, FileText, CheckCircle, AlertCircle, TrendingUp, Shield, Zap } from 'lucide-react';

type TestType = 'web' | 'document' | 'game' | 'ai' | 'avatar' | 'tool' | 'api' | 'mobile';
type EconomyMode = 'standard' | 'economy' | 'ultra_economy';

interface TestConfig {
  testType: TestType | null;
  targetUrl: string;
  file: File | null;
  economyMode: EconomyMode;
}

interface TestResult {
  id: string;
  status: string;
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

  const handleSubmit = async () => {
    setSubmitting(true);

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
        setResult(data);
        setFreeTests(data.remainingFreeTests);
        setActiveTab('results');
        setStep(1); // Reset wizard for next test
        setConfig({
          testType: null,
          targetUrl: '',
          file: null,
          economyMode: 'standard'
        });
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
      {/* Tab Navigation */}
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
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'results'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Results {result && '(1)'}
        </button>
      </div>

      {/* Wizard Tab */}
      {activeTab === 'wizard' && (
        <>
          {/* Progress Steps */}
          <div className="flex items-center justify-center mb-8">
            {[1, 2, 3].map((s) => (
              <React.Fragment key={s}>
                <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                  step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {s}
                </div>
                {s < 3 && (
                  <div className={`h-1 w-16 ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Step Content */}
          <div className="bg-white rounded-lg shadow-lg p-8">
            {/* Step 1: Select Test Type */}
            {step === 1 && (
              <div>
                <h2 className="text-2xl font-bold mb-6 text-center">What do you want to test?</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {testTypes.map((test) => (
                    <button
                      key={test.type}
                      onClick={() => {
                        setConfig({ ...config, testType: test.type });
                        setStep(2);
                      }}
                      className={`p-4 border-2 rounded-lg hover:border-blue-500 transition-all ${
                        config.testType === test.type ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="text-4xl mb-2">{test.icon}</div>
                      <div className="font-semibold">{test.label}</div>
                      <div className="text-xs text-gray-500">{test.desc}</div>
                      <div className="text-xs text-blue-600 mt-1">{test.credits} credits</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Enter Target */}
            {step === 2 && (
              <div>
                <h2 className="text-2xl font-bold mb-6">Enter Target URL or Upload File</h2>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2">Target URL</label>
                  <input
                    type="url"
                    placeholder="https://example.com"
                    value={config.targetUrl}
                    onChange={(e) => setConfig({ ...config, targetUrl: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="text-center text-gray-500 mb-4">OR</div>

                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2">Upload File</label>
                  <input
                    type="file"
                    onChange={(e) => setConfig({ ...config, file: e.target.files?.[0] || null })}
                    className="w-full"
                  />
                </div>

                {/* Economy Mode Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2">Testing Mode</label>
                  <div className="grid grid-cols-3 gap-4">
                    {economyOptions.map((option) => (
                      <button
                        key={option.mode}
                        onClick={() => setConfig({ ...config, economyMode: option.mode })}
                        className={`p-4 border-2 rounded-lg transition-all ${
                          config.economyMode === option.mode ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                        }`}
                      >
                        <div className="font-semibold">{option.label}</div>
                        <div className="text-xs text-gray-500">{option.desc}</div>
                        {option.discount > 0 && (
                          <div className="text-xs text-green-600 mt-1">Save {option.discount}%</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!config.targetUrl && !config.file}
                    className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Review & Submit */}
            {step === 3 && (
              <div>
                <h2 className="text-2xl font-bold mb-6">Review & Submit</h2>

                <div className="space-y-4 mb-6">
                  <div className="flex justify-between py-2 border-b">
                    <span className="font-medium">Test Type:</span>
                    <span className="capitalize">{config.testType}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="font-medium">Target:</span>
                    <span className="text-sm">{config.targetUrl || config.file?.name}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="font-medium">Mode:</span>
                    <span className="capitalize">{config.economyMode.replace('_', ' ')}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="font-medium">Credits:</span>
                    <span className="text-blue-600 font-bold">
                      {freeTests > 0 ? 'FREE' : getCredits()}
                    </span>
                  </div>
                </div>

                {freeTests > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                    <div className="flex items-center gap-2 text-green-800">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-semibold">Free Test Available!</span>
                    </div>
                    <p className="text-sm text-green-700 mt-1">
                      You have {freeTests} free {freeTests === 1 ? 'test' : 'tests'} remaining. No credits will be charged.
                    </p>
                  </div>
                )}

                <div className="flex gap-4">
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200"
                    disabled={submitting}
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Processing...
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
        </>
      )}

      {/* Results Tab */}
      {activeTab === 'results' && (
        <div>
          {result ? (
            <div className="space-y-6">
              {/* Overall Score */}
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold">Test Results</h2>
                  <div className={`px-4 py-2 rounded-full font-semibold ${
                    result.results.overall === 'pass' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {result.results.overall.toUpperCase()}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-3xl font-bold text-blue-600">{result.results.score}</div>
                    <div className="text-sm text-gray-600">Overall Score</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-3xl font-bold text-green-600">{result.results.summary.passed}</div>
                    <div className="text-sm text-gray-600">Passed</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <div className="text-3xl font-bold text-red-600">{result.results.summary.failed}</div>
                    <div className="text-sm text-gray-600">Failed</div>
                  </div>
                  <div className="text-center p-4 bg-yellow-50 rounded-lg">
                    <div className="text-3xl font-bold text-yellow-600">{result.results.summary.warnings}</div>
                    <div className="text-sm text-gray-600">Warnings</div>
                  </div>
                </div>

                {result.usedFreeTest && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-green-800">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-semibold">FREE Test Used</span>
                    </div>
                    <p className="text-sm text-green-700 mt-1">
                      No credits charged. {result.remainingFreeTests} free {result.remainingFreeTests === 1 ? 'test' : 'tests'} remaining.
                    </p>
                  </div>
                )}
              </div>

              {/* Issues Found */}
              {result.results.issues.length > 0 && (
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <AlertCircle className="w-6 h-6 text-orange-500" />
                    Issues Found
                  </h3>
                  <div className="space-y-4">
                    {result.results.issues.map((issue, idx) => (
                      <div key={idx} className="border-l-4 border-orange-500 pl-4 py-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            issue.severity === 'high' ? 'bg-red-100 text-red-800' :
                            issue.severity === 'medium' ? 'bg-orange-100 text-orange-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {issue.severity.toUpperCase()}
                          </span>
                          <span className="font-semibold">{issue.category}</span>
                        </div>
                        <p className="text-gray-700 mb-2">{issue.message}</p>
                        <p className="text-sm text-blue-600">💡 {issue.suggestion}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {result.results.recommendations.length > 0 && (
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <TrendingUp className="w-6 h-6 text-blue-500" />
                    Recommendations
                  </h3>
                  <ul className="space-y-2">
                    {result.results.recommendations.map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-700">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Javari Auto-Fix */}
              {result.results.javariAutoFix?.available && (
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg shadow-lg p-6 border border-purple-200">
                  <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Zap className="w-6 h-6 text-purple-600" />
                    Javari AI Auto-Fix Available
                  </h3>
                  <p className="text-gray-700 mb-4">{result.results.javariAutoFix.message}</p>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      Confidence: <span className="font-bold text-purple-600">{result.results.javariAutoFix.confidence}%</span>
                    </div>
                    <button className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700">
                      Apply Auto-Fix
                    </button>
                  </div>
                </div>
              )}

              {/* Run Another Test Button */}
              <button
                onClick={() => setActiveTab('wizard')}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5" />
                Run Another Test
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-lg p-12 text-center">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-700 mb-2">No Results Yet</h3>
              <p className="text-gray-500 mb-6">Run your first test to see results here</p>
              <button
                onClick={() => setActiveTab('wizard')}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
              >
                Start Testing
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
