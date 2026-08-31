// Contract tests for the serverless lookup handlers in ../../api.
//
// These exercise only the input-validation paths, which all return before any fetch,
// so the suite stays offline and deterministic. The distinction being locked in:
// bad caller input must produce HTTP 400, and only upstream/network failures may
// produce HTTP 500.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { lookupPrimerSpecificity } = require("../../primer-specificity-lookup.cjs");
const { lookupBrunelloGuides } = require("../../brunello-lookup.cjs");
const { lookupCasDatabase } = require("../../cas-database-lookup.cjs");
const primerSpecificityHandler = require("../../api/primer-specificity.js");

function fakeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(key, value) { this.headers[key] = value; },
    end(payload) { this.body = payload; },
  };
}

async function invoke(handler, { method = "GET", query = {} } = {}) {
  const res = fakeResponse();
  await handler({ method, query }, res);
  return { res, json: res.body ? JSON.parse(res.body) : null };
}

test("primer specificity rejects malformed input as a result, not an exception", async () => {
  const missing = await lookupPrimerSpecificity({ forwardPrimer: "", reversePrimer: "ACGTACGTACGTACGTACGT" });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /Forward primer sequence is required/);

  const tooShort = await lookupPrimerSpecificity({ forwardPrimer: "ACGTACG", reversePrimer: "ACGTACGTACGTACGTACGT" });
  assert.equal(tooShort.ok, false);
  assert.match(tooShort.error, /between 15 and 40 nt/);

  const tooLong = await lookupPrimerSpecificity({ forwardPrimer: "A".repeat(41), reversePrimer: "ACGTACGTACGTACGTACGT" });
  assert.equal(tooLong.ok, false);

  const wrongGenome = await lookupPrimerSpecificity({
    forwardPrimer: "ACGTACGTACGTACGTACGT",
    reversePrimer: "ACGTACGTACGTACGTACGT",
    genome: "hg19",
  });
  assert.equal(wrongGenome.ok, false);
  assert.match(wrongGenome.error, /hg38/);
});

test("bad primer input maps to HTTP 400, not 500", async () => {
  // Regression guard: validation used to throw, so the handler's catch block turned
  // every malformed request into a 500 and looked like a server fault.
  const { res, json } = await invoke(primerSpecificityHandler, { query: { fw: "", rev: "" } });
  assert.equal(res.statusCode, 400);
  assert.equal(json.ok, false);
  assert.equal(res.headers["Content-Type"], "application/json");
});

test("non-GET requests are rejected with 405", async () => {
  const { res, json } = await invoke(primerSpecificityHandler, { method: "POST" });
  assert.equal(res.statusCode, 405);
  assert.equal(json.ok, false);
});

test("gene-symbol lookups require a gene and report it as a result", async () => {
  const brunello = await lookupBrunelloGuides({ gene: "" });
  assert.equal(brunello.ok, false);
  assert.match(brunello.error, /required/i);

  const cas = await lookupCasDatabase({ gene: "", organismId: "1" });
  assert.equal(cas.ok, false);
  assert.match(cas.error, /required/i);
});
