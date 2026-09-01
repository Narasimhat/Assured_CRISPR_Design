// Shared presentation model for reports and exports.
//
// First piece of the canonical report layer: anything that tells a reader whether a
// sequence may be ordered lives here, in plain JS, so it can be unit-tested. App.jsx is
// JSX and cannot be imported by `node --test`, which is why this logic could previously
// regress unnoticed in four separate render paths.

/**
 * A donor strand's `recommended` flag says WHICH strand to synthesise (sense vs
 * antisense). It carries no authority over whether the design may be ordered at all -
 * only the release state does. Deriving the badge from `recommended` alone put a green
 * "Order this strand" pill on blocked designs in both the on-screen report and the HTML
 * download.
 *
 * @param {{recommended?: boolean}|null|undefined} strand
 * @param {"blocked"|"review"|"ready"|boolean} releaseStatus authoritative procurement status.
 * Boolean values remain supported for older callers (`true` = blocked, `false` = ready).
 */
export function getDonorStrandBadge(strand, releaseStatus = "ready") {
  const status = releaseStatus === true ? "blocked" : releaseStatus === false ? "ready" : releaseStatus;
  if (!strand?.recommended) {
    return {
      tone: "reference",
      label: "Reference strand",
      labelTitle: "Reference Strand",
      orderable: false,
      fg: "#475467", bg: "#EAECF0", border: "#d7dee7", panel: "#f8fafc",
    };
  }
  if (status === "blocked") {
    return {
      tone: "candidate",
      label: "Candidate donor — do not order",
      labelTitle: "Candidate Donor — Do Not Order",
      orderable: false,
      fg: "#B42318", bg: "#FEE4E2", border: "#F0443855", panel: "#FEF3F2",
    };
  }
  if (status === "review") {
    return {
      tone: "review",
      label: "Candidate donor — review required",
      labelTitle: "Candidate Donor — Review Required",
      orderable: false,
      fg: "#B54708", bg: "#FEF0C7", border: "#F7900955", panel: "#FFFAEB",
    };
  }
  return {
    tone: "order",
    label: "Order this strand",
    labelTitle: "Order This Strand",
    orderable: true,
    fg: "#047857", bg: "#D1FAE5", border: "#10B98155", panel: "#ECFDF5",
  };
}

/** Maps a badge tone onto the app's Badge palette. */
export function getDonorStrandBadgeColor(badge, colors) {
  if (badge?.tone === "order") return colors.success;
  if (badge?.tone === "candidate") return colors.danger;
  if (badge?.tone === "review") return colors.warning || "#B54708";
  return colors.muted;
}

/** Wording for the "Recommended" column in the combined order preview / CSV. */
export function getOrderRecommendationLabels(releaseStatus = "ready") {
  const status = releaseStatus === true ? "blocked" : releaseStatus === false ? "ready" : releaseStatus;
  if (status === "blocked") return { item: "No - design blocked", donorStrand: "Do not order - design blocked" };
  if (status === "review") return { item: "Draft - review required", donorStrand: "Candidate strand - review required" };
  return { item: "Yes", donorStrand: "Order this strand" };
}
