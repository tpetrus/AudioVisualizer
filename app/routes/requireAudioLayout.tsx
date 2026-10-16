import { Outlet } from "react-router";
import RequireAudio from "~/features/audio/RequireAudio";

// Visualizer routes need a running audio source; without one they send the user back to the landing page.
export default function RequireAudioLayout() {
  return (
    <RequireAudio>
      <Outlet />
    </RequireAudio>
  );
}
