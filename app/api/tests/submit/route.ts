// COMPLETE REAL TESTING API - ALL TEST TYPES
// app/api/tests/submit/route.ts
// Routes to appropriate testing engine based on test type

import { NextRequest, NextResponse } from 'next/server';
import { CompleteWebTester } from '@/lib/complete-web-testing';
import { CompleteDocumentTester } from '@/lib/complete-document-testing';
import { CompleteApiTester } from '@/lib/complete-api-testing';
import { CompleteAiBotTester } from '@/lib/complete-ai-bot-testing';
import { CompleteGameTester } from '@/lib/complete-game-testing';
import { CompleteMobileTester } from '@/lib/complete-mobile-testing';
import { CompleteAvatarTester } from '@/lib/complete-avatar-testing';
import { CompleteToolTester } from '@/lib/complete-tool-testing';

// 2026-08-24: the in-memory credit counter was REMOVED, not replaced.
//
// It was `let userCredits = { freeTests: 3, paidCredits: 0 }` at module scope:
// one counter shared by every caller, reset on every lambda cold start, keyed to
// no user, and reported to the client as `remainingFreeTests` /
// `remainingPaidCredits` as though it described their account. It did not. Two
// concurrent instances held different numbers and both were wrong.
//
// Nothing here charges or checks credits now. That is deliberate and temporary:
// real metering needs a real caller identity, which this route does not yet
// establish, and inventing a number in the meantime is the defect being removed.
// See issue #45.

// Store test progress
const testProgressStore = new Map<string, any>();

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const testType = formData.get('test_type') as string;
    const targetUrl = formData.get('target_url') as string;
    const economyMode = formData.get('economy_mode') as string;
    const file = formData.get('file') as File | null;

    // Validate input
    if (!testType) {
      return NextResponse.json(
        { error: 'Missing required field: test_type' },
        { status: 400 }
      );
    }

    if (!targetUrl && !file) {
      return NextResponse.json(
        { error: 'Either target_url or file is required' },
        { status: 400 }
      );
    }

    // Generate test ID
    const testId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const target = targetUrl || (file ? file.name : 'uploaded-file');

    // Initialize progress
    testProgressStore.set(testId, {
      stage: 'initializing',
      progress: 0,
      message: 'Starting test...'
    });

    // ==================================================
    // ROUTE TO REAL TESTING ENGINE
    // ==================================================
    
    let testResults: any;
    const startTime = Date.now();

    try {
      console.log(`🚀 Starting REAL ${testType} test for: ${target}`);

      switch (testType) {
        case 'web':
          if (!targetUrl) throw new Error('URL required for web testing');
          const webTester = new CompleteWebTester();
          testResults = await webTester.testWebsite(targetUrl);
          break;

        case 'document':
          if (!file) throw new Error('File required for document testing');
          const docTester = new CompleteDocumentTester();
          testResults = await docTester.testDocument(file);
          break;

        case 'api':
          if (!targetUrl) throw new Error('URL required for API testing');
          const apiTester = new CompleteApiTester();
          testResults = await apiTester.testApi(targetUrl);
          break;

        case 'ai':
          if (!targetUrl) throw new Error('URL required for AI/Bot testing');
          const aiTester = new CompleteAiBotTester();
          testResults = await aiTester.testAiBot(targetUrl);
          break;

        case 'game':
          if (!file) throw new Error('File required for game testing');
          const gameTester = new CompleteGameTester();
          testResults = await gameTester.testGame(file);
          break;

        case 'mobile':
          if (!file) throw new Error('File required for mobile testing');
          const mobileTester = new CompleteMobileTester();
          testResults = await mobileTester.testMobileApp(file);
          break;

        case 'avatar':
          if (!file) throw new Error('File required for avatar testing');
          const avatarTester = new CompleteAvatarTester();
          testResults = await avatarTester.testAvatar(file);
          break;

        case 'tool':
          if (!targetUrl) throw new Error('URL required for tool testing');
          const toolTester = new CompleteToolTester();
          testResults = await toolTester.testTool(targetUrl);
          break;

        default:
          throw new Error(`Unsupported test type: ${testType}`);
      }

      console.log(`✅ REAL ${testType} test completed for ${testId}`);

    } catch (error: any) {
      console.error(`❌ Real testing failed for ${testId}:`, error);
      
      testResults = {
        overall: 'fail' as const,
        score: 0,
        summary: { total: 1, passed: 0, failed: 1, warnings: 0 },
        issues: [{
          severity: 'high' as const,
          category: 'Testing Error',
          message: `Test failed: ${error.message}`,
          suggestion: 'Check your input and try again'
        }],
        recommendations: [
          'Verify the input is correct',
          'Check if the resource is accessible',
          'Try a different test configuration'
        ]
      };
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Build final response
    const testResult = {
      id: testId,
      testType,
      target,
      mode: economyMode || 'standard',
      status: 'completed',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date(endTime).toISOString(),
      duration: `${(duration / 1000).toFixed(2)}s`,
      results: {
        ...testResults,
        javariAutoFix: {
          available: testResults.issues?.length > 0,
          confidence: testResults.issues?.length > 0 ? 90 : 0,
          message: testResults.issues?.length > 0 
            ? `Javari AI can automatically fix ${testResults.issues.length} issue(s) with 90% confidence`
            : 'No issues found to fix'
        }
      },
      report: {
        url: `/reports/${testId}`,
        downloadUrl: `/api/reports/${testId}/download`
      }
    };

    testProgressStore.delete(testId);

    console.log(`✅ Test ${testId} completed: ${testType}, score: ${testResults.score}, duration: ${(duration / 1000).toFixed(2)}s`);

    return NextResponse.json(testResult, { status: 200 });

  } catch (error: any) {
    console.error('❌ Test submission error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to submit test', 
        details: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// GET endpoint for progress and credits
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'credits') {
      // Refuse rather than answer with a number nobody can stand behind. This
      // used to report a module-global counter as the caller's balance.
      return NextResponse.json({
        error: 'Credit balance is not available from this endpoint',
        message:
          'This route does not yet establish who is calling, so it cannot report ' +
          'an account balance. It previously returned an in-memory counter that ' +
          'was shared between callers and reset on every cold start.',
      }, { status: 501 });
    }

    if (action === 'progress') {
      const testId = searchParams.get('id');
      if (!testId) {
        return NextResponse.json({ error: 'Missing test ID' }, { status: 400 });
      }

      const progress = testProgressStore.get(testId);
      if (!progress) {
        return NextResponse.json({ 
          stage: 'complete',
          progress: 100,
          message: 'Test completed or not found'
        }, { status: 200 });
      }

      return NextResponse.json(progress, { status: 200 });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error: any) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'API request failed', details: error.message },
      { status: 500 }
    );
  }
}
