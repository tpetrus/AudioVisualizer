import { useRef, useState } from 'react';
import { cubesControls } from './cubesControls';
import { useCubesScene } from './useCubesScene';
import { ControlPanel } from '~/components/ControlPanel/ControlPanel';
import { useAnalyser } from '~/features/audio/useAudioState';
import { useControlValues } from '~/components/ControlPanel/useControlValues';

export function CubesPage() {
    const containerRef = useRef<HTMLDivElement>(null);
    const analyser = useAnalyser();
    const { values, valuesRef, setValue, resetAll } = useControlValues(cubesControls);
    // Locked by default: the picture can't be dragged, rotated or zoomed until the lock button is clicked.
    const [cameraLocked, setCameraLocked] = useState(true);
    // True once the view has been moved away from its starting position (shows the reset-view button).
    const [viewChanged, setViewChanged] = useState(false);

    const { resetView } = useCubesScene(containerRef, {
        analyser,
        valuesRef,
        cameraLocked,
        onViewChanged: setViewChanged,
    });

    return (
        <>
            <div ref={containerRef} className="fixed inset-0 bg-black" />
            <ControlPanel
                definitions={cubesControls}
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
