// =====================================================
// VERIFYFORGE AI - MULTI-TENANT MIDDLEWARE
// Organization context, usage tracking, and limit enforcement
// Generated: November 22, 2025 12:48 PM EST
// =====================================================

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role for admin operations
);

// =====================================================
// TYPES
// =====================================================

export interface Organization {
  id: string;
  name: string;
  slug: string;
  subscription_tier: 'free' | 'pro' | 'enterprise';
  monthly_test_limit: number;
  api_calls_limit: number;
  tests_used_this_month: number;
  api_calls_used_this_month: number;
  status: 'active' | 'trial' | 'suspended' | 'cancelled';
  logo_url?: string;
  primary_color?: string;
  report_footer_text?: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  permissions: {
    can_create_tests: boolean;
    can_view_reports: boolean;
    can_manage_team: boolean;
    can_manage_billing: boolean;
  };
  status: 'active' | 'inactive' | 'invited';
}

export interface UsageLimits {
  canCreateTest: boolean;
  canMakeApiCall: boolean;
  remainingTests: number;
  remainingApiCalls: number;
  testsUsed: number;
  testsLimit: number;
  apiCallsUsed: number;
  apiCallsLimit: number;
}

// =====================================================
// ORGANIZATION CONTEXT
// =====================================================

/**
 * Get the current organization context from request
 * Checks headers for organization slug or ID
 */
export async function getOrganizationContext(
  userId: string,
  orgSlugOrId?: string
): Promise<Organization | null> {
  try {
    let query = supabase
      .from('organizations')
      .select('*')
      .eq('status', 'active');

    if (orgSlugOrId) {
      // Check if it's a UUID (ID) or slug
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgSlugOrId);
      
      if (isUUID) {
        query = query.eq('id', orgSlugOrId);
      } else {
        query = query.eq('slug', orgSlugOrId);
      }
    }

    const { data: orgs, error } = await query;

    if (error || !orgs || orgs.length === 0) {
      return null;
    }

    // Verify user has access to this organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('*')
      .eq('organization_id', orgs[0].id)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (!membership) {
      return null; // User doesn't have access
    }

    return orgs[0] as Organization;
  } catch (error) {
    console.error('Error getting organization context:', error);
    return null;
  }
}

/**
 * Get all organizations a user belongs to
 */
export async function getUserOrganizations(userId: string): Promise<Organization[]> {
  try {
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (!memberships || memberships.length === 0) {
      return [];
    }

    const orgIds = memberships.map(m => m.organization_id);

    const { data: orgs } = await supabase
      .from('organizations')
      .select('*')
      .in('id', orgIds)
      .eq('status', 'active');

    return (orgs as Organization[]) || [];
  } catch (error) {
    console.error('Error getting user organizations:', error);
    return [];
  }
}

/**
 * Get user's role and permissions in an organization
 */
export async function getUserPermissions(
  userId: string,
  organizationId: string
): Promise<OrganizationMember | null> {
  try {
    const { data: member, error } = await supabase
      .from('organization_members')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (error || !member) {
      return null;
    }

    return member as OrganizationMember;
  } catch (error) {
    console.error('Error getting user permissions:', error);
    return null;
  }
}

// =====================================================
// USAGE TRACKING & LIMITS
// =====================================================

/**
 * Check if organization can perform an action based on usage limits
 */
export async function checkUsageLimits(
  organizationId: string
): Promise<UsageLimits> {
  try {
    const { data: org, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', organizationId)
      .single();

    if (error || !org) {
      return {
        canCreateTest: false,
        canMakeApiCall: false,
        remainingTests: 0,
        remainingApiCalls: 0,
        testsUsed: 0,
        testsLimit: 0,
        apiCallsUsed: 0,
        apiCallsLimit: 0,
      };
    }

    const isEnterprise = org.subscription_tier === 'enterprise';

    return {
      canCreateTest: isEnterprise || org.tests_used_this_month < org.monthly_test_limit,
      canMakeApiCall: isEnterprise || org.api_calls_used_this_month < org.api_calls_limit,
      remainingTests: isEnterprise ? -1 : org.monthly_test_limit - org.tests_used_this_month,
      remainingApiCalls: isEnterprise ? -1 : org.api_calls_limit - org.api_calls_used_this_month,
      testsUsed: org.tests_used_this_month,
      testsLimit: org.monthly_test_limit,
      apiCallsUsed: org.api_calls_used_this_month,
      apiCallsLimit: org.api_calls_limit,
    };
  } catch (error) {
    console.error('Error checking usage limits:', error);
    return {
      canCreateTest: false,
      canMakeApiCall: false,
      remainingTests: 0,
      remainingApiCalls: 0,
      testsUsed: 0,
      testsLimit: 0,
      apiCallsUsed: 0,
      apiCallsLimit: 0,
    };
  }
}

/**
 * Increment usage counter for an organization
 */
export async function incrementUsage(
  organizationId: string,
  resourceType: 'test' | 'api_call' | 'storage',
  quantity: number = 1,
  userId?: string
): Promise<boolean> {
  try {
    // Call the database function to increment usage
    const { error: funcError } = await supabase.rpc('increment_usage', {
      org_id: organizationId,
      resource_type: resourceType,
      quantity,
    });

    if (funcError) {
      console.error('Error incrementing usage:', funcError);
      return false;
    }

    // Check if we've hit limits and need to send notification
    const limits = await checkUsageLimits(organizationId);
    
    if (resourceType === 'test' && limits.remainingTests <= 5 && limits.remainingTests >= 0) {
      await sendLimitWarning(organizationId, 'test', limits.remainingTests);
    }
    
    if (resourceType === 'api_call' && limits.remainingApiCalls <= 100 && limits.remainingApiCalls >= 0) {
      await sendLimitWarning(organizationId, 'api_call', limits.remainingApiCalls);
    }

    return true;
  } catch (error) {
    console.error('Error incrementing usage:', error);
    return false;
  }
}

/**
 * Send notification when approaching usage limits
 */
async function sendLimitWarning(
  organizationId: string,
  resourceType: 'test' | 'api_call',
  remaining: number
): Promise<void> {
  try {
    // Get organization owners/admins
    const { data: admins } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', organizationId)
      .in('role', ['owner', 'admin'])
      .eq('status', 'active');

    if (!admins || admins.length === 0) return;

    const resourceName = resourceType === 'test' ? 'tests' : 'API calls';
    
    // Create notifications for each admin
    const notifications = admins.map(admin => ({
      organization_id: organizationId,
      user_id: admin.user_id,
      type: 'usage_alert',
      title: `${remaining} ${resourceName} remaining`,
      message: `You're approaching your monthly limit. Consider upgrading to continue testing.`,
    }));

    await supabase
      .from('notifications')
      .insert(notifications);
  } catch (error) {
    console.error('Error sending limit warning:', error);
  }
}

/**
 * Reset monthly usage counters (called via cron)
 */
export async function resetMonthlyUsage(): Promise<void> {
  try {
    const { error } = await supabase.rpc('reset_monthly_usage');
    
    if (error) {
      console.error('Error resetting monthly usage:', error);
    }
  } catch (error) {
    console.error('Error in resetMonthlyUsage:', error);
  }
}

// =====================================================
// ORGANIZATION MANAGEMENT
// =====================================================

/**
 * Create a new organization (when user signs up)
 */
export async function createOrganization(
  userId: string,
  name: string,
  slug?: string
): Promise<Organization | null> {
  try {
    // Generate slug from name if not provided
    const orgSlug = slug || name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Create organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name,
        slug: orgSlug,
        subscription_tier: 'free',
        monthly_test_limit: 10,
        api_calls_limit: 0,
        team_members_limit: 1,
        storage_limit_gb: 1,
        status: 'trial',
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days trial
      })
      .select()
      .single();

    if (orgError || !org) {
      console.error('Error creating organization:', orgError);
      return null;
    }

    // Add user as owner
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: org.id,
        user_id: userId,
        role: 'owner',
        permissions: {
          can_create_tests: true,
          can_view_reports: true,
          can_manage_team: true,
          can_manage_billing: true,
        },
        status: 'active',
        joined_at: new Date().toISOString(),
      });

    if (memberError) {
      console.error('Error adding organization owner:', memberError);
      // Rollback: delete the organization
      await supabase.from('organizations').delete().eq('id', org.id);
      return null;
    }

    return org as Organization;
  } catch (error) {
    console.error('Error in createOrganization:', error);
    return null;
  }
}

/**
 * Update organization subscription tier
 */
export async function updateSubscriptionTier(
  organizationId: string,
  tier: 'free' | 'pro' | 'enterprise',
  stripeCustomerId?: string,
  stripeSubscriptionId?: string
): Promise<boolean> {
  try {
    const limits = {
      free: { tests: 10, api: 0, members: 1, storage: 1 },
      pro: { tests: 100, api: 1000, members: 10, storage: 50 },
      enterprise: { tests: 999999, api: 999999, members: 999999, storage: 999999 },
    };

    const tierLimits = limits[tier];

    const { error } = await supabase
      .from('organizations')
      .update({
        subscription_tier: tier,
        monthly_test_limit: tierLimits.tests,
        api_calls_limit: tierLimits.api,
        team_members_limit: tierLimits.members,
        storage_limit_gb: tierLimits.storage,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', organizationId);

    return !error;
  } catch (error) {
    console.error('Error updating subscription tier:', error);
    return false;
  }
}

/**
 * Invite a team member to an organization
 */
export async function inviteTeamMember(
  organizationId: string,
  invitedByUserId: string,
  email: string,
  role: 'admin' | 'member' | 'viewer' = 'member'
): Promise<boolean> {
  try {
    // Check if inviter has permission
    const inviter = await getUserPermissions(invitedByUserId, organizationId);
    if (!inviter || !inviter.permissions.can_manage_team) {
      return false;
    }

    // Check team size limit
    const { data: org } = await supabase
      .from('organizations')
      .select('team_members_limit')
      .eq('id', organizationId)
      .single();

    const { count: currentMembers } = await supabase
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'active');

    if (currentMembers && org && currentMembers >= org.team_members_limit) {
      return false; // Team size limit reached
    }

    // TODO: Send invitation email
    // For now, just create a pending invitation record
    
    const permissions = {
      can_create_tests: true,
      can_view_reports: true,
      can_manage_team: role === 'admin',
      can_manage_billing: role === 'admin',
    };

    const { error } = await supabase
      .from('organization_members')
      .insert({
        organization_id: organizationId,
        user_id: null, // Will be set when they accept
        role,
        permissions,
        invited_by: invitedByUserId,
        status: 'invited',
      });

    return !error;
  } catch (error) {
    console.error('Error inviting team member:', error);
    return false;
  }
}

// =====================================================
// MIDDLEWARE FOR NEXT.JS API ROUTES
// =====================================================

/**
 * Middleware to enforce organization context and permissions
 */
export function withOrganization(
  handler: (req: NextRequest, org: Organization, member: OrganizationMember) => Promise<Response>
) {
  return async (req: NextRequest): Promise<Response> => {
    try {
      // Get user from session (Supabase Auth)
      const authHeader = req.headers.get('authorization');
      if (!authHeader) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return NextResponse.json(
          { error: 'Invalid authentication token' },
          { status: 401 }
        );
      }

      // Get organization from header or query
      const orgSlug = req.headers.get('x-organization') || 
                     new URL(req.url).searchParams.get('organization');

      if (!orgSlug) {
        return NextResponse.json(
          { error: 'Organization not specified' },
          { status: 400 }
        );
      }

      // Get organization context
      const org = await getOrganizationContext(user.id, orgSlug);
      if (!org) {
        return NextResponse.json(
          { error: 'Organization not found or access denied' },
          { status: 403 }
        );
      }

      // Get user permissions
      const member = await getUserPermissions(user.id, org.id);
      if (!member) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }

      // Call the handler with organization context
      return await handler(req, org, member);
    } catch (error) {
      console.error('Middleware error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

/**
 * Middleware to check usage limits before allowing action
 */
export function withUsageLimit(
  resourceType: 'test' | 'api_call',
  handler: (req: NextRequest, org: Organization, member: OrganizationMember) => Promise<Response>
) {
  return withOrganization(async (req, org, member) => {
    // Check usage limits
    const limits = await checkUsageLimits(org.id);

    if (resourceType === 'test' && !limits.canCreateTest) {
      return NextResponse.json(
        { 
          error: 'Monthly test limit reached',
          limit: limits.testsLimit,
          used: limits.testsUsed,
          upgrade_required: true,
        },
        { status: 429 }
      );
    }

    if (resourceType === 'api_call' && !limits.canMakeApiCall) {
      return NextResponse.json(
        { 
          error: 'Monthly API call limit reached',
          limit: limits.apiCallsLimit,
          used: limits.apiCallsUsed,
          upgrade_required: true,
        },
        { status: 429 }
      );
    }

    // Increment usage counter
    await incrementUsage(org.id, resourceType, 1, member.user_id);

    // Call the handler
    return await handler(req, org, member);
  });
}

export default {
  getOrganizationContext,
  getUserOrganizations,
  getUserPermissions,
  checkUsageLimits,
  incrementUsage,
  resetMonthlyUsage,
  createOrganization,
  updateSubscriptionTier,
  inviteTeamMember,
  withOrganization,
  withUsageLimit,
};
