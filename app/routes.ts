import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [index("routes/landingPage.tsx"), route('/cubes', "routes/cubesPage.tsx")] satisfies RouteConfig;
