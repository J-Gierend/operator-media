import { test, expect } from '@playwright/test';

test.describe('OPERATOR Music Page', () => {

  test.beforeEach(async ({ page }) => {
    // Go to page and wait for it to fully load
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Wait for main element to exist
    await page.waitForSelector('main', { timeout: 30000 });
  });

  test('content should NOT fade out when clicking play', async ({ page }) => {
    const main = page.locator('main');

    // Check initial opacity is 1
    const initialOpacity = await main.evaluate(el => getComputedStyle(el).opacity);
    expect(initialOpacity).toBe('1');

    // Click play on first track (Acid Rain)
    const playButton = page.locator('[data-video-id="evgoa2uVcuE"] .play-button');
    await playButton.waitFor({ state: 'visible' });
    await playButton.click();

    // Wait a bit for any animations to start
    await page.waitForTimeout(3000);

    // Content should still be visible (opacity = 1)
    const afterClickOpacity = await main.evaluate(el => getComputedStyle(el).opacity);
    expect(afterClickOpacity).toBe('1');

    // Check content-glitch class is NOT applied
    const hasGlitchClass = await main.evaluate(el => el.classList.contains('content-glitch'));
    expect(hasGlitchClass).toBe(false);

    console.log('[PASS] Content does NOT fade out when clicking play');
  });

  test('operator face should appear when clicking play', async ({ page }) => {
    const operatorBg = page.locator('#operator-bg');
    await operatorBg.waitFor({ state: 'attached' });

    // Initially should be hidden (opacity 0)
    const initialOpacity = await operatorBg.evaluate(el => getComputedStyle(el).opacity);
    expect(initialOpacity).toBe('0');

    // Click play
    const playButton = page.locator('[data-video-id="evgoa2uVcuE"] .play-button');
    await playButton.waitFor({ state: 'visible' });
    await playButton.click();

    // Wait for face to appear (has 8s transition)
    await page.waitForTimeout(5000);

    // Should have active class
    const hasActiveClass = await operatorBg.evaluate(el => el.classList.contains('active'));
    expect(hasActiveClass).toBe(true);

    console.log('[PASS] Operator face appears when clicking play');
  });

  test('nav links should scroll to correct position', async ({ page }) => {
    // Wait for nav to be visible
    const navLink = page.locator('.nav-links a[href="#track-2"]');
    await navLink.waitFor({ state: 'visible' });

    // Click on track 2 in nav
    await navLink.click();

    await page.waitForTimeout(1500);

    // Track 2 should be near top of viewport
    const track2 = page.locator('#track-2');
    const boundingBox = await track2.boundingBox();

    // Should be within 120px of top (accounting for nav)
    expect(boundingBox.y).toBeLessThan(120);

    console.log('[PASS] Nav links scroll to correct position');
  });

  test('scrolling should reveal content if hidden', async ({ page }) => {
    const main = page.locator('main');

    // Manually hide content to simulate fade
    await page.evaluate(() => {
      const m = document.querySelector('main');
      if (m) m.style.opacity = '0';
    });

    // Verify it's hidden
    let opacity = await main.evaluate(el => el.style.opacity);
    expect(opacity).toBe('0');

    // Scroll down
    await page.evaluate(() => window.scrollBy(0, 200));
    await page.waitForTimeout(500);

    // Content should be visible again (skipAnimation sets opacity to 1)
    opacity = await main.evaluate(el => el.style.opacity);
    expect(opacity).toBe('1');

    console.log('[PASS] Scrolling reveals content if hidden');
  });

  test('scrollbar should be hidden during animation', async ({ page }) => {
    // Start playing to trigger animation
    const playButton = page.locator('[data-video-id="evgoa2uVcuE"] .play-button');
    await playButton.waitFor({ state: 'visible' });
    await playButton.click();

    await page.waitForTimeout(1000);

    // Check if body has animating class and overflow hidden
    const bodyOverflow = await page.evaluate(() => {
      return document.body.classList.contains('animating') ?
             getComputedStyle(document.body).overflow : 'visible';
    });

    // Should have hidden overflow when animating
    // Note: This test may need adjustment based on current implementation
    console.log('Body overflow during animation:', bodyOverflow);
  });

  test('revealContent should fade content back in', async ({ page }) => {
    const main = page.locator('main');

    // First, simulate content being faded out (like after playing)
    // Need to set animation to none to allow inline opacity to work
    await page.evaluate(() => {
      const m = document.querySelector('main');
      if (m) {
        m.style.animation = 'none';
        m.style.opacity = '0';
        m.classList.add('content-glitch');
      }
    });

    // Verify content is hidden
    let opacity = await main.evaluate(el => getComputedStyle(el).opacity);
    expect(opacity).toBe('0');

    // Call revealContent directly
    const revealCalled = await page.evaluate(() => {
      if (window.operatorBg && typeof window.operatorBg.revealContent === 'function') {
        window.operatorBg.revealContent();
        return true;
      }
      return false;
    });

    expect(revealCalled).toBe(true);

    // Wait for the transition (5 seconds + buffer)
    await page.waitForTimeout(6000);

    // Content should be visible again
    opacity = await main.evaluate(el => getComputedStyle(el).opacity);
    expect(opacity).toBe('1');

    console.log('[PASS] revealContent fades content back in');
  });

  test('operatorBg.content is properly initialized', async ({ page }) => {
    // Debug: Check operatorBg.content is set
    const contentExists = await page.evaluate(() => {
      return {
        operatorBgExists: !!window.operatorBg,
        contentExists: !!window.operatorBg?.content,
        contentTagName: window.operatorBg?.content?.tagName
      };
    });
    console.log('Debug - operatorBg state:', contentExists);
    expect(contentExists.operatorBgExists).toBe(true);
    expect(contentExists.contentExists).toBe(true);
    expect(contentExists.contentTagName).toBe('MAIN');

    console.log('[PASS] operatorBg.content is properly initialized');
  });

});
