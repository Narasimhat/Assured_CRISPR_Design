function normalizeGuide(guide = {}, index = 0) {
  return {
    name: guide.n || `gRNA${index + 1}`,
    sequence: guide.sp || "",
    pam: guide.pm || guide.pam || "",
    strand: guide.str || "",
    gc: Number.isFinite(guide.gc) ? guide.gc : null,
    notes: guide.arm || guide.note || "",
    raw: guide,
  };
}

function normalizeSsOdn(donor = {}, index = 0) {
  return {
    name: donor.n || `ssODN${index + 1}`,
    kind: "ssODN",
    sequence: donor.od || donor.orderSeq || donor.seq || "",
    referenceSequence: donor.wo || "",
    linkedGuide: donor.guideName || donor.linkedGuide || "",
    strand: donor.sl || donor.guideStrand || "",
    proteinValidation: donor.proteinValidation || null,
    guideProtection: donor.guideProtection || [],
    raw: donor,
  };
}

function normalizePrimer(primer = {}, index = 0) {
  return {
    name: primer.n || `Primer${index + 1}`,
    sequence: primer.s || "",
    qc: primer.qc || null,
    raw: primer,
  };
}

/**
 * Stable presentation/export contract for every design class.
 *
 * The engine intentionally keeps class-specific fields (`os` for guide-linked
 * ssODNs and `donor` for terminal HDR donors). Reports and exports must consume
 * this adapter instead of guessing those raw field names independently.
 */
export function normalizeDesignResult(result) {
  if (!result || result.err) {
    return {
      type: result?.type || "unknown",
      gene: result?.gene || "",
      guides: [],
      donors: [],
      primers: [],
      raw: result || null,
    };
  }

  const guides = (result.gs || []).map(normalizeGuide);
  let donors = [];
  if (result.type === "pm" || result.type === "it") {
    donors = (result.os || []).map(normalizeSsOdn);
  } else if ((result.type === "ct" || result.type === "nt") && result.donor) {
    donors = [{
      name: `${result.tag || "HDR"} donor`,
      kind: "HDR",
      sequence: result.donor,
      referenceSequence: "",
      linkedGuide: guides.map((guide) => guide.name).join(", "),
      strand: "",
      proteinValidation: result.insertValidation || null,
      guideProtection: result.guideProtection?.guides || [],
      raw: result.donor,
    }];
  }

  return {
    type: result.type || "unknown",
    gene: result.gene || "",
    guides,
    donors,
    primers: (result.ps || []).map(normalizePrimer),
    raw: result,
  };
}

export function getPreferredStrandPresentation(releaseStatus = "review") {
  if (releaseStatus === "blocked") {
    return {
      label: "Candidate strand — blocked",
      note: "Preferred synthesis orientation only. Resolve every procurement blocker before ordering.",
      tone: "blocked",
    };
  }
  if (releaseStatus === "review") {
    return {
      label: "Candidate strand — review",
      note: "Preferred synthesis orientation only. Complete the listed reviews before ordering.",
      tone: "review",
    };
  }
  return {
    label: "Preferred strand",
    note: "Preferred synthesis orientation. Complete all standing external checks before ordering.",
    tone: "ready",
  };
}
