import type { Config } from "@react-router/dev/config";

export default {
  // SPA mode: the app is entirely client-side (Web Audio, WebGL, localStorage), so the build is a static
  // build/client folder that Cloudflare serves as assets. There is no server to render on.
  ssr: false,
} satisfies Config;
