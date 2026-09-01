import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { lookupCasDatabase } = require("../cas-database-lookup.cjs");
const { lookupBrunelloGuides } = require("../brunello-lookup.cjs");
const { lookupFpbaseReporters } = require("../fpbase-lookup.cjs");
const { lookupPrimerSpecificity } = require("../primer-specificity-lookup.cjs");

/**
 * Commit the bundle was built from, so the footer can name the code that produced a report.
 *
 * Read out of .git rather than shelled out to `git`: under `npm run build` the spawned git
 * exits non-zero with no stderr on this machine, which silently produced an empty SHA and
 * a footer that looked fine while carrying no provenance at all. Reading the files has no
 * PATH dependency and cannot fail quietly in that way.
 */
function readGitSha(startDir) {
  let dir = startDir;
  for (let depth = 0; depth < 8; depth += 1) {
    const dotGit = path.join(dir, ".git");
    if (fs.existsSync(dotGit)) {
      // A worktree or submodule checkout has .git as a file pointing at the real gitdir.
      const gitDir = fs.statSync(dotGit).isDirectory()
        ? dotGit
        : path.resolve(dir, fs.readFileSync(dotGit, "utf8").replace(/^gitdir:\s*/, "").trim());
      const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
      if (!head.startsWith("ref:")) return head;              // detached HEAD
      const ref = head.slice(4).trim();
      const looseRef = path.join(gitDir, ref);
      if (fs.existsSync(looseRef)) return fs.readFileSync(looseRef, "utf8").trim();
      const packedRefs = path.join(gitDir, "packed-refs");     // ref may only be packed
      if (fs.existsSync(packedRefs)) {
        const line = fs.readFileSync(packedRefs, "utf8")
          .split(/\r?\n/)
          .find((entry) => entry.endsWith(` ${ref}`));
        if (line) return line.split(" ")[0];
      }
      return "";
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "";
}

/** CI hosts hand us the commit; a local build reads it from the checkout. Never throws. */
function resolveBuildSha() {
  const fromEnv = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || process.env.BUILD_SHA;
  if (fromEnv) return String(fromEnv).trim();
  try {
    return readGitSha(path.dirname(fileURLToPath(import.meta.url)));
  } catch {
    return "";
  }
}

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

function fpbaseDevApi() {
  return {
    name: "fpbase-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/fpbase-reporters", async (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: "Method not allowed." }));
          return;
        }

        try {
          const requestUrl = new URL(req.url || "/", "http://localhost");
          const search = requestUrl.searchParams.get("search") || "";
          const limit = Number(requestUrl.searchParams.get("limit") || 200);
          const result = await lookupFpbaseReporters({ search, limit });
          res.statusCode = result.ok ? 200 : 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            ok: false,
            error: error?.message || "FPbase lookup failed unexpectedly.",
          }));
        }
      });
    },
  };
}

function primerSpecificityDevApi() {
  return {
    name: "primer-specificity-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/primer-specificity", async (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: "Method not allowed." }));
          return;
        }

        try {
          const requestUrl = new URL(req.url || "/", "http://localhost");
          const forwardPrimer = requestUrl.searchParams.get("fw") || "";
          const reversePrimer = requestUrl.searchParams.get("rev") || "";
          const genome = requestUrl.searchParams.get("genome") || "hg38";
          const result = await lookupPrimerSpecificity({ forwardPrimer, reversePrimer, genome });
          res.statusCode = result.ok ? 200 : 400;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(result));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            ok: false,
            error: error?.message || "Primer specificity lookup failed unexpectedly.",
          }));
        }
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), casDatabaseDevApi(), brunelloDevApi(), fpbaseDevApi(), primerSpecificityDevApi()],
  define: {
    __BUILD_SHA__: JSON.stringify(resolveBuildSha()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
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
