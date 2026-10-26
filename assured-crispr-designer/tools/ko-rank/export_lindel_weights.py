#!/usr/bin/env python3
"""Convert Lindel's two pickles into one binary the Designer can load in the browser and in Node.

    python tools/ko-rank/export_lindel_weights.py /path/to/Lindel src/lindel/lindel-weights.bin

Lindel (Chen et al. 2019, Nucleic Acids Res 47:7989; github.com/shendurelab/Lindel, MIT licence). The pickles are read with an unpickler that only admits
numpy array reconstruction and plain containers, and nothing from them is executed in the app.

File layout (little-endian):  8 bytes magic "LNDLJS01" | uint32 header length H | H bytes UTF-8 JSON header, padded with spaces to a multiple of 4 |
float32 tensors w1 b1 w2 b2 w3 b3 back to back. The header carries the class names by index (557), the microhomology feature names by index (2649),
the frame-shift flag per class, the tensor shapes and offsets, and the SHA-256 of the source pickles.
"""
import hashlib, importlib.util, json, os, struct, sys

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("lindel_outcomes", os.path.join(here, "lindel_outcomes.py"))
lo = importlib.util.module_from_spec(spec); spec.loader.exec_module(lo)

def main():
    if len(sys.argv) != 3: sys.exit("usage: export_lindel_weights.py /path/to/Lindel out.bin")
    root, out = sys.argv[1], sys.argv[2]
    wpath = os.path.join(root, "Lindel", "Model_weights.pkl"); ppath = os.path.join(root, "Lindel", "model_prereq.pkl")
    weights = lo.load(wpath); label, rev_index, features, frame_shift = lo.load(ppath)
    names = ["w1", "b1", "w2", "b2", "w3", "b3"]
    expected = [(384, 2), (2,), (3033, 536), (536,), (104, 21), (21,)]
    assert [tuple(w.shape) for w in weights] == expected, [w.shape for w in weights]
    assert len(rev_index) == 557 and sorted(rev_index) == list(range(557)) and all(label[rev_index[i]] == i for i in range(557))
    assert sorted(features.values()) == list(range(len(features))) and len(features) == 2649 and len(frame_shift) == 557
    tensors, blobs, offset = [], [], 0
    for name, w in zip(names, weights):
        b = w.astype("<f4").tobytes(); tensors.append({"name": name, "shape": list(w.shape), "offset": offset, "bytes": len(b)}); blobs.append(b); offset += len(b)
    inv_features = [None] * len(features)
    for k, i in features.items(): inv_features[i] = k
    header = {"format": "lindel-js-1", "source": "github.com/shendurelab/Lindel", "paper": "Chen et al. 2019, Nucleic Acids Research 47:7989", "licence": "MIT (Copyright (c) 2019 Wei Chen)",
              "sourceSha256": {"Model_weights.pkl": hashlib.sha256(open(wpath, "rb").read()).hexdigest(), "model_prereq.pkl": hashlib.sha256(open(ppath, "rb").read()).hexdigest()},
              "classes": [rev_index[i] for i in range(557)], "features": inv_features, "frameShift": [int(x) for x in frame_shift], "tensors": tensors}
    hb = json.dumps(header, separators=(",", ":")).encode("utf-8"); hb += b" " * ((-len(hb)) % 4)
    with open(out, "wb") as f:
        f.write(b"LNDLJS01"); f.write(struct.pack("<I", len(hb))); f.write(hb)
        for b in blobs: f.write(b)
    print(f"wrote {out}: {os.path.getsize(out)} bytes, header {len(hb)} bytes, {offset // 4} float32 weights")

if __name__ == "__main__": main()
