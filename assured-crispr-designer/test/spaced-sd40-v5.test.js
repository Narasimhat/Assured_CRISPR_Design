// SD40-V5 C-terminal variants with a GGGGS spacer: composition and design checks.
//
// The cassettes are assembled from the same SD40 and V5 modules as the built-in "SD40-V5", so
// these tests pin the parts that must not drift: the two shared modules, the translated insert,
// the synthesis hygiene of the new Gly-Ser elements, and that a design with either variant
// keeps the reading frame and leaves guide selection untouched.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { CASSETTES, runDesign } from "../src/designEngine.js";

const fixture = (name) => readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", name), "utf8");

const CODON = {};
"KNKNTTTTRSRSIIMIQHQHPPPPRRRRLLLLEDEDAAAAGGGGVVVV*Y*YSSSS*CWCLFLF".split("").forEach((aa, i) => {
  CODON["ACGT"[(i >> 4) & 3] + "ACGT"[(i >> 2) & 3] + "ACGT"[i & 3]] = aa;
});
const translate = (dna) => dna.match(/.{3}/g).map((c) => CODON[c]).join("");

const LINKER = CASSETTES["N:SD40-Linker"].seq.slice(-33);
const SD40 = CASSETTES["N:SD40-Linker"].seq.slice(0, -33);
const BASE = CASSETTES["SD40-V5"].seq;
const V5 = BASE.slice(LINKER.length + SD40.length, -3);

const VARIANTS = [
  { tag: "SD40-GGGGS-V5", linkerAa: "AAKAKNNQGSG", cassetteBp: 201, labels: ["Linker", "SD40", "GGGGS spacer", "V5 tag", "Stop"] },
  { tag: "GGGGS3-SD40-GGGGS-V5", linkerAa: "GGGGSGGGGSGGGGS", cassetteBp: 213, labels: ["Linker (GGGGS)x3", "SD40", "GGGGS spacer", "V5 tag", "Stop"] },
];
const SD40_AA = "LLLFCPICGFTCRQKGNLLRHINLHTGEKLFKYHLY";
const V5_AA = "GKPIPNPLLGLDST";

test("the built-in SD40-V5 cassette is linker + SD40 + V5 + stop (reference for the variants)", () => {
  assert.equal(translate(SD40), SD40_AA);
  assert.equal(translate(V5), V5_AA);
  assert.equal(BASE, `${LINKER}${SD40}${V5}TAA`);
});

VARIANTS.forEach(({ tag, linkerAa, cassetteBp }) => {
  test(`${tag}: cassette is registered C-terminal and translates to linker-SD40-GGGGS-V5-stop`, () => {
    const entry = CASSETTES[tag];
    assert.ok(entry, "cassette is not registered");
    assert.equal(entry.pos, "C-term");
    assert.equal(entry.seq.length, cassetteBp);
    assert.equal(entry.len, entry.seq.length);
    assert.equal(translate(entry.seq), `${linkerAa}${SD40_AA}GGGGS${V5_AA}*`);
    // The shared modules are the built-in ones, byte for byte.
    assert.ok(entry.seq.includes(`${SD40}`));
    assert.ok(entry.seq.endsWith(`${V5}TAA`));
  });

  test(`${tag}: the Gly-Ser elements are safe to synthesise`, () => {
    const gs = entry_gs(tag);
    gs.forEach((element) => {
      assert.ok(!/(A{5}|C{5}|G{5}|T{5})/.test(element), `${element} has a run of five`);
      const kmers = new Set();
      for (let i = 0; i + 9 <= element.length; i += 1) {
        const k = element.slice(i, i + 9);
        assert.ok(!kmers.has(k), `${element} repeats the 9-mer ${k}`);
        kmers.add(k);
      }
      ["GGTCTC", "GAGACC", "CGTCTC", "GAGACG", "GAAGAC", "GTCTTC"].forEach((site) => {
        assert.ok(!element.includes(site), `${element} contains ${site}`);
      });
    });
  });
});

function entry_gs(tag) {
  const seq = CASSETTES[tag].seq;
  const spacer = seq.slice(seq.indexOf(SD40) + SD40.length, seq.length - V5.length - 3);
  const linker = seq.slice(0, seq.indexOf(SD40));
  return linker === LINKER ? [spacer] : [linker, spacer];
}

VARIANTS.forEach(({ tag, linkerAa, cassetteBp, labels }) => {
  test(`${tag}: NR2F2 design keeps the frame, builds the donor from the cassette and leaves the guides alone`, () => {
    const gb = fixture("nr2f2-ng016753.gb");
    const arm = 400;
    const result = runDesign("ct", gb, "", tag, arm, { deliveryMethod: "rnp", expectedGene: "NR2F2" });
    const plain = runDesign("ct", gb, "", "SD40-V5", arm, { deliveryMethod: "rnp", expectedGene: "NR2F2" });
    assert.equal(result.err, undefined);

    assert.equal(result.il, cassetteBp);
    assert.equal(result.dl, 2 * arm + cassetteBp);
    assert.ok(result.donor.includes(CASSETTES[tag].seq));

    const check = result.insertValidation;
    assert.equal(check.matchesPreset, true);
    assert.equal(check.framePreserved, true);
    assert.equal(check.unexpectedStop, false);
    assert.equal(check.terminalStopPresent, true);
    // The validator lists the translated insert with a trailing "Stop" token.
    assert.equal(check.actualAas.at(-1), "Stop");
    assert.equal(check.actualAas.slice(0, -1).join(""), `${linkerAa}${SD40_AA}GGGGS${V5_AA}`);

    // Donor map: 5' arm, the five insert segments in order, 3' arm. Guide-site marks overlay these.
    const parts = result.donorAnnotations.filter((a) => a.priority === 1).map((a) => a.label);
    assert.deepEqual(parts, ["5' HA", ...labels, "3' HA"]);

    // The cassette sits at the stop codon, so guide choice and blocking cannot depend on it.
    assert.deepEqual(result.gs.map((g) => g.sp), plain.gs.map((g) => g.sp));
    assert.deepEqual(result.ss.map((s) => [s.gp, s.oc, s.nc]), plain.ss.map((s) => [s.gp, s.oc, s.nc]));
  });
});
