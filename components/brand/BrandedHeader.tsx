'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';
import { AuthButtons } from './AuthButtons';
import { createSupabaseBrowserClient } from '@/lib/supabase';

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      // Repointed off CentralServices.Auth.getSession(). That call goes to
      // CENTRAL_API_BASE — core's domain, a different origin — relying on a
      // cookie this origin's JavaScript cannot read. The shape bugs fixed here
      // earlier were real, but they were the second half of the problem: the
      // call itself does not return a session for a user signed in on THIS
      // origin, so the header could not show a signed-in visitor either way.
      const supabase = createSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getUser();
      const currentUser = sessionData.user;
      if (currentUser !== null) {
        setIsLoggedIn(true);
        setUser({
          name: typeof currentUser.user_metadata?.['name'] === 'string'
            ? (currentUser.user_metadata['name'] as string)
            : undefined,
          email: currentUser.email ?? '',
        });

        // Credits and plan come from the ledger, read server-side against the
        // verified session. They are deliberately NOT read here yet: this
        // component has no authenticated route to ask, and the previous code
        // asked cross-origin and silently got nothing. Showing 0 credits and
        // 'free' to a paying customer is the defect that paused production, so
        // the header shows neither until there is a real answer to show.
        //
        // Wired to a real balance endpoint in the ladder work. See issue #45.
      }
    } catch (error) {
      console.error('Auth check error:', error);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUser(null);
  };

  return (
    <>
      {/* The credits bar is not rendered.
        *
        * It took `credits` and `plan` from component state that started at 0 and
        * 'free' and, since the cross-origin balance call returned nothing, never
        * moved. A signed-in customer on any paid tier was shown "0 credits,
        * Free" — a displayed number backed by nothing, which is the defect that
        * paused production.
        *
        * It comes back when there is an authenticated endpoint to read a real
        * balance from. Showing nothing is worse UI and better honesty; showing
        * zero is a claim about someone's account. See issue #45. */}
      
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
