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
  // `vite preview` (our production server — see Dockerfile.web) rejects
  // requests whose Host header it doesn't recognize, as a DNS-rebinding
  // defense meant for a developer's own machine. In production this
  // container only ever receives traffic that Dokploy's reverse proxy has
  // already routed for a domain we explicitly configured there, so that
  // protection is redundant here — allow every host rather than hardcode
  // one domain and hit this again for the next subdomain we add.
  preview: { allowedHosts: true },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
});
