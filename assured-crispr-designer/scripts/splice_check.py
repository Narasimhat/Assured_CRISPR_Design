#!/usr/bin/env python3
"""Optional splice-predictor check for a Genomic SNP design (SpliceAI).

The Genomic SNP tab can add PAM/seed blocking changes and screen them by position. This script goes one step further: it scores the reference, the requested edit and the
edit with the blocking changes with SpliceAI and reports how much the blocking changes move the predicted splice sites on the edited allele. Attach the result file to the design
in the app to update its recommendation.

  python scripts/splice_check.py request.json reference.gb [-o splice_check.json] [--window 400] [--strand +]

request.json  the "splice-check request" downloaded from the app (schema assured-splice-check-request/1)
reference.gb  the same forward-strand genomic GenBank reference that was uploaded to the app
--strand      orientation of the gene on the reference; use "-" for a gene on the reverse strand (SpliceAI scores a gene in its own orientation)

Needs python 3.10 or 3.11 with numpy<2, tensorflow-cpu 2.15 and spliceai (pip install spliceai --no-deps, then tensorflow-cpu==2.15.1). SpliceAI is run on windows of
+-window bases around the edit with 5,000 bases of context on each side, averaging its five models. Nothing leaves your computer.
The scores are predictions, not measurements; the app's thresholds (<= 0.05 supports the blocking changes, <= 0.2 review, above that advises against) are the tool's own.
"""
import argparse, json, re, sys

COMP = {"A": "T", "C": "G", "G": "C", "T": "A", "N": "N"}
rc = lambda s: "".join(COMP.get(b, "N") for b in reversed(s))


def read_genbank_sequence(path):
    raw = open(path, encoding="utf-8", errors="replace").read()
    if "\nORIGIN" not in raw:
        sys.exit("No ORIGIN section in the GenBank file.")
    body = raw[raw.rindex("\nORIGIN"):].split("\n//")[0].split("\n")[2:]
    seq = "".join(re.sub(r"[^A-Za-z]", "", re.match(r"\s*\d+\s+(.*)$", l).group(1)) for l in body if re.match(r"\s*\d+\s+", l))
    return seq.upper()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("request"); ap.add_argument("reference"); ap.add_argument("-o", "--out", default="splice_check.json")
    ap.add_argument("--window", type=int, default=400); ap.add_argument("--strand", choices=["+", "-"], default="+")
    a = ap.parse_args()
    req = json.load(open(a.request))
    if req.get("schema") != "assured-splice-check-request/1":
        sys.exit("This is not a splice-check request from the app (schema assured-splice-check-request/1).")
    seq = read_genbank_sequence(a.reference); start = int(req["referenceStart"])
    muts = {"edit": [(int(req["edit"]["position"]) - start, req["edit"]["ref"], req["edit"]["alt"])],
            "blocking": [(int(c["position"]) - start, c["ref"], c["alt"]) for c in req["blocking"]]}
    for group in muts.values():
        for p, ref, alt in group:
            if p < 0 or p >= len(seq) or seq[p] != ref:
                sys.exit(f"The reference does not have {ref} at {start + p}; use the GenBank file that was uploaded to the app.")
    try:
        import numpy as np
        from pkg_resources import resource_filename
        from keras.models import load_model
        from spliceai.utils import one_hot_encode
    except ImportError as e:
        sys.exit(f"Missing package ({e}). See the notes at the top of this file for what to install.")
    models = [load_model(resource_filename("spliceai", f"models/spliceai{i}.h5"), compile=False) for i in range(1, 6)]
    centre = muts["edit"][0][0]; half, flank = a.window, 5000
    if centre - half - flank < 0 or centre + half + 1 + flank > len(seq):
        sys.exit(f"The reference needs {half + flank} bases on each side of the edit; this one is too short.")
    alleles = {"wild type": [], "edit": muts["edit"], "edit with blocking changes": muts["edit"] + muts["blocking"], "blocking changes only": muts["blocking"]}
    pred = {}
    for name, group in alleles.items():
        s = list(seq)
        for p, _, alt in group: s[p] = alt
        window = "".join(s)[centre - half - flank: centre + half + 1 + flank]
        if a.strand == "-": window = rc(window)
        y = np.mean([m.predict(one_hot_encode(window)[None, :], verbose=0) for m in models], axis=0)[0]  # columns: neither, acceptor, donor
        pred[name] = y
    g0 = start + centre - half

    def delta(base, other):
        d = pred[other] - pred[base]; out = {}
        for col, kind in ((1, "acceptor"), (2, "donor")):
            out[kind + "Gain"] = round(float(d[:, col].max()), 3); out[kind + "Loss"] = round(float(-d[:, col].min()), 3)
        out["max"] = max(out.values()); return out
    comparisons = [("wild type", "edit"), ("edit", "edit with blocking changes"), ("wild type", "blocking changes only")]
    scores = [{"comparison": f"{o} vs {b}", **delta(b, o)} for b, o in comparisons]
    from importlib.metadata import version as pkg_version
    result = {"schema": "assured-splice-check-result/1", "tool": "SpliceAI", "version": pkg_version("spliceai"), "request": req, "window": half, "strand": a.strand,
              "scores": scores, "summary": {"blockingEffectMax": scores[1]["max"], "editEffectMax": scores[0]["max"], "blockingOnlyEffectMax": scores[2]["max"]},
              "note": "Predictions from SpliceAI; the largest absolute change in acceptor or donor probability within the window."}
    json.dump(result, open(a.out, "w"), indent=1)
    print(f"Blocking changes on the edited allele: largest change {scores[1]['max']:.3f}; the edit alone: {scores[0]['max']:.3f}. Written to {a.out}")


if __name__ == "__main__":
    main()
