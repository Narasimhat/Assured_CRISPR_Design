const { lookupPrimerSpecificity } = require("../primer-specificity-lookup.cjs");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Method not allowed." }));
    return;
  }

  try {
    const forwardPrimer = req.query?.fw || "";
    const reversePrimer = req.query?.rev || "";
    const genome = req.query?.genome || "hg38";
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
};
