/**
 * VerifyForge AI - Analytics Dashboard with Interactive Charts
 * 
 * Features:
 * - Line charts for quality trends over time
 * - Bar charts for test type distribution
 * - Pie charts for issue severity breakdown
 * - Area charts for credit usage
 * - Interactive tooltips and legends
 * - Responsive design
 * 
 * @version 2.0.0
 * @date 2025-11-01
 */

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ============================================================================
// TYPES
// ============================================================================

interface AnalyticsData {
  qualityTrend: QualityTrendPoint[];
  testTypeDistribution: TestTypeData[];
  issueBreakdown: IssueData[];
  creditUsage: CreditUsagePoint[];
  summary: AnalyticsSummary;
}

interface QualityTrendPoint {
  date: string;
  qualityScore: number;
  testsRun: number;
  issuesFound: number;
}

interface TestTypeData {
  name: string;
  count: number;
  credits: number;
}

interface IssueData {
  severity: string;
  count: number;
}

interface CreditUsagePoint {
  date: string;
  credits: number;
  cost: number;
}

interface AnalyticsSummary {
  totalTests: number;
  avgQualityScore: number;
  totalIssues: number;
  totalCredits: number;
  period: string;
}

// ============================================================================
// CHART COLORS
// ============================================================================

const COLORS = {
  primary: '#6366f1',
  secondary: '#8b5cf6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  gray: '#6b7280',
};

const SEVERITY_COLORS = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#eab308',
  low: '#84cc16',
};

const TEST_TYPE_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#84cc16',
  '#10b981',
];

// ============================================================================
// ANALYTICS COMPONENT
// ============================================================================

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [organizationId, setOrganizationId] = useState<string>('');

  useEffect(() => {
    // Get organization from session/auth
    const orgId = localStorage.getItem('organizationId') || 'demo-org';
    setOrganizationId(orgId);
    loadAnalytics(orgId, timeRange);
  }, [timeRange]);

  const loadAnalytics = async (orgId: string, range: string) => {
    setLoading(true);

    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      switch (range) {
        case '7d':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(endDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(endDate.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
      }

      // Fetch analytics data
      const { data: results, error } = await supabase
        .from('test_results')
        .select('*')
        .eq('organization_id', orgId)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Process data
      const analytics = processAnalyticsData(results || [], range);
      setData(analytics);

    } catch (error) {
      console.error('Failed to load analytics:', error);
      // Load demo data for preview
      setData(generateDemoData(range));
    } finally {
      setLoading(false);
    }
  };

  const processAnalyticsData = (results: any[], range: string): AnalyticsData => {
    // Group by date
    const dateMap = new Map<string, any[]>();
    results.forEach(result => {
      const date = new Date(result.created_at).toISOString().split('T')[0];
      if (!dateMap.has(date)) {
        dateMap.set(date, []);
      }
      dateMap.get(date)!.push(result);
    });

    // Quality trend
    const qualityTrend: QualityTrendPoint[] = Array.from(dateMap.entries()).map(([date, tests]) => {
      const passed = tests.filter(t => t.passed).length;
      const qualityScore = (passed / tests.length) * 100;
      const issuesFound = tests.reduce((sum, t) => sum + (t.issues?.length || 0), 0);

      return {
        date: formatDate(date),
        qualityScore: Math.round(qualityScore),
        testsRun: tests.length,
        issuesFound,
      };
    });

    // Test type distribution
    const typeMap = new Map<string, { count: number; credits: number }>();
    results.forEach(result => {
      const type = result.test_type || 'unknown';
      if (!typeMap.has(type)) {
        typeMap.set(type, { count: 0, credits: 0 });
      }
      const stats = typeMap.get(type)!;
      stats.count++;
      stats.credits += result.credits_used || 0;
    });

    const testTypeDistribution: TestTypeData[] = Array.from(typeMap.entries()).map(([name, stats]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      count: stats.count,
      credits: stats.credits,
    }));

    // Issue breakdown
    const severityMap = new Map<string, number>();
    results.forEach(result => {
      result.issues?.forEach((issue: any) => {
        const severity = issue.severity || 'low';
        severityMap.set(severity, (severityMap.get(severity) || 0) + 1);
      });
    });

    const issueBreakdown: IssueData[] = Array.from(severityMap.entries()).map(([severity, count]) => ({
      severity: severity.charAt(0).toUpperCase() + severity.slice(1),
      count,
    }));

    // Credit usage
    const creditUsage: CreditUsagePoint[] = Array.from(dateMap.entries()).map(([date, tests]) => {
      const credits = tests.reduce((sum, t) => sum + (t.credits_used || 0), 0);
      const cost = credits * 0.01; // $0.01 per credit

      return {
        date: formatDate(date),
        credits,
        cost: parseFloat(cost.toFixed(2)),
      };
    });

    // Summary
    const totalTests = results.length;
    const totalIssues = results.reduce((sum, r) => sum + (r.issues?.length || 0), 0);
    const totalCredits = results.reduce((sum, r) => sum + (r.credits_used || 0), 0);
    const passedTests = results.filter(r => r.passed).length;
    const avgQualityScore = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

    return {
      qualityTrend,
      testTypeDistribution,
      issueBreakdown,
      creditUsage,
      summary: {
        totalTests,
        avgQualityScore,
        totalIssues,
        totalCredits,
        period: range,
      },
    };
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const generateDemoData = (range: string): AnalyticsData => {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 365;
    const qualityTrend: QualityTrendPoint[] = [];
    const creditUsage: CreditUsagePoint[] = [];

    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      qualityTrend.push({
        date: formatDate(date.toISOString()),
        qualityScore: 75 + Math.random() * 20,
        testsRun: Math.floor(10 + Math.random() * 40),
        issuesFound: Math.floor(Math.random() * 25),
      });

      creditUsage.push({
        date: formatDate(date.toISOString()),
        credits: Math.floor(50 + Math.random() * 150),
        cost: parseFloat((0.5 + Math.random() * 1.5).toFixed(2)),
      });
    }

    return {
      qualityTrend,
      testTypeDistribution: [
        { name: 'Web', count: 245, credits: 6125 },
        { name: 'Mobile', count: 156, credits: 2340 },
        { name: 'API', count: 189, credits: 1890 },
        { name: 'Document', count: 87, credits: 1305 },
        { name: 'Game', count: 34, credits: 1020 },
        { name: 'AI', count: 23, credits: 690 },
      ],
      issueBreakdown: [
        { severity: 'Critical', count: 12 },
        { severity: 'High', count: 34 },
        { severity: 'Medium', count: 89 },
        { severity: 'Low', count: 156 },
      ],
      creditUsage,
      summary: {
        totalTests: 734,
        avgQualityScore: 87,
        totalIssues: 291,
        totalCredits: 13370,
        period: range,
      },
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center p-8">
        <p className="text-gray-600">No analytics data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-gray-600 mt-1">Track quality trends and usage statistics</p>
        </div>

        <Select value={timeRange} onValueChange={(v: any) => setTimeRange(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="1y">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Tests</CardDescription>
            <CardTitle className="text-3xl">{data.summary.totalTests.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Quality Score</CardDescription>
            <CardTitle className="text-3xl">{data.summary.avgQualityScore}%</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Issues</CardDescription>
            <CardTitle className="text-3xl">{data.summary.totalIssues.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Credits Used</CardDescription>
            <CardTitle className="text-3xl">{data.summary.totalCredits.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="quality" className="space-y-4">
        <TabsList>
          <TabsTrigger value="quality">Quality Trends</TabsTrigger>
          <TabsTrigger value="distribution">Test Distribution</TabsTrigger>
          <TabsTrigger value="issues">Issue Breakdown</TabsTrigger>
          <TabsTrigger value="usage">Credit Usage</TabsTrigger>
        </TabsList>

        {/* Quality Trends */}
        <TabsContent value="quality" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quality Score Over Time</CardTitle>
              <CardDescription>
                Track how your quality score improves over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={data.qualityTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#6b7280"
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                  />
                  <YAxis 
                    stroke="#6b7280"
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="qualityScore"
                    stroke={COLORS.primary}
                    strokeWidth={2}
                    dot={{ fill: COLORS.primary, r: 4 }}
                    activeDot={{ r: 6 }}
                    name="Quality Score"
                  />
                  <Line
                    type="monotone"
                    dataKey="testsRun"
                    stroke={COLORS.secondary}
                    strokeWidth={2}
                    dot={{ fill: COLORS.secondary, r: 4 }}
                    name="Tests Run"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Issues Found Over Time</CardTitle>
              <CardDescription>
                Monitor issue trends to measure improvement
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data.qualityTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#6b7280"
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                  />
                  <YAxis 
                    stroke="#6b7280"
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="issuesFound"
                    stroke={COLORS.danger}
                    fill={COLORS.danger}
                    fillOpacity={0.2}
                    name="Issues Found"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Test Distribution */}
        <TabsContent value="distribution" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Tests by Type</CardTitle>
                <CardDescription>
                  Distribution of test types run
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.testTypeDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {data.testTypeDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={TEST_TYPE_COLORS[index % TEST_TYPE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Credits by Test Type</CardTitle>
                <CardDescription>
                  Credit consumption breakdown
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.testTypeDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="name" 
                      stroke="#6b7280"
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                    />
                    <YAxis 
                      stroke="#6b7280"
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                      }}
                    />
                    <Bar dataKey="credits" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Issue Breakdown */}
        <TabsContent value="issues" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Issues by Severity</CardTitle>
                <CardDescription>
                  Breakdown of issue severity levels
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.issueBreakdown}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ severity, count }) => `${severity}: ${count}`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {data.issueBreakdown.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={SEVERITY_COLORS[entry.severity.toLowerCase() as keyof typeof SEVERITY_COLORS]} 
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Issue Distribution</CardTitle>
                <CardDescription>
                  Compare severity levels
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.issueBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 12 }} />
                    <YAxis 
                      dataKey="severity" 
                      type="category" 
                      stroke="#6b7280"
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                      }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {data.issueBreakdown.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={SEVERITY_COLORS[entry.severity.toLowerCase() as keyof typeof SEVERITY_COLORS]} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Credit Usage */}
        <TabsContent value="usage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Credit Usage</CardTitle>
              <CardDescription>
                Monitor your credit consumption over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={data.creditUsage}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#6b7280"
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                  />
                  <YAxis 
                    stroke="#6b7280"
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                    }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="credits"
                    stroke={COLORS.info}
                    fill={COLORS.info}
                    fillOpacity={0.3}
                    name="Credits Used"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Daily Cost</CardTitle>
              <CardDescription>
                Track your daily testing costs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.creditUsage}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#6b7280"
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                  />
                  <YAxis 
                    stroke="#6b7280"
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                    }}
                    formatter={(value) => `$${value}`}
                  />
                  <Bar 
                    dataKey="cost" 
                    fill={COLORS.success} 
                    radius={[4, 4, 0, 0]}
                    name="Cost ($)"
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
