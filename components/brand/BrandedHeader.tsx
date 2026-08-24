'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';
import { AuthButtons } from './AuthButtons';
import { CreditsBar } from './CreditsBar';
import { CentralServices } from '@/lib/central-services';

interface BrandedHeaderProps {
  appName: string;
  appLogo?: React.ReactNode;
  quickLinks?: Array<{ label: string; href: string }>;
}

/**
 * Branded Header Component
 * 
 * Standard header for all CR AudioViz AI apps with:
 * - App logo (3D style)
 * - Quick links
 * - Theme toggle (innocuous)
 * - Auth buttons (Log In/Sign Up or User Name/Log Out)
 * - Credits bar (when logged in)
 */
export function BrandedHeader({ appName, appLogo, quickLinks = [] }: BrandedHeaderProps) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // `name` is genuinely optional on User; `email` is not. Modelling that exactly
  // keeps exactOptionalPropertyTypes honest at the call sites below.
  const [user, setUser] = useState<{ name: string | undefined; email: string } | null>(null);
  const [credits, setCredits] = useState(0);
  const [plan, setPlan] = useState<'free' | 'pro' | 'business' | 'enterprise'>('free');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const session = await CentralServices.Auth.getSession();
      if (session.success && session.data) {
        const currentUser = session.data;
        setIsLoggedIn(true);
        setUser({ name: currentUser.name, email: currentUser.email });

        // The plan comes from the session's subscription_tier, which is typed as
        // the four-value union. getBalance() also reports a `tier`, but as a bare
        // string — using it would need a cast or a fallback to a plausible
        // default, and a wrong plan renders the wrong price to a paying customer.
        setPlan(currentUser.subscription_tier);

        // Fetch credits
        const creditsResult = await CentralServices.Credits.getBalance();
        if (creditsResult.success) {
          setCredits(creditsResult.data?.balance ?? 0);
        }
      }
    } catch (error) {
      console.error('Auth check error:', error);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUser(null);
    setCredits(0);
    setPlan('free');
  };

  return (
    <>
      {/* Credits Bar - Only when logged in */}
      <CreditsBar 
        isLoggedIn={isLoggedIn} 
        credits={credits} 
        plan={plan}
        {...(user?.name !== undefined ? { userName: user.name } : {})}
      />
      
      {/* Main Header */}
      <header className="sticky top-0 z-50 w-full bg-white dark:bg-slate-900 
                         border-b border-slate-200 dark:border-slate-800
                         shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-[60px]">
            {/* Left: Logo & App Name */}
            <Link href="/" className="flex items-center gap-3 min-h-[44px]">
              {/* Logo with 3D effect */}
              {appLogo || (
                <div className="w-10 h-10 rounded-xl flex items-center justify-center
                               bg-gradient-to-br from-cyan-500 to-cyan-700
                               shadow-lg shadow-cyan-500/30
                               transform hover:scale-105 transition-transform">
                  <span className="text-white font-bold text-lg">
                    {appName.charAt(0)}
                  </span>
                </div>
              )}
              <span className="font-semibold text-lg text-slate-900 dark:text-white
                             hidden sm:block">
                {appName}
              </span>
            </Link>

            {/* Center: Quick Links (Desktop) */}
            {quickLinks.length > 0 && (
              <nav className="hidden md:flex items-center gap-1">
                {quickLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="px-3 py-2 min-h-[44px] flex items-center
                               text-sm font-medium text-slate-600 dark:text-slate-400
                               hover:text-cyan-600 dark:hover:text-cyan-400
                               rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800
                               transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            )}

            {/* Right: Theme Toggle & Auth */}
            <div className="flex items-center gap-2">
              {/* Theme Toggle - Small & Innocuous */}
              <ThemeToggle />
              
              {/* Auth Buttons */}
              <AuthButtons 
                isLoggedIn={isLoggedIn}
                {...(user?.name !== undefined ? { userName: user.name } : {})}
                {...(user?.email !== undefined ? { userEmail: user.email } : {})}
                onLogout={handleLogout}
              />
              
              {/* Mobile Menu Button */}
              {quickLinks.length > 0 && (
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="md:hidden p-2 min-h-[44px] min-w-[44px] flex items-center justify-center
                             text-slate-600 dark:text-slate-400
                             hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                  aria-label="Toggle menu"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {mobileMenuOpen ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    )}
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && quickLinks.length > 0 && (
          <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <nav className="px-4 py-2 space-y-1">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-3 py-3 min-h-[44px]
                             text-sm font-medium text-slate-600 dark:text-slate-400
                             hover:text-cyan-600 dark:hover:text-cyan-400
                             rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800
                             transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>
    </>
  );
}

export default BrandedHeader;
