// VerifyForge AI - Game Testing Engine
// lib/game-testing.ts
// Tests games for FPS, performance, graphics quality, and gameplay

import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface GameTestResult {
  passed: boolean;
  issues: any[];
  metrics: any[];
  summary: {
    avg_fps: number;
    load_time_ms: number;
    quality_score: number;
  };
}

export class GameTester {
  /**
   * Main entry point for game testing
   */
  static async testGame(
    submissionId: string,
    gameUrl: string,
    config?: {
      test_duration?: number;
      target_fps?: number;
      max_load_time?: number;
    }
  ): Promise<GameTestResult> {
    
    const issues: any[] = [];
    const metrics: any[] = [];
    const performanceData: any = {
      fps_samples: [],
      memory_samples: [],
      load_times: []
    };

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-webgl']
    });

    try {
      const page = await browser.newPage();
      
      // Monitor performance
      await page.evaluateOnNewDocument(() => {
        (window as any).fpsData = [];
        let lastTime = performance.now();
        
        const measureFPS = () => {
          const currentTime = performance.now();
          const fps = 1000 / (currentTime - lastTime);
          (window as any).fpsData.push(fps);
          lastTime = currentTime;
          requestAnimationFrame(measureFPS);
        };
        
        requestAnimationFrame(measureFPS);
      });

      // Measure load time
      const loadStart = Date.now();
      await page.goto(gameUrl, { waitUntil: 'networkidle0', timeout: 30000 });
      const loadTime = Date.now() - loadStart;
      
      performanceData.load_times.push(loadTime);
      metrics.push({
        submission_id: submissionId,
        metric_name: 'load_time',
        value: loadTime,
        unit: 'ms',
        threshold: config?.max_load_time || 10000,
        passed: loadTime < (config?.max_load_time || 10000)
      });

      if (loadTime > (config?.max_load_time || 10000)) {
        issues.push({
          submission_id: submissionId,
          issue_type: 'performance',
          severity: 'high',
          title: 'Slow Load Time',
          description: `Game took ${loadTime}ms to load (target: ${config?.max_load_time || 10000}ms)`,
          location: 'Initial Load'
        });
      }

      // Run game for test duration
      const testDuration = config?.test_duration || 60;
      await new Promise(resolve => setTimeout(resolve, testDuration * 1000));

      // Collect FPS data
      const fpsData = await page.evaluate(() => (window as any).fpsData || []);
      performanceData.fps_samples = fpsData;

      const avgFps = fpsData.length > 0 
        ? fpsData.reduce((a: number, b: number) => a + b, 0) / fpsData.length 
        : 0;

      const targetFps = config?.target_fps || 60;
      metrics.push({
        submission_id: submissionId,
        metric_name: 'average_fps',
        value: avgFps,
        unit: 'fps',
        threshold: targetFps,
        passed: avgFps >= targetFps * 0.9 // 90% of target
      });

      if (avgFps < targetFps * 0.9) {
        issues.push({
          submission_id: submissionId,
          issue_type: 'performance',
          severity: avgFps < targetFps * 0.5 ? 'critical' : 'high',
          title: 'Low Frame Rate',
          description: `Average FPS (${avgFps.toFixed(1)}) below target (${targetFps})`,
          location: 'Game Performance'
        });
      }

      // Check for WebGL support
      const hasWebGL = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
      });

      if (!hasWebGL) {
        issues.push({
          submission_id: submissionId,
          issue_type: 'compatibility',
          severity: 'critical',
          title: 'No WebGL Support',
          description: 'Game requires WebGL but it is not available',
          location: 'Browser Compatibility'
        });
      }

      // Check for console errors
      const consoleErrors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      if (consoleErrors.length > 0) {
        issues.push({
          submission_id: submissionId,
          issue_type: 'error',
          severity: 'medium',
          title: 'Console Errors Detected',
          description: `Found ${consoleErrors.length} console errors during gameplay`,
          location: 'JavaScript Console'
        });
      }

      await browser.close();

      // Calculate quality score
      let qualityScore = 100;
      qualityScore -= issues.filter(i => i.severity === 'critical').length * 20;
      qualityScore -= issues.filter(i => i.severity === 'high').length * 10;
      qualityScore -= issues.filter(i => i.severity === 'medium').length * 5;
      qualityScore = Math.max(0, Math.min(100, qualityScore));

      // Store results
      await this.storeResults(submissionId, issues, metrics);

      return {
        passed: issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0,
        issues,
        metrics,
        summary: {
          avg_fps: Math.round(avgFps),
          load_time_ms: loadTime,
          quality_score: qualityScore
        }
      };

    } catch (error) {
      console.error('Game testing error:', error);
      await browser.close();
      throw error;
    }
  }

  /**
   * Helper: Store results in database
   */
  static async storeResults(submissionId: string, issues: any[], metrics: any[]) {
    if (issues.length > 0) {
      await supabase.from('test_issues').insert(issues);
    }
    if (metrics.length > 0) {
      await supabase.from('performance_metrics').insert(metrics);
    }
  }
}

export default GameTester;
