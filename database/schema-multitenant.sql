-- =====================================================
-- VERIFYFORGE AI - MULTI-TENANT DATABASE SCHEMA
-- Complete customer-ready platform with isolation
-- Generated: November 22, 2025 12:45 PM EST
-- =====================================================

-- ORGANIZATIONS (Multi-tenant root)
-- Each customer gets their own organization
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, -- URL-safe identifier (e.g., 'acme-corp')
  domain TEXT, -- Custom domain for white-label (e.g., 'testing.acme.com')
  
  -- Subscription & Billing
  subscription_tier TEXT NOT NULL DEFAULT 'free', -- free, pro, enterprise
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  billing_email TEXT,
  
  -- Usage Limits (based on tier)
  monthly_test_limit INTEGER NOT NULL DEFAULT 10, -- free: 10, pro: 100, enterprise: unlimited
  api_calls_limit INTEGER NOT NULL DEFAULT 0, -- free: 0, pro: 1000, enterprise: unlimited
  team_members_limit INTEGER NOT NULL DEFAULT 1, -- free: 1, pro: 10, enterprise: unlimited
  storage_limit_gb INTEGER NOT NULL DEFAULT 1, -- free: 1GB, pro: 50GB, enterprise: unlimited
  
  -- Current Usage (resets monthly)
  tests_used_this_month INTEGER NOT NULL DEFAULT 0,
  api_calls_used_this_month INTEGER NOT NULL DEFAULT 0,
  storage_used_gb DECIMAL(10,2) NOT NULL DEFAULT 0,
  usage_reset_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT date_trunc('month', NOW() + INTERVAL '1 month'),
  
  -- White-Label Customization
  logo_url TEXT, -- Customer's logo for reports
  primary_color TEXT DEFAULT '#3b82f6', -- Brand color
  report_footer_text TEXT, -- Custom footer for reports
  custom_email_domain TEXT, -- For email notifications
  
  -- Status & Timestamps
  status TEXT NOT NULL DEFAULT 'active', -- active, suspended, cancelled
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_tier CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
  CONSTRAINT valid_status CHECK (status IN ('active', 'trial', 'suspended', 'cancelled'))
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_status ON organizations(status);
CREATE INDEX idx_organizations_tier ON organizations(subscription_tier);

-- ORGANIZATION MEMBERS (Team Management)
-- Users can belong to multiple organizations with different roles
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  role TEXT NOT NULL DEFAULT 'member', -- owner, admin, member, viewer
  permissions JSONB NOT NULL DEFAULT '{"can_create_tests": true, "can_view_reports": true, "can_manage_team": false, "can_manage_billing": false}'::jsonb,
  
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  joined_at TIMESTAMP WITH TIME ZONE,
  
  status TEXT NOT NULL DEFAULT 'active', -- active, inactive, invited
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_role CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  CONSTRAINT valid_member_status CHECK (status IN ('active', 'inactive', 'invited')),
  CONSTRAINT unique_org_user UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_org_members_org ON organization_members(organization_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_org_members_role ON organization_members(role);

-- USAGE TRACKING
-- Detailed tracking of all resource usage per organization
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  
  resource_type TEXT NOT NULL, -- test, api_call, storage, report
  action TEXT NOT NULL, -- create, update, delete, execute
  quantity DECIMAL(10,4) NOT NULL DEFAULT 1, -- 1 for tests, bytes for storage
  
  metadata JSONB, -- Additional details about the action
  
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_resource CHECK (resource_type IN ('test', 'api_call', 'storage', 'report', 'export'))
);

CREATE INDEX idx_usage_org ON usage_logs(organization_id);
CREATE INDEX idx_usage_timestamp ON usage_logs(timestamp);
CREATE INDEX idx_usage_resource ON usage_logs(resource_type);

-- TEST SUBMISSIONS (Enhanced with Organization)
CREATE TABLE test_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- Test Configuration
  target_url TEXT,
  target_type TEXT NOT NULL, -- web, api, document, game, mobile, ai, avatar, tool
  test_engines JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of engines to run
  
  -- Customization
  custom_checks JSONB, -- Customer-defined test rules
  schedule_config JSONB, -- For recurring tests
  
  -- Economy Mode
  economy_mode BOOLEAN DEFAULT FALSE,
  estimated_cost DECIMAL(10,2),
  actual_cost DECIMAL(10,2),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed, cancelled
  priority INTEGER DEFAULT 5, -- 1-10, enterprise gets higher priority
  
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_target_type CHECK (target_type IN ('web', 'api', 'document', 'game', 'mobile', 'ai', 'avatar', 'tool')),
  CONSTRAINT valid_submission_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX idx_submissions_org ON test_submissions(organization_id);
CREATE INDEX idx_submissions_user ON test_submissions(user_id);
CREATE INDEX idx_submissions_status ON test_submissions(status);
CREATE INDEX idx_submissions_created ON test_submissions(created_at DESC);

-- TEST RESULTS (Enhanced with Organization)
CREATE TABLE test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES test_submissions(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  test_suite TEXT NOT NULL,
  test_name TEXT NOT NULL,
  status TEXT NOT NULL, -- passed, failed, warning, skipped
  
  severity TEXT, -- critical, high, medium, low, info
  category TEXT,
  
  message TEXT,
  details JSONB,
  
  execution_time_ms INTEGER,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_result_status CHECK (status IN ('passed', 'failed', 'warning', 'skipped')),
  CONSTRAINT valid_severity CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info', NULL))
);

CREATE INDEX idx_results_submission ON test_results(submission_id);
CREATE INDEX idx_results_org ON test_results(organization_id);
CREATE INDEX idx_results_status ON test_results(status);
CREATE INDEX idx_results_severity ON test_results(severity);

-- DISCOVERED ISSUES (Enhanced with Organization)
CREATE TABLE discovered_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES test_submissions(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL, -- critical, high, medium, low
  category TEXT NOT NULL,
  
  location TEXT, -- File, URL, line number, etc.
  code_snippet TEXT,
  
  -- Auto-Fix Status
  fix_status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, fixed, cannot_fix, ignored
  fix_confidence DECIMAL(5,2), -- 0-100 confidence score
  fix_applied BOOLEAN DEFAULT FALSE,
  fix_details JSONB,
  fixed_by TEXT, -- 'javari_ai', 'manual', 'external'
  fixed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_issue_severity CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  CONSTRAINT valid_fix_status CHECK (fix_status IN ('pending', 'in_progress', 'fixed', 'cannot_fix', 'ignored'))
);

CREATE INDEX idx_issues_submission ON discovered_issues(submission_id);
CREATE INDEX idx_issues_org ON discovered_issues(organization_id);
CREATE INDEX idx_issues_severity ON discovered_issues(severity);
CREATE INDEX idx_issues_fix_status ON discovered_issues(fix_status);

-- SCHEDULED TESTS (Enhanced with Organization)
CREATE TABLE scheduled_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  name TEXT NOT NULL,
  description TEXT,
  
  target_url TEXT,
  target_type TEXT NOT NULL,
  test_engines JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Schedule Configuration
  schedule_type TEXT NOT NULL, -- hourly, daily, weekly, monthly, custom
  cron_expression TEXT, -- For custom schedules
  timezone TEXT DEFAULT 'UTC',
  
  next_run_at TIMESTAMP WITH TIME ZONE,
  last_run_at TIMESTAMP WITH TIME ZONE,
  
  -- Notifications
  notify_on_failure BOOLEAN DEFAULT TRUE,
  notify_on_success BOOLEAN DEFAULT FALSE,
  notification_emails TEXT[], -- Array of email addresses
  
  status TEXT NOT NULL DEFAULT 'active', -- active, paused, deleted
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_schedule_type CHECK (schedule_type IN ('hourly', 'daily', 'weekly', 'monthly', 'custom')),
  CONSTRAINT valid_scheduled_status CHECK (status IN ('active', 'paused', 'deleted'))
);

CREATE INDEX idx_scheduled_org ON scheduled_tests(organization_id);
CREATE INDEX idx_scheduled_next_run ON scheduled_tests(next_run_at);
CREATE INDEX idx_scheduled_status ON scheduled_tests(status);

-- REPORT TEMPLATES (White-Label)
CREATE TABLE report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  name TEXT NOT NULL,
  description TEXT,
  
  -- Template Configuration
  format TEXT NOT NULL, -- pdf, docx, html, markdown
  include_logo BOOLEAN DEFAULT TRUE,
  include_summary BOOLEAN DEFAULT TRUE,
  include_detailed_results BOOLEAN DEFAULT TRUE,
  include_recommendations BOOLEAN DEFAULT TRUE,
  include_charts BOOLEAN DEFAULT TRUE,
  
  -- Custom Sections
  custom_header TEXT,
  custom_footer TEXT,
  custom_styles JSONB, -- CSS/styling overrides
  
  is_default BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_format CHECK (format IN ('pdf', 'docx', 'html', 'markdown', 'excel', 'csv', 'json', 'txt'))
);

CREATE INDEX idx_templates_org ON report_templates(organization_id);
CREATE INDEX idx_templates_default ON report_templates(is_default) WHERE is_default = TRUE;

-- API KEYS (For Developer Access)
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE, -- Hashed API key (never store plaintext)
  key_prefix TEXT NOT NULL, -- First 8 chars for identification (e.g., 'vf_test_12345678')
  
  -- Permissions
  scopes TEXT[] NOT NULL DEFAULT '{"tests:read", "tests:write"}'::TEXT[], -- Array of allowed actions
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
  rate_limit_per_day INTEGER NOT NULL DEFAULT 10000,
  
  -- Usage
  last_used_at TIMESTAMP WITH TIME ZONE,
  total_requests INTEGER DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active', -- active, revoked, expired
  expires_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_key_status CHECK (status IN ('active', 'revoked', 'expired'))
);

CREATE INDEX idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_status ON api_keys(status);

-- NOTIFICATIONS
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  
  type TEXT NOT NULL, -- test_completed, test_failed, limit_reached, subscription_expiring, team_invite
  title TEXT NOT NULL,
  message TEXT,
  
  -- Related Resources
  submission_id UUID REFERENCES test_submissions(id),
  related_data JSONB,
  
  -- Status
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_notification_type CHECK (type IN ('test_completed', 'test_failed', 'limit_reached', 'subscription_expiring', 'team_invite', 'usage_alert'))
);

CREATE INDEX idx_notifications_org ON notifications(organization_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read) WHERE read = FALSE;

-- AUDIT LOGS
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  
  action TEXT NOT NULL, -- create, update, delete, login, invite, etc.
  resource_type TEXT NOT NULL, -- test, member, template, api_key, etc.
  resource_id UUID,
  
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_org ON audit_logs(organization_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Ensures complete data isolation between organizations
-- =====================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovered_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Organizations: Users can only see their own organizations
CREATE POLICY org_isolation ON organizations
  FOR ALL
  USING (
    id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Organization Members: See members in your organizations only
CREATE POLICY member_isolation ON organization_members
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Test Submissions: Organization-scoped
CREATE POLICY submission_isolation ON test_submissions
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Test Results: Organization-scoped
CREATE POLICY results_isolation ON test_results
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Issues: Organization-scoped
CREATE POLICY issues_isolation ON discovered_issues
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Scheduled Tests: Organization-scoped
CREATE POLICY scheduled_isolation ON scheduled_tests
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Templates: Organization-scoped
CREATE POLICY templates_isolation ON report_templates
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- API Keys: Organization-scoped
CREATE POLICY apikeys_isolation ON api_keys
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Notifications: User-specific
CREATE POLICY notifications_isolation ON notifications
  FOR ALL
  USING (user_id = auth.uid());

-- Usage Logs: Organization-scoped
CREATE POLICY usage_isolation ON usage_logs
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Audit Logs: Organization-scoped
CREATE POLICY audit_isolation ON audit_logs
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Function: Reset monthly usage counters
CREATE OR REPLACE FUNCTION reset_monthly_usage()
RETURNS void AS $$
BEGIN
  UPDATE organizations
  SET 
    tests_used_this_month = 0,
    api_calls_used_this_month = 0,
    usage_reset_date = date_trunc('month', NOW() + INTERVAL '1 month')
  WHERE usage_reset_date <= NOW();
END;
$$ LANGUAGE plpgsql;

-- Function: Check if organization has reached limits
CREATE OR REPLACE FUNCTION check_usage_limits(org_id UUID, resource_type TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  org_record organizations%ROWTYPE;
BEGIN
  SELECT * INTO org_record FROM organizations WHERE id = org_id;
  
  IF resource_type = 'test' THEN
    IF org_record.subscription_tier = 'enterprise' THEN
      RETURN TRUE; -- Unlimited
    END IF;
    RETURN org_record.tests_used_this_month < org_record.monthly_test_limit;
  ELSIF resource_type = 'api_call' THEN
    IF org_record.subscription_tier = 'enterprise' THEN
      RETURN TRUE; -- Unlimited
    END IF;
    RETURN org_record.api_calls_used_this_month < org_record.api_calls_limit;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function: Increment usage counter
CREATE OR REPLACE FUNCTION increment_usage(org_id UUID, resource_type TEXT, quantity DECIMAL DEFAULT 1)
RETURNS void AS $$
BEGIN
  IF resource_type = 'test' THEN
    UPDATE organizations 
    SET tests_used_this_month = tests_used_this_month + quantity::INTEGER
    WHERE id = org_id;
  ELSIF resource_type = 'api_call' THEN
    UPDATE organizations 
    SET api_calls_used_this_month = api_calls_used_this_month + quantity::INTEGER
    WHERE id = org_id;
  ELSIF resource_type = 'storage' THEN
    UPDATE organizations 
    SET storage_used_gb = storage_used_gb + quantity
    WHERE id = org_id;
  END IF;
  
  -- Log the usage
  INSERT INTO usage_logs (organization_id, resource_type, action, quantity)
  VALUES (org_id, resource_type, 'increment', quantity);
END;
$$ LANGUAGE plpgsql;

-- Trigger: Update organization updated_at on changes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER org_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER member_updated_at
  BEFORE UPDATE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Trigger: Audit log on important actions
CREATE OR REPLACE FUNCTION log_audit_trail()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (organization_id, user_id, action, resource_type, resource_id, details)
  VALUES (
    COALESCE(NEW.organization_id, OLD.organization_id),
    auth.uid(),
    TG_OP, -- INSERT, UPDATE, DELETE
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply audit trigger to key tables
CREATE TRIGGER test_submissions_audit
  AFTER INSERT OR UPDATE OR DELETE ON test_submissions
  FOR EACH ROW
  EXECUTE FUNCTION log_audit_trail();

CREATE TRIGGER api_keys_audit
  AFTER INSERT OR UPDATE OR DELETE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION log_audit_trail();

-- =====================================================
-- INITIAL DATA: Pricing Tiers
-- =====================================================
COMMENT ON TABLE organizations IS 'Multi-tenant root: Each customer organization with subscription, limits, and white-label settings';
COMMENT ON TABLE organization_members IS 'Team management: Users can belong to multiple organizations with different roles';
COMMENT ON TABLE usage_logs IS 'Detailed usage tracking for billing and analytics';
COMMENT ON TABLE test_submissions IS 'All test requests with organization isolation';
COMMENT ON TABLE api_keys IS 'API keys for programmatic access with rate limiting';

-- =====================================================
-- PRICING TIER REFERENCE (For Application Logic)
-- =====================================================
/*
FREE TIER:
- 10 tests/month
- 0 API calls
- 1 team member
- 1GB storage
- No white-label
- Email support

PRO TIER ($49/month):
- 100 tests/month
- 1,000 API calls/month
- 10 team members
- 50GB storage
- White-label reports
- Priority email support
- Scheduled tests

ENTERPRISE TIER (Custom pricing):
- Unlimited tests
- Unlimited API calls
- Unlimited team members
- Unlimited storage
- Full white-label (custom domain)
- Dedicated support
- Custom integrations
- SLA guarantees
*/
