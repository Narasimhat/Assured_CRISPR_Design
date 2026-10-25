#!/usr/bin/env bash
# Rank every guide of a record by the predicted fraction of loss-of-function alleles.
#   tools/ko-rank/run.sh record.gb ranking.csv /path/to/Lindel [GENE]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; record="$1"; out="$2"; lindel="$3"; gene="${4:-}"; tmp="$(mktemp -d)"
geneArg=(); [ -n "$gene" ] && geneArg=(--gene "$gene")
node "$here/ko_candidates.mjs" "$record" "${geneArg[@]}" > "$tmp/candidates.json"
python3 "$here/lindel_outcomes.py" "$tmp/candidates.json" --lindel "$lindel" > "$tmp/edits.json"
node "$here/ko_classify.mjs" "$tmp/edits.json" "$record" "${geneArg[@]}" > "$out"
echo "wrote $out ($(($(wc -l < "$out") - 1)) guides)"
