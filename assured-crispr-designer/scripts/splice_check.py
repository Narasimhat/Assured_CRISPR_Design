#!/usr/bin/env python3
"""Optional splice-predictor check for a Genomic SNP design (SpliceAI).

The Genomic SNP tab adds blocking changes that avoid the splice-site windows and screens them by position. This script goes one step further: it scores the reference, the requested
edit and the edit with each ssODN's blocking changes with SpliceAI and reports how much the blocking changes move the predicted splice sites on the edited allele. Attach the
result file to the design in the app to update its recommendation.

  python scripts/splice_check.py request.json reference.gb [-o splice_check.json] [--window 400] [--strand +]

request.json  the "splice-check request" downloaded from the app (schema assured-splice-check-request/1)
reference.gb  the same forward-strand genomic GenBank reference that was uploaded to the app
--strand      orientation of the gene on the reference; use "-" for a gene on the reverse strand (SpliceAI scores a gene in its own orientation)

Needs python 3.10 or 3.11 with numpy<2, tensorflow-cpu 2.15 and spliceai (pip install spliceai --no-deps, then tensorflow-cpu==2.15.1). SpliceAI is run on windows of
+-window bases around the edit with 5,000 bases of context on each side, averaging its five models. Nothing leaves your computer.
The scores are predictions, not measurements; the app's thresholds (<= 0.05 supports the blocking changes, <= 0.2 review, above that advises against) are the tool's own.
With co-transfection both ssODNs carry the same changes and are scored once; delivered separately, each ssODN's allele is scored and the worst case is reported.
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
    conv = lambda items: [(int(c["position"]) - start, c["ref"], c["alt"]) for c in items]
    edit = conv([{"position": req["edit"]["position"], "ref": req["edit"]["ref"], "alt": req["edit"]["alt"]}])
    donors = [(d["name"], conv(d["blocking"])) for d in (req.get("donors") or [{"name": "ssODN", "blocking": req["blocking"]}])]
    for p, ref, alt in edit + [m for _, group in donors for m in group]:
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
    centre = edit[0][0]; half, flank = a.window, 5000
    if centre - half - flank < 0 or centre + half + 1 + flank > len(seq):
        sys.exit(f"The reference needs {half + flank} bases on each side of the edit; this one is too short.")
    unique = {}  # identical blocking sets are scored once
    for name, group in donors: unique.setdefault(tuple(sorted(group)), []).append(name)
    alleles = {"wild type": [], "edit": edit}
    for group, names in unique.items():
        label = " + ".join(names)
        alleles[f"edit with {label} blocking changes"] = edit + list(group); alleles[f"{label} blocking changes only"] = list(group)
    pred = {}
    for name, group in alleles.items():
        s = list(seq)
        for p, _, alt in group: s[p] = alt
        window = "".join(s)[centre - half - flank: centre + half + 1 + flank]
        if a.strand == "-": window = rc(window)
        pred[name] = np.mean([m.predict(one_hot_encode(window)[None, :], verbose=0) for m in models], axis=0)[0]  # columns: neither, acceptor, donor

    def delta(base, other):
        d = pred[other] - pred[base]; out = {}
        for col, kind in ((1, "acceptor"), (2, "donor")):
            out[kind + "Gain"] = round(float(d[:, col].max()), 3); out[kind + "Loss"] = round(float(-d[:, col].min()), 3)
        out["max"] = max(out.values()); return out
    scores = [{"comparison": "edit vs wild type", **delta("wild type", "edit")}]
    for group, names in unique.items():
        label = " + ".join(names)
        scores.append({"comparison": f"edit with {label} blocking changes vs edit", "donors": names, **delta("edit", f"edit with {label} blocking changes")})
        scores.append({"comparison": f"{label} blocking changes only vs wild type", "donors": names, **delta("wild type", f"{label} blocking changes only")})
    effect = lambda s: s["max"]
    blocking_scores = [s for s in scores if " vs edit" in s["comparison"] and s["comparison"] != "edit vs wild type"]
    only_scores = [s for s in scores if "only vs wild type" in s["comparison"]]
    from importlib.metadata import version as pkg_version
    result = {"schema": "assured-splice-check-result/1", "tool": "SpliceAI", "version": pkg_version("spliceai"), "request": req, "window": half, "strand": a.strand, "scores": scores,
              "summary": {"blockingEffectMax": max(map(effect, blocking_scores), default=0.0), "editEffectMax": scores[0]["max"], "blockingOnlyEffectMax": max(map(effect, only_scores), default=0.0)},
              "note": "Predictions from SpliceAI; the largest absolute change in acceptor or donor probability within the window."}
    json.dump(result, open(a.out, "w"), indent=1)
    print(f"Blocking changes on the edited allele: largest change {result['summary']['blockingEffectMax']:.3f}; the edit alone: {scores[0]['max']:.3f}. Written to {a.out}")


if __name__ == "__main__":
    main()
