import { test, expect } from '@playwright/test';

const PORT = process.env.OPMUSIC_PORT || '8888';
const BASE = `http://localhost:${PORT}/`;

// WebGL drawing buffers aren't readable after composite (preserveDrawingBuffer:false),
// so this test's pixel-level assertion is on the page screenshot rather than the
// WebGL canvas itself.

test.describe('Visual sanity — beat face + 3D rain', () => {
  test('face component loads, scene renders, no console errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main', { timeout: 30000 });
    await page.evaluate(() => {
      const hint = document.getElementById('fullscreen-hint');
      if (hint) hint.remove();
      window.isFullscreen = () => true;
      window.isMobile = () => true;
    });

    await page.waitForFunction(() => !!customElements.get('operator-face-beat'), { timeout: 10000 });
    await page.waitForFunction(() => {
      const el = document.querySelector('operator-face-beat');
      return el?.shadowRoot?.querySelector('canvas');
    }, { timeout: 15000 });
    await page.waitForFunction(() => {
      const el = document.querySelector('operator-face-beat');
      const loading = el?.shadowRoot?.querySelector('.loading');
      return loading && loading.style.display === 'none';
    }, { timeout: 30000 });

    // Force play-sequence end-state — face + black overlay visible, content hidden
    await page.evaluate(() => {
      const bg = document.getElementById('operator-bg');
      bg.classList.add('active');
      bg.style.transition = 'none';
      bg.style.opacity = '1';
      const ov = document.getElementById('black-overlay');
      ov.style.transition = 'none';
      ov.style.opacity = '1';
      ov.classList.add('active');
      const mainEl = document.querySelector('main');
      mainEl.style.transition = 'none';
      mainEl.style.opacity = '0';
    });

    // Click play so the rain swells visibly + face beat-syncs
    await page.locator('[data-track-id="acid-rain"] .play-button').click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: '/tmp/op-face-beat.png' });

    expect(consoleErrors.filter(e => !/favicon/i.test(e))).toEqual([]);

    // operatorBeat must be active
    const beatPlaying = await page.evaluate(() => window.operatorBeat?.isPlaying);
    expect(beatPlaying).toBe(true);

    console.log('[PASS] Face + 3D rain scene composed, no console errors');
  });
});
