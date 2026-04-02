const { lookupBrunelloGuides } = require("../brunello-lookup.cjs");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Method not allowed." }));
    return;
  }

  try {
    const gene = req.query?.gene || "";
    const result = await lookupBrunelloGuides({ gene });
    res.statusCode = result.ok ? 200 : 400;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.end(JSON.stringify(result));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      ok: false,
      error: error?.message || "Brunello lookup failed unexpectedly.",
    }));
  }
};
