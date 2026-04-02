import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { lookupCasDatabase } = require("../cas-database-lookup.cjs");
const { lookupBrunelloGuides } = require("../brunello-lookup.cjs");

/** GitHub Pages project site: https://<user>.github.io/<repo>/ */
const GITHUB_PAGES_BASE = "/Assured_CRISPR_Design/";

function casDatabaseDevApi() {
  return {
    name: "cas-database-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/cas-database", async (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: "Method not allowed." }));
          return;
        }

        try {
          const requestUrl = new URL(req.url || "/", "http://localhost");
          const gene = requestUrl.searchParams.get("gene") || "";
          const organismId = requestUrl.searchParams.get("organism") || "1";
          const result = await lookupCasDatabase({ gene, organismId });
          res.statusCode = result.ok ? 200 : 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            ok: false,
            error: error?.message || "Cas-Database lookup failed unexpectedly.",
          }));
        }
      });
    },
  };
}

function brunelloDevApi() {
  return {
    name: "brunello-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/brunello", async (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: "Method not allowed." }));
          return;
        }

        try {
          const requestUrl = new URL(req.url || "/", "http://localhost");
          const gene = requestUrl.searchParams.get("gene") || "";
          const result = await lookupBrunelloGuides({ gene });
          res.statusCode = result.ok ? 200 : 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            ok: false,
            error: error?.message || "Brunello lookup failed unexpectedly.",
          }));
        }
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), casDatabaseDevApi(), brunelloDevApi()],
  base: command === "build" && process.env.GITHUB_PAGES === "1" ? GITHUB_PAGES_BASE : "/",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/xlsx")) return "xlsx";
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) return "react-vendor";
          if (id.includes("node_modules")) return "vendor";
          return undefined;
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
}));
