import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  index("routes/landingPage.tsx"),
  // Visualizers need a running audio source.
  layout("routes/requireAudioLayout.tsx", [
    route('/cubes', "routes/cubesPage.tsx"),
    route('/trio-color-wave', "routes/trioColorWavePage.tsx"),
  ]),
] satisfies RouteConfig;
