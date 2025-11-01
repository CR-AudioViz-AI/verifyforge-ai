// VerifyForge AI - Test Execution Engine
// lib/test-execution-engine.ts
// Master orchestrator for all 8 test types

import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Import all test engines
import { DocumentTester } from './document-testing';
import { GameTester } from './game-testing';
import { AITester } from './ai-testing';
import { AvatarToolTester } from './avatar-tool-testing';
import { JavariAutoFix } from './javari-autofix';

export interface TestSubmission {
  id: string;
  user_id: string;
  test_type: 'web' | 'document' | 'game' | 'ai' | 'avatar' | 'tool' | 'api' | 'mobile';
  target_url?: string;
  file_path?: string;
  config: any;
  economy_mode: 'standard' | 'economy' | 'ultra_economy';
}

export interface TestResult {
  submission_id: string;
  passed: boolean;
  tests_run: number;
  tests_passed: number;
  tests_failed: number;
  issues_found: number;
  quality_score: number;
  execution_time_ms: number;
  credits_used: number;
}

/**
 * Main entry point for test execution
 */
export async function executeTests(submission: TestSubmission): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    // Update status to running
    await updateSubmissionStatus(submission.id, 'running');

    let result: any;
    
    // Route to appropriate test engine
    switch (submission.test_type) {
      case 'web':
        result = await executeWebTests(submission.id, submission.target_url!, submission.config);
        break;
      case 'document':
        result = await executeDocumentTests(submission.id, submission.file_path!, submission.config);
        break;
      case 'game':
        result = await executeGameTests(submission.id, submission.target_url!, submission.config);
        break;
      case 'ai':
        result = await executeAITests(submission.id, submission.target_url!, submission.config);
        break;
      case 'avatar':
        result = await executeAvatarTests(submission.id, submission.target_url!, submission.config);
        break;
      case 'tool':
        result = await executeToolTests(submission.id, submission.target_url!, submission.config);
        break;
      case 'api':
        result = await executeAPITests(submission.id, submission.target_url!, submission.config);
        break;
      case 'mobile':
        result = await executeMobileTests(submission.id, submission.target_url!, submission.config);
        break;
      default:
        throw new Error(`Unknown test type: ${submission.test_type}`);
    }

    // Apply Javari auto-fixing for issues with 90%+ confidence
    const issues = await getSubmissionIssues(submission.id);
    if (issues.length > 0) {
      await JavariAutoFix.processIssues(submission.id, issues);
    }

    // Calculate final metrics
    const executionTime = Date.now() - startTime;
    const qualityScore = await calculateQualityScore(submission.id);
    const creditsUsed = calculateCredits(submission.test_type, submission.economy_mode, result);

    // Update submission with results
    await supabase
      .from('test_submissions')
      .update({
        status: 'completed',
        credits_used: creditsUsed,
        completed_at: new Date().toISOString()
      })
      .eq('id', submission.id);

    // Deduct credits from user balance
    await deductCredits(submission.user_id, creditsUsed, submission.id);

    return {
      submission_id: submission.id,
      passed: result.passed || false,
      tests_run: result.tests_run || 0,
      tests_passed: result.tests_passed || 0,
      tests_failed: result.tests_failed || 0,
      issues_found: issues.length,
      quality_score: qualityScore,
      execution_time_ms: executionTime,
      credits_used: creditsUsed
    };

  } catch (error) {
    console.error('Test execution error:', error);
    
    await supabase
      .from('test_submissions')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString()
      })
      .eq('id', submission.id);

    throw error;
  }
}

/**
 * Web Testing - 6 comprehensive test suites
 */
async function executeWebTests(submissionId: string, url: string, config: any) {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    let testsRun = 0;
    let testsPassed = 0;
    let testsFailed = 0;

    // Economy mode determines which suites to run
    const economyMode = config.economy_mode || 'standard';
    
    // 1. Functional Testing (ALWAYS RUN)
    testsRun++;
    try {
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      await logTestResult(submissionId, 'functional', 'Page Load', 'pass');
      testsPassed++;
    } catch (error) {
      await logTestResult(submissionId, 'functional', 'Page Load', 'fail');
      testsFailed++;
    }

    // 2. Performance Testing (skip in ultra_economy)
    if (economyMode !== 'ultra_economy') {
      testsRun++;
      const metrics = await page.metrics();
      const passed = metrics.TaskDuration < 5000;
      await logTestResult(submissionId, 'performance', 'Load Time', passed ? 'pass' : 'fail');
      if (passed) testsPassed++; else testsFailed++;
    }

    // 3. Security Testing (skip in economy/ultra_economy)
    if (economyMode === 'standard') {
      testsRun++;
      const hasHttps = url.startsWith('https://');
      await logTestResult(submissionId, 'security', 'HTTPS Check', hasHttps ? 'pass' : 'fail');
      if (hasHttps) testsPassed++; else testsFailed++;
    }

    // 4. Accessibility Testing (skip in economy/ultra_economy)
    if (economyMode === 'standard') {
      testsRun++;
      const htmlContent = await page.content();
      const hasAlt = htmlContent.includes('alt=');
      await logTestResult(submissionId, 'accessibility', 'Image Alt Text', hasAlt ? 'pass' : 'fail');
      if (hasAlt) testsPassed++; else testsFailed++;
    }

    // 5. Visual Regression (skip in economy/ultra_economy)
    if (economyMode === 'standard') {
      testsRun++;
      await page.screenshot({ path: `/tmp/${submissionId}.png` });
      await logTestResult(submissionId, 'visual', 'Screenshot Captured', 'pass');
      testsPassed++;
    }

    // 6. SEO Testing (skip in economy/ultra_economy)
    if (economyMode === 'standard') {
      testsRun++;
      const title = await page.title();
      await logTestResult(submissionId, 'seo', 'Page Title Exists', title ? 'pass' : 'fail');
      if (title) testsPassed++; else testsFailed++;
    }

    return {
      passed: testsFailed === 0,
      tests_run: testsRun,
      tests_passed: testsPassed,
      tests_failed: testsFailed
    };

  } finally {
    await browser.close();
  }
}

/**
 * Document Testing - PDF/DOCX/XLSX/PPTX
 */
async function executeDocumentTests(submissionId: string, filePath: string, config: any) {
  const fileType = filePath.split('.').pop()?.toLowerCase() as 'pdf' | 'docx' | 'xlsx' | 'pptx';
  
  if (!['pdf', 'docx', 'xlsx', 'pptx'].includes(fileType)) {
    throw new Error(`Unsupported document type: ${fileType}`);
  }

  const result = await DocumentTester.testDocument(submissionId, filePath, fileType);
  
  return {
    passed: result.passed,
    tests_run: result.metrics.length,
    tests_passed: result.metrics.filter(m => m.passed).length,
    tests_failed: result.metrics.filter(m => !m.passed).length,
    quality_score: result.summary.quality_score
  };
}

/**
 * Game Testing - FPS, graphics, performance
 */
async function executeGameTests(submissionId: string, url: string, config: any) {
  const result = await GameTester.testGame(submissionId, url, {
    test_duration: config?.test_duration || 60,
    target_fps: config?.target_fps || 60,
    max_load_time: config?.max_load_time || 10000
  });
  
  return {
    passed: result.passed,
    tests_run: result.metrics.length,
    tests_passed: result.metrics.filter(m => m.passed).length,
    tests_failed: result.metrics.filter(m => !m.passed).length,
    avg_fps: result.summary.avg_fps,
    load_time: result.summary.load_time_ms,
    quality_score: result.summary.quality_score
  };
}

/**
 * AI/Bot Testing - Hallucination detection, conversation quality
 */
async function executeAITests(submissionId: string, url: string, config: any) {
  const result = await AITester.testAI(submissionId, url, {
    test_conversations: config?.test_conversations || 10,
    check_hallucinations: config?.check_hallucinations !== false,
    test_knowledge_base: config?.test_knowledge_base !== false
  });
  
  return {
    passed: result.passed,
    tests_run: result.metrics.length,
    tests_passed: result.metrics.filter(m => m.passed).length,
    tests_failed: result.metrics.filter(m => !m.passed).length,
    avg_response_time: result.summary.avg_response_time,
    accuracy_score: result.summary.accuracy_score,
    quality_score: result.summary.quality_score
  };
}

/**
 * Avatar Testing - 3D rendering, WebGL
 */
async function executeAvatarTests(submissionId: string, url: string, config: any) {
  const result = await AvatarToolTester.testAvatar(submissionId, url, {
    test_duration: config?.test_duration || 30,
    target_fps: config?.target_fps || 30
  });
  
  return {
    passed: result.passed,
    tests_run: result.metrics.length,
    tests_passed: result.metrics.filter(m => m.passed).length,
    tests_failed: result.metrics.filter(m => !m.passed).length,
    quality_score: result.summary.quality_score
  };
}

/**
 * Tool Testing - Capability verification
 */
async function executeToolTests(submissionId: string, url: string, config: any) {
  const result = await AvatarToolTester.testTool(submissionId, url, {
    test_cases: config?.test_cases || []
  });
  
  return {
    passed: result.passed,
    tests_run: result.metrics.length,
    tests_passed: result.metrics.filter(m => m.passed).length,
    tests_failed: result.metrics.filter(m => !m.passed).length,
    success_rate: result.summary.success_rate,
    quality_score: result.summary.quality_score
  };
}

/**
 * API Testing - Endpoint validation
 */
async function executeAPITests(submissionId: string, url: string, config: any) {
  const tests = config?.endpoints || [{ method: 'GET', path: '/' }];
  let testsRun = 0;
  let testsPassed = 0;
  
  for (const test of tests) {
    testsRun++;
    try {
      const response = await fetch(`${url}${test.path}`, {
        method: test.method,
        headers: test.headers || {},
        body: test.body ? JSON.stringify(test.body) : undefined
      });
      
      const passed = response.ok;
      await logTestResult(submissionId, 'api', `${test.method} ${test.path}`, passed ? 'pass' : 'fail');
      if (passed) testsPassed++;
    } catch (error) {
      await logTestResult(submissionId, 'api', `${test.method} ${test.path}`, 'fail');
    }
  }
  
  return {
    passed: testsPassed === testsRun,
    tests_run: testsRun,
    tests_passed: testsPassed,
    tests_failed: testsRun - testsPassed
  };
}

/**
 * Mobile Testing - Mobile app testing (uses web engine + mobile viewport)
 */
async function executeMobileTests(submissionId: string, url: string, config: any) {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Set mobile viewport
    await page.setViewport({
      width: 375,
      height: 667,
      isMobile: true,
      hasTouch: true
    });
    
    let testsRun = 0;
    let testsPassed = 0;
    
    // Mobile-specific tests
    testsRun++;
    try {
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      await logTestResult(submissionId, 'mobile', 'Mobile Page Load', 'pass');
      testsPassed++;
    } catch (error) {
      await logTestResult(submissionId, 'mobile', 'Mobile Page Load', 'fail');
    }
    
    // Touch events test
    testsRun++;
    const hasTouchEvents = await page.evaluate(() => {
      return 'ontouchstart' in window;
    });
    await logTestResult(submissionId, 'mobile', 'Touch Events', hasTouchEvents ? 'pass' : 'fail');
    if (hasTouchEvents) testsPassed++;
    
    return {
      passed: testsPassed === testsRun,
      tests_run: testsRun,
      tests_passed: testsPassed,
      tests_failed: testsRun - testsPassed
    };

  } finally {
    await browser.close();
  }
}

/**
 * Helper functions
 */

async function updateSubmissionStatus(submissionId: string, status: string) {
  await supabase
    .from('test_submissions')
    .update({ 
      status, 
      ...(status === 'running' ? { started_at: new Date().toISOString() } : {})
    })
    .eq('id', submissionId);
}

async function logTestResult(
  submissionId: string,
  testSuite: string,
  testName: string,
  status: 'pass' | 'fail' | 'skip'
) {
  await supabase
    .from('test_results')
    .insert({
      submission_id: submissionId,
      test_suite: testSuite,
      test_name: testName,
      status
    });
}

async function getSubmissionIssues(submissionId: string) {
  const { data, error } = await supabase
    .from('test_issues')
    .select('*')
    .eq('submission_id', submissionId);
  
  return data || [];
}

async function calculateQualityScore(submissionId: string): Promise<number> {
  const { data: issues } = await supabase
    .from('test_issues')
    .select('severity')
    .eq('submission_id', submissionId);
  
  if (!issues || issues.length === 0) return 100;
  
  let score = 100;
  score -= issues.filter(i => i.severity === 'critical').length * 20;
  score -= issues.filter(i => i.severity === 'high').length * 10;
  score -= issues.filter(i => i.severity === 'medium').length * 5;
  score -= issues.filter(i => i.severity === 'low').length * 2;
  
  return Math.max(0, Math.min(100, score));
}

function calculateCredits(
  testType: string,
  economyMode: string,
  result: any
): number {
  // Base credits per test type
  const baseCredits: Record<string, number> = {
    web: 10,
    document: 8,
    game: 15,
    ai: 12,
    avatar: 10,
    tool: 8,
    api: 5,
    mobile: 12
  };
  
  let credits = baseCredits[testType] || 10;
  
  // Apply economy mode multipliers
  if (economyMode === 'economy') {
    credits = Math.ceil(credits * 0.6); // 40% savings
  } else if (economyMode === 'ultra_economy') {
    credits = Math.ceil(credits * 0.4); // 60% savings
  }
  
  return credits;
}

async function deductCredits(userId: string, amount: number, submissionId: string) {
  // Get current balance
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('credits_balance')
    .eq('id', userId)
    .single();
  
  if (!profile) throw new Error('User profile not found');
  
  const newBalance = profile.credits_balance - amount;
  
  // Update balance
  await supabase
    .from('user_profiles')
    .update({ credits_balance: newBalance })
    .eq('id', userId);
  
  // Log transaction
  await supabase
    .from('credit_transactions')
    .insert({
      user_id: userId,
      amount: -amount,
      transaction_type: 'usage',
      submission_id: submissionId,
      description: `Test execution`,
      balance_after: newBalance
    });
}

export default {
  executeTests
};
