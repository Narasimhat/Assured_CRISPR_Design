const BLAST_URL = "https://blast.ncbi.nlm.nih.gov/Blast.cgi";
const HUMAN_ENTREZ_QUERY = "Homo sapiens[Organism]";
const DEFAULT_HITLIST_SIZE = 100;
const MIN_PRIMER_LENGTH = 15;
const MAX_PRIMER_LENGTH = 40;

function normalizePrimerSequence(sequence) {
  return String(sequence || "").toUpperCase().replace(/[^ACGT]/g, "");
}

function validatePrimerSequence(sequence, label) {
  const clean = normalizePrimerSequence(sequence);
  if (!clean) throw new Error(`${label} primer sequence is required.`);
  if (clean.length < MIN_PRIMER_LENGTH || clean.length > MAX_PRIMER_LENGTH) {
    throw new Error(`${label} primer must be between ${MIN_PRIMER_LENGTH} and ${MAX_PRIMER_LENGTH} nt for the remote specificity check.`);
  }
  return clean;
}

function buildLocusKey(accession, hitFrom, hitTo) {
  const start = Math.min(Number(hitFrom) || 0, Number(hitTo) || 0);
  const end = Math.max(Number(hitFrom) || 0, Number(hitTo) || 0);
  return `${accession || "unknown"}:${start}-${end}`;
}

function parseRidAndRtoe(payload) {
  const text = String(payload || "");
  const ridMatch = text.match(/RID = ([A-Z0-9-]+)/);
  const rtoeMatch = text.match(/RTOE = (\d+)/);
  if (!ridMatch) throw new Error("NCBI BLAST did not return a request identifier.");
  return {
    rid: ridMatch[1],
    rtoeSeconds: rtoeMatch ? Number(rtoeMatch[1]) : 0,
  };
}

function getBlastStatus(payload) {
  const text = String(payload || "");
  const match = text.match(/Status=([A-Z]+)/);
  return match ? match[1] : "";
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function submitBlastQuery(sequence) {
  const body = new URLSearchParams({
    CMD: "Put",
    PROGRAM: "blastn",
    DATABASE: "nt",
    QUERY: sequence,
    SHORT_QUERY_ADJUST: "true",
    ENTREZ_QUERY: HUMAN_ENTREZ_QUERY,
    FORMAT_TYPE: "JSON2_S",
    HITLIST_SIZE: String(DEFAULT_HITLIST_SIZE),
  });
  const response = await fetch(BLAST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Accept: "text/plain, text/html",
      "User-Agent": "Assured-CRISPR-Designer/1.0",
    },
    body: body.toString(),
  });
  if (!response.ok) throw new Error(`NCBI BLAST submission failed with HTTP ${response.status}.`);
  return parseRidAndRtoe(await response.text());
}

async function waitForBlastReady(rid, rtoeSeconds = 0) {
  const deadlineMs = Date.now() + Math.max(45000, (Number(rtoeSeconds) || 0) * 1000 + 25000);
  while (Date.now() < deadlineMs) {
    const url = new URL(BLAST_URL);
    url.searchParams.set("CMD", "Get");
    url.searchParams.set("RID", rid);
    url.searchParams.set("FORMAT_OBJECT", "SearchInfo");
    const response = await fetch(url, {
      headers: {
        Accept: "text/plain, text/html",
        "User-Agent": "Assured-CRISPR-Designer/1.0",
      },
    });
    if (!response.ok) throw new Error(`NCBI BLAST status check failed with HTTP ${response.status}.`);
    const statusPayload = await response.text();
    const status = getBlastStatus(statusPayload);
    if (status === "READY") return;
    if (status === "FAILED") throw new Error("NCBI BLAST reported a failed search.");
    if (status === "UNKNOWN") throw new Error("NCBI BLAST could not find this search request.");
    await sleep(5000);
  }
  throw new Error("NCBI BLAST did not finish within the remote specificity timeout window.");
}

async function fetchBlastResultJson(rid) {
  const url = new URL(BLAST_URL);
  url.searchParams.set("CMD", "Get");
  url.searchParams.set("RID", rid);
  url.searchParams.set("FORMAT_TYPE", "JSON2_S");
  url.searchParams.set("HITLIST_SIZE", String(DEFAULT_HITLIST_SIZE));
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain",
      "User-Agent": "Assured-CRISPR-Designer/1.0",
    },
  });
  if (!response.ok) throw new Error(`NCBI BLAST result retrieval failed with HTTP ${response.status}.`);
  return response.json();
}

function getThreePrimeSuffixMatch(hsp) {
  const qseq = String(hsp?.qseq || "");
  const hseq = String(hsp?.hseq || "");
  if (!qseq || !hseq || qseq.length !== hseq.length) return 0;
  let count = 0;
  for (let index = qseq.length - 1; index >= 0; index -= 1) {
    const qBase = qseq[index];
    const hBase = hseq[index];
    if (!qBase || !hBase || qBase === "-" || hBase === "-") break;
    if (qBase !== hBase) break;
    count += 1;
  }
  return count;
}

function classifyHsp(hsp, queryLength) {
  const identity = Number(hsp?.identity || 0);
  const alignLength = Number(hsp?.align_len || 0);
  const gaps = Number(hsp?.gaps || 0);
  const queryFrom = Number(hsp?.query_from || 0);
  const queryTo = Number(hsp?.query_to || 0);
  const threePrimeSuffix = getThreePrimeSuffixMatch(hsp);
  const coversFullQuery = queryFrom === 1 && queryTo === queryLength && alignLength === queryLength && gaps === 0;
  const exact = coversFullQuery && identity === queryLength;
  const nearPerfect = coversFullQuery && identity >= queryLength - 1;
  const threePrimeRisk = queryTo === queryLength && identity >= queryLength - 2 && alignLength >= queryLength - 2 && threePrimeSuffix >= Math.min(8, queryLength);
  return {
    identity,
    alignLength,
    gaps,
    threePrimeSuffix,
    exact,
    nearPerfect,
    threePrimeRisk,
  };
}

function summarizePrimerSearch(sequence, search) {
  const queryLength = Number(search?.query_len || sequence.length || 0);
  const exactLoci = new Map();
  const nearPerfectLoci = new Map();
  const threePrimeRiskLoci = new Map();
  const topHits = [];

  for (const hit of Array.isArray(search?.hits) ? search.hits : []) {
    const description = hit?.description?.[0] || {};
    const accession = description.accession || description.id || "";
    const title = description.title || "";
    for (const hsp of Array.isArray(hit?.hsps) ? hit.hsps : []) {
      const flags = classifyHsp(hsp, queryLength);
      const locusKey = buildLocusKey(accession, hsp?.hit_from, hsp?.hit_to);
      const locus = {
        accession,
        title,
        start: Math.min(Number(hsp?.hit_from) || 0, Number(hsp?.hit_to) || 0),
        end: Math.max(Number(hsp?.hit_from) || 0, Number(hsp?.hit_to) || 0),
        strand: hsp?.hit_strand || "",
        identity: flags.identity,
        alignLength: flags.alignLength,
        threePrimeSuffix: flags.threePrimeSuffix,
        classification: flags.exact
          ? "exact"
          : flags.nearPerfect
            ? "near-perfect"
            : flags.threePrimeRisk
              ? "3prime-risk"
              : "partial",
      };
      if (flags.exact && !exactLoci.has(locusKey)) exactLoci.set(locusKey, locus);
      if (flags.nearPerfect && !nearPerfectLoci.has(locusKey)) nearPerfectLoci.set(locusKey, locus);
      if (flags.threePrimeRisk && !threePrimeRiskLoci.has(locusKey)) threePrimeRiskLoci.set(locusKey, locus);
      if (flags.exact || flags.nearPerfect || flags.threePrimeRisk) topHits.push(locus);
    }
  }

  const exactLocusCount = exactLoci.size;
  const nearPerfectLocusCount = nearPerfectLoci.size;
  const threePrimeRiskLocusCount = threePrimeRiskLoci.size;
  const bestThreePrimeSuffix = topHits.reduce((best, hit) => Math.max(best, Number(hit.threePrimeSuffix) || 0), 0);
  const status = exactLocusCount <= 1 && threePrimeRiskLocusCount <= 2
    ? "favorable"
    : exactLocusCount <= 3 && threePrimeRiskLocusCount <= 6
      ? "moderate"
      : "broad";

  const summary = [
    `${exactLocusCount} exact human loci`,
    `${nearPerfectLocusCount} near-perfect loci`,
    `${threePrimeRiskLocusCount} 3' risk loci`,
  ].join(" | ");

  return {
    sequence,
    queryLength,
    exactLocusCount,
    nearPerfectLocusCount,
    threePrimeRiskLocusCount,
    bestThreePrimeSuffix,
    status,
    summary,
    topHits: topHits
      .sort((left, right) => {
        const priority = { exact: 0, "near-perfect": 1, "3prime-risk": 2, partial: 3 };
        if ((priority[left.classification] || 9) !== (priority[right.classification] || 9)) {
          return (priority[left.classification] || 9) - (priority[right.classification] || 9);
        }
        if ((right.identity || 0) !== (left.identity || 0)) return (right.identity || 0) - (left.identity || 0);
        if ((right.threePrimeSuffix || 0) !== (left.threePrimeSuffix || 0)) return (right.threePrimeSuffix || 0) - (left.threePrimeSuffix || 0);
        return String(left.accession || "").localeCompare(String(right.accession || ""));
      })
      .filter((hit, index, all) => index === all.findIndex((entry) => buildLocusKey(entry.accession, entry.start, entry.end) === buildLocusKey(hit.accession, hit.start, hit.end)))
      .slice(0, 5),
  };
}

function summarizePair(forward, reverse) {
  const statuses = [forward.status, reverse.status];
  const status = statuses.includes("broad")
    ? "review"
    : statuses.includes("moderate")
      ? "caution"
      : "acceptable";
  const label = status === "acceptable"
    ? "Approximate unique pair"
    : status === "caution"
      ? "Usable with review"
      : "Broad / repeated pair";
  const note = status === "acceptable"
    ? "Both primers look limited on the remote human BLAST screen."
    : status === "caution"
      ? "At least one primer shows multiple human matches; keep backup pairs available."
      : "One or both primers show repeated human matches and should be reviewed before ordering.";
  return { status, label, note };
}

async function runBlastSpecificityForPrimer(sequence) {
  const submission = await submitBlastQuery(sequence);
  await waitForBlastReady(submission.rid, submission.rtoeSeconds);
  const payload = await fetchBlastResultJson(submission.rid);
  const search = payload?.BlastOutput2?.[0]?.report?.results?.search || {};
  return {
    rid: submission.rid,
    searchTarget: payload?.BlastOutput2?.[0]?.report?.search_target?.db || "core_nt",
    params: payload?.BlastOutput2?.[0]?.report?.params || {},
    summary: summarizePrimerSearch(sequence, search),
  };
}

async function lookupPrimerSpecificity({ forwardPrimer, reversePrimer, genome = "hg38" }) {
  if (String(genome || "").toLowerCase() !== "hg38") {
    return { ok: false, error: "Only hg38 remote specificity is currently enabled." };
  }

  const forwardSequence = validatePrimerSequence(forwardPrimer, "Forward");
  const reverseSequence = validatePrimerSequence(reversePrimer, "Reverse");

  const [forwardResult, reverseResult] = await Promise.all([
    runBlastSpecificityForPrimer(forwardSequence),
    runBlastSpecificityForPrimer(reverseSequence),
  ]);
  const pair = summarizePair(forwardResult.summary, reverseResult.summary);

  return {
    ok: true,
    genome: "hg38",
    source: "NCBI BLAST Common URL API",
    method: "Remote human nt/core_nt BLAST limited with Homo sapiens[Organism]; approximation for hg38 primer specificity, not a local genome index.",
    forward: forwardResult.summary,
    reverse: reverseResult.summary,
    pair,
    metadata: {
      entrezQuery: HUMAN_ENTREZ_QUERY,
      database: forwardResult.searchTarget || reverseResult.searchTarget || "core_nt",
      forwardRid: forwardResult.rid,
      reverseRid: reverseResult.rid,
    },
  };
}

module.exports = {
  lookupPrimerSpecificity,
};
