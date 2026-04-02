const { lookupFpbaseReporters } = require("../fpbase-lookup.cjs");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Method not allowed." }));
    return;
  }

  try {
    const search = req.query?.search || "";
    const limit = Number(req.query?.limit || 200);
    const result = await lookupFpbaseReporters({ search, limit });
    res.statusCode = result.ok ? 200 : 400;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.end(JSON.stringify(result));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      ok: false,
      error: error?.message || "FPbase lookup failed unexpectedly.",
    }));
  }
};
