import { createContext, useContext } from 'react';
import { audioHub } from './audioHub';
import type { AudioHubReader } from './types';

// Where visualizers get the hub. It defaults to the app's singleton, so nothing needs to be provided in the app; a spec
// provides a fake (app/test/fakeAudioHub.ts) to drive the snapshot by hand.
export const AudioHubContext = createContext<AudioHubReader>(audioHub);

// The hub's reader. Hold the returned `snapshot` in a ref or a local and call `update()` once per frame; never copy
// the snapshot into React state.
export function useAudioHub(): AudioHubReader {
    return useContext(AudioHubContext);
}
