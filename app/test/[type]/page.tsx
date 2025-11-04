'use client'

import { useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Upload, 
  Link as LinkIcon,
  Play,
  CheckCircle,
  AlertCircle,
  Loader2,
  Download,
  Share2,
  TrendingUp,
  Clock
} from 'lucide-react'

interface TestProgress {
  stage: string
  progress: number
  message: string
}

const testConfigs: Record<string, {
  name: string
  inputType: 'url' | 'file' | 'both'
  acceptedFormats?: string
  placeholder: string
  examples: string[]
  description: string
}> = {
  web: {
    name: 'Website Testing',
    inputType: 'url',
    placeholder: 'https://example.com',
    examples: ['https://example.com', 'https://yourwebsite.com'],
    description: 'Test any website for SEO, performance, security, accessibility, and more'
  },
  document: {
    name: 'Document Testing',
    inputType: 'file',
    acceptedFormats: '.pdf,.docx,.xlsx,.pptx',
    placeholder: 'Upload your document',
    examples: ['PDF', 'DOCX', 'XLSX', 'PPTX'],
    description: 'Analyze documents for quality, structure, security, and optimization'
  },
  api: {
    name: 'API Testing',
    inputType: 'url',
    placeholder: 'https://api.example.com/endpoint',
    examples: ['https://api.example.com/v1/users'],
    description: 'Test REST APIs for security, performance, authentication, and compliance'
  },
  ai: {
    name: 'AI/Bot Testing',
    inputType: 'url',
    placeholder: 'https://api.yourbot.com/chat',
    examples: ['AI Chat API Endpoint'],
    description: 'Advanced testing including hallucination detection and security analysis'
  },
  game: {
    name: 'Game Testing',
    inputType: 'file',
    acceptedFormats: '.html,.apk,.zip,.unity3d',
    placeholder: 'Upload your game',
    examples: ['HTML5', 'APK', 'Unity'],
    description: 'Comprehensive game testing for performance, assets, and user experience'
  },
  mobile: {
    name: 'Mobile App Testing',
    inputType: 'file',
    acceptedFormats: '.apk,.ipa,.aab',
    placeholder: 'Upload your mobile app',
    examples: ['APK', 'IPA', 'AAB'],
    description: 'iOS/Android app testing for performance, security, and app store compliance'
  },
  avatar: {
    name: 'Avatar Testing',
    inputType: 'file',
    acceptedFormats: '.fbx,.gltf,.glb,.obj,.usd',
    placeholder: 'Upload your 3D model',
    examples: ['FBX', 'glTF', 'OBJ', 'USD'],
    description: '3D model testing for VR/AR, games, and metaverse applications'
  },
  tool: {
    name: 'Tool Testing',
    inputType: 'url',
    placeholder: 'https://yourtool.com',
    examples: ['https://yourtool.com'],
    description: 'Analyze web tools and SaaS platforms for quality and performance'
  }
}

export default function TestPage() {
  const params = useParams()
  const router = useRouter()
  const testType = params?.type as string
  
  const [input, setInput] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState<TestProgress | null>(null)
  const [results, setResults] = useState<any>(null)

  const config = testConfigs[testType]

  if (!config) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Invalid test type</div>
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
    }
  }

  const runTest = async () => {
    setIsRunning(true)
    setResults(null)
    setProgress({ stage: 'initializing', progress: 0, message: 'Initializing test...' })

    try {
      const formData = new FormData()
      if (config.inputType === 'file' && file) {
        formData.append('file', file)
      } else if (config.inputType === 'url' && input) {
        formData.append('url', input)
      }
      formData.append('testType', testType)

      const response = await fetch('/api/test/run', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('Test failed')
      }

      const data = await response.json()
      setResults(data)
      setProgress({ stage: 'complete', progress: 100, message: 'Test complete!' })
    } catch (error) {
      console.error('Test error:', error)
      setProgress({ stage: 'error', progress: 0, message: 'Test failed. Please try again.' })
    } finally {
      setTimeout(() => setIsRunning(false), 500)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">{config.name}</h1>
              <p className="text-sm text-slate-400">{config.description}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {!isRunning && !results && (
          <div className="space-y-8">
            {/* Input Section */}
            <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-8">
              <h2 className="text-xl font-bold text-white mb-6">Input</h2>
              
              {config.inputType === 'url' ? (
                <div className="space-y-4">
                  <div className="relative">
                    <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="url"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={config.placeholder}
                      className="w-full pl-12 pr-4 py-4 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {config.examples.map((example) => (
                      <button
                        key={example}
                        onClick={() => setInput(example)}
                        className="px-3 py-1.5 bg-slate-800/50 text-slate-300 text-sm rounded-lg hover:bg-slate-700/50 transition-colors"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="block">
                    <div className="border-2 border-dashed border-slate-700 rounded-xl p-12 text-center hover:border-slate-600 transition-colors cursor-pointer">
                      <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                      <p className="text-white font-medium mb-2">
                        {file ? file.name : 'Click to upload or drag and drop'}
                      </p>
                      <p className="text-sm text-slate-400">
                        Supported formats: {config.examples.join(', ')}
                      </p>
                      <input
                        type="file"
                        accept={config.acceptedFormats}
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </div>
                  </label>
                </div>
              )}
            </div>

            {/* Start Button */}
            <div className="flex justify-center">
              <button
                onClick={runTest}
                disabled={(!input && !file)}
                className="group px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-semibold text-lg shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-5 h-5" />
                Run Test
                <span className="opacity-75">→</span>
              </button>
            </div>
          </div>
        )}

        {/* Progress */}
        {isRunning && progress && (
          <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-8">
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">{progress.message}</h3>
                <p className="text-slate-400">{progress.stage}</p>
              </div>
              <div className="max-w-md mx-auto">
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-300"
                    style={{ width: `${progress.progress}%` }}
                  />
                </div>
                <p className="text-sm text-slate-400 mt-2">{progress.progress}% Complete</p>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="space-y-6">
            {/* Score Card */}
            <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">Test Results</h2>
                  <p className="text-slate-400">Comprehensive analysis complete</p>
                </div>
                <div className="text-right">
                  <div className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    {results.score}
                  </div>
                  <p className="text-slate-400 text-sm">Overall Score</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-800/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-slate-400 text-sm">Passed</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{results.summary.passed}</p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-yellow-400" />
                    <span className="text-slate-400 text-sm">Warnings</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{results.summary.warnings}</p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span className="text-slate-400 text-sm">Failed</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{results.summary.failed}</p>
                </div>
              </div>
            </div>

            {/* Issues */}
            {results.issues && results.issues.length > 0 && (
              <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-8">
                <h3 className="text-xl font-bold text-white mb-6">Issues Found</h3>
                <div className="space-y-4">
                  {results.issues.slice(0, 5).map((issue: any, i: number) => (
                    <div key={i} className="bg-slate-800/50 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-2 h-2 rounded-full mt-2 ${
                          issue.severity === 'high' ? 'bg-red-400' :
                          issue.severity === 'medium' ? 'bg-yellow-400' :
                          'bg-blue-400'
                        }`} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-white font-medium">{issue.message}</span>
                            <span className={`px-2 py-0.5 text-xs rounded ${
                              issue.severity === 'high' ? 'bg-red-500/20 text-red-300' :
                              issue.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-300' :
                              'bg-blue-500/20 text-blue-300'
                            }`}>
                              {issue.severity}
                            </span>
                          </div>
                          <p className="text-sm text-slate-400 mb-2">{issue.suggestion}</p>
                          <p className="text-xs text-slate-500">{issue.category}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {results.recommendations && results.recommendations.length > 0 && (
              <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-8">
                <h3 className="text-xl font-bold text-white mb-6">Recommendations</h3>
                <ul className="space-y-3">
                  {results.recommendations.map((rec: string, i: number) => (
                    <li key={i} className="flex items-start gap-3 text-slate-300">
                      <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setResults(null)
                  setInput('')
                  setFile(null)
                }}
                className="flex-1 px-6 py-3 bg-slate-800 text-white rounded-xl font-medium hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                Run Another Test
              </button>
              <button className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
                <Download className="w-4 h-4" />
                Download Report
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
