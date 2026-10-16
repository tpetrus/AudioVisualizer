import { LandingPage } from "~/features/landing/LandingPage";
import type { Route } from "../+types/root";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Audio Visualizer" },
    {
      name: "description",
      content:
        "Spice up your music-listening experience, add vibrancy and motion, to your DJ set, or whatever else you think of.",
    },
  ];
}

export default function Home() {
  return <LandingPage />;
}
