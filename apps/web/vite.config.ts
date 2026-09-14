import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // Prisma's generated client uses __dirname to locate its query engine
  // binary — bundling it into an ESM SSR chunk breaks that. Keep it (and
  // our thin @songverse/db wrapper) external so Node loads it natively.
  ssr: { external: ["@prisma/client", "@songverse/db"] },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
});
