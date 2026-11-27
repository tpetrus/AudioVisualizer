import { useRef, useState } from 'react';
import { trioColorWaveControls } from './trioColorWaveControls';
import { TRIO_ENHANCED_STRINGS } from './trioEnhancedStrings';
import { trioAllControls } from './trioLookControls';
import { useTrioColorWaveScene } from './useTrioColorWaveScene';
import { FullscreenLayer } from '~/features/fullscreen/FullscreenLayer';
import { useFullscreen } from '~/hooks/useFullscreen';
import { ControlPanel } from '~/components/ControlPanel/ControlPanel';
import { useControlValues } from '~/components/ControlPanel/useControlValues';
import {
    EnhancedGraphicsToggle,
    type EnhancedGraphicsStatus,
} from '~/components/EnhancedGraphicsToggle/EnhancedGraphicsToggle';
import { useAnalyser } from '~/features/audio/useAudioState';
import { useRhythm } from '~/features/rhythm/rhythmTrackerContext';

export function TrioColorWavePage() {
    const containerRef = useRef<HTMLDivElement>(null);
    const fullscreenRef = useRef<HTMLDivElement>(null);
    const fullscreen = useFullscreen(fullscreenRef);
    const analyser = useAnalyser();
    const rhythm = useRhythm();
    // The page holds the values of every trio control, so Look values survive the look being switched off and on.
    const { values, valuesRef, setValue, resetAll } = useControlValues(trioAllControls);
    // Locked by default: the picture can't be dragged, rotated or zoomed until the lock button is clicked.
    const [cameraLocked, setCameraLocked] = useState(true);
    // True once the view has been moved away from its starting position (shows the reset-view button).
    const [viewChanged, setViewChanged] = useState(false);

    // The enhanced look's progress, undefined in standard mode. It changes a few times per toggle, never per frame.
    const [enhancedStatus, setEnhancedStatus] = useState<EnhancedGraphicsStatus | undefined>(undefined);

    const { resetView } = useTrioColorWaveScene(containerRef, {
        analyser,
        valuesRef,
        rhythm,
        onEnhancedStatus: setEnhancedStatus,
        cameraLocked,
        onViewChanged: setViewChanged,
    });

    return (
        <>
            {/* The wrapper is the fullscreen target, so the browser hides every overlay outside it. It is React-owned and its
                className must stay a static string (useFullscreen adds the idle-cursor classes to it). The canvas host
                stays a separate child because useThreeScene appends and removes the canvas imperatively. */}
            <div ref={fullscreenRef} className="fixed inset-0 bg-black">
                {/* Fill the whole window with black, so nothing of the page shows around or under the picture. */}
                <div ref={containerRef} className="absolute inset-0 overflow-hidden" />
                <FullscreenLayer active={fullscreen.active} hint={fullscreen.hint} onExit={() => fullscreen.exit()} />
            </div>
            <ControlPanel
                // The Look section only exists while the enhanced look is running.
                definitions={enhancedStatus === 'ready' ? trioAllControls : trioColorWaveControls}
                values={values}
                onChange={setValue}
                onResetAll={resetAll}
                cameraLocked={cameraLocked}
                onCameraLockedChange={setCameraLocked}
                viewChanged={viewChanged}
                onResetView={resetView}
                fullscreenActive={fullscreen.active}
                onToggleFullscreen={() => fullscreen.toggle()}
                header={
                    <EnhancedGraphicsToggle status={enhancedStatus} description={TRIO_ENHANCED_STRINGS.description} />
                }
            />
        </>
    );
}
