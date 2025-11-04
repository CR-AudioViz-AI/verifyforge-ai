'use client'

import { useState } from 'react'
import { 
  Globe, 
  FileText, 
  Gamepad2, 
  Bot, 
  Smartphone, 
  User, 
  Wrench, 
  Code,
  Play,
  CheckCircle,
  AlertCircle,
  Clock,
  TrendingUp,
  Shield,
  Zap
} from 'lucide-react'

interface TestType {
  id: string
  name: string
  description: string
  icon: any
  color: string
  checks: number
  avgTime: string
  supported: string[]
}

const testTypes: TestType[] = [
  {
    id: 'web',
    name: 'Website Testing',
    description: 'Comprehensive analysis of websites, SEO, performance, security, and accessibility',
    icon: Globe,
    color: 'from-blue-500 to-cyan-500',
    checks: 40,
    avgTime: '30-60s',
    supported: ['URL']
  },
  {
    id: 'document',
    name: 'Document Testing',
    description: 'Deep analysis of PDF, DOCX, XLSX, PPTX files for quality, security, and optimization',
    icon: FileText,
    color: 'from-purple-500 to-pink-500',
    checks: 40,
    avgTime: '20-45s',
    supported: ['PDF', 'DOCX', 'XLSX', 'PPTX']
  },
  {
    id: 'api',
    name: 'API Testing',
    description: 'REST API endpoint testing for security, performance, authentication, and compliance',
    icon: Code,
    color: 'from-green-500 to-emerald-500',
    checks: 42,
    avgTime: '15-30s',
    supported: ['REST', 'GraphQL']
  },
  {
    id: 'ai',
    name: 'AI/Bot Testing',
    description: 'Advanced testing for AI systems including hallucination detection and security',
    icon: Bot,
    color: 'from-orange-500 to-red-500',
    checks: 50,
    avgTime: '2-5min',
    supported: ['ChatGPT', 'Claude', 'Custom']
  },
  {
    id: 'game',
    name: 'Game Testing',
    description: 'Comprehensive game analysis covering performance, assets, and user experience',
    icon: Gamepad2,
    color: 'from-indigo-500 to-purple-500',
    checks: 45,
    avgTime: '30-90s',
    supported: ['HTML5', 'APK', 'Unity']
  },
  {
    id: 'mobile',
    name: 'Mobile App Testing',
    description: 'iOS and Android app testing for performance, security, and app store compliance',
    icon: Smartphone,
    color: 'from-pink-500 to-rose-500',
    checks: 40,
    avgTime: '45-90s',
    supported: ['APK', 'IPA', 'AAB']
  },
  {
    id: 'avatar',
    name: 'Avatar Testing',
    description: '3D model and avatar testing for VR/AR, games, and metaverse applications',
    icon: User,
    color: 'from-teal-500 to-cyan-500',
    checks: 35,
    avgTime: '20-45s',
    supported: ['FBX', 'glTF', 'OBJ', 'USD']
  },
  {
    id: 'tool',
    name: 'Tool Testing',
    description: 'Comprehensive analysis of web tools, SaaS platforms, and software applications',
    icon: Wrench,
    color: 'from-yellow-500 to-orange-500',
    checks: 35,
    avgTime: '30-60s',
    supported: ['URL', 'SaaS']
  }
]

export default function VerifyForgeDashboard() {
  const [selectedTest, setSelectedTest] = useState<string | null>(null)
  const [isTestRunning, setIsTestRunning] = useState(false)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">VerifyForge AI</h1>
                <p className="text-sm text-slate-400">Professional Testing Platform</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-lg border border-slate-700">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm text-slate-300">3 Free Tests</span>
              </div>
              <button className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium hover:opacity-90 transition-opacity">
                Upgrade
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Total Tests</p>
                <p className="text-2xl font-bold text-white">247+</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Test Types</p>
                <p className="text-2xl font-bold text-white">8</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Avg Time</p>
                <p className="text-2xl font-bold text-white">45s</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-500/10 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Accuracy</p>
                <p className="text-2xl font-bold text-white">99.9%</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Test Type Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">Select Test Type</h2>
          <p className="text-slate-400">Choose from 8 professional-grade testing engines</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {testTypes.map((test) => {
            const Icon = test.icon
            return (
              <button
                key={test.id}
                onClick={() => setSelectedTest(test.id)}
                className={`group relative bg-slate-900/50 backdrop-blur-sm border rounded-2xl p-6 text-left transition-all duration-300 hover:scale-105 hover:shadow-2xl ${
                  selectedTest === test.id 
                    ? 'border-blue-500 shadow-lg shadow-blue-500/20' 
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Gradient Background */}
                <div className={`absolute inset-0 bg-gradient-to-br ${test.color} opacity-0 group-hover:opacity-5 rounded-2xl transition-opacity`} />
                
                {/* Icon */}
                <div className={`w-14 h-14 bg-gradient-to-br ${test.color} rounded-xl flex items-center justify-center mb-4 shadow-lg`}>
                  <Icon className="w-7 h-7 text-white" />
                </div>

                {/* Content */}
                <h3 className="text-lg font-bold text-white mb-2">{test.name}</h3>
                <p className="text-sm text-slate-400 mb-4 line-clamp-2">{test.description}</p>

                {/* Stats */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Checks:</span>
                    <span className="text-slate-300 font-medium">{test.checks}+</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Time:</span>
                    <span className="text-slate-300 font-medium">{test.avgTime}</span>
                  </div>
                </div>

                {/* Supported Formats */}
                <div className="mt-4 pt-4 border-t border-slate-800">
                  <div className="flex flex-wrap gap-1">
                    {test.supported.slice(0, 2).map((format) => (
                      <span key={format} className="px-2 py-1 bg-slate-800/50 text-slate-400 text-xs rounded">
                        {format}
                      </span>
                    ))}
                    {test.supported.length > 2 && (
                      <span className="px-2 py-1 bg-slate-800/50 text-slate-400 text-xs rounded">
                        +{test.supported.length - 2}
                      </span>
                    )}
                  </div>
                </div>

                {/* Selected Indicator */}
                {selectedTest === test.id && (
                  <div className="absolute top-4 right-4">
                    <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-white" />
                    </div>
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Start Test Button */}
        {selectedTest && (
          <div className="mt-8 flex justify-center">
            <button 
              onClick={() => {
                setIsTestRunning(true)
                // Navigate to test page
                window.location.href = `/test/${selectedTest}`
              }}
              className="group px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-semibold text-lg shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300 flex items-center gap-3"
            >
              <Play className="w-5 h-5" />
              Start {testTypes.find(t => t.id === selectedTest)?.name}
              <span className="opacity-75">→</span>
            </button>
          </div>
        )}
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 backdrop-blur-sm border border-slate-800 rounded-2xl p-8">
          <h3 className="text-xl font-bold text-white mb-6">Why VerifyForge AI?</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h4 className="text-white font-semibold mb-1">Most Comprehensive</h4>
                <p className="text-sm text-slate-400">247+ checks across 8 test types - more than any competitor</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h4 className="text-white font-semibold mb-1">AI-Powered Analysis</h4>
                <p className="text-sm text-slate-400">Advanced AI detects issues humans miss, including hallucinations</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h4 className="text-white font-semibold mb-1">Actionable Results</h4>
                <p className="text-sm text-slate-400">Every issue includes specific suggestions to fix it</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
