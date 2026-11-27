import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { SceneSize } from '~/hooks/useThreeScene';
import { createTrioAccent, stepTrioAccent } from './trioAccent';
import { TrioBackdrop, backdropHazeColor } from './trioBackdrop';
import { TrioDenseBars } from './trioDenseBars';
import {
    BLOOM_MIN_SIDE_PX,
    BLOOM_PULSE_BOOST,
    BLOOM_RADIUS,
    BLOOM_RESOLUTION_SHARE,
    BLOOM_STRENGTH_PER_GLOW,
    BLOOM_THRESHOLD,
    EMISSIVE_GAIN_BASE,
    EMISSIVE_GAIN_PER_GLOW,
    HAZE_MAX,
} from './trioEnhancedConfig';
import type {
    CreateTrioEnhancedLook,
    TrioAccentInput,
    TrioEnhancedLook,
    TrioEnhancedLookOptions,
} from './trioEnhancedTypes';
import { TrioDust } from './trioDust';
import { TrioShockwave } from './trioShockwave';

// The longest frame time the look advances by, so a stalled tab does not skip its animations in one step.
const MAX_FRAME_SECONDS = 0.1;

// What the look remembers of a standard sheet so it can put it back exactly as it was.
interface StandardState {
    visible: boolean;
    opacity: number;
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

// The enhanced look of the trio scene: a denser, glowing copy of each sheet, a backdrop with depth haze, dust, a ring
// on every accented beat, and a bloom composer. Everything the look owns is allocated here, once; `render` reuses it and
// only writes numbers.
export const createTrioEnhancedLook: CreateTrioEnhancedLook = (options: TrioEnhancedLookOptions): TrioEnhancedLook => {
    const { renderer, scene, camera, sheets, valuesRef, rhythm, reducedMotion } = options;

    // Everything is built, and sized, before the first object is added to the scene. A constructor that throws partway
    // (a pass failing to compile, say) then has only GPU objects to free, never a scene to undo, and the standard
    // meshes were never touched. `built` lists what to free in that case.
    const built: { dispose(): void }[] = [];
    const track = <T extends { dispose(): void }>(item: T): T => {
        built.push(item);
        return item;
    };

    let dense: TrioDenseBars[];
    let backdrop: TrioBackdrop;
    let dust: TrioDust;
    let shockwave: TrioShockwave;
    let composer: EffectComposer;
    let renderPass: RenderPass;
    let bloom: UnrealBloomPass;
    let outputPass: OutputPass;
    const bloomResolution = new THREE.Vector2(1, 1);
    let width = options.size.width;
    let height = options.size.height;
    let mix = 0;
    let disposed = false;

    const hazeColor = backdropHazeColor(new THREE.Vector3());
    const standard: StandardState[] = sheets.map((sheet) => ({
        visible: sheet.mesh.visible,
        opacity: sheet.material.uniforms.opacity.value as number,
    }));
    const accent = createTrioAccent();
    // One input object, rewritten every frame, so stepping the accent allocates nothing.
    const accentInput: TrioAccentInput = {
        dtSeconds: 0,
        beatCount: 0,
        bassOnset: 0,
        intensity: 0,
        reducedMotion: false,
    };

    const tooSmallForBloom = (): boolean => {
        const ratio = renderer.getPixelRatio();
        return width * ratio < BLOOM_MIN_SIDE_PX || height * ratio < BLOOM_MIN_SIDE_PX;
    };

    const applySize = (): void => {
        const ratio = renderer.getPixelRatio();
        bloomResolution.set(
            Math.max(1, Math.round(width * ratio * BLOOM_RESOLUTION_SHARE)),
            Math.max(1, Math.round(height * ratio * BLOOM_RESOLUTION_SHARE)),
        );
        composer.setSize(width, height);
        // The composer hands every pass the full drawing size and the bloom's first target is half of what it is
        // given, so giving it twice the resolution makes that target the configured share of the drawing size.
        bloom.setSize(bloomResolution.x * 2, bloomResolution.y * 2);
        dust.setPixelRatio(ratio);
    };

    try {
        dense = sheets.map((sheet) => track(new TrioDenseBars(sheet, hazeColor)));
        // The backdrop sits behind the farthest sheet, which is the last one.
        const farthestZ = sheets.length > 0 ? sheets[sheets.length - 1].mesh.position.z : 0;
        backdrop = track(new TrioBackdrop(farthestZ));
        dust = track(new TrioDust(renderer.getPixelRatio()));
        shockwave = track(new TrioShockwave());

        // The composer: the scene in linear HDR, a bloom, then one conversion to the screen (ACES and sRGB) in
        // OutputPass.
        composer = track(new EffectComposer(renderer));
        renderPass = track(new RenderPass(scene, camera));
        bloom = track(new UnrealBloomPass(bloomResolution, 0, BLOOM_RADIUS, BLOOM_THRESHOLD));
        outputPass = track(new OutputPass());
        composer.addPass(renderPass);
        composer.addPass(bloom);
        composer.addPass(outputPass);
        applySize();
    } catch (error) {
        // Best effort: a dispose that throws must not hide the failure that got us here.
        for (const item of built) {
            try {
                item.dispose();
            } catch {
                // Ignored on purpose.
            }
        }
        throw error;
    }

    scene.add(backdrop.mesh);
    for (const bars of dense) {
        bars.flags.mesh.visible = false;
        scene.add(bars.flags.mesh);
    }
    scene.add(dust.points);
    for (const ring of shockwave.rings) scene.add(ring);

    // Standard meshes are shown at (1 - mix) of their opacity while the look comes in, and hidden once it has.
    const applyMix = (): void => {
        for (let index = 0; index < sheets.length; index++) {
            const sheet = sheets[index];
            const saved = standard[index];
            sheet.mesh.visible = mix < 1 ? saved.visible : false;
            sheet.material.uniforms.opacity.value = mix < 1 ? saved.opacity * (1 - mix) : saved.opacity;
        }
        for (const bars of dense) bars.flags.mesh.visible = mix > 0;
        for (const bars of dense) bars.uniforms.mixOpacity.value = mix;
    };

    return {
        render(dtSeconds: number): void {
            if (disposed) return;
            const dt = Number.isFinite(dtSeconds) ? Math.min(MAX_FRAME_SECONDS, Math.max(0, dtSeconds)) : 0;
            const values = valuesRef.current;
            const glow = values.glowStrength;
            const reduced = reducedMotion.matches;

            // Without a tracker nothing ever triggers: the counters stay at 0.
            let beatCount = 0;
            let bassOnset = 0;
            if (rhythm) {
                rhythm.updatePhase();
                beatCount = rhythm.state.beatCount;
                bassOnset = rhythm.state.bandOnsets[0] ?? 0;
            }
            accentInput.dtSeconds = dt;
            accentInput.beatCount = beatCount;
            accentInput.bassOnset = bassOnset;
            accentInput.intensity = values.accentIntensity;
            accentInput.reducedMotion = reduced;
            stepTrioAccent(accent, accentInput);

            const gain = EMISSIVE_GAIN_BASE + glow * EMISSIVE_GAIN_PER_GLOW;
            const lastSheet = dense.length - 1;
            for (let index = 0; index < dense.length; index++) {
                const bars = dense[index];
                bars.update();
                const { uniforms } = bars;
                uniforms.emissiveGain.value = gain;
                uniforms.pulse.value = accent.pulse;
                // The front sheet is clear; each sheet behind it is hazier, up to HAZE_MAX at the back.
                uniforms.haze.value = lastSheet > 0 ? values.depth * HAZE_MAX * (index / lastSheet) : 0;
            }

            backdrop.update(values.depth, mix);
            dust.update(dt, values.dust, mix, reduced);
            if (accent.triggered && !reduced) shockwave.fire(values.accentIntensity);
            shockwave.update(dt, mix, reduced);

            // Glow 0 is a true off: no bloom pass at all, not just a weak one.
            bloom.enabled = glow > 0 && !tooSmallForBloom();
            bloom.strength = (glow * BLOOM_STRENGTH_PER_GLOW + accent.pulse * BLOOM_PULSE_BOOST) * mix;

            composer.render();
        },

        setSize(size: SceneSize): void {
            if (disposed) return;
            width = size.width;
            height = size.height;
            applySize();
        },

        setMix(value: number): void {
            if (disposed || Number.isNaN(value)) return;
            mix = clamp01(value);
            applyMix();
        },

        dispose(): void {
            if (disposed) return;
            disposed = true;
            // Put the standard meshes back first, so a failure below cannot leave them hidden.
            for (let index = 0; index < sheets.length; index++) {
                sheets[index].mesh.visible = standard[index].visible;
                sheets[index].material.uniforms.opacity.value = standard[index].opacity;
            }
            for (const bars of dense) bars.dispose();
            backdrop.dispose();
            dust.dispose();
            shockwave.dispose();
            renderPass.dispose();
            bloom.dispose();
            outputPass.dispose();
            composer.dispose();
        },
    };
};
