// Coverage for the release-language layer.
//
// Regression guard for a live contradiction: the donor "Order this strand" badge was
// derived only from which strand to synthesise (sense vs antisense) and ignored release
// status entirely, so a design whose procurement status was "blocked" still rendered a
// green "Order this strand" pill - on screen and in the downloadable HTML report. The
// export files were already filtered, so the report was the surface that disagreed.

import test from "node:test";
import assert from "node:assert/strict";

import {
  getDonorStrandBadge,
  getDonorStrandBadgeColor,
  getOrderRecommendationLabels,
} from "../src/reportModel.js";

const COLORS = { success: "#059669", danger: "#DC2626", warning: "#B54708", muted: "#667085" };

test("a blocked design never says 'order' on its donor strand", () => {
  const badge = getDonorStrandBadge({ recommended: true }, true);
  assert.equal(badge.orderable, false);
  assert.equal(badge.tone, "candidate");
  assert.doesNotMatch(badge.label, /^Order/i);
  assert.doesNotMatch(badge.labelTitle, /^Order/i);
  assert.match(badge.label, /do not order/i);
  // and it must not be styled as success
  assert.equal(getDonorStrandBadgeColor(badge, COLORS), COLORS.danger);
  assert.notEqual(badge.panel, "#ECFDF5");
});

test("an unblocked recommended strand is the orderable one", () => {
  const badge = getDonorStrandBadge({ recommended: true }, false);
  assert.equal(badge.orderable, true);
  assert.equal(badge.tone, "order");
  assert.equal(badge.label, "Order this strand");
  assert.equal(getDonorStrandBadgeColor(badge, COLORS), COLORS.success);
});

test("a review-required design presents a draft candidate, not an order instruction", () => {
  const badge = getDonorStrandBadge({ recommended: true }, "review");
  assert.equal(badge.orderable, false);
  assert.equal(badge.tone, "review");
  assert.match(badge.label, /review required/i);
  assert.doesNotMatch(badge.label, /order this strand/i);
  assert.equal(getDonorStrandBadgeColor(badge, COLORS), COLORS.warning);
});

test("the non-recommended strand is never orderable, blocked or not", () => {
  for (const releaseBlocked of [false, true]) {
    const badge = getDonorStrandBadge({ recommended: false }, releaseBlocked);
    assert.equal(badge.orderable, false, `releaseBlocked=${releaseBlocked}`);
    assert.equal(badge.label, "Reference strand");
    assert.equal(getDonorStrandBadgeColor(badge, COLORS), COLORS.muted);
  }
});

test("missing or malformed strand input is never treated as orderable", () => {
  for (const input of [null, undefined, {}, { recommended: 0 }, { recommended: "" }]) {
    for (const blocked of [false, true]) {
      assert.equal(getDonorStrandBadge(input, blocked).orderable, false, JSON.stringify(input));
    }
  }
});

test("no badge combination can be orderable while the release is blocked", () => {
  // Exhaustive over the whole input space of the decision.
  const strands = [null, undefined, {}, { recommended: true }, { recommended: false }];
  strands.forEach((strand) => {
    assert.equal(
      getDonorStrandBadge(strand, true).orderable,
      false,
      `blocked release produced an orderable badge for ${JSON.stringify(strand)}`,
    );
  });
});

test("the exported Recommended column carries the release state", () => {
  const blocked = getOrderRecommendationLabels(true);
  assert.match(blocked.item, /blocked/i);
  assert.match(blocked.donorStrand, /do not order/i);
  assert.doesNotMatch(blocked.item, /^Yes$/);

  const open = getOrderRecommendationLabels(false);
  assert.equal(open.item, "Yes");
  assert.equal(open.donorStrand, "Order this strand");

  const review = getOrderRecommendationLabels("review");
  assert.match(review.item, /draft/i);
  assert.match(review.donorStrand, /review required/i);
  assert.doesNotMatch(review.donorStrand, /order this strand/i);
});
