import { test, expect } from '@playwright/test';
import {
  FORBIDDEN_FAMILIES,
  findForbiddenHexLiterals,
  forbiddenEntryCount,
  resolveForbidden,
} from './support/tailwind-palette';

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
    // A forbidden colour can reach the page in three representations, and the
    // check has to cover all three. It used to cover only the first, so
    // app/page.tsx shipped `style={{ color: '#10b981' }}` — emerald-500 — past a
    // green forbidden-colour test. Class name, hex literal, computed value.

    test('should not use forbidden colors in CSS classes', async ({ page }) => {
      await page.goto('/');
      
      const html = await page.content();
      
      for (const color of FORBIDDEN_FAMILIES) {
        // Check for Tailwind classes with forbidden colors
        const hasColor = html.includes(`bg-${color}`) || 
                         html.includes(`text-${color}`) || 
                         html.includes(`border-${color}`);
        expect(hasColor, `Found forbidden color: ${color}`).toBe(false);
      }
    });

    test('should not use forbidden colors as hex literals', async ({ page }) => {
      await page.goto('/');

      const found = findForbiddenHexLiterals(await page.content());
      const report = found
        .map((f) => `${f.hex} is ${f.family}-${f.shade}`)
        .join(', ');

      expect(
        found,
        `Forbidden colours present as hex literals (inline styles or <style> blocks): ${report}`,
      ).toEqual([]);
    });

    test('should not render forbidden colors in computed styles', async ({ page }) => {
      await page.goto('/');

      // Collected in the browser as rgb() strings, resolved back to palette
      // entries here. This catches a banned colour arriving from a stylesheet or
      // a CSS variable, where no hex literal appears in the markup at all.
      const used = await page.$$eval('*', (elements) =>
        elements.flatMap((el) => {
          const style = window.getComputedStyle(el);
          const tag = el.tagName.toLowerCase();
          const id = el.id ? `#${el.id}` : '';
          return (['color', 'backgroundColor', 'borderTopColor', 'outlineColor'] as const).map(
            (prop) => ({ where: `${tag}${id}`, prop, value: style[prop] }),
          );
        }),
      );

      const offenders = used
        .map((u) => ({ ...u, match: resolveForbidden(u.value) }))
        .filter((u) => u.match !== null)
        .map((u) => `${u.where} ${u.prop}=${u.value} is ${u.match?.family}-${u.match?.shade}`);

      expect(
        [...new Set(offenders)],
        'Forbidden colours present in computed styles',
      ).toEqual([]);
    });

    test('the palette resolver actually catches #10b981 (emerald-500)', () => {
      // Proves the mechanism itself, with no page involved. If this ever passes
      // vacuously — an empty palette index, a renamed dependency export — the
      // two tests above would go quietly green while enforcing nothing.
      expect(forbiddenEntryCount()).toBeGreaterThan(50);

      expect(resolveForbidden('#10b981')).toEqual({
        hex: '#10b981',
        family: 'emerald',
        shade: '500',
      });
      // Case and shorthand are normalised, alpha is ignored, and the computed
      // rgb() form resolves to the same entry.
      expect(resolveForbidden('#10B981')?.family).toBe('emerald');
      expect(resolveForbidden('#10b981ff')?.family).toBe('emerald');
      expect(resolveForbidden('rgb(16, 185, 129)')?.family).toBe('emerald');

      // The approved brand colours must NOT be flagged.
      expect(resolveForbidden('#0891b2')).toBeNull();   // cyan-600
      expect(resolveForbidden('#e2e8f0')).toBeNull();   // slate-200
      expect(resolveForbidden('rgba(0, 0, 0, 0)')).toBeNull();

      expect(findForbiddenHexLiterals('<div style="color:#10B981">x</div>')).toEqual([
        { hex: '#10b981', family: 'emerald', shade: '500' },
      ]);
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
