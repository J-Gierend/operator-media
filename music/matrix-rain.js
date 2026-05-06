/**
 * Matrix Rain Background
 *
 * Falling green glyphs (Matrix-style) on a 2D canvas, sized to the host element.
 * Beat-reactive via window.operatorBeat:
 *   - drops fall faster and brighter while a track plays
 *   - subtle "intensity flare" on each beat
 *
 * Performance:
 *   - Single 2D canvas, no per-glyph DOM
 *   - Trail effect via per-frame translucent fill (no full clear)
 *   - Throttled to ~30 FPS — half the work, still smooth (rain is slow)
 *   - Pauses when the page tab is hidden
 *   - Pauses when not intersecting viewport (IntersectionObserver)
 *   - Resize via ResizeObserver, no layout thrash on each frame
 */

class MatrixRain extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._running = false;
        this._lastFrame = 0;
        this._rafId = 0;
    }

    connectedCallback() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    width: 100%;
                    height: 100%;
                    position: relative;
                    pointer-events: none;
                }
                canvas {
                    display: block;
                    width: 100%;
                    height: 100%;
                    background: #000000;
                }
            </style>
            <canvas></canvas>
        `;
        this.canvas = this.shadowRoot.querySelector('canvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false });

        // Glyphs: Japanese half-width katakana + digits + a sprinkle of latin/symbols.
        // Single string sampled per drop; precomputed to avoid per-frame split overhead.
        this.glyphs = (
            'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ' +
            '0123456789' +
            '∆∑Ωπ¥Ξ↯⟁⌬'
        ).split('');

        this.fontSize = 16; // logical px; renderer multiplies by DPR
        this.drops = [];   // y position (in cell units) per column
        this.dropSpeeds = []; // per-column speed factor 0.5–1.4

        this._setupCanvas();

        this._resizeObs = new ResizeObserver(() => this._setupCanvas());
        this._resizeObs.observe(this);

        this._visObs = new IntersectionObserver((entries) => {
            for (const e of entries) {
                if (e.isIntersecting) this._start();
                else this._stop();
            }
        }, { threshold: 0 });
        this._visObs.observe(this);

        this._onVisibility = () => {
            if (document.visibilityState === 'visible') this._start();
            else this._stop();
        };
        document.addEventListener('visibilitychange', this._onVisibility);

        this._start();
    }

    disconnectedCallback() {
        this._stop();
        this._resizeObs?.disconnect();
        this._visObs?.disconnect();
        document.removeEventListener('visibilitychange', this._onVisibility);
    }

    _setupCanvas() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = this.getBoundingClientRect();
        const w = Math.max(1, Math.floor(rect.width));
        const h = Math.max(1, Math.floor(rect.height));
        this.canvas.width = w * dpr;
        this.canvas.height = h * dpr;
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this.cssWidth = w;
        this.cssHeight = h;

        const cols = Math.ceil(w / this.fontSize);
        // Initialize/extend drops; preserve existing positions on resize
        if (this.drops.length < cols) {
            while (this.drops.length < cols) {
                this.drops.push(Math.random() * (h / this.fontSize));
                this.dropSpeeds.push(0.5 + Math.random() * 0.9);
            }
        } else if (this.drops.length > cols) {
            this.drops.length = cols;
            this.dropSpeeds.length = cols;
        }

        // Solid black wash so old content from prior dimensions doesn't ghost
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, w, h);
    }

    _start() {
        if (this._running) return;
        this._running = true;
        this._lastFrame = performance.now();
        const tick = (now) => {
            if (!this._running) return;
            this._rafId = requestAnimationFrame(tick);
            // ~30 FPS throttle
            if (now - this._lastFrame < 33) return;
            this._lastFrame = now;
            this._draw();
        };
        this._rafId = requestAnimationFrame(tick);
    }

    _stop() {
        this._running = false;
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this._rafId = 0;
    }

    _draw() {
        const ctx = this.ctx;
        const w = this.cssWidth;
        const h = this.cssHeight;
        const cellRows = h / this.fontSize;

        const beat = window.operatorBeat;
        const playing = beat?.isPlaying ?? false;
        const pulse = beat?.getPulse?.() ?? 0;
        const env = beat?.getEnvelope?.() ?? 0;

        // Trail: translucent black overlay each frame fades old glyphs out.
        // Lower alpha = longer trails (more "Matrix"). Boost when playing for energy.
        const trailAlpha = playing ? 0.06 : 0.10;
        ctx.fillStyle = `rgba(0,0,0,${trailAlpha})`;
        ctx.fillRect(0, 0, w, h);

        ctx.font = `${this.fontSize}px Consolas, "Lucida Console", monospace`;

        // Color: bright leading glyph (white-green), trailing glyphs in classic green.
        // Beat envelope brightens the whole field slightly.
        const headGreen = playing
            ? `rgba(180, 255, 180, ${0.95 + pulse * 0.05})`
            : 'rgba(120, 220, 120, 0.85)';
        const bodyGreen = playing
            ? `rgba(0, ${Math.min(255, 200 + Math.floor(env * 55))}, 65, 0.9)`
            : 'rgba(0, 180, 65, 0.7)';

        const speedMult = playing ? (1.0 + env * 0.5 + pulse * 0.6) : 0.6;

        for (let i = 0; i < this.drops.length; i++) {
            const x = i * this.fontSize;
            const yCell = this.drops[i];
            const y = yCell * this.fontSize;

            // Leading glyph (head) — bright
            const ch = this.glyphs[(Math.random() * this.glyphs.length) | 0];
            ctx.fillStyle = headGreen;
            ctx.fillText(ch, x, y);

            // Body glyph one cell up — dimmer (creates short tail)
            if (yCell > 1) {
                ctx.fillStyle = bodyGreen;
                const ch2 = this.glyphs[(Math.random() * this.glyphs.length) | 0];
                ctx.fillText(ch2, x, y - this.fontSize);
            }

            // Reset to top randomly once a column scrolls off
            // Frequency depends on speed + intensity
            const advance = this.dropSpeeds[i] * speedMult;
            this.drops[i] += advance;
            if (this.drops[i] > cellRows + Math.random() * 8) {
                // 96% chance reset, 4% leave to scatter falls
                if (Math.random() < 0.96) {
                    this.drops[i] = -Math.random() * 4;
                }
            }
        }
    }
}

customElements.define('matrix-rain', MatrixRain);
