import { useRef, useState } from 'react';
import { trioColorWaveControls } from './trioColorWaveControls';
import { useTrioColorWaveScene } from './useTrioColorWaveScene';
import { ControlPanel } from '~/components/ControlPanel/ControlPanel';
import { useControlValues } from '~/components/ControlPanel/useControlValues';
import { useAnalyser } from '~/features/audio/useAudioState';

export function TrioColorWavePage() {
    const containerRef = useRef<HTMLDivElement>(null);
    const analyser = useAnalyser();
    const { values, valuesRef, setValue, resetAll } = useControlValues(trioColorWaveControls);
    // Locked by default: the picture can't be dragged, rotated or zoomed until the lock button is clicked.
    const [cameraLocked, setCameraLocked] = useState(true);
    // True once the view has been moved away from its starting position (shows the reset-view button).
    const [viewChanged, setViewChanged] = useState(false);

    const { resetView } = useTrioColorWaveScene(containerRef, {
        analyser,
        valuesRef,
        cameraLocked,
        onViewChanged: setViewChanged,
    });

    return (
        <>
            {/* Fill the whole window with black, so nothing of the page shows around or under the picture. */}
            <div ref={containerRef} className="fixed inset-0 overflow-hidden bg-black" />
            <ControlPanel
                definitions={trioColorWaveControls}
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
