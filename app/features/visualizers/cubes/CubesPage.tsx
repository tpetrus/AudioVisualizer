import { ControlPanel } from "~/components/ControlPanel/ControlPanel";
import { useControlValues } from "~/components/ControlPanel/useControlValues";
import { cubesControls } from "./cubesControls";
import { useRef, useState } from "react";

export default function CubesPage() {
    const { values, valuesRef, setValue, resetAll } = useControlValues(cubesControls);
    const [cameraLocked, setCameraLocked] = useState(true);
    const [viewChanged, setViewChanged] = useState(false);
    const resetViewRef = useRef<() => void>(() => { });

    // … useCubesScene(containerRef, { valuesRef, … })

    return <ControlPanel
        definitions={cubesControls}
        values={values}
        onChange={setValue}
        onResetAll={resetAll}
        cameraLocked={cameraLocked}
        onCameraLockedChange={setCameraLocked}
        viewChanged={viewChanged}
        onResetView={() => resetViewRef.current()}
    />
}
