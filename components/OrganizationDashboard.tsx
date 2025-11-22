'use client';

// =====================================================
// VERIFYFORGE AI - ORGANIZATION DASHBOARD
// Multi-tenant dashboard with usage, team, and settings
// Generated: November 22, 2025 12:55 PM EST
// =====================================================

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// =====================================================
// TYPES
// =====================================================

interface Organization {
  id: string;
  name: string;
  slug: string;
  subscription_tier: 'free' | 'pro' | 'enterprise';
  monthly_test_limit: number;
  tests_used_this_month: number;
  api_calls_limit: number;
  api_calls_used_this_month: number;
  storage_limit_gb: number;
  storage_used_gb: number;
  team_members_limit: number;
  status: string;
  trial_ends_at?: string;
  logo_url?: string;
  primary_color?: string;
}

interface UsageStats {
  testsUsed: number;
  testsLimit: number;
  testsPercentage: number;
  apiCallsUsed: number;
  apiCallsLimit: number;
  apiCallsPercentage: number;
  storageUsed: number;
  storageLimit: number;
  storagePercentage: number;
}

interface TeamMember {
  id: string;
  user_id: string;
  role: string;
  status: string;
  email?: string;
  joined_at: string;
}

// =====================================================
// MAIN DASHBOARD COMPONENT
// =====================================================

export default function OrganizationDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'usage' | 'team' | 'settings'>('overview');
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadOrganization();
  }, []);

  async function loadOrganization() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's organizations
      const { data: memberships } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (!memberships) return;

      // Get organization details
      const { data: org } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', memberships.organization_id)
        .single();

      setOrganization(org);
    } catch (error) {
      console.error('Error loading organization:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No Organization Found</h2>
          <p className="text-gray-600">Please contact support to set up your organization.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {organization.logo_url && (
                <img 
                  src={organization.logo_url} 
                  alt={organization.name}
                  className="h-10 w-10 rounded-lg object-cover"
                />
              )}
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{organization.name}</h1>
                <p className="text-sm text-gray-500">
                  {organization.subscription_tier.toUpperCase()} Plan
                  {organization.trial_ends_at && ` • Trial ends ${new Date(organization.trial_ends_at).toLocaleDateString()}`}
                </p>
              </div>
            </div>
            
            {/* Upgrade Button for Non-Enterprise */}
            {organization.subscription_tier !== 'enterprise' && (
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                onClick={() => setActiveTab('settings')}
              >
                Upgrade Plan
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {['overview', 'usage', 'team', 'settings'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && <OverviewTab organization={organization} />}
        {activeTab === 'usage' && <UsageTab organization={organization} />}
        {activeTab === 'team' && <TeamTab organization={organization} />}
        {activeTab === 'settings' && <SettingsTab organization={organization} />}
      </main>
    </div>
  );
}

// =====================================================
// OVERVIEW TAB
// =====================================================

function OverviewTab({ organization }: { organization: Organization }) {
  const [recentTests, setRecentTests] = useState<any[]>([]);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadRecentTests();
  }, []);

  async function loadRecentTests() {
    const { data } = await supabase
      .from('test_submissions')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
      .limit(5);

    setRecentTests(data || []);
  }

  const usagePercentage = Math.round((organization.tests_used_this_month / organization.monthly_test_limit) * 100);
  const isUnlimited = organization.subscription_tier === 'enterprise';

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          title="Tests This Month"
          value={organization.tests_used_this_month}
          subtitle={isUnlimited ? 'Unlimited' : `of ${organization.monthly_test_limit}`}
          percentage={isUnlimited ? null : usagePercentage}
          color="blue"
        />
        <StatCard
          title="API Calls"
          value={organization.api_calls_used_this_month}
          subtitle={isUnlimited ? 'Unlimited' : `of ${organization.api_calls_limit}`}
          percentage={isUnlimited ? null : Math.round((organization.api_calls_used_this_month / organization.api_calls_limit) * 100)}
          color="green"
        />
        <StatCard
          title="Storage Used"
          value={`${organization.storage_used_gb}GB`}
          subtitle={isUnlimited ? 'Unlimited' : `of ${organization.storage_limit_gb}GB`}
          percentage={isUnlimited ? null : Math.round((organization.storage_used_gb / organization.storage_limit_gb) * 100)}
          color="purple"
        />
        <StatCard
          title="Plan Status"
          value={organization.subscription_tier.toUpperCase()}
          subtitle={organization.status}
          color="orange"
        />
      </div>

      {/* Recent Tests */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Tests</h2>
        {recentTests.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No tests run yet. Start your first test!</p>
        ) : (
          <div className="space-y-3">
            {recentTests.map((test) => (
              <div key={test.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div>
                  <p className="font-medium text-gray-900">{test.target_url || 'Unnamed Test'}</p>
                  <p className="text-sm text-gray-500">{test.target_type} • {new Date(test.created_at).toLocaleString()}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  test.status === 'completed' ? 'bg-green-100 text-green-800' :
                  test.status === 'running' ? 'bg-blue-100 text-blue-800' :
                  test.status === 'failed' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {test.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <QuickActionCard
          icon="🚀"
          title="Run New Test"
          description="Start testing your application"
          action="New Test"
        />
        <QuickActionCard
          icon="📊"
          title="View Reports"
          description="Browse all test reports"
          action="Reports"
        />
        <QuickActionCard
          icon="⚙️"
          title="Schedule Tests"
          description="Automate your testing"
          action="Schedule"
        />
      </div>
    </div>
  );
}

// =====================================================
// USAGE TAB
// =====================================================

function UsageTab({ organization }: { organization: Organization }) {
  const [usageHistory, setUsageHistory] = useState<any[]>([]);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadUsageHistory();
  }, []);

  async function loadUsageHistory() {
    const { data } = await supabase
      .from('usage_logs')
      .select('*')
      .eq('organization_id', organization.id)
      .order('timestamp', { ascending: false })
      .limit(50);

    setUsageHistory(data || []);
  }

  const isUnlimited = organization.subscription_tier === 'enterprise';

  return (
    <div className="space-y-6">
      {/* Usage Progress Bars */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Current Usage</h2>
        
        <div className="space-y-6">
          <UsageBar
            label="Tests"
            used={organization.tests_used_this_month}
            limit={organization.monthly_test_limit}
            unlimited={isUnlimited}
            color="blue"
          />
          <UsageBar
            label="API Calls"
            used={organization.api_calls_used_this_month}
            limit={organization.api_calls_limit}
            unlimited={isUnlimited}
            color="green"
          />
          <UsageBar
            label="Storage"
            used={organization.storage_used_gb}
            limit={organization.storage_limit_gb}
            unlimited={isUnlimited}
            color="purple"
            unit="GB"
          />
        </div>

        {!isUnlimited && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              💡 <strong>Tip:</strong> Upgrade to Pro or Enterprise for higher limits and more features.
            </p>
          </div>
        )}
      </div>

      {/* Usage History */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Usage History</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Resource
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantity
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {usageHistory.map((log) => (
                <tr key={log.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {log.resource_type}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {log.action}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {log.quantity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// TEAM TAB
// =====================================================

function TeamTab({ organization }: { organization: Organization }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadTeamMembers();
  }, []);

  async function loadTeamMembers() {
    const { data } = await supabase
      .from('organization_members')
      .select('*, users:user_id(email)')
      .eq('organization_id', organization.id);

    setMembers(data as any || []);
  }

  async function inviteMember() {
    // TODO: Implement invitation logic
    alert('Invitation feature coming soon!');
  }

  const canInvite = members.length < organization.team_members_limit || organization.subscription_tier === 'enterprise';

  return (
    <div className="space-y-6">
      {/* Team Overview */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
            <p className="text-sm text-gray-500">
              {members.length} {organization.subscription_tier === 'enterprise' ? 'members' : `of ${organization.team_members_limit} seats used`}
            </p>
          </div>
          {canInvite && (
            <button
              onClick={() => document.getElementById('invite-modal')?.classList.remove('hidden')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Invite Member
            </button>
          )}
        </div>

        {/* Members List */}
        <div className="space-y-3">
          {members.map((member) => (
            <div key={member.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                  {(member.email || 'U')[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{member.email || 'Unknown User'}</p>
                  <p className="text-sm text-gray-500">{member.role} • {member.status}</p>
                </div>
              </div>
              <span className="text-sm text-gray-500">
                Joined {new Date(member.joined_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>

        {!canInvite && (
          <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
            <p className="text-sm text-yellow-800">
              ⚠️ You've reached your team size limit. Upgrade your plan to invite more members.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================
// SETTINGS TAB
// =====================================================

function SettingsTab({ organization }: { organization: Organization }) {
  const [name, setName] = useState(organization.name);
  const [logoUrl, setLogoUrl] = useState(organization.logo_url || '');
  const [primaryColor, setPrimaryColor] = useState(organization.primary_color || '#3b82f6');
  const [saving, setSaving] = useState(false);
  const supabase = createClientComponentClient();

  async function saveSettings() {
    setSaving(true);
    try {
      await supabase
        .from('organizations')
        .update({
          name,
          logo_url: logoUrl,
          primary_color: primaryColor,
        })
        .eq('id', organization.id);

      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Organization Details */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Organization Settings</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Organization Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Logo URL</label>
            <input
              type="text"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Primary Color</label>
            <div className="flex items-center space-x-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-20 rounded border border-gray-300 cursor-pointer"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
            </div>
          </div>

          <button
            onClick={saveSettings}
            disabled={saving}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Subscription Management */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Subscription & Billing</h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Current Plan</p>
              <p className="text-sm text-gray-500">{organization.subscription_tier.toUpperCase()}</p>
            </div>
            {organization.subscription_tier !== 'enterprise' && (
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                Upgrade
              </button>
            )}
          </div>

          {organization.trial_ends_at && (
            <div className="p-4 bg-yellow-50 rounded-lg">
              <p className="text-sm text-yellow-800">
                ⏰ Your trial ends on {new Date(organization.trial_ends_at).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================
// HELPER COMPONENTS
// =====================================================

function StatCard({ title, value, subtitle, percentage, color }: any) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-sm font-medium text-gray-500 mb-2">{title}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
      {percentage !== null && percentage !== undefined && (
        <div className="mt-3">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${colorClasses[color as keyof typeof colorClasses]}`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            ></div>
          </div>
          <p className="text-xs text-gray-500 mt-1">{percentage}% used</p>
        </div>
      )}
    </div>
  );
}

function QuickActionCard({ icon, title, description, action }: any) {
  return (
    <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow cursor-pointer">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 mb-4">{description}</p>
      <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
        {action} →
      </button>
    </div>
  );
}

function UsageBar({ label, used, limit, unlimited, color, unit = '' }: any) {
  const percentage = unlimited ? 0 : Math.round((used / limit) * 100);
  
  const colorClasses = {
    blue: 'bg-blue-600',
    green: 'bg-green-600',
    purple: 'bg-purple-600',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm text-gray-500">
          {used}{unit} {unlimited ? '(Unlimited)' : `/ ${limit}${unit}`}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className={`h-3 rounded-full ${colorClasses[color as keyof typeof colorClasses]}`}
          style={{ width: unlimited ? '100%' : `${Math.min(percentage, 100)}%` }}
        ></div>
      </div>
    </div>
  );
}
