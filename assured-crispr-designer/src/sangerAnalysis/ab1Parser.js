/**
 * Assured Sanger Analyser — AB1 binary file parser
 * Parses Applied Biosystems ABIF (.ab1) files entirely in the browser
 * using ArrayBuffer / DataView (no server required, no BioPython).
 *
 * Reference: NCBI ABIF format, BioPython AbiIO, Chromas documentation
 */

// ── Element type decoding ────────────────────────────────────────────────────
const ELEM_TYPE = {
  1:  'byte',     // uint8
  2:  'char',     // int8 / ASCII character
  3:  'word',     // uint16
  4:  'short',    // int16
  5:  'long',     // int32
  6:  'rational', // two int32 (numerator, denominator)
  7:  'float',    // float32
  8:  'double',   // float64
  10: 'date',
  11: 'time',
  18: 'pString',  // pascal string: length byte + chars
  19: 'cString',  // null-terminated ASCII
  20: 'bool',
};

/**
 * Parse a single data element from a DataView at the given byte offset.
 * Returns the parsed value(s).
 */
function readElement(dv, offset, elementType, numElements) {
  const values = [];
  let pos = offset;
  for (let i = 0; i < numElements; i++) {
    switch (elementType) {
      case 1:  values.push(dv.getUint8(pos)); pos += 1; break;
      case 2:  values.push(dv.getInt8(pos));  pos += 1; break;
      case 3:  values.push(dv.getUint16(pos, false)); pos += 2; break;
      case 4:  values.push(dv.getInt16(pos, false));  pos += 2; break;
      case 5:  values.push(dv.getInt32(pos, false));  pos += 4; break;
      case 6: {
        const num = dv.getInt32(pos, false);
        const den = dv.getInt32(pos + 4, false);
        values.push(den !== 0 ? num / den : 0);
        pos += 8;
        break;
      }
      case 7:  values.push(dv.getFloat32(pos, false)); pos += 4; break;
      case 8:  values.push(dv.getFloat64(pos, false)); pos += 8; break;
      case 18: {
        // Pascal string: first byte = length
        const len = dv.getUint8(pos); pos += 1;
        let s = '';
        for (let c = 0; c < len; c++) s += String.fromCharCode(dv.getUint8(pos + c));
        values.push(s);
        pos += len;
        // pStrings are padded to even length
        if ((len + 1) % 2 !== 0) pos += 1;
        break;
      }
      case 19: {
        // C string: null-terminated
        let s = '';
        while (pos < dv.byteLength) {
          const ch = dv.getUint8(pos++);
          if (ch === 0) break;
          s += String.fromCharCode(ch);
        }
        values.push(s);
        break;
      }
      case 20: values.push(dv.getUint8(pos) !== 0); pos += 1; break;
      default: values.push(null); pos += 1; break;
    }
  }
  return values;
}

/**
 * Read a 4-character tag name from the DataView at the given offset.
 */
function readTagName(dv, offset) {
  let name = '';
  for (let i = 0; i < 4; i++) name += String.fromCharCode(dv.getUint8(offset + i));
  return name;
}

/**
 * Read a directory entry (28 bytes, big-endian) and return a structured object.
 */
function readDirEntry(dv, offset) {
  const tagName    = readTagName(dv, offset);
  const tagNumber  = dv.getInt32(offset + 4,  false);
  const elemType   = dv.getInt16(offset + 8,  false);
  const elemSize   = dv.getInt16(offset + 10, false);
  const numElems   = dv.getInt32(offset + 12, false);
  const dataSize   = dv.getInt32(offset + 16, false);
  const dataOffset = dv.getInt32(offset + 20, false);
  // bytes 24-27 = unused / handle

  // If dataSize <= 4, the data is stored inline in the dataOffset field itself
  const inlineData = dataSize <= 4;

  return { tagName, tagNumber, elemType, elemSize, numElems, dataSize, dataOffset, inlineData };
}

/**
 * Read the actual data for a directory entry.
 * Handles both inline (dataSize <= 4) and offset-referenced data.
 */
function readEntryData(dv, entry) {
  const { elemType, numElems, dataSize, dataOffset, inlineData } = entry;

  // Special case: ASCII / char data — return as a string
  if (elemType === 2 || elemType === 18 || elemType === 19) {
    let offset = inlineData ? (20 + (/* entry base offset */ 0)) : dataOffset;
    // We handle this by re-reading from the correct absolute offset
    // For char type: just read raw bytes and decode as ASCII
    if (elemType === 2) {
      let str = '';
      const absOffset = inlineData ? dataOffset : dataOffset; // inline = stored as int32 BE
      if (inlineData) {
        // read up to 4 bytes from the big-endian int32 at the dataOffset field
        // dataOffset is already the decoded int32, but we need the raw bytes
        // trick: re-read from the same position in the dirEntry using the ABIF buffer
        return null; // handled by caller
      }
      for (let i = 0; i < dataSize; i++) {
        const ch = dv.getUint8(dataOffset + i);
        if (ch !== 0) str += String.fromCharCode(ch);
      }
      return str;
    }
  }

  // Numeric data
  const absOffset = dataOffset; // for non-inline entries
  return readElement(dv, absOffset, elemType, numElems);
}

// ── Main parser ──────────────────────────────────────────────────────────────

/**
 * Parse an ABIF (.ab1) file from an ArrayBuffer.
 *
 * @param {ArrayBuffer} buffer — raw file contents
 * @returns {object} parsed data:
 *   {
 *     baseCalls: string,          // called bases (e.g. "AATGCCAT…")
 *     quality:   number[],        // phred quality per base
 *     peakLocations: number[],    // index into raw trace arrays for each base
 *     trace: { A, C, G, T },     // raw trace values (Int16 arrays → regular arrays)
 *     baseOrder: string,          // 4-char string, e.g. "GATC"
 *     sampleName: string,
 *     allTags: object,            // all parsed tags keyed as "NAME_number"
 *   }
 */
export function parseAb1(buffer) {
  const dv = new DataView(buffer);

  // ── Validate magic ──────────────────────────────────────────────────────
  const magic = readTagName(dv, 0); // first 4 bytes
  if (magic !== 'ABIF') {
    throw new Error(`Not a valid ABIF file. Got magic: "${magic}"`);
  }

  // ── Read root entry at offset 6 (28 bytes) ─────────────────────────────
  const root = readDirEntry(dv, 6);
  const numEntries = root.numElems;
  const dirOffset  = root.dataOffset;

  // ── Read all directory entries ──────────────────────────────────────────
  const tags = {};
  for (let i = 0; i < numEntries; i++) {
    const entryOffset = dirOffset + i * 28;
    const entry = readDirEntry(dv, entryOffset);
    const key = `${entry.tagName}_${entry.tagNumber}`;
    tags[key] = entry;
  }

  // ── Helper: read raw bytes for a tag ────────────────────────────────────
  function rawBytes(tagKey) {
    const entry = tags[tagKey];
    if (!entry) return null;
    const { dataSize, dataOffset, inlineData } = entry;
    if (inlineData) {
      // stored as big-endian int32 in the dataOffset field of the dir entry
      const bytes = [];
      for (let b = 0; b < dataSize; b++) {
        bytes.push((dataOffset >>> ((3 - b) * 8)) & 0xFF);
      }
      return bytes;
    }
    const bytes = [];
    for (let j = 0; j < dataSize; j++) bytes.push(dv.getUint8(dataOffset + j));
    return bytes;
  }

  function readString(tagKey) {
    const bytes = rawBytes(tagKey);
    if (!bytes) return null;
    return bytes.filter(b => b !== 0).map(b => String.fromCharCode(b)).join('');
  }

  function readInt16Array(tagKey) {
    const entry = tags[tagKey];
    if (!entry) return null;
    const { numElems, dataOffset } = entry;
    const arr = [];
    for (let i = 0; i < numElems; i++) {
      arr.push(dv.getInt16(dataOffset + i * 2, false));
    }
    return arr;
  }

  function readUint8Array(tagKey) {
    const bytes = rawBytes(tagKey);
    return bytes;
  }

  // ── Extract called bases ─────────────────────────────────────────────────
  // Prefer PBAS2 (final base calls), fall back to PBAS1
  let baseCalls = readString('PBAS_2') || readString('PBAS_1') || '';

  // ── Extract quality scores ───────────────────────────────────────────────
  // PCON2 preferred over PCON1
  let quality = readUint8Array('PCON_2') || readUint8Array('PCON_1') || [];

  // ── Extract peak locations ───────────────────────────────────────────────
  // PLOC2 preferred over PLOC1
  let peakLocations = readInt16Array('PLOC_2') || readInt16Array('PLOC_1') || [];

  // ── Extract base order ───────────────────────────────────────────────────
  // FWO_1 is a 4-char string mapping DATA9-12 to bases (e.g. "GATC")
  const baseOrder = readString('FWO_1') || 'GATC';

  // ── Extract raw trace channels ───────────────────────────────────────────
  // DATA9 → baseOrder[0], DATA10 → baseOrder[1], DATA11 → baseOrder[2], DATA12 → baseOrder[3]
  const rawTrace = {};
  for (let ch = 9; ch <= 12; ch++) {
    const channelKey = `DATA_${ch}`;
    rawTrace[ch] = readInt16Array(channelKey);
  }

  // Map channel numbers to base letters
  const trace = {};
  for (let i = 0; i < 4; i++) {
    const base = baseOrder[i];
    const data = rawTrace[9 + i];
    if (base && data) trace[base] = data;
  }

  // Ensure all four bases are present (fill with zeros if channel missing)
  for (const b of 'ACGT') {
    if (!trace[b]) trace[b] = new Array(peakLocations.length > 0 ? Math.max(...peakLocations) + 1 : 0).fill(0);
  }

  // ── Sample name ───────────────────────────────────────────────────────────
  const sampleName = readString('SMPL_1') || '';

  // ── Clamp and validate peak locations (must be within trace range) ────────
  const traceLen = trace.A ? trace.A.length : 0;
  peakLocations = peakLocations.map(p => Math.max(0, Math.min(p, traceLen - 1)));

  return {
    baseCalls,
    quality,
    peakLocations,
    trace,    // { A: [], C: [], G: [], T: [] } — raw trace signal arrays
    baseOrder,
    sampleName,
    traceLen,
  };
}

/**
 * Convenience: parse an ab1 File object (from file input / drag-drop).
 * Returns a Promise that resolves to the parsed data.
 */
export function parseAb1File(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(parseAb1(e.target.result));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Extract peak values: for each called base position, return the normalised
 * signal in each channel.  Returns { A: [], C: [], G: [], T: [] }
 * where each array has one value per called base.
 */
export function getPeakValues(parsed) {
  const { trace, peakLocations } = parsed;
  const result = { A: [], C: [], G: [], T: [] };
  for (const peakIdx of peakLocations) {
    for (const base of 'ACGT') {
      const ch = trace[base] || [];
      result[base].push(ch[peakIdx] ?? 0);
    }
  }
  return result;
}

/**
 * Estimate quality scores from trace data if PCON is absent or all-zero.
 * Based on the ICE SangerObject.estimate_quality_scores() method.
 */
export function estimateQualityScores(parsed) {
  const MAX_PHRED = 60;
  const peakValues = getPeakValues(parsed);
  const n = peakValues.A.length;
  const scores = [];
  for (let i = 0; i < n; i++) {
    const values = [peakValues.A[i], peakValues.C[i], peakValues.G[i], peakValues.T[i]];
    const sumV = values.reduce((a, b) => a + b, 0);
    const maxV = Math.max(...values);
    if (sumV < 100 || sumV > 5000) {
      scores.push(0);
    } else {
      const pct = (maxV / sumV) * 100;
      // linear: phred 0 at 80%, phred 60 at 100%
      scores.push(Math.max(3 * pct - 240, 0));
    }
  }
  return scores;
}

/**
 * Get reliable phred scores, estimating from trace if stored scores are unavailable.
 */
export function getPhredScores(parsed) {
  const { quality } = parsed;
  const nonZero = quality.some(q => q > 0);
  if (nonZero) return Array.from(quality);
  return estimateQualityScores(parsed);
}
