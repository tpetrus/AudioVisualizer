import { useRef, useState } from 'react';
import { bassInkControls } from './bassInkControls';
import { useBassInkScene } from './useBassInkScene';
import { ControlPanel } from '~/components/ControlPanel/ControlPanel';
import { useControlValues } from '~/components/ControlPanel/useControlValues';
import { useAnalyser } from '~/features/audio/useAudioState';
import { useRhythm } from '~/features/rhythm/rhythmTrackerContext';

export function BassInkPage() {
    const containerRef = useRef<HTMLDivElement>(null);
    const analyser = useAnalyser();
    const rhythm = useRhythm();
    const { values, valuesRef, setValue, resetAll } = useControlValues(bassInkControls);
    // Locked by default: the picture can't be dragged, rotated or zoomed until the lock button is clicked.
    const [cameraLocked, setCameraLocked] = useState(true);
    // True once the view has been moved away from its starting position (shows the reset-view button).
    const [viewChanged, setViewChanged] = useState(false);

    const { resetView } = useBassInkScene(containerRef, {
        analyser,
        rhythm,
        valuesRef,
        cameraLocked,
        onViewChanged: setViewChanged,
    });

    return (
        <>
            <div ref={containerRef} className="fixed inset-0 bg-black" />
            <ControlPanel
                definitions={bassInkControls}
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
