import { Component } from "@angular/core";
import * as THREE from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { AudioService } from "../services/audio.service";
import { FlagsMesh } from "src/assets/meshes/flags.mesh";

@Component({
  selector: 'app-polyhedron',
  templateUrl: './polyhedron.component.html',
  styleUrls: ['./polyhedron.component.scss']
})
export class PolyhedronComponent {
    public scene!: THREE.Scene;
    public camera!: THREE.PerspectiveCamera;
    public renderer!: THREE.WebGLRenderer;
    public audio!: AnalyserNode;
    public audioDataArray!: Uint8Array;
    public flags!: FlagsMesh;
    private readonly axesHelper: boolean = false;
    // Depth*Width must equal a power of 2
    private readonly flagDepth: number = 4;
    private readonly flagWidth: number = 256;
    public animate = () => {
      requestAnimationFrame(this.animate);

      this.animateFlagMesh();

      this.renderer.render(this.scene, this.camera);
    }

    public initializeScene() {
        this.processAudio();
        this.scene = new THREE.Scene();

        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.physicallyCorrectLights = true;
				this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

        this.scene.background = new THREE.Color(0x000000);

        if(this.axesHelper) {
          this.scene.add(new THREE.AxesHelper(10))
        }

        this.flags = new FlagsMesh(this.flagDepth, this.flagWidth);

        this.flags.mesh.position.set(-this.flagWidth*5/2, 0, 0);

        this.scene.add(this.flags.mesh);

        this.camera = new THREE.PerspectiveCamera(10, window.innerWidth / window.innerHeight, 1, 5000);

        this.camera.position.set(-800, 0, 4500);

        new OrbitControls(this.camera, this.renderer.domElement);

        this.renderer.shadowMap.enabled = true;

        document.body.appendChild(this.renderer.domElement);
    }

    public animateFlagMesh() {
      this.audio.getByteTimeDomainData(this.audioDataArray);
      let offset = 4;
      let numFlags = this.flags.getNumberOfFlags();
      let positions = this.flags.positions;
      let geometry = this.flags.geometry;

      for(let n = 0; n < numFlags; n++) {
        positions[offset + n*9] = this.audioDataArray[n] > 175 || this.audioDataArray[n] < 85 ? ((this.audioDataArray[n] + 1000000)/2 - 500064)*5 : (this.audioDataArray[n] - 128)*4;
        //positions[offset + n*9] = (this.audioDataArray[n] - 128)*6;
      }

      geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
    }

    public processAudio() {
      this.audio.fftSize = this.flagDepth*this.flagWidth*2;
      var bufferLength = this.audio.frequencyBinCount;
      this.audioDataArray = new Uint8Array(bufferLength);
      this.audio.getByteTimeDomainData(this.audioDataArray);
  }

    constructor(private readonly _audioService: AudioService) {
      this._audioService.getAnalyser().subscribe(analyser => {
        if(analyser) {
            this.audio = analyser;
            this.initializeScene();
            this.processAudio();
            this.animate();
        }
      });
    }
}
