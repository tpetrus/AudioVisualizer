import { Component, OnDestroy } from "@angular/core";
import * as THREE from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { AudioService } from "../services/audio.service";
import { FlagsMesh } from "src/assets/meshes/flags.mesh";

@Component({
  selector: 'app-basic-color-wave',
  templateUrl: './basic-color-wave.component.html',
  styleUrls: ['./basic-color-wave.component.scss']
})
export class BasicColorWaveComponent implements OnDestroy {
    private readonly axesHelper: boolean = false;
    private readonly showFrequency: boolean = true;
    public container!: HTMLElement | null;
    public scene!: THREE.Scene;
    public camera!: THREE.PerspectiveCamera;
    public renderer!: THREE.WebGLRenderer;
    public audio!: AnalyserNode;
    public fourierData!: Uint8Array;
    public fourier!: FlagsMesh;
    public frequencyData!: Uint8Array;
    public frequency!: FlagsMesh;

    // Depth*Width must equal a power of 2
    private readonly flagDepth: number = 4;
    private readonly flagWidth: number = 256;
    private readonly numFlags: number = this.flagDepth*this.flagWidth;
    private readonly flagSize: number = 5;
    private readonly flagDistance: number = 10;
    public animationId!: number;
    public animate = () => {
      this.animationId = requestAnimationFrame(this.animate);

      this.animateFourierMesh();
      if(this.showFrequency){ 
        this.animateFrequencyMesh();
      }

      this.renderer.render(this.scene, this.camera);
    }

    public initializeScene() {
        this.initializeAudio();
        this.container = document.getElementById('container');
        this.scene = new THREE.Scene();

        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.physicallyCorrectLights = true;
				this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

        this.scene.background = new THREE.Color(0x000000);

        if(this.axesHelper) {
          this.scene.add(new THREE.AxesHelper(10))
        }

        this.fourier = new FlagsMesh(this.flagDepth, this.flagWidth, undefined, this.flagSize, this.flagDistance);

        this.fourier.mesh.position.set(-this.flagWidth*this.flagSize/2, 0, 0);

        this.scene.add(this.fourier.mesh);


        let frequencyColors = this.createFrequencyColorArray();

        this.frequency = new FlagsMesh(this.flagDepth, this.flagWidth, undefined, this.flagSize, this.flagDistance, undefined, undefined, frequencyColors);

        this.frequency.mesh.position.set(-this.flagWidth*this.flagSize/2, 0, -50);

        if(this.showFrequency){ 
          this.scene.add(this.frequency.mesh);
        }

        this.camera = new THREE.PerspectiveCamera(10, window.innerWidth / window.innerHeight, 1, 5000);

        this.camera.position.set(-800, 0, 3800);

        new OrbitControls(this.camera, this.renderer.domElement);

        this.renderer.shadowMap.enabled = true;

        this.container?.appendChild(this.renderer.domElement);
    }

    public animateFourierMesh() {
      this.audio.getByteTimeDomainData(this.fourierData);
      let offset = 1;
      let numFlags = this.fourier.getNumberOfFlags();
      let positions = this.fourier.positions;
      let geometry = this.fourier.geometry;

      for(let n = 0; n < numFlags; n++) {
        //positions[offset + n*9] = this.fourierData[n] > 175 || this.fourierData[n] < 85 ? ((this.fourierData[n] + 1000000)/2 - 500064)*3 : (this.fourierData[n] - 128)*5;
        //positions[offset+3 + n*9] = this.fourierData[n] > 175 || this.fourierData[n] < 85 ? ((this.fourierData[n] + 1000000)/2 - 500064)*3 : (this.fourierData[n] - 128)*5;
        //positions[offset+6 + n*9] = this.fourierData[n] > 175 || this.fourierData[n] < 85 ? ((this.fourierData[n] + 1000000)/2 - 500064)*3 : (this.fourierData[n] - 128)*5;

        //positions[offset+3 + n*9] = this.fourierData[n] > 175 || this.fourierData[n] < 85 ? ((this.fourierData[n] + 1000000)/2 - 500064)*3 : (this.fourierData[n] - 128)*5;

        positions[offset+3 + n*9] = (this.fourierData[n] - 128)*5.5 - (this.fourierData[n] - 128)*3;
        // positions[offset+6 + n*9] = (this.fourierData[n] - 128)*6;
      }

      geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
    }

    public animateFrequencyMesh() {
      this.audio.getByteFrequencyData(this.frequencyData);
      let offset = 4;
      let numFlags = this.frequency.getNumberOfFlags();
      let positions = this.frequency.positions;
      let geometry = this.frequency.geometry;

      for(let n = 0; n < numFlags; n++) {
        positions[offset + n*9] = this.frequencyData[n];
      }

      geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
    }

    public createFrequencyColorArray(): number[] {
      let numColors = this.numFlags*3;
      let colors: number[] = [];

      for(let i = 0; i < numColors; i++) {
        let flagColor = this.generateFrequencyColor();
        flagColor.forEach(rgbaValue => {
          colors.push(rgbaValue);
        })
      }

      return colors;
    }

    public generateFrequencyColor(): number[] {
      let colorValues: number[] = [];

      colorValues.push( 30 );
      colorValues.push( 30 );
      colorValues.push( 30 );
      colorValues.push( 0 );

      return colorValues;
  }

    public initializeAudio() {
      this.audio.fftSize = this.flagDepth*this.flagWidth*2;
      this.audio.smoothingTimeConstant = 0;
      var bufferLength = this.audio.frequencyBinCount;
      this.fourierData = new Uint8Array(bufferLength);
      this.frequencyData = new Uint8Array(bufferLength);
      this.audio.getByteTimeDomainData(this.fourierData);
      this.audio.getByteFrequencyData(this.frequencyData);
  }

    constructor(private readonly _audioService: AudioService) {
      this._audioService.getAnalyser().subscribe(analyser => {
        if(analyser) {
            this.audio = analyser;
            this.initializeScene();
            this.initializeAudio();
            this.animate();
        }
      });
    }

    ngOnDestroy(): void {
      this.scene.clear();
      cancelAnimationFrame(this.animationId);
    }
}
