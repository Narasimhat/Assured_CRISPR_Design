const fs = require("fs");
const path = require("path");

const BRUNELLO_PATH = path.join(__dirname, "brunello_library_contents.txt");
const BRUNELLO_GENE_ALIASES = {
  DIPK2A: "C3ORF58",
};

let cachedGuidesByGene = null;

function normalizeGeneQuery(value) {
  return String(value || "").trim().toUpperCase();
}

function loadBrunelloGuides() {
  if (cachedGuidesByGene) return cachedGuidesByGene;

  const text = fs.readFileSync(BRUNELLO_PATH, "utf8");
  const lines = text.trim().split(/\r\n|\n|\r/);
  const headers = lines[0].split("\t");
  const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
  const byGene = new Map();

  for (let index = 1; index < lines.length; index += 1) {
    const columns = lines[index].split("\t");
    const gene = normalizeGeneQuery(columns[headerIndex["Target Gene Symbol"]]);
    const spacer = normalizeGeneQuery(columns[headerIndex["sgRNA Target Sequence"]]);
    if (!gene || !spacer) continue;

    const guide = {
      spacer,
      pam: normalizeGeneQuery(columns[headerIndex["PAM Sequence"]]),
      exon: String(columns[headerIndex["Exon Number"]] || "").trim(),
      ruleSet2: Number(columns[headerIndex["Rule Set 2 score"]] || 0),
      transcript: String(columns[headerIndex["Target Transcript"]] || "").trim(),
      strand: String(columns[headerIndex["Strand"]] || "").trim(),
      cutPosition: Number(columns[headerIndex["Position of Base After Cut (1-based)"]] || 0),
      genomicSequence: String(columns[headerIndex["Genomic Sequence"]] || "").trim(),
    };

    const existing = byGene.get(gene) || [];
    existing.push(guide);
    byGene.set(gene, existing);
  }

  cachedGuidesByGene = Object.fromEntries(
    [...byGene.entries()].map(([gene, guides]) => [
      gene,
      guides
        .sort((left, right) => (right.ruleSet2 - left.ruleSet2) || String(left.exon).localeCompare(String(right.exon)) || left.spacer.localeCompare(right.spacer))
        .slice(0, 4),
    ]),
  );
  return cachedGuidesByGene;
}

async function lookupBrunelloGuides({ gene }) {
  const requestedGene = normalizeGeneQuery(gene);
  if (!requestedGene) return { ok: false, error: "Gene symbol is required." };

  const libraryGene = BRUNELLO_GENE_ALIASES[requestedGene] || requestedGene;
  const guidesByGene = loadBrunelloGuides();
  const guides = guidesByGene[libraryGene] || [];

  return {
    ok: true,
    requestedGene,
    libraryGene,
    source: "Broad GPP Brunello human CRISPRko library",
    summary: "Reference sgRNAs ranked by Rule Set 2 on-target score from the Addgene Brunello library contents table.",
    totalGuides: guides.length,
    guides,
    note: guides.length ? "" : "No Brunello reference guides were found for this gene symbol.",
  };
}

module.exports = {
  lookupBrunelloGuides,
};
