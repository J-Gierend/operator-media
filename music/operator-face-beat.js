/**
 * Operator Face — slow-mo Matrix mood
 *
 * Camera behavior is INTENTIONALLY static at base. Idle has zero wobble.
 * Periodically (rare events) the camera either does a long slow turn to a
 * new framing OR snaps abruptly to a new angle and holds. No constant
 * pulsing, no envelope-driven dolly.
 *
 * 3D matrix rain is rendered IN the Three.js scene as Points distributed
 * around the head — depth, perspective, slow density/speed modulation
 * (proper rain, not screen-glued 2D). Separately the page can still drop
 * the legacy <matrix-rain> element behind us — it's harmless either way.
 *
 * Face is alive: subtle vertex deformation on the lower-face region
 * (breathing + envelope-driven micro-jaw drop), rare brow-area twitches,
 * and eye saccades that briefly shift the gaze. All cheap — vertex deforms
 * happen directly on the wireframe LineSegments instance buffer (no
 * geometry rebuilds).
 *
 * Wireframe rendered with LineSegments2 (screen-space anti-aliased lines).
 */

// Global beat state — shared singleton, set by index.html when a track plays
window.operatorBeat = {
    isPlaying: false,
    bpm: 100,
    startTime: 0,

    start(bpm = 100) {
        this.isPlaying = true;
        this.bpm = bpm;
        this.startTime = Date.now();
    },

    stop() {
        this.isPlaying = false;
    },

    getBeatPhase() {
        if (!this.isPlaying) return 0;
        const msPerBeat = 60000 / this.bpm;
        const elapsed = Date.now() - this.startTime;
        return (elapsed % msPerBeat) / msPerBeat;
    },

    getPulse() {
        if (!this.isPlaying) return 0;
        const phase = this.getBeatPhase();
        return Math.pow(1 - phase, 2);
    },

    // Smoothed envelope — stays elevated mid-beat, dips between
    getEnvelope() {
        if (!this.isPlaying) return 0;
        const phase = this.getBeatPhase();
        return 0.5 + 0.5 * Math.cos(phase * Math.PI * 2);
    },

    getBeatCount() {
        if (!this.isPlaying) return 0;
        const msPerBeat = 60000 / this.bpm;
        return (Date.now() - this.startTime) / msPerBeat;
    }
};

class OperatorFaceBeat extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.shadowRoot.innerHTML = `
            <style>
                :host { display: block; width: 100%; height: 100%; position: relative; }
                .container {
                    width: 100%; height: 100%;
                    position: absolute; inset: 0;
                    background: transparent; overflow: hidden;
                }
                canvas { display: block; width: 100% !important; height: 100% !important; }
                .loading {
                    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    color: #00ff41; font-family: monospace; font-size: 12px;
                    text-shadow: 0 0 10px #00ff41;
                }
            </style>
            <div class="container">
                <div class="loading">LOADING OPERATOR...</div>
            </div>
        `;

        this.container = this.shadowRoot.querySelector('.container');
        this.loadingEl = this.shadowRoot.querySelector('.loading');

        requestAnimationFrame(() => {
            const rect = this.container.getBoundingClientRect();
            this.width = rect.width || 300;
            this.height = rect.height || 300;
            this.loadThreeJS();
        });
    }

    async loadThreeJS() {
        const base = 'https://cdn.jsdelivr.net/npm/three@0.160.0';
        const [
            THREE,
            { GLTFLoader },
            { EffectComposer },
            { RenderPass },
            { UnrealBloomPass },
            { OutputPass },
            { LineSegments2 },
            { LineSegmentsGeometry },
            { LineMaterial }
        ] = await Promise.all([
            import(`${base}/build/three.module.js`),
            import(`${base}/examples/jsm/loaders/GLTFLoader.js`),
            import(`${base}/examples/jsm/postprocessing/EffectComposer.js`),
            import(`${base}/examples/jsm/postprocessing/RenderPass.js`),
            import(`${base}/examples/jsm/postprocessing/UnrealBloomPass.js`),
            import(`${base}/examples/jsm/postprocessing/OutputPass.js`),
            import(`${base}/examples/jsm/lines/LineSegments2.js`),
            import(`${base}/examples/jsm/lines/LineSegmentsGeometry.js`),
            import(`${base}/examples/jsm/lines/LineMaterial.js`)
        ]);

        this.initScene({
            THREE, GLTFLoader, EffectComposer, RenderPass, UnrealBloomPass, OutputPass,
            LineSegments2, LineSegmentsGeometry, LineMaterial
        });
    }

    initScene(deps) {
        const {
            THREE, GLTFLoader, EffectComposer, RenderPass, UnrealBloomPass, OutputPass,
            LineSegments2, LineSegmentsGeometry, LineMaterial
        } = deps;

        const CONFIG = {
            headModelUrl: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/LeePerrySmith/LeePerrySmith.glb',
            wireframeColor: 0x00ff41,
            lineWidth: 1.4
        };

        const LEFT_EYE_VERTEX = 5248;
        const RIGHT_EYE_VERTEX = 558;
        let eyeSize = 0.18;

        const scene = new THREE.Scene();
        // Transparent — content layer fades out, this scene composites over the
        // black overlay; no opaque clear here so the rain layer behind is visible.

        const camera = new THREE.PerspectiveCamera(40, this.width / this.height, 0.1, 200);
        const baseCameraPos = new THREE.Vector3(0, 0.5, 24);
        const lookTarget = new THREE.Vector3(0, 0.5, 0);
        camera.position.copy(baseCameraPos);
        camera.lookAt(lookTarget);

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            premultipliedAlpha: false
        });
        renderer.setSize(this.width, this.height);
        renderer.setPixelRatio(Math.min(devicePixelRatio, 3));
        renderer.setClearColor(0x000000, 0);
        renderer.autoClear = false;
        this.container.appendChild(renderer.domElement);

        const renderTarget = new THREE.WebGLRenderTarget(
            this.width * renderer.getPixelRatio(),
            this.height * renderer.getPixelRatio(),
            { format: THREE.RGBAFormat, type: THREE.HalfFloatType }
        );
        const composer = new EffectComposer(renderer, renderTarget);
        const renderPass = new RenderPass(scene, camera);
        renderPass.clearAlpha = 0;
        composer.addPass(renderPass);
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(this.width, this.height),
            0.45, 1.0, 0.3
        );
        composer.addPass(bloomPass);
        composer.addPass(new OutputPass());

        const resizeObserver = new ResizeObserver(() => {
            const rect = this.container.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                this.width = rect.width;
                this.height = rect.height;
                camera.aspect = this.width / this.height;
                camera.updateProjectionMatrix();
                renderer.setSize(this.width, this.height);
                composer.setSize(this.width, this.height);
                if (this._lineMat) {
                    this._lineMat.resolution.set(
                        this.width * renderer.getPixelRatio(),
                        this.height * renderer.getPixelRatio()
                    );
                }
            }
        });
        resizeObserver.observe(this.container);

        // ─────────────────────────────────────────────────────────────────
        // 3D Matrix Rain
        // ─────────────────────────────────────────────────────────────────
        // Particles distributed in a volume around the head. Each particle
        // falls down at its own speed, wraps to top when below floor.
        // Color/brightness derives from per-particle random + global noise.
        // Render with a small custom shader so size scales with depth and
        // far particles fade — gives the parallax/depth feel.
        const RAIN_COUNT = 900;
        const RAIN_AREA = { x: 30, y: 28, zNear: 4, zFar: -22 };
        const rainGeo = new THREE.BufferGeometry();
        const rainPos = new Float32Array(RAIN_COUNT * 3);
        const rainSpeed = new Float32Array(RAIN_COUNT);
        const rainSize = new Float32Array(RAIN_COUNT);
        const rainPhase = new Float32Array(RAIN_COUNT);
        for (let i = 0; i < RAIN_COUNT; i++) {
            rainPos[i * 3 + 0] = (Math.random() - 0.5) * RAIN_AREA.x * 2;
            rainPos[i * 3 + 1] = (Math.random() - 0.5) * RAIN_AREA.y * 2;
            // Bias z so most rain is BEHIND the head (z<0) but some is in front
            const t = Math.random();
            rainPos[i * 3 + 2] = RAIN_AREA.zFar + t * (RAIN_AREA.zNear - RAIN_AREA.zFar);
            rainSpeed[i] = 1.0 + Math.random() * 4.0;       // units/sec
            rainSize[i] = 1.6 + Math.random() * 2.6;        // base point size
            rainPhase[i] = Math.random() * Math.PI * 2;     // for per-particle flicker
        }
        rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
        rainGeo.setAttribute('aSize', new THREE.BufferAttribute(rainSize, 1));
        rainGeo.setAttribute('aPhase', new THREE.BufferAttribute(rainPhase, 1));

        const rainMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uIntensity: { value: 0.5 },
                uPxRatio: { value: renderer.getPixelRatio() },
                uColor: { value: new THREE.Color(0x66ff8a) }
            },
            vertexShader: `
                attribute float aSize;
                attribute float aPhase;
                uniform float uTime;
                uniform float uPxRatio;
                varying float vDepth;
                varying float vFlicker;
                void main() {
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    // Closer particles = larger; clamp so foreground doesn't blow up
                    float depthScale = clamp(180.0 / -mv.z, 0.5, 4.0);
                    gl_PointSize = aSize * uPxRatio * depthScale;
                    gl_Position = projectionMatrix * mv;
                    vDepth = -mv.z;
                    // Per-particle flicker so some drops shimmer
                    vFlicker = 0.6 + 0.4 * sin(uTime * 0.004 + aPhase * 7.0);
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                uniform float uIntensity;
                varying float vDepth;
                varying float vFlicker;
                void main() {
                    // Vertical-streak-shaped point: narrow X, taller Y, with bright head
                    vec2 uv = gl_PointCoord - 0.5;
                    float xMask = smoothstep(0.45, 0.0, abs(uv.x) * 3.5);
                    float yMask = smoothstep(0.5, -0.5, uv.y);     // brighter at top
                    float a = xMask * yMask;
                    // Fade with depth — atmospheric perspective
                    float depthFade = 1.0 - smoothstep(8.0, 30.0, vDepth);
                    float alpha = a * vFlicker * uIntensity * (0.35 + 0.65 * depthFade);
                    if (alpha < 0.01) discard;
                    // Brighter "head" highlight at the very top of each streak
                    vec3 c = mix(uColor, vec3(0.85, 1.0, 0.85), smoothstep(0.2, 0.5, -uv.y) * 0.5);
                    gl_FragColor = vec4(c, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        const rainPoints = new THREE.Points(rainGeo, rainMat);
        rainPoints.renderOrder = -1;
        scene.add(rainPoints);
        this._rain = { geo: rainGeo, mat: rainMat, speeds: rainSpeed };

        // ─────────────────────────────────────────────────────────────────
        // Head model + face deformation setup
        // ─────────────────────────────────────────────────────────────────
        let headGroup = null;
        let occlusionMesh, wireframeLines, leftEye, rightEye;
        let eyeMeshes = [];
        // Face deform state: filled in once the model loads.
        let faceDeform = null;

        const eyeState = {
            blinkTimer: 0,
            nextBlink: 5000 + Math.random() * 7000,
            isBlinking: false,
            blinkPhase: 0,
            blinkDir: 'close'
        };

        // Eye saccade: gaze darts. State filled in animate loop.
        const saccade = {
            offsetX: 0, offsetY: 0,
            targetX: 0, targetY: 0,
            nextAt: 1500 + Math.random() * 2500
        };

        const camState = {
            cineActive: false,
            cineKind: null,            // 'SLOW_TURN' | 'SNAP_HOLD'
            cineStart: 0,
            cineDuration: 0,
            cinePos: new THREE.Vector3(),
            cineLook: new THREE.Vector3(),
            cineNextBeat: 16 + Math.random() * 16,
            lastPreset: null,
            // Smoothed-toward "current" framing for SLOW_TURN; for SNAP_HOLD
            // we just write directly.
            curOffsetPos: new THREE.Vector3(0, 0, 0),
            curOffsetLook: new THREE.Vector3(0, 0, 0)
        };

        const createEye = () => {
            const g = new THREE.Group();
            const c = CONFIG.wireframeColor;
            const mat = (col, op) => new THREE.MeshBasicMaterial({
                color: col, transparent: true, opacity: op,
                side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
                depthTest: false, depthWrite: false
            });

            const outerGlow = new THREE.Mesh(new THREE.CircleGeometry(eyeSize * 2.5, 32), mat(c, 0.2));
            outerGlow.renderOrder = 10; outerGlow.name = 'outerGlow'; g.add(outerGlow);

            const pupil = new THREE.Mesh(new THREE.CircleGeometry(eyeSize, 32), mat(c, 1.2));
            pupil.position.z = 0.02; pupil.renderOrder = 11; pupil.name = 'pupil'; g.add(pupil);

            const core = new THREE.Mesh(new THREE.CircleGeometry(eyeSize * 0.4, 24), mat(0xffffff, 1.0));
            core.position.z = 0.03; core.renderOrder = 12; core.name = 'core'; g.add(core);

            eyeMeshes.push(g);
            return g;
        };

        const buildCrispWireframe = (geo) => {
            const wireGeo = new THREE.WireframeGeometry(geo);
            const positions = wireGeo.attributes.position.array;

            const lineGeo = new LineSegmentsGeometry();
            lineGeo.setPositions(positions);

            const dpr = renderer.getPixelRatio();
            const lineMat = new LineMaterial({
                color: CONFIG.wireframeColor,
                linewidth: CONFIG.lineWidth,
                transparent: true,
                opacity: 0.34,
                depthTest: true,
                resolution: new THREE.Vector2(this.width * dpr, this.height * dpr),
                worldUnits: false,
                alphaToCoverage: false
            });
            this._lineMat = lineMat;

            const lines = new LineSegments2(lineGeo, lineMat);
            lines.computeLineDistances();
            return { lines, lineGeo, basePositions: new Float32Array(positions) };
        };

        new GLTFLoader().load(CONFIG.headModelUrl, (gltf) => {
            const geo = gltf.scene.children[0].geometry.clone();
            geo.computeVertexNormals();

            headGroup = new THREE.Group();
            headGroup.scale.set(1.8, 1.8, 1.8);
            headGroup.position.y = -2;
            scene.add(headGroup);

            occlusionMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
                colorWrite: false,
                depthWrite: true
            }));
            occlusionMesh.renderOrder = 0;
            headGroup.add(occlusionMesh);

            const built = buildCrispWireframe(geo);
            wireframeLines = built.lines;
            wireframeLines.renderOrder = 1;
            headGroup.add(wireframeLines);

            // ── Face deformation buffers ──
            // The line buffer interleaves start (3 floats) + end (3 floats) per
            // edge — but we want to update it as a flat array of 3-float positions
            // (each line = 2 endpoints). The InterleavedBuffer underlying
            // instanceStart/instanceEnd is exactly that flat array.
            const lineBuf = built.lineGeo.attributes.instanceStart.data;
            const lineArr = lineBuf.array; // Float32Array — endpoints flat
            const endpointCount = lineArr.length / 3;

            // Compute Y range of the head from the line positions
            let yMin = Infinity, yMax = -Infinity;
            for (let i = 0; i < endpointCount; i++) {
                const y = lineArr[i * 3 + 1];
                if (y < yMin) yMin = y;
                if (y > yMax) yMax = y;
            }
            const yRange = yMax - yMin || 1;

            // Per-endpoint weights: 1 at the lowest 30%, smoothly fading to 0 at
            // 50%; brow weight peaks around 75% Y for rare twitches.
            const jawWeight = new Float32Array(endpointCount);
            const browWeight = new Float32Array(endpointCount);
            for (let i = 0; i < endpointCount; i++) {
                const y = built.basePositions[i * 3 + 1];
                const yNorm = (y - yMin) / yRange;
                jawWeight[i] = Math.max(0, 1 - yNorm * 2.2);
                browWeight[i] = smoothstep(0.62, 0.78, yNorm) * (1 - smoothstep(0.78, 0.93, yNorm));
            }

            faceDeform = {
                lineBuf,
                lineArr,
                base: built.basePositions,
                jawWeight,
                browWeight,
                browTwitch: 0,           // current twitch amount
                browTwitchTarget: 0,
                browNextAt: 6000 + Math.random() * 8000
            };

            headGroup.userData.eyeVerts = { left: LEFT_EYE_VERTEX, right: RIGHT_EYE_VERTEX };

            leftEye = createEye();
            rightEye = createEye();
            scene.add(leftEye);
            scene.add(rightEye);

            this.loadingEl.style.display = 'none';
        });

        function smoothstep(edge0, edge1, x) {
            const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
            return t * t * (3 - 2 * t);
        }

        const updateBlink = (dt) => {
            if (!eyeState.isBlinking) {
                eyeState.blinkTimer += dt;
                if (eyeState.blinkTimer > eyeState.nextBlink) {
                    eyeState.isBlinking = true;
                    eyeState.blinkPhase = 0;
                    eyeState.blinkDir = 'close';
                }
                return 1.0;
            }
            if (eyeState.blinkDir === 'close') {
                eyeState.blinkPhase += dt / 80;
                if (eyeState.blinkPhase >= 1) {
                    eyeState.blinkPhase = 0;
                    eyeState.blinkDir = 'open';
                }
                return 1 - eyeState.blinkPhase;
            } else {
                eyeState.blinkPhase += dt / 180;
                if (eyeState.blinkPhase >= 1) {
                    eyeState.isBlinking = false;
                    eyeState.blinkTimer = 0;
                    eyeState.nextBlink = 5000 + Math.random() * 7000;
                    return 1.0;
                }
                return eyeState.blinkPhase;
            }
        };

        let smoothedPulse = 0;

        const updateBeatVisuals = (t, dt) => {
            if (!this._lineMat) return;
            const beat = window.operatorBeat;
            const pulse = beat.getPulse();
            const env = beat.getEnvelope();
            const isPlaying = beat.isPlaying;

            const easeIn = 1 - Math.exp(-dt / 90);
            const easeOut = 1 - Math.exp(-dt / 240);
            if (pulse > smoothedPulse) {
                smoothedPulse += (pulse - smoothedPulse) * easeIn;
            } else {
                smoothedPulse += (pulse - smoothedPulse) * easeOut;
            }

            const baseOpacity = 0.34;
            const baseBloom = 0.32;

            if (isPlaying) {
                this._lineMat.opacity = baseOpacity + smoothedPulse * 0.18 + env * 0.04;
                bloomPass.strength = baseBloom + smoothedPulse * 0.30 + env * 0.06;
                eyeMeshes.forEach(eye => {
                    const pupil = eye.getObjectByName('pupil');
                    const outerGlow = eye.getObjectByName('outerGlow');
                    if (pupil) pupil.material.opacity = 1.0 + smoothedPulse * 0.18;
                    if (outerGlow) outerGlow.material.opacity = 0.2 + smoothedPulse * 0.15 + env * 0.05;
                });
            } else {
                const wave = Math.sin(t * 0.0012) * 0.04;
                this._lineMat.opacity = baseOpacity + wave;
                bloomPass.strength = baseBloom + wave;
            }
        };

        const _vL = new THREE.Vector3();
        const _vR = new THREE.Vector3();

        const updateSaccade = (t, dt) => {
            saccade.nextAt -= dt;
            if (saccade.nextAt <= 0) {
                // Pick a small new gaze offset
                const r = 0.05 + Math.random() * 0.10;
                const theta = Math.random() * Math.PI * 2;
                saccade.targetX = Math.cos(theta) * r;
                saccade.targetY = Math.sin(theta) * r * 0.6;
                saccade.nextAt = 1800 + Math.random() * 3500;
            }
            // Snappy ease — saccades are fast
            const e = 1 - Math.exp(-dt / 60);
            saccade.offsetX += (saccade.targetX - saccade.offsetX) * e;
            saccade.offsetY += (saccade.targetY - saccade.offsetY) * e;
        };

        const animateEyes = (t, dt) => {
            if (!leftEye || !rightEye || !headGroup) return;
            const verts = headGroup.userData.eyeVerts;
            const headMeshForVerts = occlusionMesh;
            const pos = headMeshForVerts.geometry.attributes.position;
            if (verts && pos) {
                _vL.set(pos.getX(verts.left), pos.getY(verts.left), pos.getZ(verts.left));
                _vR.set(pos.getX(verts.right), pos.getY(verts.right), pos.getZ(verts.right));
                headMeshForVerts.localToWorld(_vL);
                headMeshForVerts.localToWorld(_vR);
                // Apply saccade offset
                _vL.x += saccade.offsetX; _vL.y += saccade.offsetY;
                _vR.x += saccade.offsetX; _vR.y += saccade.offsetY;
                leftEye.position.copy(_vL);
                rightEye.position.copy(_vR);
                leftEye.rotation.copy(headGroup.rotation);
                rightEye.rotation.copy(headGroup.rotation);
            }
            const blink = updateBlink(dt);
            leftEye.scale.y = rightEye.scale.y = blink;

            const baseScale = 0.96 + Math.sin(t * 0.0014) * 0.03;
            leftEye.scale.x = rightEye.scale.x = baseScale + smoothedPulse * 0.04;
        };

        // Slow head drift — basically static but a tiny bit of life so it
        // doesn't feel mannequin-frozen. No multiplier from beat.
        const headMove = {
            phaseX: Math.random() * Math.PI * 2,
            phaseY: Math.random() * Math.PI * 2,
            speedX: 0.00006,
            speedY: 0.000048,
            rangeX: 0.025,
            rangeY: 0.035
        };

        const animateHead = (t) => {
            if (!headGroup) return;
            const breathe = Math.sin(t * 0.0003) * 0.0015;
            headGroup.scale.setScalar(1.8 * (1 + breathe));
            headGroup.rotation.x = Math.sin(t * headMove.speedX + headMove.phaseX) * headMove.rangeX;
            headGroup.rotation.y = Math.sin(t * headMove.speedY + headMove.phaseY) * headMove.rangeY;
        };

        // ── Face deformation: subtle breathing in jaw region + envelope-driven
        //   micro-jaw-drop + rare brow twitches. Updates wireframe instance
        //   buffer in place — no geometry rebuilds.
        const updateFaceDeform = (t, dt) => {
            if (!faceDeform) return;
            const beat = window.operatorBeat;
            const env = beat.getEnvelope();
            const isPlaying = beat.isPlaying;

            // Brow twitch state machine — rare event, eased target
            faceDeform.browNextAt -= dt;
            if (faceDeform.browNextAt <= 0) {
                // Pick a small twitch (positive = lift, negative = furrow)
                faceDeform.browTwitchTarget = (Math.random() < 0.5 ? -1 : 1) * (0.003 + Math.random() * 0.005);
                faceDeform.browNextAt = 4500 + Math.random() * 8500;
                // Auto-relax after a moment
                setTimeout(() => { faceDeform.browTwitchTarget = 0; }, 250 + Math.random() * 350);
            }
            const browEase = 1 - Math.exp(-dt / 110);
            faceDeform.browTwitch += (faceDeform.browTwitchTarget - faceDeform.browTwitch) * browEase;

            // Slow respiration (always, even idle)
            const breath = Math.sin(t * 0.0014) * 0.005;
            // Envelope-driven jaw drop (only while playing) — VERY subtle
            const jawDrop = isPlaying ? -env * 0.008 : 0;

            const arr = faceDeform.lineArr;
            const base = faceDeform.base;
            const jw = faceDeform.jawWeight;
            const bw = faceDeform.browWeight;
            const yShiftJaw = breath + jawDrop;
            const yShiftBrow = faceDeform.browTwitch;
            const n = jw.length;
            for (let i = 0; i < n; i++) {
                const i3 = i * 3;
                arr[i3 + 1] = base[i3 + 1] + yShiftJaw * jw[i] + yShiftBrow * bw[i];
            }
            faceDeform.lineBuf.needsUpdate = true;
        };

        // ─────────────────────────────────────────────────────────────────
        // Camera — static base + occasional SLOW_TURN or SNAP_HOLD
        // ─────────────────────────────────────────────────────────────────
        // Mostly static at base. Cinematic events:
        //   SLOW_TURN: long ease (8s+) into a new framing, hold, ease back.
        //   SNAP_HOLD: instant cut to a new framing, hold for a few beats,
        //              instant cut back. Use sparingly — it's the "Matrix"
        //              freeze-bullet-time vibe.
        const SLOW_TURN_PRESETS = [
            { pos: new THREE.Vector3(0, 0.3, 8),    look: new THREE.Vector3(0, 0.4, 0),  beats: 16 },
            { pos: new THREE.Vector3(3.5, 0.5, 5),  look: new THREE.Vector3(-0.2, 0.4, 0), beats: 16 },
            { pos: new THREE.Vector3(0, 3.0, 6),    look: new THREE.Vector3(0, -0.1, 0), beats: 18 },
            { pos: new THREE.Vector3(-2.5, 1.5, 4), look: new THREE.Vector3(0.2, 0.3, 0), beats: 16 },
            { pos: new THREE.Vector3(2.0, 1.0, 9),  look: new THREE.Vector3(-0.2, 0.4, 0), beats: 18 },
            { pos: new THREE.Vector3(-1.5, -0.4, 7), look: new THREE.Vector3(0.1, 0.7, 0), beats: 16 }
        ];
        const SNAP_PRESETS = [
            { pos: new THREE.Vector3(6.0, 0.2, 3),  look: new THREE.Vector3(-0.5, 0.4, 0), beats: 6 },
            { pos: new THREE.Vector3(0.8, 0.3, -2.5), look: new THREE.Vector3(0, 0.4, 0), beats: 6 },
            { pos: new THREE.Vector3(0, -1.5, 1.5), look: new THREE.Vector3(0, 1.2, 0), beats: 6 },
            { pos: new THREE.Vector3(-4.0, 0.5, 2), look: new THREE.Vector3(0.3, 0.4, 0), beats: 6 }
        ];

        const easeInOutCubic = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

        const triggerCinematic = () => {
            const beat = window.operatorBeat;
            const msPerBeat = 60000 / beat.bpm;
            // ~30% snap, 70% slow turn
            const isSnap = Math.random() < 0.3;
            const pool = isSnap ? SNAP_PRESETS : SLOW_TURN_PRESETS;
            let preset;
            do {
                preset = pool[Math.floor(Math.random() * pool.length)];
            } while (preset === camState.lastPreset && pool.length > 1);
            camState.lastPreset = preset;

            camState.cineKind = isSnap ? 'SNAP_HOLD' : 'SLOW_TURN';
            camState.cinePos.copy(preset.pos);
            camState.cineLook.copy(preset.look);
            camState.cineDuration = msPerBeat * preset.beats;
            camState.cineStart = Date.now();
            camState.cineActive = true;
        };

        const animateCamera = (t, dt) => {
            const beat = window.operatorBeat;
            const isPlaying = beat.isPlaying;

            // Schedule next cinematic; only while playing
            if (isPlaying && !camState.cineActive) {
                if (beat.getBeatCount() >= camState.cineNextBeat) {
                    triggerCinematic();
                    const presetBeats = camState.cineDuration / (60000 / beat.bpm);
                    // Generous gap between events (24-48 beats)
                    camState.cineNextBeat = beat.getBeatCount() + presetBeats + 24 + Math.random() * 24;
                }
            }

            // Static base (NO orbit, NO dolly — kill the wobble entirely).
            // Cinematic events override this with their own framing.
            if (!camState.cineActive) {
                camera.position.copy(baseCameraPos);
                camera.lookAt(lookTarget);
                return;
            }

            const elapsed = Date.now() - camState.cineStart;
            const progress = elapsed / camState.cineDuration;

            if (progress >= 1) {
                camState.cineActive = false;
                camera.position.copy(baseCameraPos);
                camera.lookAt(lookTarget);
                return;
            }

            const cpx = baseCameraPos.x + camState.cinePos.x;
            const cpy = baseCameraPos.y + camState.cinePos.y;
            const cpz = baseCameraPos.z + camState.cinePos.z;
            const clx = lookTarget.x + camState.cineLook.x;
            const cly = lookTarget.y + camState.cineLook.y;
            const clz = lookTarget.z + camState.cineLook.z;

            if (camState.cineKind === 'SNAP_HOLD') {
                // Instant cut in, hold, instant cut out — no easing.
                // 10% of duration is "settling" frame to avoid single-frame flash.
                if (progress < 0.92) {
                    camera.position.set(cpx, cpy, cpz);
                    camera.lookAt(clx, cly, clz);
                } else {
                    camera.position.copy(baseCameraPos);
                    camera.lookAt(lookTarget);
                }
            } else {
                // SLOW_TURN: 30% in / 40% hold / 30% out, deeply eased
                let blend;
                if (progress < 0.30) blend = easeInOutCubic(progress / 0.30);
                else if (progress < 0.70) blend = 1.0;
                else blend = easeInOutCubic(1 - (progress - 0.70) / 0.30);
                const inv = 1 - blend;
                camera.position.set(
                    baseCameraPos.x * inv + cpx * blend,
                    baseCameraPos.y * inv + cpy * blend,
                    baseCameraPos.z * inv + cpz * blend
                );
                camera.lookAt(
                    lookTarget.x * inv + clx * blend,
                    lookTarget.y * inv + cly * blend,
                    lookTarget.z * inv + clz * blend
                );
            }
        };

        // ─────────────────────────────────────────────────────────────────
        // Rain: per-frame update — fall + wrap, slow density/speed swell.
        // ─────────────────────────────────────────────────────────────────
        const updateRain = (t, dt) => {
            const positions = this._rain.geo.attributes.position.array;
            const speeds = this._rain.speeds;

            // Slow density swell — multi-period sine, never strictly periodic
            const swell =
                Math.sin(t * 0.00021) * 0.5 +
                Math.sin(t * 0.00007 + 1.2) * 0.3 +
                Math.sin(t * 0.00045 + 0.6) * 0.2;
            // Map to 0.25–1.05 intensity
            this._rain.mat.uniforms.uIntensity.value = 0.25 + Math.max(0, swell + 0.5) * 0.8;
            this._rain.mat.uniforms.uTime.value = t;

            // Speed swell: slow drift between 0.7× and 1.4×
            const speedMult = 0.7 + 0.7 * (0.5 + 0.5 * Math.sin(t * 0.00015 + 0.4));
            const dts = dt * 0.001 * speedMult;

            const yMin = -RAIN_AREA.y;
            const yMax = RAIN_AREA.y;
            for (let i = 0; i < RAIN_COUNT; i++) {
                positions[i * 3 + 1] -= speeds[i] * dts;
                if (positions[i * 3 + 1] < yMin) {
                    positions[i * 3 + 1] = yMax + Math.random() * 4;
                    // Recycle x/z too so density keeps shifting
                    positions[i * 3 + 0] = (Math.random() - 0.5) * RAIN_AREA.x * 2;
                    positions[i * 3 + 2] = RAIN_AREA.zFar + Math.random() * (RAIN_AREA.zNear - RAIN_AREA.zFar);
                }
            }
            this._rain.geo.attributes.position.needsUpdate = true;
        };

        let lastT = Date.now();
        const animate = () => {
            requestAnimationFrame(animate);
            const now = Date.now();
            const dt = Math.min(now - lastT, 100);
            lastT = now;

            updateRain(now, dt);

            if (headGroup) {
                updateBeatVisuals(now, dt);
                updateSaccade(now, dt);
                animateEyes(now, dt);
                animateHead(now);
                updateFaceDeform(now, dt);
                animateCamera(now, dt);
            }
            composer.render();
        };

        animate();
    }
}

customElements.define('operator-face-beat', OperatorFaceBeat);
