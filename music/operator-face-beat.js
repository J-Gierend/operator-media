/**
 * Operator Face — Beat-Synced Cinematic Camera
 *
 * Hero face for the soundtrack page. Reacts to music via window.operatorBeat:
 *   - continuous slow orbit (idle calm; livelier when playing)
 *   - beat-driven camera dolly (gentle push-in on each beat)
 *   - cinematic moments (every N beats, ease to a tighter framing/angle, hold, ease back)
 *   - sustained envelope follower for smooth bloom + opacity, not just sharp pulses
 *
 * Wireframe rendered with LineSegments2 (screen-space anti-aliased lines)
 * for crisp edges at any DPR — no jaggies at 1× or 4K.
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

    // Sharp pulse — peaks on beat, decays fast
    getPulse() {
        if (!this.isPlaying) return 0;
        const phase = this.getBeatPhase();
        return Math.pow(1 - phase, 2);
    },

    // Smoothed envelope — averages last ~half-beat, less jittery than pulse
    getEnvelope() {
        if (!this.isPlaying) return 0;
        const phase = this.getBeatPhase();
        // Sigmoid-ish: stays elevated mid-beat, dips between
        return 0.5 + 0.5 * Math.cos(phase * Math.PI * 2);
    },

    // Total beats elapsed since start (float)
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
            backgroundColor: 0x050505,
            lineWidth: 1.4 // screen pixels — crisp, not chunky
        };

        const LEFT_EYE_VERTEX = 5248;
        const RIGHT_EYE_VERTEX = 558;
        let eyeSize = 0.18;

        const scene = new THREE.Scene();
        // Transparent — matrix-rain renders behind us via the page DOM stack.
        // (Setting scene.background here would force an opaque clear and hide it.)

        // Pulled back to a comfortable portrait framing — head + a bit of negative
        // space, not crammed into frame. Cinematic moments push closer or wider
        // around this base so the default state is calm.
        const camera = new THREE.PerspectiveCamera(40, this.width / this.height, 0.1, 1000);
        const baseCameraPos = new THREE.Vector3(0, 0.5, 24);
        const lookTarget = new THREE.Vector3(0, 0.5, 0);
        camera.position.copy(baseCameraPos);
        camera.lookAt(lookTarget);

        // Render at higher DPR than before — the wireframe lines benefit most from extra pixels.
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

        // Composer with an RGBA float target so alpha is preserved through bloom.
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

        // Resize: keep camera, renderer, composer, AND line material resolution in sync.
        // LineMaterial needs `resolution` set in pixels to draw correct screen-space widths.
        const updateLineResolution = () => {};
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
                    this._lineMat.resolution.set(this.width * renderer.getPixelRatio(), this.height * renderer.getPixelRatio());
                }
            }
        });
        resizeObserver.observe(this.container);

        let headGroup = null; // wraps occlusion + wireframe so they transform together
        let occlusionMesh, wireframeLines, leftEye, rightEye;
        let eyeMeshes = [];

        const eyeState = {
            blinkTimer: 0,
            // Slower blink cadence — 5–12 seconds between blinks (was 3–7)
            nextBlink: 5000 + Math.random() * 7000,
            isBlinking: false,
            blinkPhase: 0,
            blinkDir: 'close'
        };

        // Camera state — orbit + dolly + cinematic
        const camState = {
            orbitTheta: 0,
            orbitPhi: 0,
            dollyOffset: 0,
            dollyTarget: 0,
            cineActive: false,
            cineStart: 0,
            cineDuration: 0,
            cinePos: new THREE.Vector3(),
            cineLook: new THREE.Vector3(),
            // First cinematic ~24-44 beats in (longer settle period at start)
            cineNextBeat: 24 + Math.random() * 20,
            phaseOffset: Math.random() * Math.PI * 2,
            lastPreset: null
        };

        const headMove = {
            phaseX: Math.random() * Math.PI * 2,
            phaseY: Math.random() * Math.PI * 2,
            // Slower drift, smaller range — calmer overall idle
            speedX: 0.00009,
            speedY: 0.00007,
            rangeX: 0.05,
            rangeY: 0.07
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

        // Build a LineSegments2 wireframe from a mesh geometry — gives anti-aliased
        // screen-space lines with controllable pixel width. Cost: one extra geometry
        // (positions only) built once at load.
        const buildCrispWireframe = (geo) => {
            const wireGeo = new THREE.WireframeGeometry(geo);
            const positions = wireGeo.attributes.position.array;

            const lineGeo = new LineSegmentsGeometry();
            lineGeo.setPositions(positions);

            const dpr = renderer.getPixelRatio();
            const lineMat = new LineMaterial({
                color: CONFIG.wireframeColor,
                linewidth: CONFIG.lineWidth, // pixels (screen-space)
                transparent: true,
                opacity: 0.32,
                depthTest: true,
                resolution: new THREE.Vector2(this.width * dpr, this.height * dpr),
                worldUnits: false,
                alphaToCoverage: false
            });
            this._lineMat = lineMat;

            const lines = new LineSegments2(lineGeo, lineMat);
            lines.computeLineDistances();
            return lines;
        };

        new GLTFLoader().load(CONFIG.headModelUrl, (gltf) => {
            const geo = gltf.scene.children[0].geometry.clone();
            geo.computeVertexNormals();

            // Group containing occlusion + wireframe — single transform target
            headGroup = new THREE.Group();
            headGroup.scale.set(1.8, 1.8, 1.8);
            headGroup.position.y = -2;
            scene.add(headGroup);

            // Occlusion mesh — solid, invisible, writes depth so back-of-head wires hide.
            occlusionMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
                colorWrite: false,
                depthWrite: true
            }));
            occlusionMesh.renderOrder = 0;
            headGroup.add(occlusionMesh);

            // Crisp anti-aliased wireframe
            wireframeLines = buildCrispWireframe(geo);
            wireframeLines.renderOrder = 1;
            headGroup.add(wireframeLines);

            // Eyes are separate so they don't get hidden by depth — kept on the
            // scene root and positioned by sampling the head mesh's eye verts.
            headGroup.userData.eyeVerts = { left: LEFT_EYE_VERTEX, right: RIGHT_EYE_VERTEX };

            leftEye = createEye();
            rightEye = createEye();
            scene.add(leftEye);
            scene.add(rightEye);

            this.loadingEl.style.display = 'none';
        });

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

        // Smoothed pulse — exponential ease so the visual response doesn't strobe
        // on every beat. We track a sustained "energy" value and let it decay
        // gently, which reads as a gentle living-glow rather than a hard flash.
        let smoothedPulse = 0;

        const updateBeatVisuals = (t, dt) => {
            if (!this._lineMat) return;
            const beat = window.operatorBeat;
            const pulse = beat.getPulse();
            const env = beat.getEnvelope();
            const isPlaying = beat.isPlaying;

            // Half-life ~250ms → reaches a beat's peak softly, decays slowly
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
                // Much gentler swings than before — the page is for reading too
                this._lineMat.opacity = baseOpacity + smoothedPulse * 0.18 + env * 0.04;
                bloomPass.strength = baseBloom + smoothedPulse * 0.30 + env * 0.06;

                eyeMeshes.forEach(eye => {
                    const pupil = eye.getObjectByName('pupil');
                    const outerGlow = eye.getObjectByName('outerGlow');
                    if (pupil) pupil.material.opacity = 1.0 + smoothedPulse * 0.18;
                    if (outerGlow) outerGlow.material.opacity = 0.2 + smoothedPulse * 0.15 + env * 0.05;
                });
            } else {
                // Slow ambient breathing while idle
                const wave = Math.sin(t * 0.0012) * 0.04;
                this._lineMat.opacity = baseOpacity + wave;
                bloomPass.strength = baseBloom + wave;
            }
        };

        // Reusable vectors — avoid per-frame allocation / GC pressure.
        const _vL = new THREE.Vector3();
        const _vR = new THREE.Vector3();

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
                leftEye.position.copy(_vL);
                rightEye.position.copy(_vR);
                leftEye.rotation.copy(headGroup.rotation);
                rightEye.rotation.copy(headGroup.rotation);
            }
            const blink = updateBlink(dt);
            leftEye.scale.y = rightEye.scale.y = blink;

            // Subtler eye-x pulse than before (was 0.1)
            const baseScale = 0.96 + Math.sin(t * 0.0014) * 0.03;
            leftEye.scale.x = rightEye.scale.x = baseScale + smoothedPulse * 0.04;
        };

        const animateHead = (t) => {
            if (!headGroup) return;
            const beat = window.operatorBeat;

            // Slow breathe + a small smoothed beat scale (no per-beat punch)
            const breathe = Math.sin(t * 0.0003) * 0.002;
            const beatScale = beat.isPlaying ? smoothedPulse * 0.004 : 0;
            headGroup.scale.setScalar(1.8 * (1 + breathe + beatScale));

            // Only slightly more active when playing (was 1.5×)
            const moveMult = beat.isPlaying ? 1.15 : 1.0;
            const rotX = Math.sin(t * headMove.speedX + headMove.phaseX) * headMove.rangeX * moveMult;
            const rotY = Math.sin(t * headMove.speedY + headMove.phaseY) * headMove.rangeY * moveMult;

            headGroup.rotation.x = rotX;
            headGroup.rotation.y = rotY;
        };

        // ---- Camera: orbit + smoothed dolly + cinematic ----
        // Presets are OFFSETS from base camera position (which is now portrait
        // distance, z=24). Mix of pull-backs (positive z), modest pushes, and
        // wide off-axis framings — variance over intensity, calm over flashy.
        // 'beats' = total length of the moment; longer = more cinematic.
        const CINE_PRESETS = [
            // Wide pull-back — portrait/3-quarter shot, lots of negative space
            { pos: new THREE.Vector3(0, 0.3, 8), look: new THREE.Vector3(0, 0.4, 0), beats: 12 },
            // Slow off-axis drift, slightly wider
            { pos: new THREE.Vector3(3.5, 0.5, 5), look: new THREE.Vector3(-0.2, 0.4, 0), beats: 12 },
            // High pull-back, like a slow reveal
            { pos: new THREE.Vector3(0, 3.0, 6), look: new THREE.Vector3(0, -0.1, 0), beats: 14 },
            // Profile from the side — head turned silhouette
            { pos: new THREE.Vector3(6.0, 0.2, 3), look: new THREE.Vector3(-0.5, 0.4, 0), beats: 12 },
            // Modest portrait closeup (was the tight one — pulled back for breathing room)
            { pos: new THREE.Vector3(0.8, 0.3, -2.5), look: new THREE.Vector3(0, 0.4, 0), beats: 10 },
            // Low angle looking up, mid distance
            { pos: new THREE.Vector3(0, -1.5, 1.5), look: new THREE.Vector3(0, 1.2, 0), beats: 10 },
            // Subtle dutch angle from upper-left, wider
            { pos: new THREE.Vector3(-2.5, 1.5, 4), look: new THREE.Vector3(0.2, 0.3, 0), beats: 12 },
            // Slow wide drift (slightly off-axis, far)
            { pos: new THREE.Vector3(2.0, 1.0, 9), look: new THREE.Vector3(-0.2, 0.4, 0), beats: 14 }
        ];

        // easeInOutCubic
        const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

        const triggerCinematic = () => {
            // Avoid repeating the same preset twice in a row
            let preset;
            do {
                preset = CINE_PRESETS[Math.floor(Math.random() * CINE_PRESETS.length)];
            } while (preset === camState.lastPreset && CINE_PRESETS.length > 1);
            camState.lastPreset = preset;

            camState.cinePos.copy(preset.pos);
            camState.cineLook.copy(preset.look);
            const beat = window.operatorBeat;
            const msPerBeat = 60000 / beat.bpm;
            // Per-preset length (was fixed at 6 beats for everything).
            // Longer holds + slower transitions read as cinematic, not jittery.
            camState.cineDuration = msPerBeat * (preset.beats || 10);
            camState.cineStart = Date.now();
            camState.cineActive = true;
        };

        const animateCamera = (t, dt) => {
            const beat = window.operatorBeat;
            const isPlaying = beat.isPlaying;
            const env = beat.getEnvelope();

            // Schedule next cinematic — wider gaps now (24–48 beats between
            // events), so the camera mostly drifts at the calm base position
            // and only occasionally cuts to a different framing.
            if (isPlaying && !camState.cineActive) {
                if (beat.getBeatCount() >= camState.cineNextBeat) {
                    triggerCinematic();
                    const presetBeats = camState.cineDuration / (60000 / beat.bpm);
                    camState.cineNextBeat = beat.getBeatCount() + presetBeats + 24 + Math.random() * 24;
                }
            }

            // Smoothed dolly — drives off ENVELOPE (sustained energy) rather
            // than per-beat pulse, so the camera doesn't jerk every beat.
            // Magnitude is tiny: at most 0.5 units of travel.
            const targetDolly = isPlaying ? -env * 0.5 : 0;
            const dollyEase = 1 - Math.exp(-dt / 350);
            camState.dollyOffset += (targetDolly - camState.dollyOffset) * dollyEase;

            // Slower continuous orbit (was 0.00012 / 0.00004) — almost imperceptible
            const orbitSpeed = isPlaying ? 0.00006 : 0.00003;
            camState.orbitTheta += dt * orbitSpeed;
            const orbitX = Math.sin(camState.orbitTheta + camState.phaseOffset) * (isPlaying ? 1.0 : 0.5);
            const orbitY = Math.sin(camState.orbitTheta * 0.7 + camState.phaseOffset * 1.3) * (isPlaying ? 0.35 : 0.18);

            const idleX = baseCameraPos.x + orbitX;
            const idleY = baseCameraPos.y + orbitY;
            const idleZ = baseCameraPos.z + camState.dollyOffset;
            const idleLook = lookTarget;

            // Cinematic blend (no allocations — write directly to camera).
            // Phases: 25% ease in, 50% hold, 25% ease out — long enough to
            // feel intentional, no abrupt cuts.
            if (camState.cineActive) {
                const elapsed = Date.now() - camState.cineStart;
                const progress = elapsed / camState.cineDuration;
                let blend;
                if (progress < 0.25) blend = ease(progress * 4);
                else if (progress < 0.75) blend = 1.0;
                else if (progress < 1) blend = ease(1 - (progress - 0.75) * 4);
                else { blend = 0; camState.cineActive = false; }

                const cpx = baseCameraPos.x + camState.cinePos.x;
                const cpy = baseCameraPos.y + camState.cinePos.y;
                const cpz = baseCameraPos.z + camState.cinePos.z;
                const clx = lookTarget.x + camState.cineLook.x;
                const cly = lookTarget.y + camState.cineLook.y;
                const clz = lookTarget.z + camState.cineLook.z;
                const inv = 1 - blend;

                camera.position.set(
                    idleX * inv + cpx * blend,
                    idleY * inv + cpy * blend,
                    idleZ * inv + cpz * blend
                );
                camera.lookAt(
                    idleLook.x * inv + clx * blend,
                    idleLook.y * inv + cly * blend,
                    idleLook.z * inv + clz * blend
                );
            } else {
                camera.position.set(idleX, idleY, idleZ);
                camera.lookAt(idleLook);
            }
        };

        let lastT = Date.now();
        const animate = () => {
            requestAnimationFrame(animate);
            const now = Date.now();
            const dt = Math.min(now - lastT, 100); // clamp big tab-switch jumps
            lastT = now;

            if (headGroup) {
                animateEyes(now, dt);
                animateHead(now);
                updateBeatVisuals(now, dt);
                animateCamera(now, dt);
            }
            composer.render();
        };

        animate();
    }
}

customElements.define('operator-face-beat', OperatorFaceBeat);
