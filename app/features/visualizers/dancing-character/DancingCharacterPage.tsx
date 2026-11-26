import { useRef, useState } from 'react';
import { CharacterAttribution } from './CharacterAttribution';
import { DEFAULT_CHARACTER_ID, findCharacter } from './characterRegistry';
import { controlsForMotionPreference, dancingCharacterControls } from './dancingCharacterControls';
import { useDancingCharacterScene, type DancingCharacterLoadStatus } from './useDancingCharacterScene';
import { FullscreenLayer } from '~/features/fullscreen/FullscreenLayer';
import { useFullscreen } from '~/hooks/useFullscreen';
import { ControlPanel } from '~/components/ControlPanel/ControlPanel';
import { useControlValues } from '~/components/ControlPanel/useControlValues';
import {
    EnhancedGraphicsToggle,
    type EnhancedGraphicsStatus,
} from '~/components/EnhancedGraphicsToggle/EnhancedGraphicsToggle';
import { isSlowNoticeDismissed } from '~/features/settings/frameRateMonitor';
import { SlowFrameNotice } from '~/features/settings/SlowFrameNotice';
import { useAudioHub } from '~/features/audio/hub/useAudioHub';
import { useAnalyser } from '~/features/audio/useAudioState';
import { useRhythm } from '~/features/rhythm/rhythmTrackerContext';

export function DancingCharacterPage() {
    const containerRef = useRef<HTMLDivElement>(null);
    const fullscreenRef = useRef<HTMLDivElement>(null);
    const fullscreen = useFullscreen(fullscreenRef);
    const analyser = useAnalyser();
    const hub = useAudioHub();
    const rhythm = useRhythm();
    // The control table is chosen once on mount (reduced motion gets calmer defaults); useControlValues needs it stable.
    const [controls] = useState(() => controlsForMotionPreference());
    const { values, valuesRef, setValue, resetAll } = useControlValues(controls);
    // Locked by default: the picture can't be dragged, rotated or zoomed until the lock button is clicked.
    const [cameraLocked, setCameraLocked] = useState(true);
    // True once the view has been moved away from its starting position (shows the reset-view button).
    const [viewChanged, setViewChanged] = useState(false);
    const [status, setStatus] = useState<DancingCharacterLoadStatus>('loading');
    const [characterProblem, setCharacterProblem] = useState<string | null>(null);
    // The enhanced look's progress, undefined in standard mode. It changes a few times per toggle, never per frame.
    const [enhancedStatus, setEnhancedStatus] = useState<EnhancedGraphicsStatus | undefined>(undefined);
    const [slowNoticeShown, setSlowNoticeShown] = useState(false);

    const { resetView } = useDancingCharacterScene(containerRef, {
        analyser,
        hub,
        rhythm,
        valuesRef,
        cameraLocked,
        // The reduced-motion table is the one that was chosen, so the preference is read once, in one place.
        reducedMotion: controls !== dancingCharacterControls,
        onViewChanged: setViewChanged,
        onStatus: setStatus,
        onEnhancedStatus: setEnhancedStatus,
        // A dismissed notice stays dismissed for the page visit, however often the scene is rebuilt.
        onSlowFrames: () => setSlowNoticeShown(!isSlowNoticeDismissed()),
        // A failed choice puts the default back in the select and says why; a good load clears the message.
        onCharacterProblem: (message) => {
            setCharacterProblem(message);
            if (message !== null) setValue('character', DEFAULT_CHARACTER_ID);
        },
    });

    const selected = values.character === DEFAULT_CHARACTER_ID ? undefined : findCharacter(values.character);

    return (
        <>
            {/* The wrapper is the fullscreen target, so the browser hides every overlay outside it. It is React-owned and its
                className must stay a static string (useFullscreen adds the idle-cursor classes to it). The canvas host
                stays a separate child because useThreeScene appends and removes the canvas imperatively. */}
            <div ref={fullscreenRef} className="fixed inset-0 bg-black">
                <div ref={containerRef} className="absolute inset-0" />
                <FullscreenLayer active={fullscreen.active} hint={fullscreen.hint} onExit={() => fullscreen.exit()} />
                {/* Inside the wrapper so it is also visible in fullscreen. */}
                {slowNoticeShown && enhancedStatus !== undefined && (
                    <SlowFrameNotice onClose={() => setSlowNoticeShown(false)} />
                )}
            </div>
            {!fullscreen.active && status === 'modelFailed' && (
                <p
                    role="status"
                    className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-black/70 px-4 py-2 text-center text-white"
                >
                    The dancer couldn&apos;t be loaded. Try reloading the page.
                </p>
            )}
            {!fullscreen.active && characterProblem !== null && (
                <p
                    role="status"
                    className="fixed top-4 left-1/2 -translate-x-1/2 rounded bg-black/70 px-4 py-2 text-center text-white"
                >
                    {characterProblem}
                </p>
            )}
            {!fullscreen.active && selected && <CharacterAttribution character={selected} />}
            <ControlPanel
                definitions={controls}
                values={values}
                onChange={setValue}
                onResetAll={resetAll}
                cameraLocked={cameraLocked}
                onCameraLockedChange={setCameraLocked}
                viewChanged={viewChanged}
                onResetView={resetView}
                fullscreenActive={fullscreen.active}
                onToggleFullscreen={() => fullscreen.toggle()}
                header={<EnhancedGraphicsToggle status={enhancedStatus} />}
            />
        </>
    );
}
