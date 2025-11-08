import { getErrorMessage, logError } from '@/lib/error-handler';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { testType, target, mode } = body;

    // Validate input
    if (!testType || !target) {
      return NextResponse.json(
        { error: 'Missing required fields: testType and target' },
        { status: 400 }
      );
    }

    // Generate test ID
    const testId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // For now, simulate test initiation
    // In production, this would trigger actual test execution
    const testResult = {
      id: testId,
      testType,
      target,
      mode: mode || 'standard',
      status: 'running',
      startedAt: new Date().toISOString(),
      estimatedCompletionTime: new Date(Date.now() + 120000).toISOString(), // 2 minutes
      message: 'Test initiated successfully. Processing...'
    };

    // Simulate test processing with a quick response
    // In production, this would be an async job
    setTimeout(() => {
      console.log(`Test ${testId} completed`);
    }, 5000);

    return NextResponse.json(testResult, { status: 200 });

  } catch (error: unknown) {
    console.error('Test submission error:', error);
    return NextResponse.json(
      { error: 'Failed to submit test', details: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    // Get test ID from query params
    const { searchParams } = new URL(req.url);
    const testId = searchParams.get('id');

    if (!testId) {
      return NextResponse.json(
        { error: 'Missing test ID' },
        { status: 400 }
      );
    }

    // For now, return a mock completed test
    const testResult = {
      id: testId,
      status: 'completed',
      completedAt: new Date().toISOString(),
      results: {
        overall: 'pass',
        score: 85,
        issues: [
          {
            severity: 'medium',
            category: 'Performance',
            message: 'Page load time could be optimized',
            suggestion: 'Consider implementing lazy loading for images'
          },
          {
            severity: 'low',
            category: 'SEO',
            message: 'Missing meta description on some pages',
            suggestion: 'Add unique meta descriptions to improve SEO'
          }
        ],
        summary: {
          total: 50,
          passed: 45,
          failed: 3,
          warnings: 2
        }
      }
    };

    return NextResponse.json(testResult, { status: 200 });

  } catch (error: unknown) {
    console.error('Test retrieval error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve test', details: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
