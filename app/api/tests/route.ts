// =====================================================
// VERIFYFORGE AI - MULTI-TENANT TEST API
// Test submission with organization context and limits
// Generated: November 22, 2025 12:57 PM EST
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { withUsageLimit } from '@/lib/organization-middleware';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// =====================================================
// POST /api/tests - Submit New Test
// =====================================================

export const POST = withUsageLimit('test', async (req, org, member) => {
  try {
    // Check if user has permission to create tests
    if (!member.permissions.can_create_tests) {
      return NextResponse.json(
        { error: 'You do not have permission to create tests' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      target_url,
      target_type,
      test_engines = [],
      economy_mode = false,
      custom_checks = null,
    } = body;

    // Validate required fields
    if (!target_type) {
      return NextResponse.json(
        { error: 'target_type is required' },
        { status: 400 }
      );
    }

    const validTypes = ['web', 'api', 'document', 'game', 'mobile', 'ai', 'avatar', 'tool'];
    if (!validTypes.includes(target_type)) {
      return NextResponse.json(
        { error: `Invalid target_type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Create database client
    const supabase = createClientComponentClient();

    // Create test submission
    const { data: submission, error: submissionError } = await supabase
      .from('test_submissions')
      .insert({
        organization_id: org.id,
        user_id: member.user_id,
        target_url,
        target_type,
        test_engines,
        economy_mode,
        custom_checks,
        status: 'pending',
        priority: org.subscription_tier === 'enterprise' ? 8 : org.subscription_tier === 'pro' ? 5 : 3,
      })
      .select()
      .single();

    if (submissionError) {
      console.error('Error creating submission:', submissionError);
      return NextResponse.json(
        { error: 'Failed to create test submission' },
        { status: 500 }
      );
    }

    // Queue test execution (would integrate with actual test runners)
    // await queueTestExecution(submission.id);

    // Create audit log
    await supabase.from('audit_logs').insert({
      organization_id: org.id,
      user_id: member.user_id,
      action: 'create',
      resource_type: 'test_submission',
      resource_id: submission.id,
      details: { target_type, economy_mode },
    });

    return NextResponse.json({
      success: true,
      submission,
      message: 'Test submitted successfully',
    });
  } catch (error) {
    console.error('Error in POST /api/tests:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

// =====================================================
// GET /api/tests - List Tests
// =====================================================

export async function GET(req: NextRequest) {
  // TODO: Implement with withOrganization middleware
  return NextResponse.json({ message: 'List tests endpoint' });
}
