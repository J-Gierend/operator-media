import { test, expect } from '@playwright/test';

test.describe('OPERATOR Music Page', () => {

  test.beforeEach(async ({ page }) => {
    // Go to page and wait for it to fully load
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Wait for main element to exist
    await page.waitForSelector('main', { timeout: 30000 });
    // Completely disable fullscreen requirement for tests
    await page.evaluate(() => {
      // Remove the fullscreen hint entirely
      const hint = document.getElementById('fullscreen-hint');
      if (hint) hint.remove();
      // Override isFullscreen to always return true
      window.isFullscreen = () => true;
      // Override isMobile to return true (skips fullscreen check)
      window.isMobile = () => true;
      // Remove animation-locked class that blocks button clicks
      document.documentElement.classList.remove('animation-locked');
      document.body.classList.remove('animation-locked');
      document.body.classList.remove('animating');
    });
  });

  test('audio elements are properly initialized', async ({ page }) => {
    // Check all 4 audio elements exist
    const audioCount = await page.locator('audio').count();
    expect(audioCount).toBe(4);

    // Check each track has proper structure
    const tracks = ['acid-rain', 'oxbow-b', 'anvil', 'inertia'];
    for (const trackId of tracks) {
      const player = page.locator(`[data-track-id="${trackId}"]`);
      await expect(player).toBeVisible();

      const audio = page.locator(`#player-${trackId}`);
      await expect(audio).toBeAttached();
    }

    console.log('[PASS] All audio elements properly initialized');
  });

  test('clicking play should start audio and show operator face', async ({ page }) => {
    const operatorBg = page.locator('#operator-bg');

    // Initially should be hidden (opacity 0)
    const initialOpacity = await operatorBg.evaluate(el => getComputedStyle(el).opacity);
    expect(initialOpacity).toBe('0');

    // Click play on Acid Rain
    const playButton = page.locator('[data-track-id="acid-rain"] .play-button');
    await playButton.waitFor({ state: 'visible' });
    await playButton.click();

    // Wait for animation to complete (operator face appears after 3000ms)
    await page.waitForTimeout(4000);

    // Button should have playing class
    const isPlaying = await playButton.evaluate(el => el.classList.contains('playing'));
    expect(isPlaying).toBe(true);

    // Operator face should have active class
    const hasActiveClass = await operatorBg.evaluate(el => el.classList.contains('active'));
    expect(hasActiveClass).toBe(true);

    console.log('[PASS] Play starts audio and shows operator face');
  });

  test('clicking play again should pause and reset', async ({ page }) => {
    // Start playing
    const playButton = page.locator('[data-track-id="acid-rain"] .play-button');
    await playButton.click();
    await page.waitForTimeout(1000);

    // Click again to pause
    await playButton.click();
    await page.waitForTimeout(500);

    // Button should not have playing class
    const isPlaying = await playButton.evaluate(el => el.classList.contains('playing'));
    expect(isPlaying).toBe(false);

    // Audio should be reset to beginning
    const currentTime = await page.evaluate(() => {
      const audio = document.getElementById('player-acid-rain');
      return audio ? audio.currentTime : -1;
    });
    expect(currentTime).toBe(0);

    console.log('[PASS] Pause resets track to beginning');
  });

  test('switching tracks should stop previous track', async ({ page }) => {
    // Start playing Acid Rain
    const acidRainBtn = page.locator('[data-track-id="acid-rain"] .play-button');
    await acidRainBtn.click();
    await page.waitForTimeout(1000);

    // Start playing Oxbow B
    const oxbowBtn = page.locator('[data-track-id="oxbow-b"] .play-button');
    await oxbowBtn.click();
    await page.waitForTimeout(500);

    // Acid Rain should be stopped
    const acidRainPlaying = await acidRainBtn.evaluate(el => el.classList.contains('playing'));
    expect(acidRainPlaying).toBe(false);

    // Oxbow B should be playing
    const oxbowPlaying = await oxbowBtn.evaluate(el => el.classList.contains('playing'));
    expect(oxbowPlaying).toBe(true);

    console.log('[PASS] Switching tracks stops previous track');
  });

  test('nav links should scroll to correct position', async ({ page }) => {
    const navLink = page.locator('.nav-links a[href="#track-2"]');
    await navLink.waitFor({ state: 'visible' });
    await navLink.click();

    await page.waitForTimeout(1500);

    const track2 = page.locator('#track-2');
    const boundingBox = await track2.boundingBox();

    // Should be within 120px of top
    expect(boundingBox.y).toBeLessThan(120);

    console.log('[PASS] Nav links scroll to correct position');
  });

  test('language toggle should switch text', async ({ page }) => {
    // Default is German
    const navBrief = page.locator('[data-i18n="nav.brief"]');
    let text = await navBrief.textContent();
    expect(text).toBe('Brief');

    // Switch to English
    await page.click('#lang-en');
    await page.waitForTimeout(300);

    text = await navBrief.textContent();
    expect(text).toBe('Brief');  // This one stays same, check another

    const prodLabel = page.locator('[data-i18n="prod.label"]');
    text = await prodLabel.textContent();
    expect(text).toContain('LORN Sound');  // English version

    // Switch back to German
    await page.click('#lang-de');
    await page.waitForTimeout(300);

    text = await prodLabel.textContent();
    expect(text).toContain('LORN-Sound');  // German version

    console.log('[PASS] Language toggle switches text');
  });

  test('scrolling should reveal content if hidden', async ({ page }) => {
    const main = page.locator('main');

    // Manually hide content
    await page.evaluate(() => {
      const m = document.querySelector('main');
      if (m) m.style.opacity = '0';
    });

    let opacity = await main.evaluate(el => el.style.opacity);
    expect(opacity).toBe('0');

    // Scroll down
    await page.evaluate(() => window.scrollBy(0, 200));
    await page.waitForTimeout(500);

    // Content should be visible again
    opacity = await main.evaluate(el => el.style.opacity);
    expect(opacity).toBe('1');

    console.log('[PASS] Scrolling reveals content if hidden');
  });

  test('operatorBg.content is properly initialized', async ({ page }) => {
    const contentExists = await page.evaluate(() => {
      return {
        operatorBgExists: !!window.operatorBg,
        contentExists: !!window.operatorBg?.content,
        contentTagName: window.operatorBg?.content?.tagName
      };
    });

    expect(contentExists.operatorBgExists).toBe(true);
    expect(contentExists.contentExists).toBe(true);
    expect(contentExists.contentTagName).toBe('MAIN');

    console.log('[PASS] operatorBg.content is properly initialized');
  });

  test('waveform progress updates while playing', async ({ page }) => {
    // Start playing
    const playButton = page.locator('[data-track-id="acid-rain"] .play-button');
    await playButton.click();

    // Wait for some progress
    await page.waitForTimeout(3000);

    // Check that some waveform bars have 'played' class
    const playedBars = await page.locator('#waveform-acid-rain .waveform-bar.played').count();
    expect(playedBars).toBeGreaterThan(0);

    // Check time display is updating
    const timeText = await page.locator('#time-acid-rain').textContent();
    expect(timeText).not.toBe('0:00');

    console.log('[PASS] Waveform progress updates while playing');
  });

});
