import { useRef, useState } from 'react';
import { cubesControls, cubesEnhancedControls } from './cubesControls';
import { CUBES_ENHANCED_STRINGS } from './cubesEnhancedStrings';
import { useCubesScene } from './useCubesScene';
import { FullscreenLayer } from '~/features/fullscreen/FullscreenLayer';
import { useFullscreen } from '~/hooks/useFullscreen';
import { ControlPanel } from '~/components/ControlPanel/ControlPanel';
import { CUBES_ANALYSER } from './cubesAnalyser';
import { useAnalyser } from '~/features/audio/useAudioState';
import { useAudioHub } from '~/features/audio/hub/useAudioHub';
import { useControlValues } from '~/components/ControlPanel/useControlValues';
import {
    EnhancedGraphicsToggle,
    type EnhancedGraphicsStatus,
} from '~/components/EnhancedGraphicsToggle/EnhancedGraphicsToggle';
import { useEnhancedGraphics } from '~/features/settings/useEnhancedGraphics';
import { isSlowNoticeDismissed } from '~/features/settings/frameRateMonitor';
import { SlowFrameNotice } from '~/features/settings/SlowFrameNotice';

export function CubesPage() {
    const containerRef = useRef<HTMLDivElement>(null);
    const fullscreenRef = useRef<HTMLDivElement>(null);
    const fullscreen = useFullscreen(fullscreenRef);
    const analyser = useAnalyser(CUBES_ANALYSER);
    const hub = useAudioHub();
    const enhanced = useEnhancedGraphics();
    // Holds the superset of values (the Enhanced controls too), so toggling never loses a setting; the panel shows the
    // Enhanced section only while the flag is on.
    const { values, valuesRef, setValue, resetAll } = useControlValues(cubesEnhancedControls);
    // Locked by default: the picture can't be dragged, rotated or zoomed until the lock button is clicked.
    const [cameraLocked, setCameraLocked] = useState(true);
    // True once the view has been moved away from its starting position (shows the reset-view button).
    const [viewChanged, setViewChanged] = useState(false);
    // The enhanced look's progress, undefined in standard mode. It changes a few times per toggle, never per frame.
    const [enhancedStatus, setEnhancedStatus] = useState<EnhancedGraphicsStatus | undefined>(undefined);
    const [slowNoticeShown, setSlowNoticeShown] = useState(false);

    const { resetView } = useCubesScene(containerRef, {
        analyser,
        hub,
        valuesRef,
        cameraLocked,
        onViewChanged: setViewChanged,
        enhanced,
        onEnhancedStatus: (next) => {
            setEnhancedStatus(next);
            // Back to the standard look: forget the notice, so turning enhanced on again waits for the monitor to fire.
            if (next === undefined) setSlowNoticeShown(false);
        },
        // A dismissed notice stays dismissed for the page visit, however often the scene is rebuilt.
        onSlowFrames: () => setSlowNoticeShown(!isSlowNoticeDismissed()),
    });

    return (
        <>
            {/* The wrapper is the fullscreen target, so the browser hides every overlay outside it. It is React-owned and its
                className must stay a static string (useFullscreen adds the idle-cursor classes to it). The canvas host
                stays a separate child because useThreeScene appends and removes the canvas imperatively. */}
            <div ref={fullscreenRef} className="fixed inset-0 bg-black">
                <div ref={containerRef} className="absolute inset-0" />
                <FullscreenLayer active={fullscreen.active} hint={fullscreen.hint} onExit={() => fullscreen.exit()} />
                {/* Inside the wrapper so it is also visible in fullscreen. The live region is always rendered, because
                    screen readers announce changes to a region that already exists, not one inserted with its text.
                    It never takes focus. */}
                <div role="status">
                    {slowNoticeShown && enhancedStatus !== undefined && (
                        <SlowFrameNotice onClose={() => setSlowNoticeShown(false)} />
                    )}
                </div>
            </div>
            <ControlPanel
                definitions={enhanced ? cubesEnhancedControls : cubesControls}
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
                    <EnhancedGraphicsToggle status={enhancedStatus} description={CUBES_ENHANCED_STRINGS.description} />
                }
            />
        </>
    );
}
