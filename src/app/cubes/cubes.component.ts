import { Component, OnDestroy } from "@angular/core";
import { Subscription } from "rxjs";
import * as THREE from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment';
import { AudioService } from "../services/audio.service";
import { VisualizerControl } from "../control-panel/control-panel.component";
import { controlValue } from "../control-panel/controls";

@Component({
    selector: 'cubes',
    templateUrl: './cubes.component.html',
    styleUrls: ['./cubes.component.scss']
})
export class CubesComponent implements OnDestroy {
    public container!: HTMLElement | null;
    public scene!: THREE.Scene;
    public camera!: THREE.PerspectiveCamera;
    public renderer!: THREE.WebGLRenderer;
    public audio!: AnalyserNode;
    public audioDataArray!: Uint8Array;
    public cube!: THREE.Mesh;
    public cube2!: THREE.Mesh;
    public hemiLight!: THREE.HemisphereLight;
    // All cubes share one geometry/material, so they are drawn as a single instanced mesh.
    // Sized in initializeScene so the grid covers the whole view.
    private columns = 46;
    private rows = 22;
    private cubes!: THREE.InstancedMesh;
    private readonly dummy = new THREE.Object3D();
    // The grid mirrors the spectrum around its centre: bass in the middle column, treble at the edges.
    private bands = Math.ceil(this.columns / 2);
    private readonly minFrequency = 40;
    private readonly maxFrequency = 14000;
    private bandBins: [number, number][] = [];
    private bandLevels = new Float32Array(this.bands);
    private readonly baseColor = new THREE.Color();
    private readonly cubeColor = new THREE.Color();
    // How far each cube has turned about its vertical axis.
    private spinAngles = new Float32Array(0);
    public animationId!: number;
    // Locked by default: the picture can't be dragged, rotated or zoomed until the lock button is clicked.
    public cameraLocked = true;
    private orbit?: OrbitControls;
    // True once the view has been moved away from its starting position (shows the reset-view button).
    public viewChanged = false;
    private defaultCameraPosition = new THREE.Vector3();
    private defaultTarget = new THREE.Vector3();

    // Remembers where the view started, and watches for it being moved.
    private trackView(orbit: OrbitControls) {
      this.defaultCameraPosition.copy(this.camera.position);
      this.defaultTarget.copy(orbit.target);
      orbit.addEventListener('change', () => {
        this.viewChanged = this.camera.position.distanceTo(this.defaultCameraPosition) > 0.5
          || orbit.target.distanceTo(this.defaultTarget) > 0.5;
      });
    }

    public resetView() {
      this.camera.position.copy(this.defaultCameraPosition);
      this.orbit!.target.copy(this.defaultTarget);
      this.orbit!.update();
      this.viewChanged = false;
    }
    private audioSubscription: Subscription;
    private axes!: THREE.AxesHelper;
    public controls: VisualizerControl[] = [
        { section: 'Response', key: 'sensitivity', label: 'Sensitivity', type: 'range', min: 0.1, max: 2, step: 0.05, value: 0.6 },
        { section: 'Response', key: 'threshold', label: 'Noise gate', type: 'range', min: 0, max: 0.7, step: 0.01, value: 0.3 },
        { section: 'Response', key: 'smoothing', label: 'Smoothing', type: 'range', min: 0, max: 0.95, step: 0.05, value: 0.85 },
        { section: 'Look', key: 'depth', label: 'Depth', type: 'range', min: 1, max: 12, step: 0.5, value: 6 },
        { section: 'Look', key: 'spin', label: 'Spin speed', type: 'range', min: 0, max: 0.05, step: 0.005, value: 0.015 },
        { section: 'Look', key: 'color', label: 'Cube color', type: 'color', value: '#8826c7' },
        { section: 'Look', key: 'axes', label: 'Show axes', type: 'checkbox', value: false },
    ];

    public initializeScene() {
        this.container = document.getElementById('container');
        this.scene = new THREE.Scene();

        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        this.scene.background = new THREE.Color(0x000000);

        // A strong key light from the upper left and a dim fill from the right, so the faces of tilted cubes
        // are shaded differently and read as solid shapes.
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
        keyLight.position.set(-6, 8, 10);
        this.scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0xaab4ff, 0.5);
        fillLight.position.set(8, -3, 6);
        this.scene.add(fillLight);

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.25));

        this.axes = new THREE.AxesHelper(10);
        this.scene.add(this.axes);

        this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 500);
        this.camera.position.set(0, 0, 32);

        this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
        this.orbit.enabled = !this.cameraLocked;
        this.trackView(this.orbit);

        // The reflections come from a studio-style environment map, not from the black background.
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();

        this.fitGridToView();
        this.createCubes();

        this.renderer.shadowMap.enabled = true;

        this.container?.appendChild(this.renderer.domElement);
    }

    // Covers the view at the grid's depth (plus a margin), whatever the window's shape.
    private fitGridToView() {
        const visibleHeight = 2 * this.camera.position.z * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
        this.rows = Math.ceil(visibleHeight) + 2;
        this.columns = Math.ceil(visibleHeight * this.camera.aspect) + 2;
        this.bands = Math.ceil(this.columns / 2);
        this.bandLevels = new Float32Array(this.bands);
    }

    public processAudio() {
        // Frequency data: 2048 samples gives ~23 Hz bins, enough to separate bass notes.
        this.audio.fftSize = 2048;
        this.audio.smoothingTimeConstant = 0.5;
        this.audioDataArray = new Uint8Array(this.audio.frequencyBinCount);
        this.bandLevels.fill(0);

        // Log-spaced frequency bands, so each column covers a similar musical range.
        const binWidth = this.audio.context.sampleRate / this.audio.fftSize;
        const ratio = this.maxFrequency / this.minFrequency;
        this.bandBins = [];
        for (let band = 0; band < this.bands; band++) {
            const start = Math.floor(this.minFrequency * Math.pow(ratio, band / this.bands) / binWidth);
            const end = Math.floor(this.minFrequency * Math.pow(ratio, (band + 1) / this.bands) / binWidth);
            this.bandBins.push([start, Math.max(end, start + 1)]);
        }
    }

    public createCubes() {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        // Glass: a smooth, clear-coated, partly transparent surface that mirrors the scene's environment.
        // Back faces are drawn too, and nothing writes depth, so overlapping cubes show through each other.
        const material = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: .5,
            roughness: 0,
            clearcoat: 1,
            clearcoatRoughness: 0,
            ior: 1.3,
            envMapIntensity: 1.4,
            transparent: true,
            opacity: .8,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.cubes = new THREE.InstancedMesh(geometry, material, this.columns * this.rows);
        this.cubes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.spinAngles = new Float32Array(this.columns * this.rows);
        // Cubes brighten as they move forward, so each one carries its own colour.
        this.cubes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.columns * this.rows * 3), 3);
        this.cubes.instanceColor.setUsage(THREE.DynamicDrawUsage);
        // Instances move every frame, so the geometry's own bounds can't be used for culling.
        this.cubes.frustumCulled = false;
        this.scene.add(this.cubes);
    }

    // Smoothed 0..1 level for each frequency band: rises quickly, falls slowly.
    private updateBandLevels(sensitivity: number, gate: number, smoothing: number) {
        this.audio.getByteFrequencyData(this.audioDataArray);

        for (let band = 0; band < this.bands; band++) {
            const [start, end] = this.bandBins[band];
            let sum = 0;
            for (let bin = start; bin < end; bin++) {
                sum += this.audioDataArray[bin];
            }
            // Music carries less energy at high frequencies, so tilt the spectrum up a little.
            const tilt = 1 + 0.8 * band / this.bands;
            const raw = Math.min(1, (sum / (end - start) / 255) * sensitivity * tilt);
            const target = Math.max(0, (raw - gate) / (1 - gate));

            const level = this.bandLevels[band];
            this.bandLevels[band] = target > level
                ? level + (target - level) * 0.6
                : level * smoothing + target * (1 - smoothing);
        }
    }

    public animateCubes() {
        const sensitivity = controlValue<number>(this.controls, 'sensitivity');
        const gate = controlValue<number>(this.controls, 'threshold');
        const smoothing = controlValue<number>(this.controls, 'smoothing');
        const depth = controlValue<number>(this.controls, 'depth');
        const spin = controlValue<number>(this.controls, 'spin');
        this.baseColor.set(controlValue<string>(this.controls, 'color'));
        this.axes.visible = controlValue<boolean>(this.controls, 'axes');

        this.updateBandLevels(sensitivity, gate, smoothing);

        const centerColumn = (this.columns - 1) / 2;
        const centerRow = (this.rows - 1) / 2;
        const reach = centerRow + 1;

        for (let x = 0; x < this.columns; x++) {
            const level = this.bandLevels[Math.floor(Math.abs(x - centerColumn))];
            for (let y = 0; y < this.rows; y++) {
                // Each column fills outward from its middle like a level meter; the edge of the fill eases in.
                const distance = Math.abs(y - centerRow);
                const raw = Math.min(1, Math.max(0, level * reach - distance + 1));
                const active = raw * raw * (3 - 2 * raw);

                const index = x * this.rows + y;
                this.dummy.position.set(x - centerColumn, y - centerRow, active * depth);
                this.dummy.scale.setScalar(0.85 + 0.15 * active);
                // Raised cubes turn to show their top and side, which is what gives them shading.
                // They also spin slowly while lifted, and ease back to the nearest full turn once they drop.
                const turn = Math.PI * 2;
                if (active > 0.05) {
                    this.spinAngles[index] += spin * 70 * Math.pow(Math.min(1, level), 3);
                } else {
                    this.spinAngles[index] += (Math.round(this.spinAngles[index] / turn) * turn - this.spinAngles[index]) * 0.1;
                }
                this.dummy.rotation.set(-0.55 * active, 0.7 * active + this.spinAngles[index], 0);
                this.dummy.updateMatrix();
                this.cubes.setMatrixAt(index, this.dummy.matrix);

                this.cubeColor.copy(this.baseColor).multiplyScalar(0.4 + 0.6 * active);
                this.cubes.setColorAt(index, this.cubeColor);
            }
        }
        this.cubes.instanceMatrix.needsUpdate = true;
        this.cubes.instanceColor!.needsUpdate = true;
    }

    constructor(
        private readonly _audioService: AudioService
    ) {
        const animate = () => {
            this.animationId = requestAnimationFrame(animate);

            this.orbit!.enabled = !this.cameraLocked;
            this.animateCubes();

            this.renderer.render(this.scene, this.camera);
        }

        this.audioSubscription = this._audioService.getAnalyser().subscribe(analyser => {
            if (analyser) {
                this.audio = analyser;
                if (this.scene) {
                    // The audio source changed: keep the scene and just rebind to the new analyser.
                    this.processAudio();
                    return;
                }
                this.initializeScene();
                this.processAudio();
                animate();
            }
        });
    }

    public ngOnDestroy(): void {
        this.audioSubscription.unsubscribe();
        this.scene.clear();
        cancelAnimationFrame(this.animationId);
    }
}