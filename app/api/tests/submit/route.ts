import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory credit tracking (in production, this would be in Supabase)
// For demo purposes, we'll track by session
let userCredits = {
  freeTests: 3,  // Everyone gets 3 FREE tests
  paidCredits: 0  // Paid credits (purchased separately)
};

export async function POST(req: NextRequest) {
  try {
    // Parse form data
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

    // Check if user has free tests remaining
    if (userCredits.freeTests <= 0 && userCredits.paidCredits <= 0) {
      return NextResponse.json(
        { 
          error: 'No credits remaining',
          message: 'You have used all your free tests. Please upgrade to continue.',
          freeTests: 0,
          paidCredits: 0
        },
        { status: 402 } // Payment Required
      );
    }

    // Generate test ID
    const testId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Determine target
    const target = targetUrl || (file ? file.name : 'uploaded-file');

    // CREDIT SYSTEM:
    // - First 3 tests are FREE (no credits charged)
    // - After that, paid credits are used based on test type and economy mode
    let creditsCharged = 0;
    let usedFreeTest = false;

    if (userCredits.freeTests > 0) {
      // Use a FREE test
      userCredits.freeTests--;
      creditsCharged = 0;
      usedFreeTest = true;
      console.log(`✅ FREE test used! Remaining free tests: ${userCredits.freeTests}`);
    } else {
      // Calculate paid credits
      const creditCosts: Record<string, number> = {
        web: 10,
        document: 8,
        game: 15,
        ai: 12,
        avatar: 10,
        tool: 8,
        api: 5,
        mobile: 12
      };

      const discounts: Record<string, number> = {
        standard: 0,
        economy: 40,
        ultra_economy: 60
      };

      const baseCredits = creditCosts[testType] || 10;
      const discount = discounts[economyMode] || 0;
      creditsCharged = Math.ceil(baseCredits * (1 - discount / 100));

      // Deduct from paid credits
      userCredits.paidCredits -= creditsCharged;
      console.log(`💳 Paid credits used: ${creditsCharged}. Remaining: ${userCredits.paidCredits}`);
    }

    // Simulate test execution
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
      startedAt: new Date().toISOString(),
      completedAt: new Date(Date.now() + 5000).toISOString(),
      results: {
        overall: 'pass',
        score: Math.floor(Math.random() * 20) + 80, // 80-100 score
        summary: {
          total: 50,
          passed: Math.floor(Math.random() * 5) + 45, // 45-50 passed
          failed: Math.floor(Math.random() * 3), // 0-3 failed
          warnings: Math.floor(Math.random() * 5) // 0-5 warnings
        },
        issues: [
          {
            severity: 'medium',
            category: 'Performance',
            message: 'Page load time could be optimized',
            suggestion: 'Consider implementing lazy loading for images and code splitting'
          },
          {
            severity: 'low',
            category: 'Accessibility',
            message: 'Some images missing alt text',
            suggestion: 'Add descriptive alt text to all images for better accessibility'
          },
          {
            severity: 'low',
            category: 'SEO',
            message: 'Meta descriptions could be more descriptive',
            suggestion: 'Write unique, compelling meta descriptions for each page'
          }
        ],
        recommendations: [
          'Enable browser caching for static assets',
          'Optimize images for web delivery',
          'Implement CDN for faster content delivery',
          'Consider adding structured data for better SEO'
        ],
        javariAutoFix: {
          available: true,
          confidence: 92,
          message: 'Javari AI can automatically fix 2 of 3 issues with 92% confidence'
        }
      },
      report: {
        url: `/reports/${testId}`,
        downloadUrl: `/api/reports/${testId}/download`
      }
    };

    // Log successful test submission
    console.log(`✅ Test ${testId} submitted successfully:`, {
      testType,
      target,
      economyMode,
      creditsCharged,
      usedFreeTest,
      remainingFreeTests: userCredits.freeTests,
      remainingPaidCredits: userCredits.paidCredits
    });

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

// GET endpoint to check remaining credits
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'credits') {
      // Return current credit balance
      return NextResponse.json({
        freeTests: userCredits.freeTests,
        paidCredits: userCredits.paidCredits,
        total: userCredits.freeTests + userCredits.paidCredits
      }, { status: 200 });
    }

    // Default: retrieve test by ID
    const testId = searchParams.get('id');
    if (!testId) {
      return NextResponse.json(
        { error: 'Missing test ID' },
        { status: 400 }
      );
    }

    // In production, this would fetch from Supabase
    const testResult = {
      id: testId,
      status: 'completed',
      completedAt: new Date().toISOString(),
      results: {
        overall: 'pass',
        score: 87,
        summary: {
          total: 50,
          passed: 47,
          failed: 1,
          warnings: 2
        }
      }
    };

    return NextResponse.json(testResult, { status: 200 });

  } catch (error: any) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'API request failed', details: error.message },
      { status: 500 }
    );
  }
}
