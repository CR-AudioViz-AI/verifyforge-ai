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

// Simple in-memory credit tracking
let userCredits = {
  freeTests: 3,
  paidCredits: 0
};

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

    // Check credits
    if (userCredits.freeTests <= 0 && userCredits.paidCredits <= 0) {
      return NextResponse.json(
        { 
          error: 'No credits remaining',
          message: 'You have used all your free tests. Please upgrade to continue.',
          freeTests: 0,
          paidCredits: 0
        },
        { status: 402 }
      );
    }

    // Generate test ID
    const testId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const target = targetUrl || (file ? file.name : 'uploaded-file');

    // Handle credits
    let creditsCharged = 0;
    let usedFreeTest = false;

    if (userCredits.freeTests > 0) {
      userCredits.freeTests--;
      creditsCharged = 0;
      usedFreeTest = true;
      console.log(`✅ FREE test used! Remaining: ${userCredits.freeTests}`);
    } else {
      const creditCosts: Record<string, number> = {
        web: 10, document: 8, game: 15, ai: 12,
        avatar: 10, tool: 8, api: 5, mobile: 12
      };
      const discounts: Record<string, number> = {
        standard: 0, economy: 40, ultra_economy: 60
      };
      const baseCredits = creditCosts[testType] || 10;
      const discount = discounts[economyMode] || 0;
      creditsCharged = Math.ceil(baseCredits * (1 - discount / 100));
      userCredits.paidCredits -= creditsCharged;
      console.log(`💳 Paid credits used: ${creditsCharged}. Remaining: ${userCredits.paidCredits}`);
    }

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
      creditsCharged,
      usedFreeTest,
      remainingFreeTests: userCredits.freeTests,
      remainingPaidCredits: userCredits.paidCredits,
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
      return NextResponse.json({
        freeTests: userCredits.freeTests,
        paidCredits: userCredits.paidCredits,
        total: userCredits.freeTests + userCredits.paidCredits
      }, { status: 200 });
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
