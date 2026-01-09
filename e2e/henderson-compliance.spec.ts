import { test, expect } from '@playwright/test';

/**
 * Henderson Standards Compliance Tests
 * 
 * These tests verify compliance with CR AudioViz AI platform standards:
 * 1. Mobile-first design
 * 2. Brand color compliance
 * 3. Accessibility requirements
 * 4. Central services integration
 */

test.describe('Henderson Standards Compliance', () => {
  
  test.describe('Mobile-First Design', () => {
    test('should have no horizontal scroll at 375px', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto('/');
      
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // 1px tolerance
    });
    
    test('should have tap targets >= 44px', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto('/');
      
      // Check all interactive elements
      const interactiveElements = await page.$$('button, a, [role="button"], input[type="submit"]');
      
      for (const element of interactiveElements) {
        const box = await element.boundingBox();
        if (box) {
          // Either width or height should be >= 44px for touch accessibility
          const meetsStandard = box.width >= 44 || box.height >= 44;
          expect(meetsStandard).toBe(true);
        }
      }
    });
    
    test('should have minimum font size of 14px', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto('/');
      
      const smallText = await page.$$eval('p, span, div, a', elements => {
        return elements.filter(el => {
          const style = window.getComputedStyle(el);
          const fontSize = parseFloat(style.fontSize);
          return fontSize < 14 && el.textContent?.trim();
        }).length;
      });
      
      expect(smallText).toBe(0);
    });
  });
  
  test.describe('Brand Color Compliance', () => {
    const FORBIDDEN_COLORS = [
      'purple', 'violet', 'emerald', 'amber', 
      'pink', 'rose', 'indigo', 'fuchsia'
    ];
    
    test('should not use forbidden colors in CSS classes', async ({ page }) => {
      await page.goto('/');
      
      const html = await page.content();
      
      for (const color of FORBIDDEN_COLORS) {
        // Check for Tailwind classes with forbidden colors
        const hasColor = html.includes(`bg-${color}`) || 
                         html.includes(`text-${color}`) || 
                         html.includes(`border-${color}`);
        expect(hasColor, `Found forbidden color: ${color}`).toBe(false);
      }
    });
    
    test('should use approved brand colors', async ({ page }) => {
      await page.goto('/');
      
      // Verify cyan is used (primary brand color)
      const html = await page.content();
      const usesCyan = html.includes('cyan') || html.includes('#0891b2');
      
      // At least some brand color should be present
      expect(usesCyan || html.includes('slate')).toBe(true);
    });
  });
  
  test.describe('Page Loading', () => {
    test('should load homepage without errors', async ({ page }) => {
      const errors: string[] = [];
      
      page.on('pageerror', error => {
        errors.push(error.message);
      });
      
      page.on('console', msg => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });
      
      const response = await page.goto('/');
      
      expect(response?.status()).toBeLessThan(400);
      expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
    });
    
    test('should have proper meta tags', async ({ page }) => {
      await page.goto('/');
      
      // Check for viewport meta tag (mobile-first)
      const viewportMeta = await page.$('meta[name="viewport"]');
      expect(viewportMeta).not.toBeNull();
      
      // Check for title
      const title = await page.title();
      expect(title.length).toBeGreaterThan(0);
    });
  });
  
  test.describe('Accessibility', () => {
    test('should have alt text on images', async ({ page }) => {
      await page.goto('/');
      
      const imagesWithoutAlt = await page.$$eval('img', images => 
        images.filter(img => !img.alt || img.alt.trim() === '').length
      );
      
      expect(imagesWithoutAlt).toBe(0);
    });
    
    test('should have form labels', async ({ page }) => {
      await page.goto('/');
      
      const inputs = await page.$$('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
      
      for (const input of inputs) {
        const id = await input.getAttribute('id');
        const ariaLabel = await input.getAttribute('aria-label');
        const ariaLabelledBy = await input.getAttribute('aria-labelledby');
        
        if (id) {
          const label = await page.$(`label[for="${id}"]`);
          const hasLabel = label !== null || ariaLabel !== null || ariaLabelledBy !== null;
          expect(hasLabel, `Input ${id} missing label`).toBe(true);
        }
      }
    });
  });
});
