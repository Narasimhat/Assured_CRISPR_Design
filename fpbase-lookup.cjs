const FPBASE_API_ROOT = "https://www.fpbase.org/api/proteins/basic/";

function pickValue(record, keys) {
  for (const key of keys) {
    if (record && record[key] !== undefined && record[key] !== null && record[key] !== "") return record[key];
  }
  return "";
}

function absoluteUrl(value) {
  if (!value) return "";
  try {
    return new URL(value, "https://www.fpbase.org").toString();
  } catch {
    return "";
  }
}

function mapReporter(record) {
  const name = pickValue(record, ["name", "label", "protein"]);
  const aaSequence = String(pickValue(record, ["seq", "sequence", "aa_seq"])).toUpperCase();
  return {
    id: pickValue(record, ["id", "uuid"]),
    name,
    slug: pickValue(record, ["slug"]),
    aaSequence,
    aaLength: aaSequence.length || 0,
    genbank: pickValue(record, ["genbank", "genbank_accession"]),
    uniprot: pickValue(record, ["uniprot"]),
    url: absoluteUrl(pickValue(record, ["url", "absolute_url", "link"])),
    exMax: pickValue(record, ["ex_max", "default_state__ex_max"]),
    emMax: pickValue(record, ["em_max", "default_state__em_max"]),
    brightness: pickValue(record, ["brightness", "default_state__brightness"]),
    qy: pickValue(record, ["qy", "default_state__qy"]),
    extCoeff: pickValue(record, ["ext_coeff", "default_state__ext_coeff"]),
    pka: pickValue(record, ["pka", "default_state__pka"]),
    agg: pickValue(record, ["agg"]),
    status: pickValue(record, ["status"]),
    organism: pickValue(record, ["parent_organism", "organism"]),
  };
}

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Assured-CRISPR-Designer/1.0",
    },
  });
  if (!response.ok) throw new Error(`FPbase request failed (${response.status}).`);
  return response.json();
}

async function lookupFpbaseReporters({ search = "", limit = 200, maxPages = 8 } = {}) {
  const normalizedSearch = String(search || "").trim();
  const params = new URLSearchParams({
    format: "json",
    page_size: String(Math.min(Math.max(limit, 1), 250)),
  });
  if (normalizedSearch) params.set("name__icontains", normalizedSearch);
  let nextUrl = `${FPBASE_API_ROOT}?${params.toString()}`;
  const reporters = [];
  const seenNames = new Set();
  let count = 0;
  let page = 0;

  while (nextUrl && page < maxPages && reporters.length < limit) {
    page += 1;
    const payload = await fetchPage(nextUrl);
    const items = Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload)
        ? payload
        : [];
    if (typeof payload?.count === "number") count = payload.count;
    for (const item of items) {
      const mapped = mapReporter(item);
      const normalizedName = String(mapped.name || "").trim().toLowerCase();
      if (!normalizedName || seenNames.has(normalizedName)) continue;
      seenNames.add(normalizedName);
      reporters.push(mapped);
      if (reporters.length >= limit) break;
    }
    nextUrl = typeof payload?.next === "string" && payload.next ? payload.next : "";
  }

  return {
    ok: true,
    source: "FPbase REST API",
    sourceUrl: "https://www.fpbase.org/api/",
    search: normalizedSearch,
    count: count || reporters.length,
    reporters,
  };
}

module.exports = {
  lookupFpbaseReporters,
};
