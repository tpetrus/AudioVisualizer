import { Component, HostListener, OnDestroy } from "@angular/core";
import { Subscription } from "rxjs";
import * as THREE from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { AudioService } from "../services/audio.service";
import { VisualizerControl } from "../control-panel/control-panel.component";
import { controlValue } from "../control-panel/controls";
import { PencilFlagsMesh } from "src/assets/meshes/pencil-flags.mesh";

// One sheet of flags showing a slice of the spectrum.
interface BandDefinition {
  name: string;
  // Keys of the settings controls that hold this band's lower/upper edge (Hz) and height multiplier.
  lowKey: string;
  highKey: string;
  heightKey: string;
  // Analysis window: long for bass (fine frequency detail), short for highs (fast, percussive).
  fftSize: number;
  // How quickly this band's bars fall back, as a fraction of the "Fall speed" setting (on top of the depth-based
  // slowing). The bass needs to fall gently or it looks jumpy.
  fallFactor: number;
  // Spreads each column's value over its neighbors (a Gaussian blur, standard deviation in columns) so a strong
  // frequency becomes a rounded hill instead of a spike next to a dip. The bass has the fewest frequency points per
  // column, so it needs the most.
  blurColumns: number;
  // Anything quieter than this (dB) is drawn as nothing. A higher floor hides faint leakage from other instruments,
  // e.g. the spread of a snare hit into the low frequencies; it only needs to be this high for the bass.
  minDecibels: number;
  // The band is never smoothed less than this, whatever the "Smoothing" setting is.
  minSmoothing: number;
  // The hue runs once from startHue to endHue along the sheet (0..1 of the color wheel).
  startHue: number;
  endHue: number;
}

// A band's sheet along with the audio it reads from.
interface Sheet {
  definition: BandDefinition;
  mesh: PencilFlagsMesh;
  analyser?: AnalyserNode;
  // Normalized Gaussian weights for the column blur, centered on the middle entry.
  kernel: Float32Array;
  data: Uint8Array;
  // Current (unscaled) height of every bar, row by row: heights[row * width + column].
  heights: Float32Array;
  // Slowly decaying peak of this band, used to balance loudness between bands.
  peak: number;
}

// Three sheets, one per band: highs in front, then mids, then bass at the back.
@Component({
  selector: 'app-basic-color-wave',
  templateUrl: './basic-color-wave.component.html',
  styleUrls: ['./basic-color-wave.component.scss']
})
export class BasicColorWaveComponent implements OnDestroy {
  private readonly axesHelper: boolean = false;
  public container!: HTMLElement | null;
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;
  public renderer!: THREE.WebGLRenderer;
  public audio!: AnalyserNode;

  private readonly flagDepth: number = 8;
  private readonly flagWidth: number = 256;
  private readonly flagDistance: number = 10;
  // Each sheet is flagDepth rows deep, so leave room for all of them plus a small gap.
  private readonly sheetSpacing = this.flagDepth * this.flagDistance + 10;
  // With the default camera (10° vertical field of view, 3800 units back) the bottom edge of the screen is about
  // 326-348 units below center, depending on how far away a row is. Every bar starts at this same level, just below it.
  private readonly baseHeight = -356;
  // Bars on each sheet further back are taller by a factor of "Growth per sheet" (so heights grow exponentially:
  // front = frontHeightScale, next = front * growth, next = front * growth^2), so a tall front sheet doesn't hide them.
  private readonly frontHeightScale = 1.5;
  // Each bar is a pencil: a straight six-sided body (pencilRadius is the distance from its middle to a corner, in the
  // same units as flagDistance) that ends in a sharpened tip tipLength long. Bars shorter than the tip are all tip.
  private readonly pencilRadius = 4.2;
  private readonly tipLength = 26;
  // How solid the bars are (1 = opaque).
  private readonly barOpacity = 0.8;
  // Rows get lower from the farthest row (1) to the nearest (0.55), so the bars behind are not hidden by the ones in front.
  private readonly rowFalloff = Array.from({ length: this.flagDepth }, (_, row) => 1 - 0.45 * row / (this.flagDepth - 1));
  private readonly minHz = 25;
  // Band loudness balancing: bars are scaled so a band's recent peak maps to TARGET_LEVEL (0..255), but a quiet
  // band is never boosted beyond what a PEAK_FLOOR-level signal would give, so silence stays flat.
  private readonly targetLevel = 200;
  private readonly peakFloor = 60;
  private readonly peakDecay = 0.995;
  // Bars get lazier the further back they are, from the front row of the front sheet (depth 0) to the last row of the
  // last sheet (depth 1). Each row chases the row in front of it, so a hit travels back as a ripple.
  //  - rise: the fraction of the gap a bar closes each frame (1 = jump straight up),
  //  - fall: how fast a bar drops, as a fraction of the "Fall speed" setting.
  private readonly backRiseRate = 0.1;
  private readonly backFallFactor = 0.25;
  private readonly targets = new Float32Array(this.flagWidth);
  private readonly blurred = new Float32Array(this.flagWidth);

  // Front to back: highs, mids, bass. Hues go by position: red -> orange, blue -> indigo, indigo -> violet.
  private readonly bands: BandDefinition[] = [
    { name: 'Highs', lowKey: 'midsHigh', highKey: 'highsHigh', heightKey: 'highsHeight', fftSize: 1024, fallFactor: 1, blurColumns: 1.5, minDecibels: -90, minSmoothing: 0.75, startHue: 0, endHue: 0.08 },
    { name: 'Mids', lowKey: 'bassHigh', highKey: 'midsHigh', heightKey: 'midsHeight', fftSize: 2048, fallFactor: 1, blurColumns: 3, minDecibels: -90, minSmoothing: 0, startHue: 0.667, endHue: 0.736 },
    { name: 'Bass', lowKey: 'bassLow', highKey: 'bassHigh', heightKey: 'bassHeight', fftSize: 4096, fallFactor: 1, blurColumns: 7, minDecibels: -90, minSmoothing: 0.4, startHue: 0.736, endHue: 0.806 },
  ];
  private sheets: Sheet[] = [];

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
  public controls: VisualizerControl[] = [
    // Heights
    { section: 'Heights', key: 'masterHeight', label: 'Overall height', type: 'range', min: 0.2, max: 4, step: 0.1, value: 1 },
    { section: 'Heights', key: 'heightGrowth', label: 'Growth per sheet', type: 'range', min: 1, max: 4, step: 0.1, value: 1.5 },
    { section: 'Heights', key: 'highsHeight', label: 'Highs height', type: 'range', min: 0, max: 12, step: 0.1, value: 1 },
    { section: 'Heights', key: 'midsHeight', label: 'Mids height', type: 'range', min: 0, max: 12, step: 0.1, value: 1.3 },
    { section: 'Heights', key: 'bassHeight', label: 'Bass height', type: 'range', min: 0, max: 12, step: 0.1, value: 1 },
    // Which frequencies each sheet shows
    { section: 'Frequency ranges', key: 'bassLow', label: 'Lowest note (Hz)', type: 'range', min: 20, max: 60, step: 5, value: 25 },
    { section: 'Frequency ranges', key: 'bassHigh', label: 'Bass / mids split (Hz)', type: 'range', min: 60, max: 500, step: 10, value: 140 },
    { section: 'Frequency ranges', key: 'midsHigh', label: 'Mids / highs split (Hz)', type: 'range', min: 1500, max: 8000, step: 100, value: 4000 },
    { section: 'Frequency ranges', key: 'highsHigh', label: 'Highest note (Hz)', type: 'range', min: 8000, max: 20000, step: 500, value: 16000 },
    // How the bars move
    { section: 'Motion', key: 'smoothing', label: 'Smoothing', type: 'range', min: 0, max: 0.95, step: 0.05, value: 0.5 },
    { section: 'Motion', key: 'fall', label: 'Fall speed', type: 'range', min: 1, max: 30, step: 1, value: 8 },
    // Where the sheets sit on screen
    { section: 'Position', key: 'moveX', label: 'Move left / right', type: 'range', min: -1500, max: 1500, step: 10, value: 0 },
    { section: 'Position', key: 'moveY', label: 'Move down / up', type: 'range', min: -300, max: 300, step: 5, value: 0 },
  ];
  public animate = () => {
    this.animationId = requestAnimationFrame(this.animate);

    const smoothing = controlValue<number>(this.controls, 'smoothing');
    const fall = controlValue<number>(this.controls, 'fall');
    this.orbit!.enabled = !this.cameraLocked;
    this.positionSheets();
    this.sheets.forEach((sheet, index) => this.animateSheet(sheet, index, smoothing, fall));

    this.renderer.render(this.scene, this.camera);
  }

  // Keeps the picture filling the window when it is resized or the page is zoomed.
  @HostListener('window:resize')
  onResize() {
    if (!this.renderer) {
      return;
    }
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  public initializeScene() {
    this.container = document.getElementById('container');
    this.scene = new THREE.Scene();

    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // A canvas is inline by default, which leaves a few pixels of page showing under it.
    this.renderer.domElement.style.display = 'block';
    this.renderer.physicallyCorrectLights = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.scene.background = new THREE.Color(0x000000);

    if (this.axesHelper) {
      this.scene.add(new THREE.AxesHelper(10))
    }

    this.sheets = this.bands.map((definition, index) => {
      const mesh = new PencilFlagsMesh(this.flagDepth, this.flagWidth, this.flagDistance,
        this.createColors(definition.startHue, definition.endHue), this.pencilRadius, this.barOpacity);
      for (let row = 0; row < this.flagDepth; row++) {
        mesh.setTipLength(row, this.tipLength);
      }
      this.scene.add(mesh.mesh);
      return { definition, mesh, kernel: this.createKernel(definition.blurColumns), data: new Uint8Array(0), heights: new Float32Array(this.flagWidth * this.flagDepth), peak: 0 };
    });

    this.camera = new THREE.PerspectiveCamera(10, window.innerWidth / window.innerHeight, 1, 5000);

    // Straight in front of the middle of the sheets, so the view is symmetrical and the bottom edge of the screen is
    // at the same height all the way across.
    this.camera.position.set(0, 0, 3800);

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enabled = !this.cameraLocked;
    this.trackView(this.orbit);

    this.renderer.shadowMap.enabled = true;

    this.container?.appendChild(this.renderer.domElement);
  }

  // Places the stack, shifted by the "Move" sliders.
  private positionSheets() {
    // Columns are flagDistance apart, so this centers the sheets on the middle of the screen.
    const x = -(this.flagWidth - 1) * this.flagDistance / 2 + controlValue<number>(this.controls, 'moveX');
    const y = this.baseHeight + controlValue<number>(this.controls, 'moveY');
    this.sheets.forEach((sheet, index) => sheet.mesh.mesh.position.set(x, y, -index * this.sheetSpacing));
  }

  // Columns are spaced logarithmically across the band, so the low end of each band gets the most room. The nearest
  // row of each sheet follows the spectrum directly; every other row chases the row in front of it, rising and
  // falling more slowly the further back it is.
  private animateSheet(sheet: Sheet, index: number, smoothing: number, fall: number) {
    const analyser = sheet.analyser!;
    analyser.smoothingTimeConstant = Math.max(smoothing, sheet.definition.minSmoothing);
    analyser.getByteFrequencyData(sheet.data);

    const { lowKey, highKey, heightKey, fallFactor } = sheet.definition;
    const growth = Math.pow(controlValue<number>(this.controls, 'heightGrowth'), index);
    const heightScale = this.frontHeightScale * growth;
    const lowHz = controlValue<number>(this.controls, lowKey);
    const highHz = controlValue<number>(this.controls, highKey);
    const height = controlValue<number>(this.controls, heightKey) * controlValue<number>(this.controls, 'masterHeight');
    const binHz = analyser.context.sampleRate / analyser.fftSize;
    const lastBin = sheet.data.length - 1;
    const ratio = highHz / lowHz;

    // Sample the spectrum for each column and find the band's loudest value this frame.
    let frameMax = 0;
    for (let column = 0; column < this.flagWidth; column++) {
      const bin = lowHz * Math.pow(ratio, column / (this.flagWidth - 1)) / binHz;
      const lower = Math.min(Math.floor(bin), lastBin);
      const mix = bin - lower;
      // Interpolate between bins because narrow bands only cover a handful of them.
      const value = sheet.data[lower] * (1 - mix) + sheet.data[Math.min(lower + 1, lastBin)] * mix;
      this.targets[column] = value;
    }

    // Blur across the columns, then find the band's loudest value.
    this.blurTargets(sheet.kernel);
    for (let column = 0; column < this.flagWidth; column++) {
      frameMax = Math.max(frameMax, this.targets[column]);
    }

    sheet.peak = Math.max(frameMax, sheet.peak * this.peakDecay);
    const gain = this.targetLevel / Math.max(sheet.peak, this.peakFloor);
    const scale = gain * height * heightScale;
    const lastRow = this.sheets.length * this.flagDepth - 1;

    // Rows are laid out toward the camera, so the last row of a sheet is its nearest and the first row its farthest.
    // Go from the nearest row to the farthest so each row can chase the (already updated) row in front of it.
    for (let row = this.flagDepth - 1; row >= 0; row--) {
      // 0 at the nearest row of the front sheet, 1 at the farthest row of the last sheet.
      const depth = (index * this.flagDepth + (this.flagDepth - 1 - row)) / lastRow;
      const riseRate = 1 - (1 - this.backRiseRate) * depth;
      // The fall step is divided by the sheet's scale so it looks the same speed on screen whatever the height.
      const fallStep = fall * fallFactor / growth * (1 - (1 - this.backFallFactor) * depth);

      for (let column = 0; column < this.flagWidth; column++) {
        const slot = row * this.flagWidth + column;
        const target = row === this.flagDepth - 1 ? this.targets[column] : sheet.heights[slot + this.flagWidth];
        const current = sheet.heights[slot];
        const next = target > current ? current + (target - current) * riseRate : Math.max(target, current - fallStep);
        sheet.heights[slot] = next;
        sheet.mesh.setFlagHeight(column, row, next * scale * this.rowFalloff[row]);
      }
    }

    sheet.mesh.heightAttribute.needsUpdate = true;
  }

  private createKernel(sigma: number): Float32Array {
    const radius = Math.max(1, Math.ceil(sigma * 3));
    const kernel = new Float32Array(radius * 2 + 1);
    let total = 0;
    for (let i = -radius; i <= radius; i++) {
      kernel[i + radius] = Math.exp(-(i * i) / (2 * sigma * sigma));
      total += kernel[i + radius];
    }
    return kernel.map(weight => weight / total);
  }

  // Convolves the column values with the kernel, repeating the edge values past the ends.
  private blurTargets(kernel: Float32Array) {
    const radius = (kernel.length - 1) / 2;
    for (let column = 0; column < this.flagWidth; column++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const source = Math.min(this.flagWidth - 1, Math.max(0, column + k));
        sum += this.targets[source] * kernel[k + radius];
      }
      this.blurred[column] = sum;
    }
    this.targets.set(this.blurred);
  }

  // Walks the flags in a snake along the length of the sheet (left to right on one row, right to left on the
  // next, ...) and advances the hue a small step at every flag, from startHue at the first flag to endHue at the last.
  private createColors(startHue: number, endHue: number): THREE.Color[] {
    const totalFlags = this.flagWidth * this.flagDepth;
    const flagColors: THREE.Color[] = new Array(totalFlags);
    let step = 0;

    for (let row = 0; row < this.flagDepth; row++) {
      for (let i = 0; i < this.flagWidth; i++) {
        const column = row % 2 === 0 ? i : this.flagWidth - 1 - i;
        const hue = startHue + (endHue - startHue) * step / (totalFlags - 1);
        flagColors[column * this.flagDepth + row] = new THREE.Color().setHSL(hue, 0.85, 0.55);
        step++;
      }
    }

    return flagColors;
  }

  // Gives each sheet its own analyser tapped from the shared one. Called again whenever the audio source changes.
  public initializeAudio() {
    this.disconnectBands();

    const context = this.audio.context;
    this.sheets.forEach(sheet => {
      const analyser = context.createAnalyser();
      analyser.fftSize = sheet.definition.fftSize;
      analyser.minDecibels = sheet.definition.minDecibels;
      analyser.maxDecibels = -20;
      this.audio.connect(analyser);
      sheet.analyser = analyser;
      sheet.data = new Uint8Array(analyser.frequencyBinCount);
    });
  }

  private disconnectBands() {
    this.sheets.forEach(sheet => {
      if (sheet.analyser) {
        try {
          this.audio?.disconnect(sheet.analyser);
        } catch { }
        sheet.analyser.disconnect();
        sheet.analyser = undefined;
      }
    });
  }

  constructor(private readonly _audioService: AudioService) {
    this.audioSubscription = this._audioService.getAnalyser().subscribe(analyser => {
      if (analyser) {
        this.audio = analyser;
        if (this.scene) {
          // The audio source changed: keep the scene and just rebind to the new analyser.
          this.initializeAudio();
          return;
        }
        this.initializeScene();
        this.initializeAudio();
        this.animate();
      }
    });
  }

  ngOnDestroy(): void {
    this.audioSubscription.unsubscribe();
    this.disconnectBands();
    if (this.scene && this.animationId) {
      this.scene.clear();
      cancelAnimationFrame(this.animationId);
    }
  }
}
