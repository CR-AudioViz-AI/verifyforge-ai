'use client';

import React from 'react';
import Link from 'next/link';
import { CREDITS_CONFIG } from './brand-config';

interface CreditsBarProps {
  isLoggedIn: boolean;
  credits?: number;
  plan?: 'free' | 'pro' | 'business';
  userName?: string;
}

/**
 * Credits Bar Component
 * 
 * Displays:
 * - Current plan name
 * - Credit balance
 * - Top up link
 * - Upgrade link (if not on highest plan)
 * - Warning when credits ≤ 10 (red text)
 */
export function CreditsBar({ isLoggedIn, credits = 0, plan = 'free', userName }: CreditsBarProps) {
  if (!isLoggedIn) return null;

  const isLowCredits = credits <= CREDITS_CONFIG.warningThreshold;
  const isCriticalCredits = credits <= CREDITS_CONFIG.criticalThreshold;
  const planInfo = CREDITS_CONFIG.plans[plan];
  const canUpgrade = plan !== 'business';

  return (
    <div className="w-full bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
      <div className="max-w-7xl mx-auto px-4 h-10 flex items-center justify-between text-sm">
        {/* Left: Plan & Credits */}
        <div className="flex items-center gap-4">
          {/* Plan Badge */}
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                          bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300">
            {planInfo.name}
          </span>
          
          {/* Credits Display */}
          <div className="flex items-center gap-1.5">
            {/* Coin icon */}
            <svg className="w-4 h-4 text-cyan-600 dark:text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.736 6.979C9.208 6.193 9.696 6 10 6c.304 0 .792.193 1.264.979a1 1 0 001.715-1.029C12.279 4.784 11.232 4 10 4s-2.279.784-2.979 1.95c-.285.475-.507 1-.67 1.55H6a1 1 0 000 2h.013a9.358 9.358 0 000 1H6a1 1 0 100 2h.351c.163.55.385 1.075.67 1.55C7.721 15.216 8.768 16 10 16s2.279-.784 2.979-1.95a1 1 0 10-1.715-1.029c-.472.786-.96.979-1.264.979-.304 0-.792-.193-1.264-.979a4.265 4.265 0 01-.264-.521H10a1 1 0 100-2H8.017a7.36 7.36 0 010-1H10a1 1 0 100-2H8.472c.08-.185.167-.36.264-.521z"/>
            </svg>
            
            <span className={`font-medium ${
              isCriticalCredits 
                ? 'text-red-600 dark:text-red-400' 
                : isLowCredits 
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-700 dark:text-slate-300'
            }`}>
              {credits.toLocaleString()} credits
            </span>
          </div>
          
          {/* Low Credits Warning */}
          {isLowCredits && (
            <span className="text-red-600 dark:text-red-400 font-medium animate-pulse">
              ⚠️ Low credits! Top up or upgrade to continue.
            </span>
          )}
        </div>
        
        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {/* Top Up Link */}
          <Link 
            href="/pricing#top-up"
            className="text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300
                       font-medium hover:underline transition-colors"
          >
            Top Up
          </Link>
          
          {/* Upgrade Link (if not on Business) */}
          {canUpgrade && (
            <Link 
              href="/pricing"
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium
                         bg-cyan-600 text-white hover:bg-cyan-700
                         dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-900
                         transition-colors"
            >
              Upgrade
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default CreditsBar;
