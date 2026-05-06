import { test, expect } from '@playwright/test';

const PORT = process.env.OPMUSIC_PORT || '8888';
const BASE = `http://localhost:${PORT}/`;

test.describe('Visual sanity', () => {
  test('beat-face loads and renders', async ({ page }) => {
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

    // Custom element should be defined within a few seconds
    await page.waitForFunction(() => !!customElements.get('operator-face-beat'), { timeout: 10000 });

    // Wait for canvas inside the shadow DOM
    await page.waitForFunction(() => {
      const el = document.querySelector('operator-face-beat');
      return el && el.shadowRoot && el.shadowRoot.querySelector('canvas');
    }, { timeout: 15000 });

    // Wait for the model to load (loading indicator hidden)
    await page.waitForFunction(() => {
      const el = document.querySelector('operator-face-beat');
      const loading = el?.shadowRoot?.querySelector('.loading');
      return loading && loading.style.display === 'none';
    }, { timeout: 30000 });

    // Force the bg fully visible (skip the 8s opacity transition for the test)
    await page.evaluate(() => {
      const bg = document.getElementById('operator-bg');
      bg.classList.add('active');
      bg.style.transition = 'none';
      bg.style.opacity = '1';
      // Black overlay so the face is the only thing rendered
      const ov = document.getElementById('black-overlay');
      if (ov) {
        ov.style.transition = 'none';
        ov.style.opacity = '1';
        ov.classList.add('active');
      }
    });
    await page.waitForTimeout(500);

    // Don't click play — face stays at default zoom. We just want to see
    // both layers composited.
    await page.waitForTimeout(5000);

    await page.screenshot({ path: '/tmp/op-face-beat.png', fullPage: false });

    // Debug rain — look for any non-zero pixel in the canvas
    const rainDebug = await page.evaluate(() => {
      const r = document.querySelector('matrix-rain');
      if (!r) return { exists: false };
      const c = r.shadowRoot.querySelector('canvas');
      const offc = document.createElement('canvas');
      offc.width = c.width; offc.height = c.height;
      const ctx = offc.getContext('2d');
      ctx.drawImage(c, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let nonBlack = 0; let maxG = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i+1] > 30) nonBlack++;
        if (data[i+1] > maxG) maxG = data[i+1];
      }
      return {
        running: r._running,
        drops: r.drops?.length,
        firstFewDrops: r.drops?.slice(0, 5),
        cssW: r.cssWidth, cssH: r.cssHeight,
        nonBlackPixels: nonBlack,
        maxGreen: maxG
      };
    });
    console.log('RAIN DEBUG:', JSON.stringify(rainDebug));

    const alphaCheck = await page.evaluate(() => {
      const sample = (canvas, x, y) => {
        const offc = document.createElement('canvas');
        offc.width = canvas.width;
        offc.height = canvas.height;
        const ctx = offc.getContext('2d');
        ctx.drawImage(canvas, 0, 0);
        return Array.from(ctx.getImageData(x, y, 1, 1).data);
      };
      const face = document.querySelector('operator-face-beat')?.shadowRoot?.querySelector('canvas');
      const rain = document.querySelector('matrix-rain')?.shadowRoot?.querySelector('canvas');
      return {
        face: face ? { w: face.width, h: face.height, corner: sample(face, 5, 5), midright: sample(face, face.width - 5, face.height/2|0) } : null,
        rain: rain ? { w: rain.width, h: rain.height, corner: sample(rain, 5, 5), mid: sample(rain, rain.width/2|0, rain.height/2|0) } : null,
        rainEl: rain ? { offsetW: document.querySelector('matrix-rain').offsetWidth, offsetH: document.querySelector('matrix-rain').offsetHeight } : null,
        overlayActive: document.getElementById('black-overlay').classList.contains('active'),
        overlayOpacity: getComputedStyle(document.getElementById('black-overlay')).opacity
      };
    });
    console.log('CANVASES:', JSON.stringify(alphaCheck, null, 2));

    // Sample composited screenshot at a few points
    const sx = await page.evaluate(async () => {
      const v = (sel) => {
        const e = document.querySelector(sel);
        return e ? { z: getComputedStyle(e).zIndex, opacity: getComputedStyle(e).opacity, pos: getComputedStyle(e).position, display: getComputedStyle(e).display } : null;
      };
      return {
        overlay: v('#black-overlay'),
        rain: v('matrix-rain'),
        rainHost: document.querySelector('matrix-rain') ? document.querySelector('matrix-rain').getBoundingClientRect() : null,
        operatorBg: v('#operator-bg')
      };
    });
    console.log('STACK:', JSON.stringify(sx, null, 2));

    if (consoleErrors.length) {
      console.log('CONSOLE ERRORS:', consoleErrors);
    }
    expect(consoleErrors.filter(e => !/favicon/i.test(e))).toEqual([]);

    console.log('[PASS] Beat-face loads and renders, screenshot at /tmp/op-face-beat.png');
  });
});
