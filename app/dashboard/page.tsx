'use client';

import SimpleDashboard from '@/components/SimpleDashboard';
import Link from 'next/link';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div className="text-3xl">⚡</div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">VerifyForge AI</h1>
                <p className="text-sm text-gray-600">Testing Dashboard</p>
              </div>
            </Link>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                <span className="font-semibold">Credits:</span> 3 free tests
              </div>
              <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors">
                Upgrade
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SimpleDashboard />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-600 text-sm">
          <p>© 2025 CR AudioViz AI, LLC • VerifyForge AI • "Testing Revolution" 🚀</p>
        </div>
      </footer>
    </div>
  );
}
