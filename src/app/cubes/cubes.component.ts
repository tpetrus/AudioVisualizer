import { Component, OnDestroy } from "@angular/core";
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
    public cubeArray: THREE.Mesh[] = [];
    public animationId!: number;
    private axes!: THREE.AxesHelper;
    private appliedColor = '';
    public controls: VisualizerControl[] = [
        { key: 'sensitivity', label: 'Sensitivity', type: 'range', min: 20, max: 200, step: 1, value: 70 },
        { key: 'threshold', label: 'Noise gate', type: 'range', min: 128, max: 160, step: 1, value: 130 },
        { key: 'rotation', label: 'Rotation speed', type: 'range', min: 0, max: 0.1, step: 0.005, value: 0.01 },
        { key: 'smoothing', label: 'Smoothing', type: 'range', min: 0, max: 0.95, step: 0.05, value: 0 },
        { key: 'color', label: 'Cube color', type: 'color', value: '#8826c7' },
        { key: 'axes', label: 'Show axes', type: 'checkbox', value: true },
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

        for (let x = 0; x < 46; x++) {
            for (let y = 0; y < 22; y++)
                this.createCube(x, y);
        }

        this.renderer.shadowMap.enabled = true;

        this.container?.appendChild(this.renderer.domElement);
    }

    public processAudio() {
        this.audio.fftSize = 2048;
        var bufferLength = this.audio.frequencyBinCount;
        this.audioDataArray = new Uint8Array(bufferLength);
    }

    public createCube(x: number, y: number) {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshLambertMaterial({ color: 0x8826C7, depthTest: true, depthWrite: true, side: THREE.FrontSide });
        let cube = new THREE.Mesh(geometry, material);
        this.cubeArray.push(cube);
        cube.position.set(1 * x - 22, 1 * y - 10, 0);
        cube.castShadow = true;
        this.scene.add(cube);
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

        this.cubeArray.forEach((cube, index) => {
            let value = this.audioDataArray[index];
            cube.position.z = value < threshold ? 1 : value / sensitivity;
            cube.rotation.x += rotation;
            cube.rotation.y += rotation;
            if (colorChanged) {
                (cube.material as THREE.MeshLambertMaterial).color.set(color);
            }
        })
    }

    constructor(
        private readonly _audioService: AudioService
    ) {
        const animate = () => {
            this.animationId = requestAnimationFrame(animate);

            this.animateCubes();

            this.renderer.render(this.scene, this.camera);
        }

        this._audioService.getAnalyser().subscribe(analyser => {
            if (analyser) {
                this.audio = analyser;
                this.initializeScene();
                this.processAudio();
                animate();
            }
        });
    }

    public ngOnDestroy(): void {
        this.scene.clear();
        cancelAnimationFrame(this.animationId);
    }
}