// VerifyForge AI - Simple Dashboard Component
// components/SimpleDashboard.tsx
// 3-step wizard for dead-simple test submission

'use client';

import React, { useState } from 'react';
import { Upload, Play, FileText, CheckCircle } from 'lucide-react';

type TestType = 'web' | 'document' | 'game' | 'ai' | 'avatar' | 'tool' | 'api' | 'mobile';
type EconomyMode = 'standard' | 'economy' | 'ultra_economy';

interface TestConfig {
  testType: TestType | null;
  targetUrl: string;
  file: File | null;
  economyMode: EconomyMode;
}

export default function SimpleDashboard() {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState<TestConfig>({
    testType: null,
    targetUrl: '',
    file: null,
    economyMode: 'standard'
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Test type options with icons and descriptions
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
      setResult(data);
      setStep(4);

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
              <div className={`h-1 w-16 mx-2 ${
                step > s ? 'bg-blue-600' : 'bg-gray-200'
              }`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Choose Test Type */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-center mb-6">
            What would you like to test?
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {testTypes.map((test) => (
              <button
                key={test.type}
                onClick={() => {
                  setConfig({ ...config, testType: test.type });
                  setStep(2);
                }}
                className={`p-6 border-2 rounded-lg hover:border-blue-500 transition-all ${
                  config.testType === test.type ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}
              >
                <div className="text-4xl mb-2">{test.icon}</div>
                <div className="font-semibold">{test.label}</div>
                <div className="text-sm text-gray-600">{test.desc}</div>
                <div className="text-xs text-blue-600 mt-2">{test.credits} credits</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Provide Target */}
      {step === 2 && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-center mb-6">
            {config.testType === 'document' ? 'Upload your file' : 'Enter your URL'}
          </h2>

          {config.testType === 'document' ? (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
              <Upload className="mx-auto mb-4 text-gray-400" size={48} />
              <p className="mb-4 text-gray-600">
                Drop your file here or click to browse
              </p>
              <input
                type="file"
                accept=".pdf,.docx,.xlsx,.pptx"
                onChange={(e) => setConfig({ ...config, file: e.target.files?.[0] || null })}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700"
              >
                Choose File
              </label>
              {config.file && (
                <p className="mt-4 text-sm text-green-600">
                  ✓ {config.file.name}
                </p>
              )}
            </div>
          ) : (
            <div>
              <input
                type="url"
                placeholder="https://example.com"
                value={config.targetUrl}
                onChange={(e) => setConfig({ ...config, targetUrl: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-lg"
              />
            </div>
          )}

          {/* Economy Mode */}
          <div>
            <h3 className="font-semibold mb-3">Choose your testing mode:</h3>
            <div className="grid grid-cols-3 gap-4">
              {economyOptions.map((option) => (
                <button
                  key={option.mode}
                  onClick={() => setConfig({ ...config, economyMode: option.mode })}
                  className={`p-4 border-2 rounded-lg ${
                    config.economyMode === option.mode
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="font-semibold">{option.label}</div>
                  <div className="text-sm text-gray-600">{option.desc}</div>
                  {option.discount > 0 && (
                    <div className="text-xs text-green-600 mt-2 font-bold">
                      SAVE {option.discount}%
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setStep(1)}
              className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!config.targetUrl && !config.file}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Submit */}
      {step === 3 && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-center mb-6">
            Review & Submit
          </h2>

          <div className="bg-gray-50 rounded-lg p-6 space-y-4">
            <div className="flex justify-between">
              <span className="font-semibold">Test Type:</span>
              <span className="capitalize">{config.testType}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">Target:</span>
              <span className="text-sm">{config.targetUrl || config.file?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">Mode:</span>
              <span className="capitalize">{config.economyMode}</span>
            </div>
            <div className="flex justify-between items-center border-t pt-4">
              <span className="font-bold text-lg">Credits:</span>
              <span className="text-2xl font-bold text-blue-600">{getCredits()}</span>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setStep(2)}
              className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>Submitting...</>
              ) : (
                <>
                  <Play size={20} />
                  Run Test
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Results */}
      {step === 4 && result && (
        <div className="space-y-6">
          <div className="text-center">
            <CheckCircle className="mx-auto mb-4 text-green-600" size={64} />
            <h2 className="text-2xl font-bold mb-2">Test Submitted!</h2>
            <p className="text-gray-600">
              Your test is running. Results will be ready in a few moments.
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="font-semibold mb-4">Test ID: {result.id}</h3>
            <p className="text-sm text-gray-600">
              You can check your test results in the Results tab.
            </p>
          </div>

          <button
            onClick={() => {
              setStep(1);
              setConfig({
                testType: null,
                targetUrl: '',
                file: null,
                economyMode: 'standard'
              });
              setResult(null);
            }}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Run Another Test
          </button>
        </div>
      )}
    </div>
  );
}
