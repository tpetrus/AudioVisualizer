import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    // `~/` imports come from tsconfig.json `paths`, the single source of truth for aliases.
    tsconfigPaths: true,
  }
});
