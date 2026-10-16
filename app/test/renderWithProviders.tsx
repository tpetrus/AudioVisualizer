import { render, renderHook, type RenderHookOptions, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { AudioProvider } from '~/features/audio/AudioProvider';
import { RhythmProvider } from '~/features/rhythm/RhythmProvider';
import { asEngine, asTracker, FakeAudioEngine, FakeRhythmTracker } from './fakeEngines';

// Renders UI the way the app mounts it (root.tsx): AudioProvider > RhythmProvider > router, but with fake engine and
// tracker instances injected so no audio hardware, worklet or localStorage is involved. Needs a jsdom spec.
//
//   const { getByRole, user, engine, tracker } = renderWithProviders(<ControlPanel ... />);
//   await user.click(getByRole('button', { name: /reset/i }));
//
// Pass `engine` / `tracker` to configure them before the first render (they are also returned). `route` is the
// initial URL for components that navigate or use `<Link>` / `useNavigate`.

export interface ProviderOptions {
    engine?: FakeAudioEngine;
    tracker?: FakeRhythmTracker;
    route?: string;
}

function createWrapper({ engine = new FakeAudioEngine(), tracker = new FakeRhythmTracker(), route = '/' }: ProviderOptions = {}) {
    // RhythmProvider calls `tracker.start(engine)` in an effect, which is a spy on the fake, so nothing runs.
    function Wrapper({ children }: { children: ReactNode }) {
        return <AudioProvider engine={asEngine(engine)}>
            <RhythmProvider tracker={asTracker(tracker)}>
                <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
            </RhythmProvider>
        </AudioProvider>;
    }
    return { Wrapper, engine, tracker };
}

export function renderWithProviders(ui: ReactElement, options: ProviderOptions & Omit<RenderOptions, 'wrapper'> = {}) {
    const { engine, tracker, route, ...renderOptions } = options;
    const wrapper = createWrapper({ engine, tracker, route });
    return {
        ...render(ui, { ...renderOptions, wrapper: wrapper.Wrapper }),
        engine: wrapper.engine,
        tracker: wrapper.tracker,
        // Created per render, as user-event recommends. With fake timers pass `advanceTimers` yourself via userEvent.setup.
        user: userEvent.setup(),
    };
}

// Same providers for hooks that call `useAudio()` / `useRhythm()`.
export function renderHookWithProviders<Result, Props>(
    hook: (props: Props) => Result,
    options: ProviderOptions & Omit<RenderHookOptions<Props>, 'wrapper'> = {},
) {
    const { engine, tracker, route, ...hookOptions } = options;
    const wrapper = createWrapper({ engine, tracker, route });
    return {
        ...renderHook(hook, { ...hookOptions, wrapper: wrapper.Wrapper }),
        engine: wrapper.engine,
        tracker: wrapper.tracker,
    };
}
