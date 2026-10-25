#!/usr/bin/env python3
"""Step 2 of 3: Lindel's predicted repair outcomes for every candidate guide, as edits on the input window.

    python tools/ko-rank/lindel_outcomes.py candidates.json --lindel /path/to/Lindel > edits.json

Lindel (Chen et al. 2019, Nucleic Acids Res 47:7989; github.com/shendurelab/Lindel, MIT licence) is a logistic-regression model of Cas9 repair
outcomes: all deletions under 30 bp, all 1-2 bp insertions, and insertions over 2 bp as one group. Needs numpy and scipy. Its weights are a pickle, so they
are read with an unpickler that only admits numpy array reconstruction and plain containers.

Each edit is expressed relative to the cut in the orientation of the input window: a deletion `start+length` removes the bases from `cut+start`; an
insertion `n+BASES` inserts BASES at the cut. ko_classify.mjs maps them to the record's coordinates (the cut index is genomic, strands are handled there).
"""
import argparse, json, os, pickle, re, sys

class SafeUnpickler(pickle.Unpickler):
    ALLOWED = {("numpy.core.multiarray", "_reconstruct"), ("numpy._core.multiarray", "_reconstruct"), ("numpy.core.multiarray", "scalar"),
               ("numpy._core.multiarray", "scalar"), ("numpy", "ndarray"), ("numpy", "dtype"), ("builtins", "dict"), ("builtins", "list"),
               ("builtins", "tuple"), ("builtins", "set"), ("builtins", "frozenset"), ("collections", "OrderedDict"), ("_codecs", "encode")}
    def find_class(self, module, name):
        if (module, name) in self.ALLOWED: return super().find_class(module, name)
        raise pickle.UnpicklingError(f"blocked {module}.{name}")

def load(path):
    with open(path, "rb") as f: return SafeUnpickler(f, encoding="latin1").load()

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("candidates"); ap.add_argument("--lindel", required=True, help="clone of github.com/shendurelab/Lindel")
    ap.add_argument("--min-freq", type=float, default=2e-5, help="drop outcome classes rarer than this (default 2e-5)")
    a = ap.parse_args()
    sys.path.insert(0, a.lindel)
    from Lindel import Predictor as LP
    weights = load(os.path.join(a.lindel, "Lindel", "Model_weights.pkl")); prereq = load(os.path.join(a.lindel, "Lindel", "model_prereq.pkl"))
    rev_index = prereq[1]
    data = json.load(open(a.candidates)); skipped = 0
    for guide in data["guides"]:
        seq = guide["window65"]
        if seq[33:36] not in ("AGG", "TGG", "CGG", "GGG"): guide["edits"] = []; skipped += 1; continue
        y, frameshift = LP.gen_prediction(seq, weights, prereq)
        guide["lindelFrameshift"] = float(frameshift)
        edits = []
        for i, f in enumerate(y):
            if f < a.min_freq: continue
            k = rev_index[i]
            if "+" not in k: edits.append({"k": k, "f": float(f), "kind": "ins_group"}); continue
            start, tail = k.split("+")
            if re.fullmatch(r"[ACGT]+", tail): edits.append({"k": k, "f": float(f), "kind": "ins", "bases": tail})
            else: edits.append({"k": k, "f": float(f), "kind": "del", "start": int(start), "length": int(tail)})
        guide["edits"] = edits
    data["lindel"] = {"source": "github.com/shendurelab/Lindel", "paper": "Chen et al. 2019 NAR 47:7989", "skippedNoPam": skipped}
    json.dump(data, sys.stdout)

if __name__ == "__main__": main()
