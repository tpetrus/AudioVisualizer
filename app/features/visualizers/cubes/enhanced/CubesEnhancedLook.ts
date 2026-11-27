import type {
    CubeGridLike,
    CubesEnhancedLookApi,
    CubesEnhancedLookOptions,
    CubesEnhancedSettings,
    CubesFxFrame,
} from './cubesEnhancedTypes';

// Orchestrator stub of contract C3, so the hook side can be built against the real module path. Task B replaces the
// body; the exported name and the CubesEnhancedLookApi shape must not change.
export class CubesEnhancedLook implements CubesEnhancedLookApi {
    private grid: CubeGridLike | undefined;
    private disposed = false;

    constructor(private readonly options: CubesEnhancedLookOptions) {}

    attach(grid: CubeGridLike): void {
        if (this.disposed) return;
        this.grid = grid;
    }

    update(_frame: Readonly<CubesFxFrame>, _settings: Readonly<CubesEnhancedSettings>): void {}

    render(): void {
        if (this.disposed) return;
        const { renderer, scene, camera } = this.options;
        renderer.render(scene, camera);
    }

    resize(_width: number, _height: number): void {}

    setReducedMotion(_reduced: boolean): void {}

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.grid?.setMaterialOverride(null);
        this.grid = undefined;
    }
}
