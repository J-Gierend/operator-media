/**
 * Operator Face Beat Sync - Custom version for music page
 * Pulses with the beat when music plays
 */

// Global beat state - controlled from main page
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

    // Get current beat phase (0-1, where 0 is on-beat)
    getBeatPhase() {
        if (!this.isPlaying) return 0;
        const msPerBeat = 60000 / this.bpm;
        const elapsed = Date.now() - this.startTime;
        return (elapsed % msPerBeat) / msPerBeat;
    },

    // Get pulse intensity (1 on beat, decays to 0)
    getPulse() {
        if (!this.isPlaying) return 0;
        const phase = this.getBeatPhase();
        // Sharp attack, smooth decay
        return Math.pow(1 - phase, 2);
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
                    width: 100%;
                    height: 100%;
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: transparent;
                    overflow: hidden;
                }
                canvas {
                    display: block;
                    width: 100% !important;
                    height: 100% !important;
                }
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
            backgroundColor: 0x050505  // Match page background
        };

        const LEFT_EYE_VERTEX = 5248;
        const RIGHT_EYE_VERTEX = 558;
        let eyeSize = 0.18;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(CONFIG.backgroundColor);
        const camera = new THREE.PerspectiveCamera(40, this.width / this.height, 0.1, 1000);
        camera.position.z = 16;
        camera.position.y = 0.5;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(this.width, this.height);
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);
        this.container.appendChild(renderer.domElement);

        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(this.width, this.height),
            0.4, 1.0, 0.3
        );
        composer.addPass(bloomPass);
        composer.addPass(new OutputPass());

        // Resize handler
        const resizeObserver = new ResizeObserver(() => {
            const rect = this.container.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                this.width = rect.width;
                this.height = rect.height;
                camera.aspect = this.width / this.height;
                camera.updateProjectionMatrix();
                renderer.setSize(this.width, this.height);
                composer.setSize(this.width, this.height);
            }
        });
        resizeObserver.observe(this.container);

        let headMesh, occlusionMesh, leftEye, rightEye, wireframeMat;
        let eyeMeshes = [];

        const eyeState = {
            blinkTimer: 0,
            nextBlink: 3000 + Math.random() * 4000,
            isBlinking: false,
            blinkPhase: 0,
            blinkDir: 'close'
        };

        const headMove = {
            phaseX: Math.random() * Math.PI * 2,
            phaseY: Math.random() * Math.PI * 2,
            speedX: 0.00015,
            speedY: 0.00012,
            rangeX: 0.08,
            rangeY: 0.12
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

        // Load model
        new GLTFLoader().load(CONFIG.headModelUrl, gltf => {
            const geo = gltf.scene.children[0].geometry.clone();
            geo.computeVertexNormals();

            occlusionMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true }));
            occlusionMesh.scale.set(1.8, 1.8, 1.8);
            occlusionMesh.position.y = -2;
            occlusionMesh.renderOrder = 0;
            scene.add(occlusionMesh);

            wireframeMat = new THREE.MeshBasicMaterial({
                color: CONFIG.wireframeColor,
                wireframe: true,
                transparent: true,
                opacity: 0.25,
                depthTest: true,
                depthWrite: false
            });
            headMesh = new THREE.Mesh(geo, wireframeMat);
            headMesh.scale.set(1.8, 1.8, 1.8);
            headMesh.position.y = -2;
            headMesh.renderOrder = 1;
            scene.add(headMesh);

            headMesh.userData.eyeVerts = { left: LEFT_EYE_VERTEX, right: RIGHT_EYE_VERTEX };

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
                    eyeState.nextBlink = 3000 + Math.random() * 4000;
                    return 1.0;
                }
                return eyeState.blinkPhase;
            }
        };

        // BEAT-SYNCED PULSE
        const updateBeatPulse = (t) => {
            if (!wireframeMat) return;

            const beat = window.operatorBeat;
            const pulse = beat.getPulse();
            const isPlaying = beat.isPlaying;

            // Base values when not playing
            const baseOpacity = 0.25;
            const baseBloom = 0.3;

            if (isPlaying) {
                // INTENSE beat pulse when playing
                wireframeMat.opacity = baseOpacity + pulse * 0.5;
                bloomPass.strength = baseBloom + pulse * 0.8;

                // Pulse eye glow too
                eyeMeshes.forEach(eye => {
                    const pupil = eye.getObjectByName('pupil');
                    const outerGlow = eye.getObjectByName('outerGlow');
                    if (pupil) pupil.material.opacity = 1.0 + pulse * 0.5;
                    if (outerGlow) outerGlow.material.opacity = 0.2 + pulse * 0.3;
                });
            } else {
                // Subtle idle pulse
                const wave = Math.sin(t * 0.002) * 0.05;
                wireframeMat.opacity = baseOpacity + wave;
                bloomPass.strength = baseBloom + wave;
            }
        };

        const animateEyes = (t, dt) => {
            if (!leftEye || !rightEye || !headMesh) return;
            const verts = headMesh.userData.eyeVerts;
            const pos = headMesh.geometry.attributes.position;
            if (verts && pos) {
                const leftLocal = new THREE.Vector3(pos.getX(verts.left), pos.getY(verts.left), pos.getZ(verts.left));
                const rightLocal = new THREE.Vector3(pos.getX(verts.right), pos.getY(verts.right), pos.getZ(verts.right));
                headMesh.localToWorld(leftLocal);
                headMesh.localToWorld(rightLocal);
                leftEye.position.copy(leftLocal);
                rightEye.position.copy(rightLocal);
                leftEye.rotation.copy(headMesh.rotation);
                rightEye.rotation.copy(headMesh.rotation);
            }
            const blink = updateBlink(dt);
            leftEye.scale.y = rightEye.scale.y = blink;

            // Beat pulse on eye scale
            const pulse = window.operatorBeat.getPulse();
            const baseScale = 0.95 + Math.sin(t * 0.002) * 0.05;
            leftEye.scale.x = rightEye.scale.x = baseScale + pulse * 0.1;
        };

        const animateHead = (t, dt) => {
            if (!headMesh || !occlusionMesh) return;

            const beat = window.operatorBeat;
            const pulse = beat.getPulse();

            // Breathing + beat pulse
            const breathe = Math.sin(t * 0.0003) * 0.002;
            const beatScale = beat.isPlaying ? pulse * 0.01 : 0;
            headMesh.scale.y = occlusionMesh.scale.y = 1.8 * (1 + breathe + beatScale);

            // Head movement - more active when music plays
            const moveMult = beat.isPlaying ? 1.5 : 1.0;
            const rotX = Math.sin(t * headMove.speedX + headMove.phaseX) * headMove.rangeX * moveMult;
            const rotY = Math.sin(t * headMove.speedY + headMove.phaseY) * headMove.rangeY * moveMult;

            headMesh.rotation.x = occlusionMesh.rotation.x = rotX;
            headMesh.rotation.y = occlusionMesh.rotation.y = rotY;
        };

        let lastT = Date.now();
        const animate = () => {
            requestAnimationFrame(animate);
            const now = Date.now();
            const dt = now - lastT;
            lastT = now;

            if (headMesh) {
                animateEyes(now, dt);
                animateHead(now, dt);
                updateBeatPulse(now);
            }
            composer.render();
        };

        animate();
    }
}

customElements.define('operator-face-beat', OperatorFaceBeat);
