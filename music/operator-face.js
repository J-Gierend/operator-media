/**
 * Operator Face Web Component
 * Usage: <operator-face width="300" height="300"></operator-face>
 *
 * Attributes:
 *   width    - Width in pixels (default: 300)
 *   height   - Height in pixels (default: 300)
 *   controls - Show controls panel: "true" or "false" (default: false)
 */

const OPERATOR_FACE_VERSION = '0.9';

class OperatorFace extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        const widthAttr = this.getAttribute('width') || '300';
        const heightAttr = this.getAttribute('height') || '300';
        const showControls = this.getAttribute('controls') === 'true';

        // Handle both pixel and percentage values
        const width = widthAttr.includes('%') ? widthAttr : `${widthAttr}px`;
        const height = heightAttr.includes('%') ? heightAttr : `${heightAttr}px`;

        this.shadowRoot.innerHTML = `
            <style>
                :host { display: block; width: 100%; height: 100%; position: relative; }
                .container {
                    width: 100%;
                    height: 100%;
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: #000000;
                    overflow: hidden;
                }
                canvas {
                    display: block;
                    width: 100% !important;
                    height: 100% !important;
                }
                .controls {
                    position: absolute; top: 10px; right: 10px;
                    background: rgba(0, 20, 10, 0.85); border: 1px solid #00ff41;
                    padding: 10px; font-size: 10px; font-family: monospace;
                    display: ${showControls ? 'block' : 'none'};
                }
                .controls label { color: #00ff41; display: block; margin: 5px 0 2px; opacity: 0.8; }
                .controls input[type="range"] { width: 100px; accent-color: #00ff41; }
                .loading {
                    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    color: #00ff41; font-family: monospace; font-size: 12px;
                    text-shadow: 0 0 10px #00ff41;
                }
                .vignette {
                    display: none;  /* Removed for music page */
                }
                .scanlines {
                    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                    pointer-events: none;
                    background: repeating-linear-gradient(
                        0deg,
                        transparent,
                        transparent 2px,
                        rgba(0, 0, 0, 0.15) 2px,
                        rgba(0, 0, 0, 0.15) 4px
                    );
                    opacity: 0.4;
                }
            </style>
            <div class="container">
                <div class="loading">Loading...</div>
                <div class="controls">
                    <label>Glow</label>
                    <input type="range" id="bloom" min="0" max="1" value="0.35" step="0.05">
                    <label>Eye Size</label>
                    <input type="range" id="eyeSize" min="0.05" max="0.5" value="0.15" step="0.01">
                </div>
                <div class="vignette"></div>
                <div class="scanlines"></div>
            </div>
        `;

        this.container = this.shadowRoot.querySelector('.container');
        this.loadingEl = this.shadowRoot.querySelector('.loading');

        // Defer initialization to get actual container dimensions
        requestAnimationFrame(() => {
            const rect = this.container.getBoundingClientRect();
            this.width = rect.width || 300;
            this.height = rect.height || 300;
            this.loadThreeJS();
        });
    }

    async loadThreeJS() {
        // Dynamically import Three.js
        const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
        const { GLTFLoader } = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js');
        const { EffectComposer } = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js');
        const { RenderPass } = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPass.js');
        const { UnrealBloomPass } = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js');
        const { OutputPass } = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/OutputPass.js');

        this.initScene(THREE, GLTFLoader, EffectComposer, RenderPass, UnrealBloomPass, OutputPass);
    }

    initScene(THREE, GLTFLoader, EffectComposer, RenderPass, UnrealBloomPass, OutputPass) {
        const CONFIG = {
            headModelUrl: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/LeePerrySmith/LeePerrySmith.glb',
            wireframeColor: 0x00ff41,
            backgroundColor: 0x000000  // Pure black
        };

        const LEFT_EYE_VERTEX = 5248;
        const RIGHT_EYE_VERTEX = 558;

        let eyeSize = 0.15;
        let eyeGlowIntensity = 1.2;  // 80% of max

        // Performance detection
        const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(navigator.userAgent);
        const isLowPower = isMobile || navigator.hardwareConcurrency <= 4;

        // Scene setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(CONFIG.backgroundColor);
        const camera = new THREE.PerspectiveCamera(40, this.width / this.height, 0.1, 1000);
        camera.position.z = 10;  // Closer = bigger face
        camera.position.y = 0.5; // Slightly higher for portrait framing

        const renderer = new THREE.WebGLRenderer({ antialias: !isMobile });
        renderer.setSize(this.width, this.height);
        renderer.setPixelRatio(isLowPower ? 1 : Math.min(devicePixelRatio, 2));
        this.container.appendChild(renderer.domElement);

        // Post-processing
        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(this.width, this.height),
            isLowPower ? 0.25 : 0.35,  // Subtle but visible eye glow
            1.0, 0.3
        );
        composer.addPass(bloomPass);
        composer.addPass(new OutputPass());

        // Resize handler - update renderer when container size changes
        const handleResize = () => {
            const rect = this.container.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                this.width = rect.width;
                this.height = rect.height;
                camera.aspect = this.width / this.height;
                camera.updateProjectionMatrix();
                renderer.setSize(this.width, this.height);
                composer.setSize(this.width, this.height);
                bloomPass.resolution.set(this.width, this.height);
            }
        };

        // Use ResizeObserver for responsive sizing
        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(this.container);

        // Controls
        const bloomSlider = this.shadowRoot.getElementById('bloom');
        const eyeSizeSlider = this.shadowRoot.getElementById('eyeSize');
        if (bloomSlider) bloomSlider.oninput = e => bloomPass.strength = +e.target.value;
        if (eyeSizeSlider) eyeSizeSlider.oninput = e => { eyeSize = +e.target.value; updateEyeSize(); };

        // State
        let headMesh, occlusionMesh, leftEye, rightEye, wireframeMat;
        const eyeState = { blinkTimer: 0, nextBlink: 3000 + Math.random() * 4000, isBlinking: false, blinkPhase: 0, blinkDir: 'close' };
        // Continuous electric pulse - subtle, always flowing
        const pulseState = { baseOpacity: 0.35, baseBloom: 0.35 };
        // Two-layer movement: continuous sinusoidal motion for natural idle feel
        // Random phase offsets create organic, non-repeating patterns
        // Subtle head movement - like someone breathing, staying present
        const headMove = {
            phaseX: Math.random() * Math.PI * 2,
            phaseY: Math.random() * Math.PI * 2,
            speedX: 0.00006,   // Slow wobble
            speedY: 0.00005,
            rangeX: 0.06,      // Gentle nod
            rangeY: 0.09       // Subtle turn
        };

        // Slow zoom in/out - very gradual, cinematic
        const zoomMove = {
            phase: Math.PI / 2,  // Start zoomed out
            speed: 0.00002,      // Very slow zoom (long cycle)
            baseZ: 25,           // Start further out
            range: 4             // Zoom between 21 and 29
        };

        // Subtle camera drift - like you're slightly shifting weight while watching
        const camMove = {
            phaseX: Math.random() * Math.PI * 2,
            phaseY: Math.random() * Math.PI * 2,
            phaseLookX: Math.random() * Math.PI * 2,
            phaseLookY: Math.random() * Math.PI * 2,
            speedX: 0.00003,    // Slow drift
            speedY: 0.000025,
            speedLookX: 0.00002,
            speedLookY: 0.000015,
            rangeX: 0.25,       // Side drift (viewer sway)
            rangeY: 0.12,       // Up/down drift
            rangeLookX: 0.03,   // Slight gaze wander
            rangeLookY: 0.02
        };
        const perf = { frames: 0, startTime: 0, checked: false, bloomDisabled: false };
        let eyeMeshes = [];

        const createEye = () => {
            const g = new THREE.Group();
            const c = CONFIG.wireframeColor;
            const mat = (col, op) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });

            const outerGlow = new THREE.Mesh(new THREE.CircleGeometry(eyeSize * 2.0, 32), mat(c, 0.15));
            outerGlow.renderOrder = 10; outerGlow.name = 'outerGlow'; g.add(outerGlow);

            const pupil = new THREE.Mesh(new THREE.CircleGeometry(eyeSize, 32), mat(c, eyeGlowIntensity));
            pupil.position.z = 0.02; pupil.renderOrder = 11; pupil.name = 'pupil'; g.add(pupil);

            const core = new THREE.Mesh(new THREE.CircleGeometry(eyeSize * 0.4, 24), mat(0xffffff, 1.0));
            core.position.z = 0.03; core.renderOrder = 12; core.name = 'core'; g.add(core);

            eyeMeshes.push(g);
            return g;
        };

        const updateEyeSize = () => {
            eyeMeshes.forEach(eye => {
                const outerGlow = eye.getObjectByName('outerGlow');
                const pupil = eye.getObjectByName('pupil');
                const core = eye.getObjectByName('core');
                if (outerGlow) outerGlow.geometry = new THREE.CircleGeometry(eyeSize * 2.0, 32);
                if (pupil) pupil.geometry = new THREE.CircleGeometry(eyeSize, 32);
                if (core) core.geometry = new THREE.CircleGeometry(eyeSize * 0.4, 24);
            });
        };

        // Load model
        new GLTFLoader().load(CONFIG.headModelUrl, gltf => {
            const geo = gltf.scene.children[0].geometry.clone();
            geo.computeVertexNormals();

            occlusionMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true }));
            occlusionMesh.scale.set(1.8, 1.8, 1.8); occlusionMesh.position.y = -2; occlusionMesh.renderOrder = 0;
            scene.add(occlusionMesh);

            wireframeMat = new THREE.MeshBasicMaterial({ color: CONFIG.wireframeColor, wireframe: true, transparent: true, opacity: 0.35, depthTest: true, depthWrite: false });
            headMesh = new THREE.Mesh(geo, wireframeMat);
            headMesh.scale.set(1.8, 1.8, 1.8); headMesh.position.y = -2; headMesh.renderOrder = 1;
            scene.add(headMesh);

            headMesh.userData.eyeVerts = { left: LEFT_EYE_VERTEX, right: RIGHT_EYE_VERTEX };

            leftEye = createEye(); rightEye = createEye();
            scene.add(leftEye); scene.add(rightEye);

            this.loadingEl.style.display = 'none';
        });

        const updateBlink = (dt) => {
            if (!eyeState.isBlinking) {
                eyeState.blinkTimer += dt;
                if (eyeState.blinkTimer > eyeState.nextBlink) {
                    eyeState.isBlinking = true; eyeState.blinkPhase = 0; eyeState.blinkDir = 'close';
                }
                return 1.0;
            }
            if (eyeState.blinkDir === 'close') {
                eyeState.blinkPhase += dt / 80;
                if (eyeState.blinkPhase >= 1) { eyeState.blinkPhase = 0; eyeState.blinkDir = 'open'; }
                return 1 - eyeState.blinkPhase;
            } else {
                eyeState.blinkPhase += dt / 180;
                if (eyeState.blinkPhase >= 1) {
                    eyeState.isBlinking = false; eyeState.blinkTimer = 0;
                    eyeState.nextBlink = 3000 + Math.random() * 4000;
                    return 1.0;
                }
                return eyeState.blinkPhase;
            }
        };

        // Glitch state - ultra quick flash then pause
        const glitchState = {
            lastGlitch: 0,
            nextGlitch: 3000 + Math.random() * 5000,  // Random 3-8 seconds between glitches
            active: false,
            flashFrames: 0,
            flashDuration: 0,
            dispX: 0,
            dispY: 0
        };

        // Ultra quick flash glitch effect
        const updatePulse = (t) => {
            if (!wireframeMat || !headMesh) return;

            // Check if it's time for a new glitch
            if (!glitchState.active && t - glitchState.lastGlitch > glitchState.nextGlitch) {
                // Start a quick glitch flash
                glitchState.active = true;
                glitchState.flashFrames = 0;
                glitchState.flashDuration = 1 + Math.floor(Math.random() * 3);  // 1-3 frames only
                // Random direction: horizontal, vertical, or diagonal
                const dir = Math.random();
                if (dir < 0.33) {
                    // Horizontal
                    glitchState.dispX = (Math.random() - 0.5) * 0.25;
                    glitchState.dispY = 0;
                } else if (dir < 0.66) {
                    // Vertical
                    glitchState.dispX = 0;
                    glitchState.dispY = (Math.random() - 0.5) * 0.15;
                } else {
                    // Diagonal
                    glitchState.dispX = (Math.random() - 0.5) * 0.2;
                    glitchState.dispY = (Math.random() - 0.5) * 0.12;
                }
            }

            // Base stable state
            let opacity = pulseState.baseOpacity;
            let bloom = pulseState.baseBloom;
            let dispX = 0;
            let dispY = -2;  // Base Y position
            let scaleX = 1.8;
            let scaleY = 1.8;

            // Apply glitch if active
            if (glitchState.active) {
                glitchState.flashFrames++;

                // Quick intense flash
                opacity = 0.7 + Math.random() * 0.3;
                bloom = 0.9 + Math.random() * 0.4;
                dispX = glitchState.dispX;
                dispY = -2 + glitchState.dispY;
                scaleX = 1.8 + (Math.random() - 0.5) * 0.06;
                scaleY = 1.8 + (Math.random() - 0.5) * 0.04;

                // End glitch after flash duration
                if (glitchState.flashFrames >= glitchState.flashDuration) {
                    glitchState.active = false;
                    glitchState.lastGlitch = t;
                    glitchState.nextGlitch = 2000 + Math.random() * 6000;
                }
            }

            // Apply to mesh
            headMesh.position.x = dispX;
            headMesh.position.y = dispY;
            headMesh.scale.x = scaleX;
            headMesh.scale.y = scaleY;
            occlusionMesh.position.x = dispX;
            occlusionMesh.position.y = dispY;
            occlusionMesh.scale.x = scaleX;
            occlusionMesh.scale.y = scaleY;

            wireframeMat.opacity = opacity;
            bloomPass.strength = bloom;
        };

        const animateEyes = (t, dt) => {
            if (!leftEye || !rightEye || !headMesh) return;
            const verts = headMesh.userData.eyeVerts;
            const pos = headMesh.geometry.attributes.position;
            if (verts && pos) {
                const leftLocal = new THREE.Vector3(pos.getX(verts.left), pos.getY(verts.left), pos.getZ(verts.left));
                const rightLocal = new THREE.Vector3(pos.getX(verts.right), pos.getY(verts.right), pos.getZ(verts.right));
                headMesh.localToWorld(leftLocal); headMesh.localToWorld(rightLocal);
                leftEye.position.copy(leftLocal); rightEye.position.copy(rightLocal);
                leftEye.rotation.copy(headMesh.rotation); rightEye.rotation.copy(headMesh.rotation);
            }
            const blink = updateBlink(dt);
            leftEye.scale.y = rightEye.scale.y = blink;
            const pulse = 0.95 + Math.sin(t * 0.002) * 0.05;
            leftEye.scale.x = rightEye.scale.x = pulse;
        };

        const animateHead = (t, dt) => {
            if (!headMesh || !occlusionMesh) return;

            // Subtle breathing
            const breathe = Math.sin(t * 0.0003) * 0.002;
            headMesh.scale.y = occlusionMesh.scale.y = 1.8 * (1 + breathe);

            // Continuous sinusoidal motion - smooth, constant, never abrupt
            // Multiple overlapping sine waves create organic non-repeating motion
            const rotX = Math.sin(t * headMove.speedX + headMove.phaseX) * headMove.rangeX
                       + Math.sin(t * headMove.speedX * 0.7 + headMove.phaseX * 1.3) * headMove.rangeX * 0.3;
            const rotY = Math.sin(t * headMove.speedY + headMove.phaseY) * headMove.rangeY
                       + Math.sin(t * headMove.speedY * 0.6 + headMove.phaseY * 1.7) * headMove.rangeY * 0.25;

            headMesh.rotation.x = occlusionMesh.rotation.x = rotX;
            headMesh.rotation.y = occlusionMesh.rotation.y = rotY;
        };

        const animateCamera = (t) => {
            // Continuous sinusoidal camera drift - smooth conversation feel
            // Overlapping waves prevent predictable looping
            const posX = Math.sin(t * camMove.speedX + camMove.phaseX) * camMove.rangeX
                       + Math.sin(t * camMove.speedX * 0.8 + camMove.phaseX * 1.4) * camMove.rangeX * 0.2;
            const posY = 0.5 + Math.sin(t * camMove.speedY + camMove.phaseY) * camMove.rangeY
                       + Math.sin(t * camMove.speedY * 0.7 + camMove.phaseY * 1.2) * camMove.rangeY * 0.15;

            // Slow zoom in/out
            const posZ = zoomMove.baseZ + Math.sin(t * zoomMove.speed + zoomMove.phase) * zoomMove.range;

            const lookX = Math.sin(t * camMove.speedLookX + camMove.phaseLookX) * camMove.rangeLookX;
            const lookY = Math.sin(t * camMove.speedLookY + camMove.phaseLookY) * camMove.rangeLookY;

            camera.position.x = posX;
            camera.position.y = posY;
            camera.position.z = posZ;
            camera.lookAt(lookX, lookY, 0);
        };

        const checkPerformance = () => {
            // Performance check disabled - was killing bloom on fullscreen resize
            perf.checked = true;
        };

        let lastT = Date.now();
        const animate = () => {
            requestAnimationFrame(animate);
            const now = Date.now(), dt = now - lastT;
            lastT = now;
            if (headMesh) {
                animateEyes(now, dt);
                animateHead(now, dt);
                animateCamera(now);
                if (!perf.bloomDisabled) updatePulse(now);
                checkPerformance();
            }
            composer.render();
        };

        animate();
    }
}

customElements.define('operator-face', OperatorFace);
