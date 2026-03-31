import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** GitHub Pages project site: https://<user>.github.io/<repo>/ */
const GITHUB_PAGES_BASE = "/Assured_CRISPR_Design/";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" && process.env.GITHUB_PAGES === "1" ? GITHUB_PAGES_BASE : "/",
  server: {
    host: true,
    port: 5173,
  },
}));
