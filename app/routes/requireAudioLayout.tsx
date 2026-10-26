import { Outlet } from "react-router";
import { RequireAudio } from "~/features/audio/RequireAudio";

// Visualizer routes need a running audio source; without one they ask for it in a required dialog.
export default function RequireAudioLayout() {
  return (
    <RequireAudio>
      <Outlet />
    </RequireAudio>
  );
}
