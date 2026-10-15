import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [index("routes/landingPage.tsx"), route('/test1', "routes/test1.tsx")] satisfies RouteConfig;
