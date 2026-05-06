import { test, expect } from '@playwright/test';

const PORT = process.env.OPMUSIC_PORT || '8765';
const BASE = `http://localhost:${PORT}/`;

test.describe('Bug regression: Anvil play freezes the player', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main', { timeout: 30000 });
    await page.evaluate(() => {
      const hint = document.getElementById('fullscreen-hint');
      if (hint) hint.remove();
      window.isFullscreen = () => true;
      window.isMobile = () => true;
      document.documentElement.classList.remove('animation-locked');
      document.body.classList.remove('animation-locked');
      document.body.classList.remove('animating');
    });
  });

  // Forces audio.play() to reject — simulates the failure mode that previously
  // left the page locked with no unlock path.
  const failPlayFor = async (page, trackId) => {
    await page.evaluate((id) => {
      const audio = document.getElementById('player-' + id);
      audio.play = () => Promise.reject(new DOMException('forced failure', 'NotSupportedError'));
    }, trackId);
  };

  test('failed audio.play() must not lock the UI forever', async ({ page }) => {
    await failPlayFor(page, 'anvil');

    const button = page.locator('[data-track-id="anvil"] .play-button');
    await button.click();

    // Allow the rejection + cleanup to settle (microtasks + render)
    await page.waitForTimeout(500);

    // Controls must NOT be locked.
    const locked = await page.evaluate(() =>
      document.documentElement.classList.contains('animation-locked') ||
      document.body.classList.contains('animation-locked')
    );
    expect(locked).toBe(false);

    // currentlyPlaying should be reset.
    const cp = await page.evaluate(() => window.currentlyPlaying);
    expect(cp).toBeNull();

    // Status should reflect the error.
    const status = await page.locator('[data-track-id="anvil"] .audio-status').textContent();
    expect(status.toLowerCase()).toMatch(/fehlgeschlagen|failed|error/);

    // Other tracks must still be clickable.
    const otherDisabled = await page.locator('[data-track-id="acid-rain"] .play-button')
      .evaluate(el => el.disabled);
    expect(otherDisabled).toBeFalsy();

    console.log('[PASS] Failed play does not lock the page');
  });

  test('safety net: stuck-paused audio auto-unlocks within 10s', async ({ page }) => {
    // Different failure mode: play() resolves but audio never advances (stuck buffering).
    // The safety net in annotationController.checkTime() must auto-skipAnimation.
    await page.evaluate((id) => {
      const audio = document.getElementById('player-' + id);
      // Make play() succeed but audio stays paused
      const origPlay = audio.play.bind(audio);
      audio.play = () => {
        // Don't actually start; resolve so .catch is not triggered
        return Promise.resolve();
      };
      // Force paused getter to return true
      Object.defineProperty(audio, 'paused', {
        get: () => true,
        configurable: true
      });
    }, 'anvil');

    const button = page.locator('[data-track-id="anvil"] .play-button');
    await button.click();

    // Safety net fires after 8s of stuck-paused.
    await page.waitForTimeout(9500);

    const locked = await page.evaluate(() =>
      document.documentElement.classList.contains('animation-locked') ||
      document.body.classList.contains('animation-locked')
    );
    expect(locked).toBe(false);

    console.log('[PASS] Stuck-paused safety net unlocked the page');
  });

  test('happy path: anvil plays normally and operator face activates', async ({ page }) => {
    const button = page.locator('[data-track-id="anvil"] .play-button');
    await button.click();

    // Operator face shows after 3000ms in the start sequence
    await page.waitForTimeout(3500);

    const hasActive = await page.locator('#operator-bg').evaluate(el => el.classList.contains('active'));
    expect(hasActive).toBe(true);

    const playing = await button.evaluate(el => el.classList.contains('playing'));
    expect(playing).toBe(true);

    console.log('[PASS] Anvil plays normally end-to-end');
  });

});
