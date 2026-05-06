import { test, expect } from '@playwright/test';

const PORT = process.env.OPMUSIC_PORT || '8888';
const BASE = `http://localhost:${PORT}/`;

test.describe('Visual sanity — beat face + matrix rain', () => {
  test('layers compose: rain renders behind, face renders crisp on top, no console errors', async ({ page }) => {
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
    await page.waitForFunction(() => !!customElements.get('matrix-rain'), { timeout: 10000 });

    // Wait for face canvas + model loaded
    await page.waitForFunction(() => {
      const el = document.querySelector('operator-face-beat');
      return el?.shadowRoot?.querySelector('canvas');
    }, { timeout: 15000 });
    await page.waitForFunction(() => {
      const el = document.querySelector('operator-face-beat');
      const loading = el?.shadowRoot?.querySelector('.loading');
      return loading && loading.style.display === 'none';
    }, { timeout: 30000 });

    // Force play-sequence end-state (skip the 8s opacity transition)
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

    // Let rain accumulate and face animate
    await page.waitForTimeout(5000);

    // Face canvas must be transparent (so rain shows through)
    const faceAlpha = await page.evaluate(() => {
      const c = document.querySelector('operator-face-beat').shadowRoot.querySelector('canvas');
      const off = document.createElement('canvas');
      off.width = c.width; off.height = c.height;
      const ctx = off.getContext('2d');
      ctx.drawImage(c, 0, 0);
      return ctx.getImageData(5, 5, 1, 1).data[3];
    });
    expect(faceAlpha).toBe(0);

    // Rain canvas must contain visible green glyphs
    const rainStats = await page.evaluate(() => {
      const c = document.querySelector('matrix-rain').shadowRoot.querySelector('canvas');
      const off = document.createElement('canvas');
      off.width = c.width; off.height = c.height;
      const ctx = off.getContext('2d');
      ctx.drawImage(c, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let nonBlack = 0, maxG = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 1] > 30) nonBlack++;
        if (data[i + 1] > maxG) maxG = data[i + 1];
      }
      return { nonBlack, maxG };
    });
    expect(rainStats.nonBlack).toBeGreaterThan(1000);
    expect(rainStats.maxG).toBeGreaterThan(150);

    await page.screenshot({ path: '/tmp/op-face-beat.png' });

    expect(consoleErrors.filter(e => !/favicon/i.test(e))).toEqual([]);

    console.log('[PASS] Layers compose correctly, rain non-black pixels:', rainStats.nonBlack, 'max-green:', rainStats.maxG);
  });
});
