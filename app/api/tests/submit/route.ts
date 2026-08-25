// COMPLETE REAL TESTING API - ALL TEST TYPES
// app/api/tests/submit/route.ts
// Routes to appropriate testing engine based on test type

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/api/central';
import {
  claimFreeScan,
  releaseFreeScan,
  createEntitlementClient,
  supabaseEntitlementStore,
  type EntitlementStore,
} from '@/lib/entitlements';
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
  // No billable work without a verified caller. getUserFromRequest verifies the
  // Supabase JWT from the Authorization header and returns null on every failure
  // path — an absent header, a malformed token, a rejected token. It never
  // returns a stand-in user, so there is no anonymous identity to bill or to
  // attribute a scan to.
  const caller = await getUserFromRequest(req);
  if (caller === null) {
    return NextResponse.json(
      {
        error: 'Sign in required',
        message: 'This endpoint runs work against a target and must know who is asking. Sign in and retry.',
      },
      { status: 401 },
    );
  }

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

    // ==================================================
    // CLAIM THE FREE SCAN — BEFORE ANY WORK IS DISPATCHED
    // ==================================================
    //
    // The insert comes first and the primary-key collision IS the refusal, so a
    // duplicate request is rejected before a tester runs. Reading first and
    // recording afterwards would bound the bookkeeping and not the cost: ten
    // concurrent requests would all read "no row", all ten scans would run, and
    // nine inserts would collide after we had already paid for them.
    //
    // EVERY scan is the free one today. There is no paid tier to bypass this
    // check yet, so this is one scan per account, full stop. When the ladder
    // exists, a paid scan skips this block entirely — it is not free, so it does
    // not consume the free claim.
    const store: EntitlementStore = supabaseEntitlementStore(createEntitlementClient());
    const claim = await claimFreeScan(store, caller.id, testId, target);
    if (!claim.ok) {
      // 429, not 402. Payment Required would tell the caller to pay, and there
      // is nothing to pay for — no tier, no checkout, and /pricing is a 404.
      // Pointing at a purchase that does not exist is the fictional-balance
      // defect on the selling side.
      return NextResponse.json(
        {
          error: 'Free scan already used',
          message:
            'This account has already used its one free scan. Paid tiers are not '
            + 'available yet — when they are, this is where they will apply.',
          contact: 'royhenderson@craudiovizai.com',
        },
        { status: 429 },
      );
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

      // The scan failed, so the free scan was not delivered. Give the claim back
      // rather than charging the user for our failure. Scoped to this testId, so
      // it can only remove the claim this request made.
      //
      // Best effort, deliberately: if the release itself fails we log and carry
      // on, because the caller's problem is the failed scan and masking it with a
      // release error would help nobody. And it cannot reach a hard crash or a
      // platform timeout — those leave the claim consumed, which is a support
      // case, not something this handler can catch.
      try {
        await releaseFreeScan(store, caller.id, testId);
      } catch (releaseError: any) {
        console.error(`⚠️ Could not release the free-scan claim for ${testId}:`, releaseError);
      }

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
      // javariAutoFix REMOVED — it advertised a capability that does not exist.
      //
      // It reported `confidence: 90` as a hardcoded literal, with `available`
      // set to "this scan found at least one issue", and told the user "Javari
      // AI can automatically fix N issue(s) with 90% confidence". Nothing
      // measured that 90, and there is no autofix implementation for it to
      // describe — the `autoFixable` flags in lib/modules/checks are a separate,
      // real, per-issue property and are overwhelmingly false.
      //
      // The dashboard rendered it as a heading and an "Apply Fixes" button with
      // no onClick handler, so the button did nothing when pressed.
      //
      // This is the defect that paused production — a number the product cannot
      // back — still live on the endpoint being metered. It is removed rather
      // than corrected, because there is no correct value for the confidence of
      // a feature that does not exist. It comes back when autofix does.
      results: testResults,
      // `report` REMOVED — it advertised two routes that do not exist.
      //
      // url pointed at /reports/{id} and downloadUrl at
      // /api/reports/{id}/download. Neither route exists in app/, both 404, and
      // nothing consumed either field. Handing a caller a link to a report that
      // was never written is an unverifiable claim, the same class as the
      // fabricated autofix confidence removed above and the /pricing link the
      // 429 refuses to emit. They come back when the routes do.
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
    // The GET side is gated too. It was not, until writing the auth e2e made the
    // asymmetry obvious: ?action=progress returns the progress of a test by id,
    // and an id is guessable enough that leaving it open hands out other
    // people's run state to anyone who asks. The client already sends the token
    // here — authedFetch is used for both calls — so nothing legitimate breaks.
    const caller = await getUserFromRequest(req);
    if (caller === null) {
      return NextResponse.json(
        {
          error: 'Sign in required',
          message: 'This endpoint reports on work owned by an account and must know who is asking.',
        },
        { status: 401 },
      );
    }

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
