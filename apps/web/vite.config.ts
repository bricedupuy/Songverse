import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // ogg-opus-decoder's optional speech enhancement (8 MB), never used (issue #185).
    alias: { "@wasm-audio-decoders/opus-ml": fileURLToPath(new URL("./src/lib/vendor/opus-ml-stub.ts", import.meta.url)) },
  },
  // `vite preview` (our production server — see Dockerfile.web) rejects
  // requests whose Host header it doesn't recognize, as a DNS-rebinding
  // defense meant for a developer's own machine. In production this
  // container only ever receives traffic that Dokploy's reverse proxy has
  // already routed for a domain we explicitly configured there, so that
  // protection is redundant here — allow every host rather than hardcode
  // one domain and hit this again for the next subdomain we add.
  //
  // The build also runs a preview server itself, to prerender the offline
  // app shell (spa mode below, issue #49). It listens on 127.0.0.1, not
  // "localhost": in some build sandboxes (Dokploy's Docker builds) localhost
  // resolves to ::1 for the server and 127.0.0.1 for the prerender's fetch,
  // and the build failed with ECONNREFUSED.
  preview: { allowedHosts: true, host: "127.0.0.1" },
  plugins: [tailwindcss(), tanstackStart({ spa: { enabled: true } }), viteReact()],
});
