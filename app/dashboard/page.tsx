'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SimpleDashboard from '@/components/SimpleDashboard';
import Link from 'next/link';

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Check authentication
    const isAuth = localStorage.getItem('verifyforge_auth');
    const userData = localStorage.getItem('verifyforge_user');

    if (!isAuth || !userData) {
      // Not authenticated, redirect to auth page
      router.push('/auth');
      return;
    }

    // Load user data
    setUser(JSON.parse(userData));
    setLoading(false);
  }, [router]);

  const handleSignOut = () => {
    localStorage.removeItem('verifyforge_auth');
    localStorage.removeItem('verifyforge_user');
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

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
              {user && (
                <div className="text-sm text-gray-600">
                  <span className="font-semibold">Welcome, {user.name || user.email}</span>
                </div>
              )}
              <div className="text-sm text-gray-600 bg-green-50 px-3 py-1 rounded-lg border border-green-200">
                <span className="font-semibold">Free Tests:</span> {user?.freeTests || 3}
              </div>
              <button 
                onClick={handleSignOut}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              >
                Sign Out
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
