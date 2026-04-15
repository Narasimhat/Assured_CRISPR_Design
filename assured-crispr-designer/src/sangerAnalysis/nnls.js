/**
 * Assured Sanger Analyser — Non-Negative Least Squares (NNLS)
 *
 * Implements the Lawson-Hanson active-set algorithm.
 * Solves:  min  ½ ‖A·x − b‖²   subject to  x ≥ 0
 *
 * Reference:
 *   Lawson, C.L. and Hanson, R.J. (1974). Solving Least Squares Problems.
 *   Prentice-Hall, Chapter 23.
 *
 * API mirrors scipy.optimize.nnls:
 *   const { x, residual } = nnls(A, b);
 *   // A: Float64Array[][] — m×n matrix (row-major array of rows)
 *   // b: Float64Array     — m-vector
 *   // x: Float64Array     — n solution vector (all ≥ 0)
 *   // residual: number    — ‖A·x − b‖
 */

const NNLS_TOL  = 1e-10;
const NNLS_ITER = 3;   // max inner iterations = n * NNLS_ITER

// ── Tiny dense linear algebra helpers ────────────────────────────────────────

/** Matrix-vector product: returns A·v (A is rows×cols, v is cols-length) */
function matVec(A, v) {
  const rows = A.length;
  const cols = v.length;
  const out  = new Float64Array(rows);
  for (let i = 0; i < rows; i++) {
    let s = 0;
    for (let j = 0; j < cols; j++) s += A[i][j] * v[j];
    out[i] = s;
  }
  return out;
}

/** Transpose-matrix-vector product: returns Aᵀ·v */
function matTVec(A, v) {
  const rows = A.length;
  const cols = A[0].length;
  const out  = new Float64Array(cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) out[j] += A[i][j] * v[i];
  }
  return out;
}

/** Extract sub-matrix columns: A[:,P] where P is an index array */
function subCols(A, P) {
  return A.map(row => P.map(j => row[j]));
}

/**
 * Least-squares solve for a small over/under-determined system A·x = b
 * using QR factorisation (Gram–Schmidt).  Returns x as a plain array.
 * Only called for the active (positive) set — typically small.
 */
function leastSquares(A, b) {
  const m = A.length;
  const n = A[0].length;
  if (n === 0) return [];

  // Copy columns into a mutable array
  const Q = A.map(r => [...r]);
  const R = Array.from({ length: n }, () => new Array(n).fill(0));

  // Modified Gram-Schmidt
  for (let j = 0; j < n; j++) {
    // Compute norm of column j
    let norm = 0;
    for (let i = 0; i < m; i++) norm += Q[i][j] * Q[i][j];
    norm = Math.sqrt(norm);
    if (norm < 1e-12) { R[j][j] = 0; continue; }
    R[j][j] = norm;
    for (let i = 0; i < m; i++) Q[i][j] /= norm;

    // Orthogonalise remaining columns
    for (let k = j + 1; k < n; k++) {
      let dot = 0;
      for (let i = 0; i < m; i++) dot += Q[i][j] * Q[i][k];
      R[j][k] = dot;
      for (let i = 0; i < m; i++) Q[i][k] -= dot * Q[i][j];
    }
  }

  // Compute Qᵀ·b
  const Qtb = new Array(n).fill(0);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < m; i++) Qtb[j] += Q[i][j] * b[i];
  }

  // Back-substitution: R·x = Qᵀ·b
  const x = new Array(n).fill(0);
  for (let j = n - 1; j >= 0; j--) {
    if (Math.abs(R[j][j]) < 1e-12) { x[j] = 0; continue; }
    let sum = Qtb[j];
    for (let k = j + 1; k < n; k++) sum -= R[j][k] * x[k];
    x[j] = sum / R[j][j];
  }
  return x;
}

// ── Main NNLS solver ─────────────────────────────────────────────────────────

/**
 * @param {number[][]|Float64Array[]} A — m×n matrix
 * @param {number[]|Float64Array}     b — m-vector
 * @returns {{ x: Float64Array, residual: number }}
 */
export function nnls(A, b) {
  const m = A.length;
  const n = A[0].length;

  const x = new Float64Array(n);       // solution
  const s = new Float64Array(n);       // unconstrained sub-solution
  const w = new Float64Array(n);       // gradient w = Aᵀ(b - Ax)

  // Passive set P (indices where x > 0), zero set Z (where x == 0)
  const P = new Set();                 // positive / passive
  const Z = new Set(Array.from({ length: n }, (_, i) => i)); // all start in zero set

  // b as Float64
  const bArr = Float64Array.from(b);

  // Initial gradient: w = Aᵀ·b  (since x=0, Ax=0)
  const AtB = matTVec(A, bArr);
  for (let j = 0; j < n; j++) w[j] = AtB[j];

  const maxIter = n * NNLS_ITER + 3;
  let outerIter = 0;

  while (Z.size > 0) {
    // Find j in Z with maximum w[j]
    let maxW = -Infinity, tIdx = -1;
    for (const j of Z) {
      if (w[j] > maxW) { maxW = w[j]; tIdx = j; }
    }

    if (maxW <= NNLS_TOL || outerIter++ >= maxIter) break;

    // Move t from Z to P
    Z.delete(tIdx);
    P.add(tIdx);

    // Inner loop: enforce non-negativity in P
    let innerIter = 0;
    while (true) {
      if (innerIter++ > maxIter) break;

      const pList = [...P].sort((a, b) => a - b);
      const AP    = subCols(A, pList);

      // Unconstrained LS: min ‖A_P·s_P − b‖
      const sp  = leastSquares(AP, Array.from(bArr));

      // Check if all s_P > 0
      const allPos = sp.every(v => v > 0);

      if (allPos) {
        for (let k = 0; k < pList.length; k++) s[pList[k]] = sp[k];
        // s[Z] = 0 already
        break;
      }

      // Find α = min over P where sp ≤ 0 of  x/(x - sp)
      let alpha = Infinity;
      for (let k = 0; k < pList.length; k++) {
        const j = pList[k];
        if (sp[k] <= 0) {
          const a = x[j] / (x[j] - sp[k]);
          if (a < alpha) alpha = a;
        }
      }
      if (!isFinite(alpha)) break;

      // Update x = x + α·(s - x)  (only for P indices)
      for (const j of P) {
        x[j] = x[j] + alpha * (s[j] - x[j]);
      }

      // Move near-zero P elements back to Z
      const toRemove = [];
      for (const j of P) {
        if (Math.abs(x[j]) < NNLS_TOL) {
          x[j] = 0;
          toRemove.push(j);
        }
      }
      for (const j of toRemove) { P.delete(j); Z.add(j); }

      // Recompute s for updated P
      const pList2 = [...P].sort((a, b) => a - b);
      const AP2    = subCols(A, pList2);
      const sp2    = leastSquares(AP2, Array.from(bArr));
      for (let k = 0; k < pList2.length; k++) s[pList2[k]] = sp2[k];
    }

    // Copy s → x
    for (const j of P) x[j] = s[j];
    for (const j of Z) x[j] = 0;

    // Update gradient w = Aᵀ·(b - A·x)
    const Ax  = matVec(A, x);
    const res = bArr.map((bi, i) => bi - Ax[i]);
    const newW = matTVec(A, res);
    for (let j = 0; j < n; j++) w[j] = newW[j];
  }

  // Final residual
  const Ax      = matVec(A, x);
  let   resSumSq = 0;
  for (let i = 0; i < m; i++) {
    const d = bArr[i] - Ax[i];
    resSumSq += d * d;
  }
  const residual = Math.sqrt(resSumSq);

  return { x, residual };
}

/**
 * Normalise a non-negative solution vector so it sums to 1.
 * Values below tolerance are zeroed.
 */
export function normaliseCoefficients(x, tolerance = 0.001) {
  const out = new Float64Array(x.length);
  let total = 0;
  for (let i = 0; i < x.length; i++) {
    if (x[i] > tolerance) { out[i] = x[i]; total += x[i]; }
  }
  if (total > 0) for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}
