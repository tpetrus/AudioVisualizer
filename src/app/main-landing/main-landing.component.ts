import { Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AudioService } from '../services/audio.service';
import * as THREE from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry';
import { Font, FontLoader } from 'three/examples/jsm/loaders/FontLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { rainbowStrobeAnimation } from '../utilities/color-animations';

@Component({
  selector: 'app-main-landing',
  templateUrl: './main-landing.component.html',
  styleUrls: ['./main-landing.component.scss']
})
export class MainLandingComponent implements OnDestroy {
  public readonly BASIC_COLOR_WAVE_URL = "assets/visualization-images/basic-color-wave.png";
  public _router: Router;
  public audio!: AnalyserNode;
  public fourierData!: Uint8Array;
  public titleSize: string = '25%';
  public container!: HTMLElement | null;
  public camera!: THREE.PerspectiveCamera;
  public light!: THREE.DirectionalLight;
  public scene!: THREE.Scene;
  public renderer!: THREE.WebGLRenderer;
  public font!: Font;
  public textGeometry!: TextGeometry;
  public textMesh!: THREE.Mesh;
  public animationId!: number;
  public animate = () => {
    this.animationId = requestAnimationFrame(this.animate);
    //rainbowStrobeAnimation(this.light!.color);
    this.renderer.render(this.scene, this.camera);
  }

  public initializeScene() {
        this.container = document.getElementById('title');

				// CAMERA
				this.camera = new THREE.PerspectiveCamera( 30, window.innerWidth / this.container!.clientHeight, 1, 1500 );
				this.camera.position.set( 0, 0, 150 );

				// SCENE

				 this.scene = new THREE.Scene();
				this.scene.background = new THREE.Color( 0x000000 );
				this.scene.fog = new THREE.Fog( 0xffffff, 0, 1100);

				// LIGHTS

				this.light = new THREE.DirectionalLight( 0x0003ff, 3 );
				this.light.position.set( 0, 0, 1 ).normalize();
				this.scene.add( this.light );

        this.generateText();
        //this.scene.add(new THREE.AxesHelper(10));

        // RENDERER

        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(window.innerWidth, this.container!.clientHeight);
        this.renderer.physicallyCorrectLights = true;
				this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

				this.container?.appendChild( this.renderer.domElement );

        //new OrbitControls(this.camera, this.renderer.domElement);
  }

  public onVisualizationClick(pageUrl: string) {
    this._router.navigateByUrl(pageUrl);
  }

  public initializeAudio() {
    this.audio.fftSize = 32;
    this.audio.smoothingTimeConstant = 0;
    var bufferLength = this.audio.frequencyBinCount;
    this.fourierData = new Uint8Array(bufferLength);
    this.audio.getByteTimeDomainData(this.fourierData);
  }

  public updateFourierValues() {
    this.audio.getByteTimeDomainData(this.fourierData);
  }

  public generateText() {
    const loader = new FontLoader();
    loader.load( 'assets/fonts/paladins_gradient.json', (response) => {
      this.font = response;
      this.createTextMesh();
    });
  }

  public createTextMesh() {
    this.textGeometry = new TextGeometry('AudioVisualizer', {
      font: this.font,
      size: 10
    });

    this.textGeometry.computeBoundingBox();

    const centerOffset = - 0.5 * ( this.textGeometry.boundingBox!.max.x - this.textGeometry.boundingBox!.min.x );
    let materials = [
      new THREE.MeshPhongMaterial( { color: 0xffffff, flatShading: true } ), // front
      new THREE.MeshPhongMaterial( { color: 0xffffff } ) // side
    ];

    this.textMesh = new THREE.Mesh( this.textGeometry, materials );

    this.textMesh.position.x = centerOffset;
    this.textMesh.position.z = 0;

    this.textMesh.rotation.x = 0;
    this.textMesh.rotation.y = Math.PI * 2;

    this.textMesh.name = "AudioVisualizer";

    this.scene.add(this.textMesh);
  }

  constructor(router: Router, audioService: AudioService) {
    this._router = router;
    audioService.getAnalyser().subscribe(async analyser => {
      if(analyser) {
          this.audio = analyser;
          this.initializeAudio();
          this.initializeScene();
          this.animate();
      }
    });
  }

  ngOnDestroy(): void {
    this.scene.clear();
    cancelAnimationFrame(this.animationId);
  }
}
