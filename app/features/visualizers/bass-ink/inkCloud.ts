import * as THREE from 'three';
import { bassInkSceneConfig } from './bassInkSceneConfig';
import { KICK_SLOTS, type DirectorCue, type KickRingView, type PalettePair } from './bassInkTypes';
import { bassInkConfig } from './bassInkConfig';
import { hash01, isGalaxyDisc, writeFormation } from './formations';
import { flowDiscPoint, inkFragmentShader, inkVertexShader } from '../meshes/inkShaders';

// Depths where the fade starts and ends, relative to the cloud center's view depth (the shader subtracts the center's),
// and following the fitted radius. Relative, so zooming the camera in or out never changes a point's fade.
function depthNear(radius: number): number {
    return -radius * bassInkSceneConfig.depth.halfRange;
}

function depthFar(radius: number): number {
    return radius * bassInkSceneConfig.depth.halfRange;
}

// Set-once scales for a cloud that is not the shell, such as the dense core inside it. Each maps onto uniforms written
// at construction that no per-frame method touches (update, setRadius, setPunch, setSwell and setTexture write other
// uniforms), so the scaled value stays for the cloud's life.
export interface InkCloudOptions {
    // Bass swell as a share of the radius (uSwellAmp); the default is the shell's.
    swellAmplitude?: number;
    // Multiplies the absolute displacements: uWaveAmp, uWaveMax, uSpectrumAmp, uNoiseBase and uNoiseMid. Default 1.
    displacementScale?: number;
    // Multiplies uAlpha. Default 1.
    alphaScale?: number;
}

// Contract C4: the point cloud of the Bass Ink visualizer.
//
// The two unit formations live in two ping-pong attributes (`position` is side A, `restB` is side B). One side is
// the active one the cloud shows; the other is filled with the next formation in chunks over several frames and then
// faded in by a uniform. The attributes are created once and never reallocated, so a transition costs no allocation
// and no GPU buffer churn. All motion (radius, breathing, shockwaves, turbulence) is in the vertex shader.
export class InkCloud {
    readonly object: THREE.Points;
    readonly pointCount: number;

    private readonly geometry = new THREE.BufferGeometry();
    // Public for the enhanced look, which swaps this material's shaders in place (see enhanced/bassInkEnhanced.ts).
    readonly material: THREE.ShaderMaterial;
    private readonly sides: readonly [THREE.BufferAttribute, THREE.BufferAttribute];
    private readonly uniforms: Record<string, THREE.IUniform>;
    private readonly kickTimes = new Float32Array(KICK_SLOTS);
    private readonly kickStrengths = new Float32Array(KICK_SLOTS);
    private readonly core = new Float32Array(3);
    private readonly edge = new Float32Array(3);
    // Formation each side holds (-1 for a baked blend of two), so the shader knows which side flows like the disc.
    private readonly sideFormations: [number, number] = [0, -1];
    // Scratch for restPosition and bakeBlend, so neither allocates.
    private readonly flowFrom = new Float32Array(3);
    private readonly flowTo = new Float32Array(3);

    // 0 when side A is the active one, 1 when side B is.
    private active: 0 | 1 = 0;
    private activeFormation = 0;
    private prepared = -1;
    private fillCursor = 0;
    private fillSeed = 0;
    // 'pending' is a transition waiting for the fill to finish; 'fading' is a running cross-fade.
    private phase: 'idle' | 'pending' | 'fading' = 'idle';
    private fadeStart = 0;
    private fadeSeconds = 0;
    private fadeRequestedStart = 0;
    // Raw 0..1 progress of the cross-fade; the shader (and restPosition) smooth it.
    private blend = 0;

    constructor(pointCount: number, seed: number, maxPointSize: number, options: InkCloudOptions = {}) {
        this.pointCount = pointCount;
        const config = bassInkSceneConfig;
        const swellAmplitude = options.swellAmplitude ?? config.cloud.swellAmplitude;
        const displacementScale = options.displacementScale ?? 1;
        const alphaScale = options.alphaScale ?? 1;

        const a = new THREE.BufferAttribute(new Float32Array(pointCount * 3), 3);
        const b = new THREE.BufferAttribute(new Float32Array(pointCount * 3), 3);
        a.setUsage(THREE.DynamicDrawUsage);
        b.setUsage(THREE.DynamicDrawUsage);
        this.sides = [a, b];
        writeFormation(0, seed, a.array as Float32Array, pointCount, 0, pointCount);

        // A fixed random number per point seeds its sparkle and turbulence phase.
        const rand = new Float32Array(pointCount);
        for (let i = 0; i < pointCount; i++) {
            rand[i] = hash01(i, seed, 9);
        }
        this.geometry.setAttribute('position', a);
        this.geometry.setAttribute('restB', b);
        this.geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));

        this.uniforms = {
            uTime: { value: 0 },
            uBlend: { value: 0 },
            uActive: { value: 0 },
            uRadius: { value: config.cloud.radius },
            uTension: { value: 0 },
            uBreath: { value: 0 },
            uPunch: { value: 0 },
            uSwell: { value: 0 },
            uMid: { value: 0 },
            uHigh: { value: 0 },
            uTurbulence: { value: 1 },
            uMaxPointSize: { value: maxPointSize },
            uPointScale: { value: 500 },
            uKickTimes: { value: this.kickTimes },
            uKickStrengths: { value: this.kickStrengths },
            uSpectrum: { value: null },
            uSpectrumHead: { value: 0 },
            uSpectrumSpan: { value: 0 },
            uSpectrumAmp: { value: config.spectrum.amplitude * displacementScale },
            uSqueeze: { value: config.cloud.tensionSqueeze },
            uBreathAmp: { value: config.cloud.breathingAmplitude },
            uPunchAmp: { value: config.cloud.beatPunch },
            uSwellAmp: { value: swellAmplitude },
            uWaveSpeed: { value: config.wave.speed },
            uWaveWidth: { value: config.wave.width },
            uWaveDecay: { value: config.wave.decay },
            uWaveAmp: { value: config.wave.amplitude * displacementScale },
            uWaveMax: { value: config.wave.maxDisplacement * displacementScale },
            uNoiseScale: { value: config.turbulence.scale },
            uNoiseBase: { value: config.turbulence.base * displacementScale },
            uNoiseMid: { value: config.turbulence.midGain * displacementScale },
            uNoiseSpeed: { value: config.turbulence.speed },
            uJitter: { value: config.turbulence.tensionJitter },
            uSparkleFraction: { value: config.sparkle.fraction },
            uSparkleAmp: { value: config.sparkle.amplitude },
            uBaseSize: { value: config.sprite.baseSize },
            uTensionSize: { value: config.sprite.tensionSizeShrink },
            uDepthNear: { value: depthNear(config.cloud.radius) },
            uDepthFar: { value: depthFar(config.cloud.radius) },
            uDepthFade: { value: config.depth.fade },
            uBassTint: { value: config.bands.bassTint },
            uSwellTint: { value: config.bands.swellTint },
            uHighTint: { value: config.bands.highTint },
            uHighWhite: { value: config.bands.highWhite },
            uCore: { value: this.core },
            uEdge: { value: this.edge },
            uBrightness: { value: 0 },
            uAlpha: { value: config.sprite.baseAlpha * alphaScale },
            uAlphaNormalization: { value: config.sprite.tensionAlphaNormalization },
            uFlowA: { value: 0 },
            uFlowB: { value: 0 },
            uFlowPhase: { value: 0 },
            uDiscTwist: { value: bassInkConfig.formations.discTwist },
        };
        this.kickTimes.fill(-1e6);

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: inkVertexShader,
            fragmentShader: inkFragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        this.object = new THREE.Points(this.geometry, this.material);
        // The shader moves the points far from where the bounding sphere of the unit formations would say.
        this.object.frustumCulled = false;
    }

    // Index of the formation being filled or ready on the inactive side, or -1 when there is none.
    get preparedIndex(): number {
        return this.prepared;
    }

    // Formation shown by the active side, or -1 right after a retarget froze a blend of two.
    get activeIndex(): number {
        return this.activeFormation;
    }

    // True while the inactive side is still being written.
    get filling(): boolean {
        return this.prepared >= 0 && this.fillCursor < this.pointCount;
    }

    // True from beginTransition until the cross-fade has finished (including the wait for a pending fill).
    get transitioning(): boolean {
        return this.phase !== 'idle';
    }

    // Raw cross-fade progress, 0 when no fade is running.
    get blendProgress(): number {
        return this.blend;
    }

    // Window height in device pixels and the camera's vertical field of view, so a point's world size becomes pixels.
    setViewport(heightPixels: number, fovDegrees: number): void {
        this.uniforms.uPointScale.value = heightPixels / (2 * Math.tan((fovDegrees * Math.PI) / 360));
    }

    // Shows a formation at once, with no fade. For a freshly built cloud (a density change) that must match the scene.
    showFormation(index: number, seed: number): void {
        const side = this.sides[this.active];
        writeFormation(index, seed, side.array as Float32Array, this.pointCount, 0, this.pointCount);
        this.markWhole(side);
        this.activeFormation = index;
        this.setSideFormation(this.active, index);
        this.prepared = -1;
        this.fillCursor = this.pointCount;
        this.phase = 'idle';
        this.setBlend(0);
    }

    // Starts filling the inactive side with a formation, a chunk per update. Asking for what is already prepared or
    // being filled changes nothing; a new target during a fade first freezes the picture so it cannot jump.
    prepareFormation(index: number, seed: number): void {
        if (index === this.prepared) {
            return;
        }
        if (this.phase === 'fading') {
            this.bakeBlend();
        }
        this.prepared = index;
        this.setSideFormation((1 - this.active) as 0 | 1, index);
        this.fillSeed = seed;
        this.fillCursor = 0;
    }

    // Cross-fades to the prepared formation. While it is still being filled the fade starts when the fill completes.
    beginTransition(startSeconds: number, seconds: number): void {
        if (this.prepared < 0) {
            return;
        }
        if (this.phase === 'fading') {
            // Restarted mid-fade toward the same target: continue from what is on screen.
            this.bakeBlend();
        }
        this.fadeSeconds = seconds;
        this.fadeRequestedStart = startSeconds;
        if (this.filling) {
            this.phase = 'pending';
        } else {
            this.startFade(startSeconds);
        }
    }

    update(
        cue: DirectorCue,
        breathing: number,
        kicks: KickRingView,
        palette: PalettePair,
        brightness: number,
        timeSeconds: number,
    ): void {
        this.advanceFill(timeSeconds);
        this.advanceFade(timeSeconds);

        const uniforms = this.uniforms;
        uniforms.uTime.value = timeSeconds;
        uniforms.uTension.value = cue.tension;
        uniforms.uBreath.value = breathing;
        uniforms.uBrightness.value = brightness;
        // The kick ring is copied in this same call, so a kick recorded this frame is in the shader this frame.
        this.kickTimes.set(kicks.times);
        this.kickStrengths.set(kicks.strengths);
        this.core.set(palette.core);
        this.edge.set(palette.edge);
    }

    // The spectrum field to ripple through the cloud, and where its newest row and its oldest row are. The field is
    // owned by the scene, so a cloud rebuilt for a density change reads the same history.
    setSpectrum(texture: THREE.Texture, headCoordinate: number, span: number): void {
        this.uniforms.uSpectrum.value = texture;
        this.uniforms.uSpectrumHead.value = headCoordinate;
        this.uniforms.uSpectrumSpan.value = span;
    }

    // World radius of the unit formations. The scene refits it to the viewport (framing.ts) on mount, resize and rebuild.
    setRadius(worldRadius: number): void {
        this.uniforms.uRadius.value = worldRadius;
        // The depth fade follows the fit, so it spans the cloud at any window shape.
        this.uniforms.uDepthNear.value = depthNear(worldRadius);
        this.uniforms.uDepthFar.value = depthFar(worldRadius);
    }

    // The factor the vertex shader applies to a rest position on top of uRadius (the `scale` and `breath` lines in
    // inkShaders.ts), so the spray can leave from where the squeezed shell is drawn. Read it after this frame's update,
    // setPunch and setSwell.
    get surfaceScale(): number {
        const u = this.uniforms;
        return (
            (1 - u.uTension.value * u.uSqueeze.value) *
            (1 + u.uBreathAmp.value * Math.sin(2 * Math.PI * u.uBreath.value)) *
            (1 + u.uPunchAmp.value * u.uPunch.value) *
            (1 + u.uSwellAmp.value * u.uSwell.value)
        );
    }

    // The galaxy disc's accumulated inward flow (flowDiscPoint in inkShaders.ts), in units of squared radius; the scene
    // keeps it in 0..1. Only a side that holds the disc moves with it.
    setFlow(phase: number): void {
        this.uniforms.uFlowPhase.value = phase;
    }

    // 0..1 beat punch for this frame (from the motion clock, already weighted by the bass presence).
    setPunch(value: number): void {
        this.uniforms.uPunch.value = value;
    }

    // 0..1 bass swell for this frame (from the hub's bass bump; needs no tempo lock). Displacement only.
    setSwell(value: number): void {
        this.uniforms.uSwell.value = value;
    }

    // Band onsets (0..1) for the turbulence and the sparkle, and the turbulence control's multiplier.
    setTexture(mid: number, high: number, turbulence: number): void {
        this.uniforms.uMid.value = mid;
        this.uniforms.uHigh.value = high;
        this.uniforms.uTurbulence.value = turbulence;
    }

    // The current unit-radius rest position of a point as the shader computes it (the disc's flow and the same
    // smoothing), for the spray and for specs.
    restPosition(index: number, out: Float32Array | number[]): void {
        const s = this.blend * this.blend * (3 - 2 * this.blend);
        const from = this.flowedPoint(this.active, index, this.flowFrom);
        const to = this.flowedPoint((1 - this.active) as 0 | 1, index, this.flowTo);
        for (let k = 0; k < 3; k++) {
            out[k] = from[k] + (to[k] - from[k]) * s;
        }
    }

    dispose(): void {
        this.geometry.dispose();
        this.material.dispose();
    }

    private advanceFill(timeSeconds: number): void {
        if (!this.filling) {
            return;
        }
        const side = this.sides[1 - this.active];
        const start = this.fillCursor;
        const end = Math.min(this.pointCount, start + bassInkSceneConfig.points.fillChunkPoints);
        writeFormation(this.prepared, this.fillSeed, side.array as Float32Array, this.pointCount, start, end);
        // Only the written range goes to the GPU. Chunks that land before the renderer uploads are one growing range,
        // updated in place, so a fill allocates only when the previous range has already been uploaded and cleared.
        const ranges = side.updateRanges;
        if (ranges.length === 1 && ranges[0].start + ranges[0].count === start * 3) {
            ranges[0].count += (end - start) * 3;
        } else {
            side.addUpdateRange(start * 3, (end - start) * 3);
        }
        side.needsUpdate = true;
        this.fillCursor = end;
        if (end >= this.pointCount && this.phase === 'pending') {
            // The fade waited for the fill, so it starts now (not earlier than it was asked to).
            this.startFade(Math.max(this.fadeRequestedStart, timeSeconds));
        }
    }

    private startFade(start: number): void {
        this.phase = 'fading';
        this.fadeStart = start;
        this.setBlend(0);
    }

    private advanceFade(timeSeconds: number): void {
        if (this.phase !== 'fading') {
            return;
        }
        const progress = this.fadeSeconds > 0 ? (timeSeconds - this.fadeStart) / this.fadeSeconds : 1;
        if (progress >= 1) {
            // Arrived: the prepared side becomes the active one.
            this.active = (1 - this.active) as 0 | 1;
            this.activeFormation = this.prepared;
            this.prepared = -1;
            this.phase = 'idle';
            this.uniforms.uActive.value = this.active;
            this.setBlend(0);
        } else {
            this.setBlend(Math.max(0, progress));
        }
    }

    // Writes the blended positions into the active side and resets the blend, so the picture stays the same while the
    // other side is free to take a new formation.
    private bakeBlend(): void {
        // The disc's flow is baked in with the blend, so the frozen picture is where the points were drawn.
        const side = this.sides[this.active];
        const out = side.array as Float32Array;
        const other = (1 - this.active) as 0 | 1;
        const s = this.blend * this.blend * (3 - 2 * this.blend);
        for (let i = 0; i < this.pointCount; i++) {
            const from = this.flowedPoint(this.active, i, this.flowFrom);
            const to = this.flowedPoint(other, i, this.flowTo);
            for (let k = 0; k < 3; k++) {
                out[i * 3 + k] = from[k] + (to[k] - from[k]) * s;
            }
        }
        this.markWhole(side);
        this.activeFormation = -1;
        this.setSideFormation(this.active, -1);
        this.phase = 'idle';
        this.setBlend(0);
    }

    // A side's unit rest position for point `index`, flowed when the side holds the galaxy disc.
    private flowedPoint(side: 0 | 1, index: number, out: Float32Array): Float32Array {
        const array = this.sides[side].array;
        const o = index * 3;
        out[0] = array[o];
        out[1] = array[o + 1];
        out[2] = array[o + 2];
        if (isGalaxyDisc(this.sideFormations[side])) {
            flowDiscPoint(out, this.uniforms.uFlowPhase.value as number, bassInkConfig.formations.discTwist, out);
        }
        return out;
    }

    private setSideFormation(side: 0 | 1, index: number): void {
        this.sideFormations[side] = index;
        const flows = isGalaxyDisc(index) ? 1 : 0;
        if (side === 0) {
            this.uniforms.uFlowA.value = flows;
        } else {
            this.uniforms.uFlowB.value = flows;
        }
    }

    private markWhole(side: THREE.BufferAttribute): void {
        // No range means the whole buffer, so partial ranges queued by an earlier fill are dropped.
        side.clearUpdateRanges();
        side.needsUpdate = true;
    }

    private setBlend(value: number): void {
        this.blend = value;
        this.uniforms.uBlend.value = value;
    }
}
