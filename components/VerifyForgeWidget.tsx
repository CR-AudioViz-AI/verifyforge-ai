'use client'

import { Shield, ExternalLink } from 'lucide-react'

interface VerifyForgeWidgetProps {
  mode?: 'compact' | 'full'
  theme?: 'dark' | 'light'
  defaultTestType?: string
}

/**
 * VerifyForge AI Embeddable Widget
 * 
 * This component can be embedded into any page of the main website.
 * 
 * Usage in crav-website:
 * 
 * import { VerifyForgeWidget } from '@/components/VerifyForgeWidget'
 * 
 * <VerifyForgeWidget mode="compact" theme="dark" />
 * 
 * OR use iframe for complete isolation:
 * 
 * <iframe 
 *   src="https://crav-verifyforge.vercel.app" 
 *   width="100%" 
 *   height="600px"
 *   frameBorder="0"
 * />
 */
export function VerifyForgeWidget({ 
  mode = 'compact',
  theme = 'dark',
  defaultTestType 
}: VerifyForgeWidgetProps) {
  const baseUrl = process.env.NEXT_PUBLIC_VERIFYFORGE_URL || 'https://crav-verifyforge.vercel.app'
  
  if (mode === 'compact') {
    return (
      <div className={`${theme === 'dark' ? 'bg-slate-900' : 'bg-white'} rounded-2xl border ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'} p-6 shadow-xl`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              VerifyForge AI
            </h3>
            <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
              Professional Testing Platform
            </p>
          </div>
        </div>

        <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-4`}>
          Test your websites, documents, APIs, games, mobile apps, and more with 247+ comprehensive checks
        </p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-slate-800/50' : 'bg-gray-50'}`}>
            <p className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>8</p>
            <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Test Types</p>
          </div>
          <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-slate-800/50' : 'bg-gray-50'}`}>
            <p className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>247+</p>
            <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Checks</p>
          </div>
        </div>

        <a
          href={defaultTestType ? `${baseUrl}/test/${defaultTestType}` : baseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
        >
          Launch VerifyForge
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    )
  }

  // Full mode - iframe embed
  return (
    <div className="w-full">
      <iframe
        src={defaultTestType ? `${baseUrl}/test/${defaultTestType}` : baseUrl}
        className="w-full h-[800px] rounded-2xl border border-slate-800 shadow-2xl"
        frameBorder="0"
        allow="clipboard-write"
        title="VerifyForge AI Testing Platform"
      />
    </div>
  )
}

/**
 * Quick Test Button - Minimal embed for CTAs
 */
export function QuickTestButton({ 
  testType,
  label = 'Test Now',
  size = 'md'
}: {
  testType: string
  label?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const baseUrl = process.env.NEXT_PUBLIC_VERIFYFORGE_URL || 'https://crav-verifyforge.vercel.app'
  
  const sizeClasses = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg'
  }

  return (
    <a
      href={`${baseUrl}/test/${testType}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity ${sizeClasses[size]}`}
    >
      <Shield className="w-4 h-4" />
      {label}
      <ExternalLink className="w-3 h-3" />
    </a>
  )
}
