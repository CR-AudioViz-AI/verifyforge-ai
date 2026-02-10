import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const JAVARI_URL = 'https://javari-ai-git-main-roy-hendersons-projects-1d3d5e94.vercel.app/api/javari/router';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wcyvnkmepimmohexdfzd.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST() {
  const results: any[] = [];
  
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Test 1: API
    const start = Date.now();
    const apiRes = await fetch(JAVARI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    results.push({
      test: 'API Infrastructure',
      status: apiRes.status === 401 ? 'PASSED' : 'WARNING',
      duration_ms: Date.now() - start,
      details: { expected: 401, received: apiRes.status }
    });

    // Test 2: Database
    for (const table of ['user_accounts', 'ai_usage_logs']) {
      const { error } = await supabase.from(table).select('*').limit(1);
      results.push({
        test: `Database: ${table}`,
        status: error ? 'FAILED' : 'PASSED',
        details: { accessible: !error, error: error?.message }
      });
    }

    // Test 3: Env vars
    const envVars = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY'];
    const missing = envVars.filter(v => !process.env[v]);
    results.push({
      test: 'Environment Config',
      status: missing.length === 0 ? 'PASSED' : 'WARNING',
      details: { configured: envVars.length - missing.length, total: envVars.length, missing }
    });

  } catch (error) {
    results.push({ test: 'System Error', status: 'FAILED', error: String(error) });
  }

  const passed = results.filter(r => r.status === 'PASSED').length;
  const failed = results.filter(r => r.status === 'FAILED').length;
  const warnings = results.filter(r => r.status === 'WARNING').length;

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    phase: 'Phase 2',
    total_tests: results.length,
    passed,
    failed,
    warnings,
    overall_status: failed === 0 ? '✅ PHASE 2 COMPLETE' : '⚠️ NEEDS ATTENTION',
    results
  });
}
