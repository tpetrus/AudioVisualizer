import { useRef, useState } from 'react';
import { CharacterAttribution } from './CharacterAttribution';
import { DEFAULT_CHARACTER_ID, findCharacter } from './characterRegistry';
import { controlsForMotionPreference, dancingCharacterControls } from './dancingCharacterControls';
import { useDancingCharacterScene, type DancingCharacterLoadStatus } from './useDancingCharacterScene';
import { ControlPanel } from '~/components/ControlPanel/ControlPanel';
import { useControlValues } from '~/components/ControlPanel/useControlValues';
import { useAnalyser } from '~/features/audio/useAudioState';
import { useRhythm } from '~/features/rhythm/rhythmTrackerContext';

export function DancingCharacterPage() {
    const containerRef = useRef<HTMLDivElement>(null);
    const analyser = useAnalyser();
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

    const { resetView } = useDancingCharacterScene(containerRef, {
        analyser,
        rhythm,
        valuesRef,
        cameraLocked,
        // The reduced-motion table is the one that was chosen, so the preference is read once, in one place.
        reducedMotion: controls !== dancingCharacterControls,
        onViewChanged: setViewChanged,
        onStatus: setStatus,
        // A failed choice puts the default back in the select and says why; a good load clears the message.
        onCharacterProblem: (message) => {
            setCharacterProblem(message);
            if (message !== null) setValue('character', DEFAULT_CHARACTER_ID);
        },
    });

    const selected = values.character === DEFAULT_CHARACTER_ID ? undefined : findCharacter(values.character);

    return (
        <>
            <div ref={containerRef} className="fixed inset-0 bg-black" />
            {status === 'modelFailed' && (
                <p
                    role="status"
                    className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-black/70 px-4 py-2 text-center text-white"
                >
                    The dancer couldn&apos;t be loaded. Try reloading the page.
                </p>
            )}
            {characterProblem !== null && (
                <p
                    role="status"
                    className="fixed top-4 left-1/2 -translate-x-1/2 rounded bg-black/70 px-4 py-2 text-center text-white"
                >
                    {characterProblem}
                </p>
            )}
            {selected && <CharacterAttribution character={selected} />}
            <ControlPanel
                definitions={controls}
                values={values}
                onChange={setValue}
                onResetAll={resetAll}
                cameraLocked={cameraLocked}
                onCameraLockedChange={setCameraLocked}
                viewChanged={viewChanged}
                onResetView={resetView}
            />
        </>
    );
}
