import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { secretKey, supabaseUrl } from "@craudioviz/platform-sdk";

const JAVARI_API_URL = 'https://javari-ai-git-main-roy-hendersons-projects-1d3d5e94.vercel.app/api/javari/router';
const SUPABASE_URL = supabaseUrl();
const SUPABASE_SERVICE_KEY = secretKey();

export async function POST(req: NextRequest) {
  const results: any[] = [];
  
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // TEST 1: API Infrastructure
    const infraStart = Date.now();
    const infraRes = await fetch(JAVARI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    results.push({
      test: 'API Infrastructure',
      status: infraRes.status === 401 ? 'PASSED' : 'WARNING',
      duration_ms: Date.now() - infraStart,
      details: {
        url: JAVARI_API_URL,
        expected_status: 401,
        received_status: infraRes.status,
        note: infraRes.status === 401 ? 'Auth correctly enforced' : 'Unexpected response'
      }
    });

    // TEST 2: Database Tables
    const tables = ['user_accounts', 'ai_usage_logs'];
    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      results.push({
        test: `Database Table: ${table}`,
        status: error ? 'FAILED' : 'PASSED',
        details: {
          table,
          accessible: !error,
          error_message: error?.message
        }
      });
    }

    // TEST 3: Environment Variables
    const envVars = [
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'GOOGLE_API_KEY',
      'GROQ_API_KEY'
    ];

    const configured = envVars.filter(v => process.env[v]);
    const missing = envVars.filter(v => !process.env[v]);

    results.push({
      test: 'Environment Configuration',
      status: missing.length === 0 ? 'PASSED' : 'WARNING',
      details: {
        total: envVars.length,
        configured: configured.length,
        missing_vars: missing
      }
    });

  } catch (error) {
    results.push({
      test: 'System Error',
      status: 'FAILED',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  const passed = results.filter(r => r.status === 'PASSED').length;
  const failed = results.filter(r => r.status === 'FAILED').length;
  const warnings = results.filter(r => r.status === 'WARNING').length;

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    phase: 'Phase 2 - Infrastructure & Deployment',
    total_tests: results.length,
    passed,
    failed,
    warnings,
    overall_status: failed === 0 ? '✅ PHASE 2 COMPLETE' : '⚠️ NEEDS ATTENTION',
    results
  });
}
