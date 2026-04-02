const CAS_DATABASE_ROOT = "http://www.rgenome.net/cas-database";

const FILTER_TIERS = [
  {
    id: "strict",
    label: "Strict recommended filters",
    params: {
      filter_mis0: "1",
      filter_mis1: "0",
      filter_mis2: "0",
      filter_maxcoverage: "1",
      filter_gc: "20-80",
      filter_trepeat: "1",
      filter_oof: "60",
      filter_cdsposition: "5-50",
    },
  },
  {
    id: "balanced",
    label: "Balanced fallback filters",
    params: {
      filter_mis0: "1",
      filter_mis1: "0",
      filter_mis2: "0",
      filter_gc: "20-80",
      filter_trepeat: "1",
      filter_oof: "40",
      filter_cdsposition: "5-80",
    },
  },
  {
    id: "broad",
    label: "Broad fallback filters",
    params: {
      filter_gc: "20-80",
      filter_trepeat: "1",
    },
  },
];

function normalizeGeneQuery(value) {
  return String(value || "").trim().toUpperCase();
}

function buildUrl(path, params = {}) {
  const url = new URL(path, `${CAS_DATABASE_ROOT}/`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  return url.toString();
}

async function fetchJson(path, params = {}) {
  const response = await fetch(buildUrl(path, params), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Cas-Database request failed with HTTP ${response.status}.`);
  }
  return response.json();
}

function selectGeneMatch(genes, query) {
  const normalized = normalizeGeneQuery(query);
  return genes.find((gene) => normalizeGeneQuery(gene.symbol) === normalized)
    || genes.find((gene) => normalizeGeneQuery(gene.ensembl_id) === normalized)
    || genes[0]
    || null;
}

function getCdsPercentages(target) {
  return Object.values(target?.cds_percentages || {})
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function pickBestCdsPercentage(percentages) {
  if (!percentages.length) return null;
  const preferred = percentages.filter((value) => value >= 5 && value <= 50);
  const pool = preferred.length ? preferred : percentages;
  return pool.slice().sort((left, right) => Math.abs(left - 27.5) - Math.abs(right - 27.5))[0];
}

function getOffTargetTuple(target) {
  const counts = Array.isArray(target?.offtarget_counts) ? target.offtarget_counts : [];
  return [
    Number.isFinite(Number(counts[0])) ? Number(counts[0]) : Number.MAX_SAFE_INTEGER,
    Number.isFinite(Number(counts[1])) ? Number(counts[1]) : Number.MAX_SAFE_INTEGER,
    Number.isFinite(Number(counts[2])) ? Number(counts[2]) : Number.MAX_SAFE_INTEGER,
  ];
}

function rankTargets(targets) {
  return targets.slice().sort((left, right) => {
    const [left0, left1, left2] = getOffTargetTuple(left);
    const [right0, right1, right2] = getOffTargetTuple(right);
    if (left0 !== right0) return left0 - right0;
    if (left1 !== right1) return left1 - right1;
    if (left2 !== right2) return left2 - right2;
    if ((right.coverage || 0) !== (left.coverage || 0)) return (right.coverage || 0) - (left.coverage || 0);
    if ((right.oof_score || 0) !== (left.oof_score || 0)) return (right.oof_score || 0) - (left.oof_score || 0);
    const leftBest = pickBestCdsPercentage(getCdsPercentages(left));
    const rightBest = pickBestCdsPercentage(getCdsPercentages(right));
    if (leftBest !== null || rightBest !== null) {
      const leftDistance = leftBest === null ? Number.MAX_SAFE_INTEGER : Math.abs(leftBest - 27.5);
      const rightDistance = rightBest === null ? Number.MAX_SAFE_INTEGER : Math.abs(rightBest - 27.5);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    }
    return (left.id || 0) - (right.id || 0);
  });
}

function summarizeTarget(target) {
  const fullSequence = String(target?.sequence || "").toUpperCase();
  const spacer = fullSequence.length >= 20 ? fullSequence.slice(0, 20) : fullSequence;
  const pam = fullSequence.length > 20 ? fullSequence.slice(20) : "";
  const cdsPercentages = getCdsPercentages(target);
  const bestCdsPercentage = pickBestCdsPercentage(cdsPercentages);
  const [off0, off1, off2] = getOffTargetTuple(target);
  return {
    id: target.id,
    fullSequence,
    spacer,
    pam,
    chromosome: target.chromosome || "",
    position: target.position || "",
    strand: target.strand || "",
    location: target.chromosome && target.position ? `${target.chromosome}:${target.position}:${target.strand || ""}` : "",
    oofScore: Number(target.oof_score || 0),
    coverage: Number(target.coverage || 0),
    gcContents: Number(target.gc_contents || 0),
    bestCdsPercentage,
    transcriptCount: cdsPercentages.length,
    offTargetCounts: [off0, off1, off2],
  };
}

async function lookupCasDatabase({ gene, organismId }) {
  const normalizedGene = normalizeGeneQuery(gene);
  if (!normalizedGene) {
    return { ok: false, error: "Gene symbol is required." };
  }

  const normalizedOrganismId = String(organismId || "1");
  let geneSearch = await fetchJson(`organisms/${normalizedOrganismId}/genes/`, {
    page: "1",
    query: normalizedGene,
    category: "1",
  });

  if (!geneSearch?.genes?.length) {
    geneSearch = await fetchJson(`organisms/${normalizedOrganismId}/genes/`, {
      page: "1",
      query: normalizedGene,
      category: "0",
    });
  }

  const matchedGene = selectGeneMatch(geneSearch?.genes || [], normalizedGene);
  if (!matchedGene) {
    return {
      ok: true,
      geneQuery: normalizedGene,
      organismId: normalizedOrganismId,
      matchedGene: null,
      tier: null,
      totalTargets: 0,
      targets: [],
      note: "No Cas-Database gene match was found for this query and organism.",
    };
  }

  for (const tier of FILTER_TIERS) {
    const targetResponse = await fetchJson(`genes/${matchedGene.id}/targets/`, tier.params);
    const rankedTargets = rankTargets(targetResponse?.targets || []);
    if (rankedTargets.length) {
      return {
        ok: true,
        geneQuery: normalizedGene,
        organismId: normalizedOrganismId,
        matchedGene,
        tier: tier.id,
        tierLabel: tier.label,
        totalTargets: rankedTargets.length,
        targets: rankedTargets.slice(0, 8).map(summarizeTarget),
        note: tier.id === "strict"
          ? "Results meet the default recommended Cas-Database knockout filters."
          : `Results required the ${tier.label.toLowerCase()} because the stricter filters returned no targets.`,
      };
    }
  }

  return {
    ok: true,
    geneQuery: normalizedGene,
    organismId: normalizedOrganismId,
    matchedGene,
    tier: null,
    totalTargets: 0,
    targets: [],
    note: "Cas-Database found the gene, but no targets matched the available filter tiers.",
  };
}

module.exports = {
  lookupCasDatabase,
};
