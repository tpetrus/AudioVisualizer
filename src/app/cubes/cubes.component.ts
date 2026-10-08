import { Component, OnDestroy } from "@angular/core";
import { Subscription } from "rxjs";
import * as THREE from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
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
    private readonly columns = 46;
    private readonly rows = 22;
    private cubes!: THREE.InstancedMesh;
    private readonly dummy = new THREE.Object3D();
    private rotationAngle = 0;
    public animationId!: number;
    private audioSubscription: Subscription;
    private axes!: THREE.AxesHelper;
    private appliedColor = '';
    public controls: VisualizerControl[] = [
        { section: 'Response', key: 'sensitivity', label: 'Sensitivity', type: 'range', min: 20, max: 200, step: 1, value: 70 },
        { section: 'Response', key: 'threshold', label: 'Noise gate', type: 'range', min: 128, max: 160, step: 1, value: 130 },
        { section: 'Response', key: 'smoothing', label: 'Smoothing', type: 'range', min: 0, max: 0.95, step: 0.05, value: 0 },
        { section: 'Look', key: 'rotation', label: 'Rotation speed', type: 'range', min: 0, max: 0.1, step: 0.005, value: 0.01 },
        { section: 'Look', key: 'color', label: 'Cube color', type: 'color', value: '#8826c7' },
        { section: 'Look', key: 'axes', label: 'Show axes', type: 'checkbox', value: true },
    ];

    public initializeScene() {
        this.container = document.getElementById('container');
        this.scene = new THREE.Scene();

        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        this.scene.background = new THREE.Color(0x000000);

        var light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(0, 1.2, 10).normalize();
        this.scene.add(light);

        var light2 = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(-10, 0, 10).normalize();
        this.scene.add(light2);

        this.axes = new THREE.AxesHelper(10);
        this.scene.add(this.axes);

        this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 500);
        this.camera.position.set(0, 0, 20);

        new OrbitControls(this.camera, this.renderer.domElement);

        this.createCubes();

        this.renderer.shadowMap.enabled = true;

        this.container?.appendChild(this.renderer.domElement);
    }

    public processAudio() {
        // Only the waveform is used, and one sample per cube is needed, so the smallest window that fits keeps it crisp (~21 ms).
        this.audio.fftSize = 1024;
        // Time-domain data holds fftSize samples, oldest first.
        this.audioDataArray = new Uint8Array(this.audio.fftSize);
    }

    public createCubes() {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshLambertMaterial({ color: 0x8826C7, depthTest: true, depthWrite: true, side: THREE.FrontSide });
        this.cubes = new THREE.InstancedMesh(geometry, material, this.columns * this.rows);
        this.cubes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // Instances move every frame, so the geometry's own bounds can't be used for culling.
        this.cubes.frustumCulled = false;
        this.scene.add(this.cubes);
    }

    public animateCubes() {
        const sensitivity = controlValue<number>(this.controls, 'sensitivity');
        const threshold = controlValue<number>(this.controls, 'threshold');
        const rotation = controlValue<number>(this.controls, 'rotation');
        const color = controlValue<string>(this.controls, 'color');

        this.audio.smoothingTimeConstant = controlValue<number>(this.controls, 'smoothing');
        this.axes.visible = controlValue<boolean>(this.controls, 'axes');
        this.audio.getByteTimeDomainData(this.audioDataArray);

        const colorChanged = color !== this.appliedColor;
        this.appliedColor = color;

        if (colorChanged) {
            (this.cubes.material as THREE.MeshLambertMaterial).color.set(color);
        }

        // Every cube spins by the same amount, so a single angle is enough.
        this.rotationAngle += rotation;

        // Use the newest samples at the end of the buffer, not the oldest at the start.
        const newest = this.audioDataArray.length - this.columns * this.rows;

        for (let x = 0; x < this.columns; x++) {
            for (let y = 0; y < this.rows; y++) {
                const index = x * this.rows + y;
                const value = this.audioDataArray[newest + index];
                this.dummy.position.set(x - 22, y - 10, value < threshold ? 1 : value / sensitivity);
                this.dummy.rotation.set(this.rotationAngle, this.rotationAngle, 0);
                this.dummy.updateMatrix();
                this.cubes.setMatrixAt(index, this.dummy.matrix);
            }
        }
        this.cubes.instanceMatrix.needsUpdate = true;
    }

    constructor(
        private readonly _audioService: AudioService
    ) {
        const animate = () => {
            this.animationId = requestAnimationFrame(animate);

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