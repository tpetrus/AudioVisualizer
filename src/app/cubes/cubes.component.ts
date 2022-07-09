import { Component, OnDestroy } from "@angular/core";
import * as THREE from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { AudioService } from "../services/audio.service";

@Component({
    selector: 'cubes',
    templateUrl: './cubes.component.html',
    styleUrls: ['./cubes.component.scss']
  })
export class CubesComponent implements OnDestroy{
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

        this.scene.add(new THREE.AxesHelper(10));

        this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 500);
        this.camera.position.set(0, 0, 20);

        new OrbitControls(this.camera, this.renderer.domElement);

        for(let x =0; x < 46; x++) {
            for(let y=0; y < 22; y++)
            this.createCube(x,y);
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
        const geometry = new THREE.BoxGeometry( 1, 1, 1 );
        const material = new THREE.MeshLambertMaterial( { color: 0x8826C7, depthTest: true, depthWrite: true, side: THREE.FrontSide } );
        let cube = new THREE.Mesh(geometry, material);
        this.cubeArray.push(cube);
        cube.position.set(1*x-22, 1*y-10, 0);
        cube.castShadow = true;
        this.scene.add(cube);
    }

    public animateCubes() {
        this.audio.getByteTimeDomainData(this.audioDataArray);

        this.cubeArray.forEach((cube, index) => {
            let value = this.audioDataArray[index];
            if(value < 130) {
                cube.position.z = 1;
                cube.rotation.x += .01;
                cube.rotation.y += .01;
            }
            else {
                cube.position.z = value/70;
                cube.rotation.x += .01;
                cube.rotation.y += .01;
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
            if(analyser) {
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