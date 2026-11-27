import { useRef, useState } from 'react';
import { bassInkControls } from './bassInkControls';
import { BASS_INK_ANALYSER } from './bassInkAnalyser';
import { useBassInkScene } from './useBassInkScene';
import { FullscreenLayer } from '~/features/fullscreen/FullscreenLayer';
import { useFullscreen } from '~/hooks/useFullscreen';
import { ControlPanel } from '~/components/ControlPanel/ControlPanel';
import { useControlValues } from '~/components/ControlPanel/useControlValues';
import {
    EnhancedGraphicsToggle,
    type EnhancedGraphicsStatus,
} from '~/components/EnhancedGraphicsToggle/EnhancedGraphicsToggle';
import { useEnhancedGraphics } from '~/features/settings/useEnhancedGraphics';
import { useAudioHub } from '~/features/audio/hub/useAudioHub';
import { useAnalyser } from '~/features/audio/useAudioState';
import { useRhythm } from '~/features/rhythm/rhythmTrackerContext';

export function BassInkPage() {
    const containerRef = useRef<HTMLDivElement>(null);
    const fullscreenRef = useRef<HTMLDivElement>(null);
    const fullscreen = useFullscreen(fullscreenRef);
    const analyser = useAnalyser(BASS_INK_ANALYSER);
    const hub = useAudioHub();
    const rhythm = useRhythm();
    const { values, valuesRef, setValue, resetAll } = useControlValues(bassInkControls);
    // Locked by default: the picture can't be dragged, rotated or zoomed until the lock button is clicked.
    const [cameraLocked, setCameraLocked] = useState(true);
    // True once the view has been moved away from its starting position (shows the reset-view button).
    const [viewChanged, setViewChanged] = useState(false);
    const enhanced = useEnhancedGraphics();
    // The enhanced look's progress, undefined in standard mode. It changes a few times per toggle, never per frame.
    const [enhancedStatus, setEnhancedStatus] = useState<EnhancedGraphicsStatus | undefined>(undefined);

    const { resetView } = useBassInkScene(containerRef, {
        analyser,
        hub,
        rhythm,
        valuesRef,
        cameraLocked,
        onViewChanged: setViewChanged,
        enhanced,
        onEnhancedStatus: setEnhancedStatus,
    });

    return (
        <>
            {/* The wrapper is the fullscreen target, so the browser hides every overlay outside it. It is React-owned and its
                className must stay a static string (useFullscreen adds the idle-cursor classes to it). The canvas host
                stays a separate child because useThreeScene appends and removes the canvas imperatively. */}
            <div ref={fullscreenRef} className="fixed inset-0 bg-black">
                <div ref={containerRef} className="absolute inset-0" />
                <FullscreenLayer active={fullscreen.active} hint={fullscreen.hint} onExit={() => fullscreen.exit()} />
            </div>
            <ControlPanel
                header={<EnhancedGraphicsToggle status={enhancedStatus} />}
                definitions={bassInkControls}
                values={values}
                onChange={setValue}
                onResetAll={resetAll}
                cameraLocked={cameraLocked}
                onCameraLockedChange={setCameraLocked}
                viewChanged={viewChanged}
                onResetView={resetView}
                fullscreenActive={fullscreen.active}
                onToggleFullscreen={() => fullscreen.toggle()}
            />
        </>
    );
}
