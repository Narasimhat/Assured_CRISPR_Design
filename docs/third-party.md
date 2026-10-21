# Third-party components

What this repository bundles, calls or depends on, and the terms that apply to each. The MIT licence of this repository covers the
authors' own code and documentation only; it does not relicense anything listed here. Status as read on 2026-10-21; re-check before a release.

| Component | How it is used | Terms | Notes |
|---|---|---|---|
| Brunello library contents table (Broad GPP; Doench et al. 2016; Addgene #73178 / #73179), `brunello_library_contents.txt` | Bundled; reference sgRNAs ranked by Rule Set 2 score | No licence text in the file; redistribution terms not yet confirmed | Cite Doench et al. 2016 and acknowledge the depositors (David Root, John Doench) as Addgene asks. Confirm terms with the source before relying on redistribution |
| CFD tables (Doench et al. 2016, Supplementary Tables 19/20), `src/cfd.js` | Transcribed numeric tables used to grade guide blocking | Published data | Cite Doench et al. 2016, *Nat Biotechnol* 34:184-191 |
| Human codon usage (Kazusa table), `src/codonUsage.js` | Ranks synonymous blocking codons | Published table | Cite the source |
| SantaLucia 1998 nearest-neighbour parameters, `src/designEngine.js` | Primer 3'-end stability | Published parameters | Cite the source |
| FPbase (`fpbase-lookup.cjs`, `api/fpbase-reporters.js`) | Run-time REST lookup of reporter proteins | FPbase terms: data free of copyright restrictions, attribute original authors; site content CC BY-SA 4.0 | Cite Lambert 2019, *Nat Methods* 16:277-278 |
| Cas-Database at rgenome.net (`cas-database-lookup.cjs`) | Run-time lookup | Terms not assessed | External service; plain http endpoint in the source |
| NCBI BLAST (`primer-specificity-lookup.cjs`) | Run-time primer specificity check | NCBI service usage policy applies | External service; keep requests rate-limited |
| SpliceAI, `scripts/splice_check.py` | Optional check on the user's own computer; not bundled | Source code PolyForm Strict 1.0.0; models CC BY-NC 4.0 (non-commercial); upstream repository archived 2026-04-20 | Not a dependency of the web app. See [splice-check.md](./splice-check.md) |
| NCBI RefSeqGene records in `test/fixtures/` and `examples/` | Public reference sequence for tests and demos | Public database records; accessions in `test/fixtures/README.md` | `examples/reference_demo.gb` provenance not recorded there |
| npm runtime dependencies: react, react-dom, scheduler, loose-envify, js-tokens (MIT); xlsx 0.18.5, adler-32, cfb, codepage, crc-32, frac, ssf, wmf, word (Apache-2.0) | Browser bundle | Licence fields from `package-lock.json` | Run `npm audit` before a release |
| npm development dependencies (vite, esbuild, rollup, ...) | Build only | MIT, ISC, Apache-2.0, BSD-3-Clause, CC-BY-4.0 | |

The companion repository [Assured QC](https://github.com/Narasimhat/Assured_QC) lists its own components in its README.
