import {
  codingPosToGenomic,
  describeGuidePlacementFromModel,
  describeKoGenomicContextFromModel,
  extractCodingDonorWindowFromModel,
  findKoDesignTargetFromModel,
  genomicPosToAa,
  getFeatureCount,
  getCdsFromModel,
  getCodonAtAa,
  getGenomicSequence,
  normalizeGenBankToTranscriptModel,
  normalizeRawSequenceToTranscriptModel,
  selectNearbyGuidesForModel,
} from "./transcriptModel";

const CODON_TABLE = {
  TTT: "F", TTC: "F", TTA: "L", TTG: "L", CTT: "L", CTC: "L", CTA: "L", CTG: "L",
  ATT: "I", ATC: "I", ATA: "I", ATG: "M", GTT: "V", GTC: "V", GTA: "V", GTG: "V",
  TCT: "S", TCC: "S", TCA: "S", TCG: "S", CCT: "P", CCC: "P", CCA: "P", CCG: "P",
  ACT: "T", ACC: "T", ACA: "T", ACG: "T", GCT: "A", GCC: "A", GCA: "A", GCG: "A",
  TAT: "Y", TAC: "Y", TAA: "*", TAG: "*", CAT: "H", CAC: "H", CAA: "Q", CAG: "Q",
  AAT: "N", AAC: "N", AAA: "K", AAG: "K", GAT: "D", GAC: "D", GAA: "E", GAG: "E",
  TGA: "*", TGT: "C", TGC: "C", TGG: "W", CGT: "R", CGC: "R", CGA: "R", CGG: "R",
  AGT: "S", AGC: "S", AGA: "R", AGG: "R", GGT: "G", GGC: "G", GGA: "G", GGG: "G",
};

const DNA_COMPLEMENT = { A: "T", T: "A", G: "C", C: "G" };

export const REPORTERS = {
  EGFP: {
    dna: "ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAGGAGCGCACCATCTTCTTCAAGGACGACGGCAACTACAAGACCCGCGCCGAGGTGAAGTTCGAGGGCGACACCCTGGTGAACCGCATCGAGCTGAAGGGCATCGACTTCAAGGAGGACGGCAACATCCTGGGGCACAAGCTGGAGTACAACTACAACAGCCACAACGTCTATATCATGGCCGACAAGCAGAAGAACGGCATCAAGGTGAACTTCAAGATCCGCCACAACATCGAGGACGGCAGCGTGCAGCTCGCCGACCACTACCAGCAGAACACCCCCATCGGCGACGGCCCCGTGCTGCTGCCCGACAACCACTACCTGAGCACCCAGTCCGCCCTGAGCAAAGACCCCAACGAGAAGCGCGATCACATGGTCCTGCTGGAGTTCGTGACCGCCGCCGGGATCACTCTCGGCATGGACGAGCTGTACAAG",
    aa: "MVSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTLTYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITLGMDELYK",
    sourceLabel: "FPbase EGFP",
    sourceUrl: "https://www.fpbase.org/protein/egfp/",
  },
  mCherry: {
    dna: "ATGGTGAGCAAGGGCGAGGAGGACAACATGGCCATCATCAAGGAGTTCATGCGCTTCAAGGTGCACATGGAGGGCAGCGTGAACGGCCACGAGTTCGAGATCGAGGGCGAGGGCGAGGGCCGCCCCTACGAGGGCACCCAGACCGCCAAGCTGAAGGTGACCAAGGGCGGCCCCCTGCCCTTCGCCTGGGACATCCTGAGCCCCCAGTTCATGTACGGCAGCAAGGCCTACGTGAAGCACCCCGCCGACATCCCCGACTACCTGAAGCTGAGCTTCCCCGAGGGCTTCAAGTGGGAGCGCGTGATGAACTTCGAGGACGGCGGCGTGGTGACCGTGACCCAGGACAGCAGCCTGCAGGACGGCGAGTTCATCTACAAGGTGAAGCTGCGCGGCACCAACTTCCCCAGCGACGGCCCCGTGATGCAGAAGAAGACCATGGGCTGGGAGGCCAGCAGCGAGCGCATGTACCCCGAGGACGGCGCCCTGAAGGGCGAGATCAAGCAGCGCCTGAAGCTGAAGGACGGCGGCCACTACGACGCCGAGGTGAAGACCACCTACAAGGCCAAGAAGCCCGTGCAGCTGCCCGGCGCCTACAACGTGAACATCAAGCTGGACATCACCAGCCACAACGAGGACTACACCATCGTGGAGCAGTACGAGCGCGCCGAGGGCCGCCACAGCACCGGCGGCATGGACGAGCTGTACAAG",
    aa: "MVSKGEEDNMAIIKEFMRFKVHMEGSVNGHEFEIEGEGEGRPYEGTQTAKLKVTKGGPLPFAWDILSPQFMYGSKAYVKHPADIPDYLKLSFPEGFKWERVMNFEDGGVVTVTQDSSLQDGEFIYKVKLRGTNFPSDGPVMQKKTMGWEASSERMYPEDGALKGEIKQRLKLKDGGHYDAEVKTTYKAKKPVQLPGAYNVNIKLDITSHNEDYTIVEQYERAEGRHSTGGMDELYK",
    sourceLabel: "FPbase mCherry",
    sourceUrl: "https://www.fpbase.org/protein/mcherry/",
  },
  mScarlet: {
    dna: "ATGGTGAGCAAGGGCGAGGCCGTGATCAAGGAGTTCATGCGCTTCAAGGTGCACATGGAGGGCAGCATGAACGGCCACGAGTTCGAGATCGAGGGCGAGGGCGAGGGCCGCCCCTACGAGGGCACCCAGACCGCCAAGCTGAAGGTGACCAAGGGCGGCCCCCTGCCCTTCAGCTGGGACATCCTGAGCCCCCAGTTCATGTACGGCAGCCGCGCCTTCACCAAGCACCCCGCCGACATCCCCGACTACTACAAGCAGAGCTTCCCCGAGGGCTTCAAGTGGGAGCGCGTGATGAACTTCGAGGACGGCGGCGCCGTGACCGTGACCCAGGACACCAGCCTGGAGGACGGCACCCTGATCTACAAGGTGAAGCTGCGCGGCACCAACTTCCCCCCCGACGGCCCCGTGATGCAGAAGAAGACCATGGGCTGGGAGGCCAGCACCGAGCGCCTGTACCCCGAGGACGGCGTGCTGAAGGGCGACATCAAGATGGCCCTGCGCCTGAAGGACGGCGGCCGCTACCTGGCCGACTTCAAGACCACCTACAAGGCCAAGAAGCCCGTGCAGATGCCCGGCGCCTACAACGTGGACCGCAAGCTGGACATCACCAGCCACAACGAGGACTACACCGTGGTGGAGCAGTACGAGCGCAGCGAGGGCCGCCACAGCACCGGCGGCATGGACGAGCTGTACAAG",
    aa: "MVSKGEAVIKEFMRFKVHMEGSMNGHEFEIEGEGEGRPYEGTQTAKLKVTKGGPLPFSWDILSPQFMYGSRAFTKHPADIPDYYKQSFPEGFKWERVMNFEDGGAVTVTQDTSLEDGTLIYKVKLRGTNFPPDGPVMQKKTMGWEASTERLYPEDGVLKGDIKMALRLKDGGRYLADFKTTYKAKKPVQMPGAYNVDRKLDITSHNEDYTVVEQYERSEGRHSTGGMDELYK",
    sourceLabel: "FPbase mScarlet",
    sourceUrl: "https://www.fpbase.org/protein/mscarlet/",
  },
  mScarlet_I3: {
    dna: "ATGGATAGCACCGAGGCAGTGATCAAGGAGTTCATGCGGTTCAAGGTGCACATGGAGGGCTCCATGAACGGCCACGAGTTCGAGATCGAGGGCGAGGGCGAGGGCCGCCCCTACGAGGGCACCCAGACCGCCAAGCTGAAGGTGACCAAGGGTGGCCCCCTGCCCTTCTCCTGGGACATCCTGTCCCCTCAGTTCATGTACGGCTCCAGGGCCTTCATCAAGCACCCCGCCGACATCCCCGACTACTGGAAGCAGTCCTTCCCCGAGGGCTTCAAGTGGGAGCGCGTGATGATCTTCGAGGACGGCGGCACCGTGTCCGTGACCCAGGACACCTCCCTGGAGGACGGCACCCTGATCTACAAGGTGAAGCTCCGCGGCGGCAACTTCCCTCCTGACGGCCCCGTAATGCAGAAGAGGACAATGGGCTGGGAAGCATCCACCGAGCGGTTGTACCCCGAGGACGTCGTGCTGAAGGGCGACATTAAGATGGCCCTGCGCCTGAAGGACGGCGGCCGCTACCTGGCGGACTTCAAGACCACCTACAAGGCCAAGAAGCCCGTGCAGATGCCCGGCGCCTTCAACATCGACCGCAAGTTGGACATCACCTCCCACAACGAGGACTACACCGTGGTGGAACAGTACGAACGCTCCGTGGCCCGCCACTCCACCGGCGGCTCCGGTGGCTCC",
    aa: "MDSTEAVIKEFMRFKVHMEGSMNGHEFEIEGEGEGRPYEGTQTAKLKVTKGGPLPFSWDILSPQFMYGSRAFIKHPADIPDYWKQSFPEGFKWERVMIFEDGGTVSVTQDTSLEDGTLIYKVKLRGGNFPPDGPVMQKRTMGWEASTERLYPEDVVLKGDIKMALRLKDGGRYLADFKTTYKAKKPVQMPGAFNIDRKLDITSHNEDYTVVEQYERSVARHSTGGSGGS",
    sourceLabel: "FPbase mScarlet-I3",
    sourceUrl: "https://www.fpbase.org/protein/mscarlet-i3/",
  },
  mStayGold2: {
    dna: "ATGGTGAGCACCGGCGAGGAGCTGTTCACCGGCGTGGTGCCCTTCAAGTTCCAGCTGAAGGGCACCATCAACGGCAAGAGCTTCACCGTGGAGGGCGAGGGCGAGGGCAACAGCCACGAGGGCAGCCACAAGGGCAAGTACGTGTGCACCAGCGGCAAGCTGCCCATGAGCTGGGCCGCCCTGGGCACCAGCTTCGGCTACGGCATGAAGTACTACACCAAGTACCCCAGCGGCCTGAAGAACTGGTTCCACGAGGTGATGCCCGAGGGCTTCACCTACGACCGCCACATCCAGTACAAGGGCGACGGCAGCATCCACGCCAAGCACCAGCACTTCATGAAGAACGGCACCTACCACAACATCGTGGAGTTCACCGGCCAGGACTTCAAGGAGAACAGCCCCGTGCTGACCGGCGACATGGACGTGAGCCTGCCCAACGAGGTGCAGCACATCCCCCGCGACGACGGCGTGGAGTGCACCGTGACCCTGACCTACCCCCTGCTGAGCGACGAGAGCAAGTGCGTGGAGGCCTACCAGAACACCATCATCAAGCCCCTGCACAACCAGCCCGCCCCCGACGTGCCCTACCACTGGATCCGCAAGCAGTACACCCAGAGCAAGGACGACACCGAGGAGCGCGACCACATCATCCAGAGCGAGACCCTGGAGGCCCACCTGTACAGCCGCACCAAGCTGGAG",
    aa: "MVSTGEELFTGVVPFKFQLKGTINGKSFTVEGEGEGNSHEGSHKGKYVCTSGKLPMSWAALGTSFGYGMKYYTKYPSGLKNWFHEVMPEGFTYDRHIQYKGDGSIHAKHQHFMKNGTYHNIVEFTGQDFKENSPVLTGDMDVSLPNEVQHIPRDDGVECTVTLTYPLLSDESKCVEAYQNTIIKPLHNQPAPDVPYHWIRKQYTQSKDDTEERDHIIQSETLEAHLYSRTKLE",
    sourceLabel: "FPbase mStayGold2",
    sourceUrl: "https://www.fpbase.org/protein/mstaygold2/",
  },
};

const REPORTER_PROTEIN_REFERENCES = Object.fromEntries(
  Object.entries(REPORTERS).map(([name, reporter]) => [name, {
    label: reporter.sourceLabel,
    aa: reporter.aa,
    sourceUrl: reporter.sourceUrl,
  }]),
);

const PEPTIDE_INSERTS = {
  P2A: "GCAACAAACTTCTCTCTGCTGAAACAAGCCGGAGATGTCGAAGAGAATCCTGGACCG",
  T2A: "GAGGGCAGAGGAAGTCTTCTAACATGCGGCGACGTGGAGGAAAATCCCGGCCCC",
};

export const CASSETTES = {
  "2xHA-only": { seq: "GCAGCTAAAGCCAAAAACAACCAGGGATCCGGAGGCGGCTACCCCTACGACGTGCCCGACTACGCCGGCTATCCGTATGATGTCCCGGACTATTAA", len: 93, pos: "C-term" },
  "N:2xHA-dTAG-Linker": { seq: "GGCGGCTACCCCTACGACGTGCCCGACTACGCCGGCTATCCGTATGATGTCCCGGACTATGCAGGAGTGCAGGTGGAAACCATCTCCCCAGGAGACGGGCGCACCTTCCCCAAGCGCGGCCAGACCTGCGTGGTGCACTACACCGGGATGCTTGAAGATGGAAAGAAAGTTGATTCCTCCCGGGACAGAAACAAGCCCTTTAAGTTTATGCTAGGCAAGCAGGAGGTGATCCGAGGCTGGGAAGAAGGGGTTGCCCAGATGAGTGTGGGTCAGAGAGCCAAACTGACTATATCTCCAGATTATGCCTATGGTGCCACTGGGCACCCAGGCATCATCCCACCACATGCCACTCTCGTCTTCGATGTGGAGCTTCTAAAACTGGAAGCAGCTAAAGCCAAAAACAACCAGGGATCCGGA", len: 414, pos: "N-term" },
  "N:EGFP-Linker": { seq: "ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAGGAGCGCACCATCTTCTTCAAGGACGACGGCAACTACAAGACCCGCGCCGAGGTGAAGTTCGAGGGCGACACCCTGGTGAACCGCATCGAGCTGAAGGGCATCGACTTCAAGGAGGACGGCAACATCCTGGGGCACAAGCTGGAGTACAACTACAACAGCCACAACGTCTATATCATGGCCGACAAGCAGAAGAACGGCATCAAGGTGAACTTCAAGATCCGCCACAACATCGAGGACGGCAGCGTGCAGCTCGCCGACCACTACCAGCAGAACACCCCCATCGGCGACGGCCCCGTGCTGCTGCCCGACAACCACTACCTGAGCACCCAGTCCGCCCTGAGCAAAGACCCCAACGAGAAGCGCGATCACATGGTCCTGCTGGAGTTCGTGACCGCCGCCGGGATCACTCTCGGCATGGACGAGCTGTACAAGGCAGCTAAAGCCAAAAACAACCAGGGATCCGGA", len: 747, pos: "N-term" },
  "N:mStayGold2-Linker": { seq: "ATGGTGAGCACCGGCGAGGAGCTGTTCACCGGCGTGGTGCCCTTCAAGTTCCAGCTGAAGGGCACCATCAACGGCAAGAGCTTCACCGTGGAGGGCGAGGGCGAGGGCAACAGCCACGAGGGCAGCCACAAGGGCAAGTACGTGTGCACCAGCGGCAAGCTGCCCATGAGCTGGGCCGCCCTGGGCACCAGCTTCGGCTACGGCATGAAGTACTACACCAAGTACCCCAGCGGCCTGAAGAACTGGTTCCACGAGGTGATGCCCGAGGGCTTCACCTACGACCGCCACATCCAGTACAAGGGCGACGGCAGCATCCACGCCAAGCACCAGCACTTCATGAAGAACGGCACCTACCACAACATCGTGGAGTTCACCGGCCAGGACTTCAAGGAGAACAGCCCCGTGCTGACCGGCGACATGGACGTGAGCCTGCCCAACGAGGTGCAGCACATCCCCCGCGACGACGGCGTGGAGTGCACCGTGACCCTGACCTACCCCCTGCTGAGCGACGAGAGCAAGTGCGTGGAGGCCTACCAGAACACCATCATCAAGCCCCTGCACAACCAGCCCGCCCCCGACGTGCCCTACCACTGGATCCGCAAGCAGTACACCCAGAGCAAGGACGACACCGAGGAGCGCGACCACATCATCCAGAGCGAGACCCTGGAGGCCCACCTGTACAGCCGCACCAAGCTGGAGGCAGCTAAAGCCAAAAACAACCAGGGATCCGGA", len: 732, pos: "N-term" },
  "N:SD40-Linker": { seq: "CTGTTGCTGTTCTGCCCTATTTGCGGGTTTACATGTCGCCAGAAGGGCAACTTACTTCGCCATATTAACCTGCACACAGGGGAAAAGTTATTTAAGTACCACCTGTATGCAGCTAAAGCCAAAAACAACCAGGGATCCGGA", len: 138, pos: "N-term" },
  "N:dTAG-Linker": { seq: "GGAGTGCAGGTGGAAACCATCTCCCCAGGAGACGGGCGCACCTTCCCCAAGCGCGGCCAGACCTGCGTGGTGCACTACACCGGGATGCTTGAAGATGGAAAGAAAGTTGATTCCTCCCGGGACAGAAACAAGCCCTTTAAGTTTATGCTAGGCAAGCAGGAGGTGATCCGAGGCTGGGAAGAAGGGGTTGCCCAGATGAGTGTGGGTCAGAGAGCCAAACTGACTATATCTCCAGATTATGCCTATGGTGCCACTGGGCACCCAGGCATCATCCCACCACATGCCACTCTCGTCTTCGATGTGGAGCTTCTAAAACTGGAAGCAGCTAAAGCCAAAAACAACCAGGGATCCGGA", len: 351, pos: "N-term" },
  "N:mAID-Linker": { seq: "AAGGAGAAGAGTGCTTGTCCTAAAGATCCAGCCAAACCTCCGGCCAAGGCACAAGTTGTGGGATGGCCACCGGTGAGATCATACCGGAAGAACGTGATGGTTTCCTGCCAAAAATCAAGCGGTGGCCCGGAGGCGGCGGCGTTCGTGAAGGTATCAATGGACGGAGCACCGTACTTGAGGAAAATCGATTTGAGGATGTATAAAGCAGCTAAAGCCAAAAACAACCAGGGATCCGGA", len: 234, pos: "N-term" },
  "P2A-mCherry": { seq: "GCAACAAACTTCTCTCTGCTGAAACAAGCCGGAGATGTCGAAGAGAATCCTGGACCGGTGAGCAAGGGCGAGGAGGATAACATGGCCATCATCAAGGAGTTCATGCGCTTCAAGGTGCACATGGAGGGCTCCGTGAACGGCCACGAGTTCGAGATCGAGGGCGAGGGCGAGGGCCGCCCCTACGAGGGCACCCAGACCGCCAAGCTGAAGGTGACCAAGGGTGGCCCCCTGCCCTTCGCCTGGGACATCCTGTCCCCTCAGTTCATGTACGGCTCCAAGGCCTACGTGAAGCACCCCGCCGACATCCCCGACTACTTGAAGCTGTCCTTCCCCGAGGGCTTCAAGTGGGAGCGCGTGATGAACTTCGAGGACGGCGGCGTGGTGACCGTGACCCAGGACTCCTCCCTGCAGGACGGCGAGTTCATCTACAAGGTGAAGCTGCGCGGCACCAACTTCCCCTCCGACGGCCCCGTAATGCAGAAGAAAACCATGGGCTGGGAGGCCTCCTCCGAGCGGATGTACCCCGAGGACGGCGCCCTGAAGGGCGAGATCAAGCAGAGGCTGAAGCTGAAGGACGGCGGCCACTACGACGCTGAGGTCAAGACCACCTACAAGGCCAAGAAGCCCGTGCAGCTGCCCGGCGCCTACAACGTCAACATCAAGTTGGACATCACCTCCCACAACGAGGACTACACCATCGTGGAACAGTACGAACGCGCCGAGGGCCGCCACTCCACCGGCGGCATGGACGAGCTGTACAAGTAATAATAA", len: 771, pos: "C-term" },
  "P2A-mScarlet": { seq: "GCAACAAACTTCTCTCTGCTGAAACAAGCCGGAGATGTCGAAGAGAATCCTGGACCGATGGTGAGCAAGGGCGAGGCCGTGATCAAGGAGTTCATGCGCTTCAAGGTGCACATGGAGGGCAGCATGAACGGCCACGAGTTCGAGATCGAGGGCGAGGGCGAGGGCCGCCCCTACGAGGGCACCCAGACCGCCAAGCTGAAGGTGACCAAGGGCGGCCCCCTGCCCTTCAGCTGGGACATCCTGAGCCCCCAGTTCATGTACGGCAGCCGCGCCTTCACCAAGCACCCCGCCGACATCCCCGACTACTACAAGCAGAGCTTCCCCGAGGGCTTCAAGTGGGAGCGCGTGATGAACTTCGAGGACGGCGGCGCCGTGACCGTGACCCAGGACACCAGCCTGGAGGACGGCACCCTGATCTACAAGGTGAAGCTGCGCGGCACCAACTTCCCCCCCGACGGCCCCGTGATGCAGAAGAAGACCATGGGCTGGGAGGCCAGCACCGAGCGCCTGTACCCCGAGGACGGCGTGCTGAAGGGCGACATCAAGATGGCCCTGCGCCTGAAGGACGGCGGCCGCTACCTGGCCGACTTCAAGACCACCTACAAGGCCAAGAAGCCCGTGCAGATGCCCGGCGCCTACAACGTGGACCGCAAGCTGGACATCACCAGCCACAACGAGGACTACACCGTGGTGGAGCAGTACGAGCGCAGCGAGGGCCGCCACAGCACCGGCGGCATGGACGAGCTGTACAAGTAA", len: 756, pos: "C-term" },
  "P2A-mStayGold2": { seq: "GCAACAAACTTCTCTCTGCTGAAACAAGCCGGAGATGTCGAAGAGAATCCTGGACCGATGGTGAGCACCGGCGAGGAGCTGTTCACCGGCGTGGTGCCCTTCAAGTTCCAGCTGAAGGGCACCATCAACGGCAAGAGCTTCACCGTGGAGGGCGAGGGCGAGGGCAACAGCCACGAGGGCAGCCACAAGGGCAAGTACGTGTGCACCAGCGGCAAGCTGCCCATGAGCTGGGCCGCCCTGGGCACCAGCTTCGGCTACGGCATGAAGTACTACACCAAGTACCCCAGCGGCCTGAAGAACTGGTTCCACGAGGTGATGCCCGAGGGCTTCACCTACGACCGCCACATCCAGTACAAGGGCGACGGCAGCATCCACGCCAAGCACCAGCACTTCATGAAGAACGGCACCTACCACAACATCGTGGAGTTCACCGGCCAGGACTTCAAGGAGAACAGCCCCGTGCTGACCGGCGACATGGACGTGAGCCTGCCCAACGAGGTGCAGCACATCCCCCGCGACGACGGCGTGGAGTGCACCGTGACCCTGACCTACCCCCTGCTGAGCGACGAGAGCAAGTGCGTGGAGGCCTACCAGAACACCATCATCAAGCCCCTGCACAACCAGCCCGCCCCCGACGTGCCCTACCACTGGATCCGCAAGCAGTACACCCAGAGCAAGGACGACACCGAGGAGCGCGACCACATCATCCAGAGCGAGACCCTGGAGGCCCACCTGTACAGCCGCACCAAGCTGGAGTAA", len: 759, pos: "C-term" },
  "SD40-2xHA": { seq: "GCAGCTAAAGCCAAAAACAACCAGGGATCCGGACTGTTGCTGTTCTGCCCTATTTGCGGGTTTACATGTCGCCAGAAGGGCAACTTACTTCGCCATATTAACCTGCACACAGGGGAAAAGTTATTTAAGTACCACCTGTATGGCGGCTACCCCTACGACGTGCCCGACTACGCCGGCTATCCGTATGATGTCCCGGACTATGCATAA", len: 204, pos: "C-term" },
  "SD40-2xHA-P2A-mCherry": { seq: "GCAGCTAAAGCCAAAAACAACCAGGGATCCGGACTGTTGCTGTTCTGCCCTATTTGCGGGTTTACATGTCGCCAGAAGGGCAACTTACTTCGCCATATTAACCTGCACACAGGGGAAAAGTTATTTAAGTACCACCTGTATGGCGGCTACCCCTACGACGTGCCCGACTACGCCGGCTATCCGTATGATGTCCCGGACTATGCAGCAACAAACTTCTCTCTGCTGAAACAAGCCGGAGATGTCGAAGAGAATCCTGGACCGGTGAGCAAGGGCGAGGAGGATAACATGGCCATCATCAAGGAGTTCATGCGCTTCAAGGTGCACATGGAGGGCTCCGTGAACGGCCACGAGTTCGAGATCGAGGGCGAGGGCGAGGGCCGCCCCTACGAGGGCACCCAGACCGCCAAGCTGAAGGTGACCAAGGGTGGCCCCCTGCCCTTCGCCTGGGACATCCTGTCCCCTCAGTTCATGTACGGCTCCAAGGCCTACGTGAAGCACCCCGCCGACATCCCCGACTACTTGAAGCTGTCCTTCCCCGAGGGCTTCAAGTGGGAGCGCGTGATGAACTTCGAGGACGGCGGCGTGGTGACCGTGACCCAGGACTCCTCCCTGCAGGACGGCGAGTTCATCTACAAGGTGAAGCTGCGCGGCACCAACTTCCCCTCCGACGGCCCCGTAATGCAGAAGAAAACCATGGGCTGGGAGGCCTCCTCCGAGCGGATGTACCCCGAGGACGGCGCCCTGAAGGGCGAGATCAAGCAGAGGCTGAAGCTGAAGGACGGCGGCCACTACGACGCTGAGGTCAAGACCACCTACAAGGCCAAGAAGCCCGTGCAGCTGCCCGGCGCCTACAACGTCAACATCAAGTTGGACATCACCTCCCACAACGAGGACTACACCATCGTGGAACAGTACGAACGCGCCGAGGGCCGCCACTCCACCGGCGGCATGGACGAGCTGTACAAGTAATAATAA", len: 972, pos: "C-term" },
  "T2A-EGFP": { seq: "GAGGGCAGAGGAAGTCTTCTAACATGCGGCGACGTGGAGGAAAATCCCGGCCCCATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAGGAGCGCACCATCTTCTTCAAGGACGACGGCAACTACAAGACCCGCGCCGAGGTGAAGTTCGAGGGCGACACCCTGGTGAACCGCATCGAGCTGAAGGGCATCGACTTCAAGGAGGACGGCAACATCCTGGGGCACAAGCTGGAGTACAACTACAACAGCCACAACGTCTATATCATGGCCGACAAGCAGAAGAACGGCATCAAGGTGAACTTCAAGATCCGCCACAACATCGAGGACGGCAGCGTGCAGCTCGCCGACCACTACCAGCAGAACACCCCCATCGGCGACGGCCCCGTGCTGCTGCCCGACAACCACTACCTGAGCACCCAGTCCGCCCTGAGCAAAGACCCCAACGAGAAGCGCGATCACATGGTCCTGCTGGAGTTCGTGACCGCCGCCGGGATCACTCTCGGCATGGACGAGCTGTACAAGTAA", len: 774, pos: "C-term" },
  "T2A-mScarlet_I3": { seq: "GAGGGCAGAGGAAGTCTTCTAACATGCGGCGACGTGGAGGAAAATCCCGGCCCCATGGATAGCACCGAGGCAGTGATCAAGGAGTTCATGCGGTTCAAGGTGCACATGGAGGGCTCCATGAACGGCCACGAGTTCGAGATCGAGGGCGAGGGCGAGGGCCGCCCCTACGAGGGCACCCAGACCGCCAAGCTGAAGGTGACCAAGGGTGGCCCCCTGCCCTTCTCCTGGGACATCCTGTCCCCTCAGTTCATGTACGGCTCCAGGGCCTTCATCAAGCACCCCGCCGACATCCCCGACTACTGGAAGCAGTCCTTCCCCGAGGGCTTCAAGTGGGAGCGCGTGATGATCTTCGAGGACGGCGGCACCGTGTCCGTGACCCAGGACACCTCCCTGGAGGACGGCACCCTGATCTACAAGGTGAAGCTCCGCGGCGGCAACTTCCCTCCTGACGGCCCCGTAATGCAGAAGAGGACAATGGGCTGGGAAGCATCCACCGAGCGGTTGTACCCCGAGGACGTCGTGCTGAAGGGCGACATTAAGATGGCCCTGCGCCTGAAGGACGGCGGCCGCTACCTGGCGGACTTCAAGACCACCTACAAGGCCAAGAAGCCCGTGCAGATGCCCGGCGCCTTCAACATCGACCGCAAGTTGGACATCACCTCCCACAACGAGGACTACACCGTGGTGGAACAGTACGAACGCTCCGTGGCCCGCCACTCCACCGGCGGCTCCGGTGGCTCCTAATAA", len: 744, pos: "C-term" },
  "T2A-mStayGold2": { seq: "GAGGGCAGAGGAAGTCTTCTAACATGCGGCGACGTGGAGGAAAATCCCGGCCCCATGGTGAGCACCGGCGAGGAGCTGTTCACCGGCGTGGTGCCCTTCAAGTTCCAGCTGAAGGGCACCATCAACGGCAAGAGCTTCACCGTGGAGGGCGAGGGCGAGGGCAACAGCCACGAGGGCAGCCACAAGGGCAAGTACGTGTGCACCAGCGGCAAGCTGCCCATGAGCTGGGCCGCCCTGGGCACCAGCTTCGGCTACGGCATGAAGTACTACACCAAGTACCCCAGCGGCCTGAAGAACTGGTTCCACGAGGTGATGCCCGAGGGCTTCACCTACGACCGCCACATCCAGTACAAGGGCGACGGCAGCATCCACGCCAAGCACCAGCACTTCATGAAGAACGGCACCTACCACAACATCGTGGAGTTCACCGGCCAGGACTTCAAGGAGAACAGCCCCGTGCTGACCGGCGACATGGACGTGAGCCTGCCCAACGAGGTGCAGCACATCCCCCGCGACGACGGCGTGGAGTGCACCGTGACCCTGACCTACCCCCTGCTGAGCGACGAGAGCAAGTGCGTGGAGGCCTACCAGAACACCATCATCAAGCCCCTGCACAACCAGCCCGCCCCCGACGTGCCCTACCACTGGATCCGCAAGCAGTACACCCAGAGCAAGGACGACACCGAGGAGCGCGACCACATCATCCAGAGCGAGACCCTGGAGGCCCACCTGTACAGCCGCACCAAGCTGGAGTAA", len: 756, pos: "C-term" },
  "dTAG-2xHA": { seq: "GCAGCTAAAGCCAAAAACAACCAGGGATCCGGAGGAGTGCAGGTGGAAACCATCTCCCCAGGAGACGGGCGCACCTTCCCCAAGCGCGGCCAGACCTGCGTGGTGCACTACACCGGGATGCTTGAAGATGGAAAGAAAGTTGATTCCTCCCGGGACAGAAACAAGCCCTTTAAGTTTATGCTAGGCAAGCAGGAGGTGATCCGAGGCTGGGAAGAAGGGGTTGCCCAGATGAGTGTGGGTCAGAGAGCCAAACTGACTATATCTCCAGATTATGCCTATGGTGCCACTGGGCACCCAGGCATCATCCCACCACATGCCACTCTCGTCTTCGATGTGGAGCTTCTAAAACTGGAAGGCGGCTACCCCTACGACGTGCCCGACTACGCCGGCTATCCGTATGATGTCCCGGACTATGCATAA", len: 417, pos: "C-term" },
  "dTAG-2xHA-P2A-mCherry": { seq: "GCAGCTAAAGCCAAAAACAACCAGGGATCCGGAGGAGTGCAGGTGGAAACCATCTCCCCAGGAGACGGGCGCACCTTCCCCAAGCGCGGCCAGACCTGCGTGGTGCACTACACCGGGATGCTTGAAGATGGAAAGAAAGTTGATTCCTCCCGGGACAGAAACAAGCCCTTTAAGTTTATGCTAGGCAAGCAGGAGGTGATCCGAGGCTGGGAAGAAGGGGTTGCCCAGATGAGTGTGGGTCAGAGAGCCAAACTGACTATATCTCCAGATTATGCCTATGGTGCCACTGGGCACCCAGGCATCATCCCACCACATGCCACTCTCGTCTTCGATGTGGAGCTTCTAAAACTGGAAGGCGGCTACCCCTACGACGTGCCCGACTACGCCGGCTATCCGTATGATGTCCCGGACTATGCAGCAACAAACTTCTCTCTGCTGAAACAAGCCGGAGATGTCGAAGAGAATCCTGGACCGGTGAGCAAGGGCGAGGAGGATAACATGGCCATCATCAAGGAGTTCATGCGCTTCAAGGTGCACATGGAGGGCTCCGTGAACGGCCACGAGTTCGAGATCGAGGGCGAGGGCGAGGGCCGCCCCTACGAGGGCACCCAGACCGCCAAGCTGAAGGTGACCAAGGGTGGCCCCCTGCCCTTCGCCTGGGACATCCTGTCCCCTCAGTTCATGTACGGCTCCAAGGCCTACGTGAAGCACCCCGCCGACATCCCCGACTACTTGAAGCTGTCCTTCCCCGAGGGCTTCAAGTGGGAGCGCGTGATGAACTTCGAGGACGGCGGCGTGGTGACCGTGACCCAGGACTCCTCCCTGCAGGACGGCGAGTTCATCTACAAGGTGAAGCTGCGCGGCACCAACTTCCCCTCCGACGGCCCCGTAATGCAGAAGAAAACCATGGGCTGGGAGGCCTCCTCCGAGCGGATGTACCCCGAGGACGGCGCCCTGAAGGGCGAGATCAAGCAGAGGCTGAAGCTGAAGGACGGCGGCCACTACGACGCTGAGGTCAAGACCACCTACAAGGCCAAGAAGCCCGTGCAGCTGCCCGGCGCCTACAACGTCAACATCAAGTTGGACATCACCTCCCACAACGAGGACTACACCATCGTGGAACAGTACGAACGCGCCGAGGGCCGCCACTCCACCGGCGGCATGGACGAGCTGTACAAGTAATAATAA", len: 1185, pos: "C-term" },
  "mAID-2xHA": { seq: "GCAGCTAAAGCCAAAAACAACCAGGGATCCGGAAAGGAGAAGAGTGCTTGTCCTAAAGATCCAGCCAAACCTCCGGCCAAGGCACAAGTTGTGGGATGGCCACCGGTGAGATCATACCGGAAGAACGTGATGGTTTCCTGCCAAAAATCAAGCGGTGGCCCGGAGGCGGCGGCGTTCGTGAAGGTATCAATGGACGGAGCACCGTACTTGAGGAAAATCGATTTGAGGATGTATAAAGGCGGCTACCCCTACGACGTGCCCGACTACGCCGGCTATCCGTATGATGTCCCGGACTATGCATAA", len: 300, pos: "C-term" },
  "mAID-2xHA-P2A-mCherry": { seq: "GCAGCTAAAGCCAAAAACAACCAGGGATCCGGAAAGGAGAAGAGTGCTTGTCCTAAAGATCCAGCCAAACCTCCGGCCAAGGCACAAGTTGTGGGATGGCCACCGGTGAGATCATACCGGAAGAACGTGATGGTTTCCTGCCAAAAATCAAGCGGTGGCCCGGAGGCGGCGGCGTTCGTGAAGGTATCAATGGACGGAGCACCGTACTTGAGGAAAATCGATTTGAGGATGTATAAAGGCGGCTACCCCTACGACGTGCCCGACTACGCCGGCTATCCGTATGATGTCCCGGACTATGCAGCAACAAACTTCTCTCTGCTGAAACAAGCCGGAGATGTCGAAGAGAATCCTGGACCGGTGAGCAAGGGCGAGGAGGATAACATGGCCATCATCAAGGAGTTCATGCGCTTCAAGGTGCACATGGAGGGCTCCGTGAACGGCCACGAGTTCGAGATCGAGGGCGAGGGCGAGGGCCGCCCCTACGAGGGCACCCAGACCGCCAAGCTGAAGGTGACCAAGGGTGGCCCCCTGCCCTTCGCCTGGGACATCCTGTCCCCTCAGTTCATGTACGGCTCCAAGGCCTACGTGAAGCACCCCGCCGACATCCCCGACTACTTGAAGCTGTCCTTCCCCGAGGGCTTCAAGTGGGAGCGCGTGATGAACTTCGAGGACGGCGGCGTGGTGACCGTGACCCAGGACTCCTCCCTGCAGGACGGCGAGTTCATCTACAAGGTGAAGCTGCGCGGCACCAACTTCCCCTCCGACGGCCCCGTAATGCAGAAGAAAACCATGGGCTGGGAGGCCTCCTCCGAGCGGATGTACCCCGAGGACGGCGCCCTGAAGGGCGAGATCAAGCAGAGGCTGAAGCTGAAGGACGGCGGCCACTACGACGCTGAGGTCAAGACCACCTACAAGGCCAAGAAGCCCGTGCAGCTGCCCGGCGCCTACAACGTCAACATCAAGTTGGACATCACCTCCCACAACGAGGACTACACCATCGTGGAACAGTACGAACGCGCCGAGGGCCGCCACTCCACCGGCGGCATGGACGAGCTGTACAAGTAATAATAA", len: 1068, pos: "C-term" }
};

export const INTERNAL_TAGS = {
  SPOT: { seq: "GACCGCGTGCGCGCCGTGAGCCATTGGAGCAGC", len: 33, aa: "DRVRAVSHWSS" },
  alphaBtx: { seq: "CGATACTATGAAAGCAGTCTAGAGCCTTACCCAGAC", len: 36, aa: "RYYESSLEPYPD" },
};

const toAA = (codon) => CODON_TABLE[codon] || "?";
const reverseComplement = (sequence) => sequence.split("").reverse().map((base) => DNA_COMPLEMENT[base] || "N").join("");

function sanitizeLabelPart(value, fallback) {
  const cleaned = String(value || "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function simplifyTagName(tag) {
  const raw = String(tag || "").replace(/^N:/, "");
  if (/SD40/i.test(raw)) return "SD40";
  if (/dTAG/i.test(raw)) return "dTAG";
  if (/mAID/i.test(raw)) return "mAID";
  if (/2xHA/i.test(raw) && !/SD40|dTAG|mAID/i.test(raw)) return "2xHA";
  if (/EGFP/i.test(raw)) return "EGFP";
  if (/mScarlet/i.test(raw)) return "mScarlet";
  if (/mCherry/i.test(raw)) return "mCherry";
  return raw;
}

function buildDesignModifier(projectType, mutationString = "", tag = "") {
  if (projectType === "pm") return sanitizeLabelPart(String(mutationString || "").toUpperCase(), "PM");
  if (projectType === "ko") return "KO";
  return `${sanitizeLabelPart(simplifyTagName(tag), "KI")}_KI`;
}

function buildDesignPrefix(gene, projectType, mutationString = "", tag = "") {
  return `${sanitizeLabelPart(gene, "GENE")}_${buildDesignModifier(projectType, mutationString, tag)}`;
}

function makeGuideName(gene, projectType, index, mutationString = "", tag = "") {
  return `${buildDesignPrefix(gene, projectType, mutationString, tag)}_gRNA${index + 1}`;
}

function makePrimerName(gene, projectType, direction, mutationString = "", tag = "") {
  return `${buildDesignPrefix(gene, projectType, mutationString, tag)}_${direction}`;
}

export function parseGB(rawText) {
  const text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const feats = [];
  let seq = "";
  let inSequence = false;
  let inFeatures = false;
  let current = null;
  let lastQualifier = "";

  for (const line of text.split("\n")) {
    if (line.startsWith("ORIGIN")) { inSequence = true; inFeatures = false; continue; }
    if (line.startsWith("//")) break;
    if (line.startsWith("FEATURES")) { inFeatures = true; continue; }
    if (inSequence) { seq += line.replace(/[^a-zA-Z]/g, ""); continue; }
    if (!inFeatures) continue;
    if (line.length > 5 && line.charAt(5) !== " " && line.charAt(0) === " ") {
      if (current) feats.push(current);
      const parts = line.trim().split(/\s+/);
      current = { type: parts[0], loc: parts.slice(1).join(""), q: {} };
      lastQualifier = "";
      continue;
    }
    if (current && /^\s{21}\//.test(line)) {
      const match = line.trim().match(/^\/(\w+)=?"?([^"]*)"?$/);
      if (match) { current.q[match[1]] = match[2]; lastQualifier = match[1]; }
      continue;
    }
    if (current && /^\s{21}[^/]/.test(line) && !current.loc.includes(")")) { current.loc += line.trim(); continue; }
    if (current && lastQualifier && /^\s{21}/.test(line)) current.q[lastQualifier] = `${current.q[lastQualifier] || ""}${line.trim().replace(/"/g, "")}`;
  }
  if (current) feats.push(current);
  return { seq: seq.toUpperCase(), feats };
}

function armType(guide, mutationPos) {
  return guide.str === "+" ? (mutationPos > guide.cut ? "PROX" : "DIST") : (mutationPos < guide.cut ? "PROX" : "DIST");
}

function findSilent(model, guide, blockedPositions = new Set(), options = {}) {
  const allowNonCoding = !!options.allowNonCoding;
  const seq = getGenomicSequence(model);
  const pamStart = guide.str === "+" ? guide.ps + 20 : guide.ps;
  if (pamStart < 0 || pamStart + 3 > seq.length) return null;

  const candidateSites = [];
  const seenPositions = new Set();
  const addCandidate = (genomicPos, label, kind, pamIndex = null) => {
    if (!Number.isFinite(genomicPos) || genomicPos < 0 || genomicPos >= seq.length) return;
    if (blockedPositions.has(genomicPos) || seenPositions.has(genomicPos)) return;
    seenPositions.add(genomicPos);
    candidateSites.push({ genomicPos, label, kind, pamIndex });
  };

  const pamIndexes = guide.str === "+" ? [1, 2] : [0, 1];
  pamIndexes.forEach((pamIndex) => addCandidate(pamStart + pamIndex, "PAM", "pam", pamIndex));

  for (let spacerIndex = 10; spacerIndex < 20; spacerIndex += 1) {
    const genomicPos = guide.str === "+"
      ? guide.ps + spacerIndex
      : guide.ps + 3 + (19 - spacerIndex);
    addCandidate(genomicPos, `Seed pos ${spacerIndex + 1}/20`, "seed");
  }

  for (let spacerIndex = 0; spacerIndex < 10; spacerIndex += 1) {
    const genomicPos = guide.str === "+"
      ? guide.ps + spacerIndex
      : guide.ps + 3 + (19 - spacerIndex);
    addCandidate(genomicPos, `Guide pos ${spacerIndex + 1}/20`, "guide");
  }

  for (const site of candidateSites) {
    const { genomicPos, label, kind, pamIndex } = site;
    const aaNumber = genomicPosToAa(model, genomicPos);
    const codonInfo = aaNumber ? getCodonAtAa(model, aaNumber, toAA) : null;
    const codon = codonInfo?.cod || null;
    const codonIndex = codonInfo ? codonInfo.genomicPositions.indexOf(genomicPos) : -1;
    const originalAA = codon ? toAA(codon) : null;
    const originalBase = seq[genomicPos];
    for (const alt of ["A", "C", "G", "T"]) {
      if (alt === originalBase) continue;

      if (kind === "pam") {
        const mutantPam = seq.slice(pamStart, pamStart + 3).split("");
        mutantPam[pamIndex] = alt;
        const stillPam = guide.str === "+"
          ? mutantPam.slice(1).join("") === "GG"
          : reverseComplement(mutantPam.join("")).slice(1) === "GG";
        if (stillPam) continue;
        const oldPam = guide.str === "+" ? seq.slice(pamStart, pamStart + 3) : reverseComplement(seq.slice(pamStart, pamStart + 3));
        const newPam = guide.str === "+" ? mutantPam.join("") : reverseComplement(mutantPam.join(""));

        if (!codonInfo || codonIndex < 0) {
          if (!allowNonCoding) continue;
          return { gp: genomicPos, nb: alt, lb: "noncoding", oc: originalBase, nc: alt, pur: `PAM ${oldPam}->${newPam} outside CDS`, mt: "noncoding" };
        }

        const mutantCodon = `${codon.slice(0, codonIndex)}${alt}${codon.slice(codonIndex + 1)}`;
        if (toAA(mutantCodon) !== originalAA) continue;
        return { gp: genomicPos, nb: alt, lb: `p.${originalAA}${aaNumber}${originalAA}`, oc: codon, nc: mutantCodon, pur: `PAM ${oldPam}->${newPam}`, mt: "silent" };
      }

      if (!codonInfo || codonIndex < 0) {
        if (!allowNonCoding) continue;
        return { gp: genomicPos, nb: alt, lb: "noncoding", oc: originalBase, nc: alt, pur: `${label} outside CDS`, mt: "noncoding" };
      }

      const mutantCodon = `${codon.slice(0, codonIndex)}${alt}${codon.slice(codonIndex + 1)}`;
      if (toAA(mutantCodon) !== originalAA) continue;
      return { gp: genomicPos, nb: alt, lb: `p.${originalAA}${aaNumber}${originalAA}`, oc: codon, nc: mutantCodon, pur: label, mt: "silent" };
    }
  }
  return null;
}

function mkODN(model, guide, mutationPositions, mutationBases, silentMutations = []) {
  const seq = getGenomicSequence(model);
  let donorStart;
  let donorEnd;
  if (guide.str === "+") { donorStart = guide.cut - 36; donorEnd = guide.cut + 91; }
  else { donorStart = guide.cut - 91; donorEnd = guide.cut + 36; }
  const desiredLength = donorEnd - donorStart;
  if (donorStart < 0) {
    donorEnd = Math.min(seq.length, donorEnd - donorStart);
    donorStart = 0;
  }
  if (donorEnd > seq.length) {
    donorStart = Math.max(0, donorStart - (donorEnd - seq.length));
    donorEnd = seq.length;
  }
  if (donorEnd - donorStart < desiredLength && seq.length >= desiredLength) {
    donorStart = Math.max(0, donorEnd - desiredLength);
    donorEnd = Math.min(seq.length, donorStart + desiredLength);
  }
  if (donorStart < 0 || donorEnd > seq.length || donorEnd - donorStart < desiredLength) return null;

  const payload = seq.slice(donorStart, donorEnd).split("");
  const wildType = seq.slice(donorStart, donorEnd);
  mutationPositions.forEach((pos, index) => {
    const donorIndex = pos - donorStart;
    if (donorIndex >= 0 && donorIndex < 127) payload[donorIndex] = mutationBases[index];
  });
  silentMutations.forEach((mutation) => {
    const donorIndex = mutation.gp - donorStart;
    if (donorIndex >= 0 && donorIndex < 127) payload[donorIndex] = mutation.nb;
  });
  const guideSiteStart = guide.ps - donorStart;
  const guideSiteEnd = guideSiteStart + 23;
  const guidePamStart = guide.str === "+" ? guideSiteStart + 20 : guideSiteStart;
  const guidePamEnd = guidePamStart + 3;
  const ssOdn = guide.str === "+" ? reverseComplement(payload.join("")) : payload.join("");
  const wtOdn = guide.str === "+" ? reverseComplement(wildType) : wildType;
  const { codingWt, codingDonor } = extractCodingDonorWindowFromModel(model, donorStart, donorEnd, payload);
  const orderedIndex = (genomicPos) => {
    const payloadIndex = genomicPos - donorStart;
    if (payloadIndex < 0 || payloadIndex >= payload.length) return null;
    return guide.str === "+" ? payload.length - 1 - payloadIndex : payloadIndex;
  };
  const diff = [];
  for (let index = 0; index < 127; index += 1) if (ssOdn[index] !== wtOdn[index]) diff.push(index);
  const desiredDiffIndexes = mutationPositions.map((pos) => orderedIndex(pos)).filter((index) => index !== null).sort((left, right) => left - right);
  const silentDiffIndexes = silentMutations.map((mutation) => orderedIndex(mutation.gp)).filter((index) => index !== null).sort((left, right) => left - right);
  return {
    od: ssOdn,
    wo: wtOdn,
    df: diff,
    desiredDiffIndexes,
    silentDiffIndexes,
    silentMutations,
    sl: guide.str === "+" ? "- strand target" : "+ strand target",
    codingWt,
    codingDonor,
    guideSiteStart,
    guideSiteEnd,
    guidePamStart,
    guidePamEnd,
  };
}

const COMMON_LINKER = "GCAGCTAAAGCCAAAAACAACCAGGGATCCGGA";
const DONOR_COLORS = {
  HA5: "#38bdf8",
  HA3: "#818cf8",
  START: "#22c55e",
  LINKER: "#f59e0b",
  TAG: "#34d399",
  REPORTER: "#fb7185",
  PEPTIDE: "#f97316",
  STOP: "#facc15",
  GUIDE: "#c084fc",
  PAM: "#fbbf24",
  SILENT: "#ef4444",
};

function cloneSegments(segments) {
  return segments.map((segment) => ({ ...segment }));
}

function getReporterDefinition(reporterLabel) {
  return REPORTERS[reporterLabel] || null;
}

function buildPureReporterPreset(name, twoALabel, reporterLabel) {
  const sequence = CASSETTES[name].seq;
  const reporterStart = sequence.indexOf("ATG", 20);
  const reporter = getReporterDefinition(reporterLabel);
  const peptideSeq = PEPTIDE_INSERTS[twoALabel] || sequence.slice(0, reporterStart);
  const reporterSeq = reporter?.dna || sequence.slice(reporterStart, -3);
  const reporterReference = reporter ? REPORTER_PROTEIN_REFERENCES[reporterLabel] : null;
  const stopSeq = "TAA";
  return {
    ct: {
      seq: `${peptideSeq}${reporterSeq}${stopSeq}`,
      segments: [
        { label: twoALabel, role: "PEPTIDE", color: DONOR_COLORS.PEPTIDE, seq: peptideSeq },
        { label: reporterLabel, role: "REPORTER", color: DONOR_COLORS.REPORTER, seq: reporterSeq, referenceProtein: reporterReference },
        { label: "Stop", role: "STOP", color: DONOR_COLORS.STOP, seq: stopSeq },
      ],
    },
    nt: {
      seq: `${reporterSeq}${peptideSeq}`,
      segments: [
        { label: "Start", role: "START", color: DONOR_COLORS.START, seq: "ATG" },
        { label: reporterLabel, role: "REPORTER", color: DONOR_COLORS.REPORTER, seq: reporterSeq.slice(3), referenceProtein: reporterReference ? { ...reporterReference, aa: reporterReference.aa.slice(1) } : null },
        { label: twoALabel, role: "PEPTIDE", color: DONOR_COLORS.PEPTIDE, seq: peptideSeq },
      ],
    },
  };
}

function buildReporterLinkerPreset(name, reporterLabel) {
  const sequence = CASSETTES[name].seq;
  const reporter = getReporterDefinition(reporterLabel);
  const reporterSeq = reporter?.dna || sequence.slice(0, sequence.length - COMMON_LINKER.length);
  const reporterReference = reporter ? REPORTER_PROTEIN_REFERENCES[reporterLabel] : null;
  return {
    nt: {
      seq: `${reporterSeq}${COMMON_LINKER}`,
      segments: [
        { label: "Start", role: "START", color: DONOR_COLORS.START, seq: "ATG" },
        {
          label: reporterLabel,
          role: "REPORTER",
          color: DONOR_COLORS.REPORTER,
          seq: reporterSeq.startsWith("ATG") ? reporterSeq.slice(3) : reporterSeq,
          referenceProtein: reporterReference
            ? {
              ...reporterReference,
              aa: reporterReference.aa.startsWith("M") ? reporterReference.aa.slice(1) : reporterReference.aa,
            }
            : null,
        },
        { label: "Linker", role: "LINKER", color: DONOR_COLORS.LINKER, seq: COMMON_LINKER },
      ],
    },
  };
}

function buildTaggedPreset(name, tagLabel) {
  const fullSeq = CASSETTES[name].seq;
  const tagSeq = fullSeq.slice(COMMON_LINKER.length, -3);
  const ntTagSeq = tagSeq.startsWith("ATG") ? tagSeq : `ATG${tagSeq}`;
  return {
    ct: {
      seq: fullSeq,
      segments: [
        { label: "Linker", role: "LINKER", color: DONOR_COLORS.LINKER, seq: COMMON_LINKER },
        { label: tagLabel, role: "TAG", color: DONOR_COLORS.TAG, seq: tagSeq },
        { label: "Stop", role: "STOP", color: DONOR_COLORS.STOP, seq: "TAA" },
      ],
    },
    nt: {
      seq: `${ntTagSeq}${COMMON_LINKER}`,
      segments: [
        { label: "Start", role: "START", color: DONOR_COLORS.START, seq: "ATG" },
        { label: tagLabel, role: "TAG", color: DONOR_COLORS.TAG, seq: ntTagSeq.slice(3) },
        { label: "Linker", role: "LINKER", color: DONOR_COLORS.LINKER, seq: COMMON_LINKER },
      ],
    },
  };
}

function buildComboPreset(name, tagLabel, tailPresetName, twoALabel, reporterLabel) {
  const tailSeq = CASSETTES[tailPresetName].seq;
  const comboSeq = CASSETTES[name].seq;
  const tagSeq = comboSeq.slice(COMMON_LINKER.length, comboSeq.length - tailSeq.length);
  const pureReporter = buildPureReporterPreset(tailPresetName, twoALabel, reporterLabel);
  const peptideSeq = pureReporter.ct.segments[0].seq;
  const reporterSeq = pureReporter.ct.segments[1].seq;
  const reporterReference = pureReporter.ct.segments[1].referenceProtein || null;
  return {
    ct: {
      seq: comboSeq,
      segments: [
        { label: "Linker", role: "LINKER", color: DONOR_COLORS.LINKER, seq: COMMON_LINKER },
        { label: tagLabel, role: "TAG", color: DONOR_COLORS.TAG, seq: tagSeq },
        { label: twoALabel, role: "PEPTIDE", color: DONOR_COLORS.PEPTIDE, seq: peptideSeq },
        { label: reporterLabel, role: "REPORTER", color: DONOR_COLORS.REPORTER, seq: reporterSeq, referenceProtein: reporterReference },
        { label: "Stop", role: "STOP", color: DONOR_COLORS.STOP, seq: "TAA" },
      ],
    },
    nt: {
      seq: `${reporterSeq}${peptideSeq}${tagSeq}${COMMON_LINKER}`,
      segments: [
        { label: "Start", role: "START", color: DONOR_COLORS.START, seq: "ATG" },
        { label: reporterLabel, role: "REPORTER", color: DONOR_COLORS.REPORTER, seq: reporterSeq.slice(3), referenceProtein: reporterReference ? { ...reporterReference, aa: reporterReference.aa.slice(1) } : null },
        { label: twoALabel, role: "PEPTIDE", color: DONOR_COLORS.PEPTIDE, seq: peptideSeq },
        { label: tagLabel, role: "TAG", color: DONOR_COLORS.TAG, seq: tagSeq },
        { label: "Linker", role: "LINKER", color: DONOR_COLORS.LINKER, seq: COMMON_LINKER },
      ],
    },
  };
}

const DONOR_PRESETS = {
  "2xHA-only": buildTaggedPreset("2xHA-only", "2xHA"),
  "N:EGFP-Linker": buildReporterLinkerPreset("N:EGFP-Linker", "EGFP"),
  "N:mStayGold2-Linker": buildReporterLinkerPreset("N:mStayGold2-Linker", "mStayGold2"),
  "SD40-2xHA": buildTaggedPreset("SD40-2xHA", "SD40-2xHA"),
  "dTAG-2xHA": buildTaggedPreset("dTAG-2xHA", "dTAG-2xHA"),
  "mAID-2xHA": buildTaggedPreset("mAID-2xHA", "mAID-2xHA"),
  "P2A-mCherry": buildPureReporterPreset("P2A-mCherry", "P2A", "mCherry"),
  "P2A-mScarlet": buildPureReporterPreset("P2A-mScarlet", "P2A", "mScarlet"),
  "P2A-mStayGold2": buildPureReporterPreset("P2A-mStayGold2", "P2A", "mStayGold2"),
  "T2A-EGFP": buildPureReporterPreset("T2A-EGFP", "T2A", "EGFP"),
  "T2A-mScarlet_I3": buildPureReporterPreset("T2A-mScarlet_I3", "T2A", "mScarlet_I3"),
  "T2A-mStayGold2": buildPureReporterPreset("T2A-mStayGold2", "T2A", "mStayGold2"),
  "SD40-2xHA-P2A-mCherry": buildComboPreset("SD40-2xHA-P2A-mCherry", "SD40-2xHA", "P2A-mCherry", "P2A", "mCherry"),
  "dTAG-2xHA-P2A-mCherry": buildComboPreset("dTAG-2xHA-P2A-mCherry", "dTAG-2xHA", "P2A-mCherry", "P2A", "mCherry"),
  "mAID-2xHA-P2A-mCherry": buildComboPreset("mAID-2xHA-P2A-mCherry", "mAID-2xHA", "P2A-mCherry", "P2A", "mCherry"),
};

function getInsertPreset(name, orientation) {
  const preset = DONOR_PRESETS[name];
  if (preset) return { ...preset[orientation], segments: cloneSegments(preset[orientation].segments) };
  if (orientation === "nt" && CASSETTES[name]?.pos === "N-term") {
    return { seq: CASSETTES[name].seq, segments: [{ label: name.replace(/^N:/, ""), role: "TAG", color: DONOR_COLORS.TAG, seq: CASSETTES[name].seq }] };
  }
  const fallback = CASSETTES[name];
  if (!fallback) return null;
  return { seq: fallback.seq, segments: [{ label: name, role: "TAG", color: DONOR_COLORS.TAG, seq: fallback.seq }] };
}

export function getCassetteSequenceLength(name, orientation = "ct") {
  const preset = getInsertPreset(name, orientation);
  if (preset?.seq) return preset.seq.length;
  return CASSETTES[name]?.seq?.length || 0;
}

function buildDonorAnnotations(h5Length, insertSegments, h3Length, extraAnnotations = []) {
  const annotations = [];
  let cursor = 0;
  annotations.push({ label: "5' HA", color: DONOR_COLORS.HA5, start: cursor, end: cursor + h5Length, priority: 1 });
  cursor += h5Length;
  insertSegments.forEach((segment) => {
    annotations.push({ label: segment.label, color: segment.color, start: cursor, end: cursor + segment.seq.length, priority: 1 });
    cursor += segment.seq.length;
  });
  annotations.push({ label: "3' HA", color: DONOR_COLORS.HA3, start: cursor, end: cursor + h3Length, priority: 1 });
  return annotations.concat(extraAnnotations).sort((left, right) => {
    if (left.start !== right.start) return left.start - right.start;
    return (left.priority || 0) - (right.priority || 0);
  });
}

function buildSilentAnnotations(silentMutations, toDonorIndex) {
  return silentMutations
    .map((mutation) => {
      const donorIndex = toDonorIndex(mutation);
      if (!Number.isFinite(donorIndex) || donorIndex < 0) return null;
      const isNonCoding = mutation.mt === "noncoding";
      const labelPrefix = isNonCoding ? "Guide block" : "Silent";
      return {
        label: `${labelPrefix} gRNA${mutation.gi || ""}`.trim(),
        badgeLabel: `${labelPrefix} gRNA${mutation.gi || ""}`.trim(),
        title: `${mutation.lb}: ${mutation.oc} -> ${mutation.nc} | ${mutation.pur}`,
        color: DONOR_COLORS.SILENT,
        start: donorIndex,
        end: donorIndex + 1,
        priority: 10,
      };
    })
    .filter(Boolean);
}

function buildIndexedAnnotations(indexes, details) {
  const ordered = [...new Set((indexes || []).filter((index) => Number.isFinite(index) && index >= 0))].sort((left, right) => left - right);
  if (!ordered.length) return [];
  const ranges = [];
  let start = ordered[0];
  let previous = ordered[0];
  for (let index = 1; index < ordered.length; index += 1) {
    const current = ordered[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    ranges.push({ start, end: previous + 1 });
    start = current;
    previous = current;
  }
  ranges.push({ start, end: previous + 1 });
  return ranges.map((range) => ({ ...details, start: range.start, end: range.end }));
}

function buildGuideAnnotationsFromIndexes(guide, guideIndex, siteIndexes, pamIndexes) {
  return [
    ...buildIndexedAnnotations(siteIndexes, {
      label: `gRNA${guideIndex} site`,
      badgeLabel: `gRNA${guideIndex} site`,
      title: `${guide.sp}`,
      color: DONOR_COLORS.GUIDE,
      priority: 6,
    }),
    ...buildIndexedAnnotations(pamIndexes, {
      label: `gRNA${guideIndex} PAM`,
      badgeLabel: `gRNA${guideIndex} PAM`,
      title: `${guide.pam}`,
      color: DONOR_COLORS.PAM,
      priority: 7,
    }),
  ];
}

function buildGuideAnnotationsForMappedDonor(guide, guideIndex, toDonorIndex) {
  const sitePositions = guide.str === "+"
    ? Array.from({ length: 20 }, (_, index) => guide.ps + index)
    : Array.from({ length: 20 }, (_, index) => guide.ps + 3 + index);
  const pamPositions = guide.str === "+"
    ? [guide.ps + 20, guide.ps + 21, guide.ps + 22]
    : [guide.ps, guide.ps + 1, guide.ps + 2];
  const siteIndexes = sitePositions.map((position) => toDonorIndex(position)).filter((index) => Number.isFinite(index) && index >= 0);
  const pamIndexes = pamPositions.map((position) => toDonorIndex(position)).filter((index) => Number.isFinite(index) && index >= 0);
  return buildGuideAnnotationsFromIndexes(guide, guideIndex, siteIndexes, pamIndexes);
}

function pickPrimerOutsideLeft(seq, boundary, primerLength = 24) {
  const end = Math.max(0, Math.min(seq.length, boundary));
  const start = Math.max(0, end - primerLength);
  return seq.slice(start, end);
}

function pickPrimerOutsideRight(seq, boundary, primerLength = 24) {
  const start = Math.max(0, Math.min(seq.length, boundary));
  const end = Math.min(seq.length, start + primerLength);
  return reverseComplement(seq.slice(start, end));
}

function scorePrimerSequence(primer) {
  const seq = String(primer || "").toUpperCase();
  if (!seq) return Number.MAX_SAFE_INTEGER;
  const gcCount = [...seq].filter((base) => base === "G" || base === "C").length;
  const gcPercent = (gcCount / seq.length) * 100;
  let score = Math.abs(gcPercent - 50);
  if (/(A{5,}|T{5,}|G{5,}|C{5,})/.test(seq)) score += 20;
  if (/AAAA|TTTT/.test(seq)) score += 6;
  const lastBase = seq[seq.length - 1];
  if (lastBase !== "G" && lastBase !== "C") score += 4;
  return score;
}

function pickCenteredPrimerPair(seq, center, minAmpliconLength = 450, maxAmpliconLength = 500, primerLength = 24) {
  const minLength = Math.max(primerLength * 2, minAmpliconLength);
  const maxLength = Math.max(minLength, maxAmpliconLength);
  let best = null;

  for (let ampliconLength = minLength; ampliconLength <= maxLength; ampliconLength += 1) {
    const maxStart = Math.max(0, seq.length - ampliconLength);
    const idealStart = Math.round(center - ampliconLength / 2);
    for (const offset of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5]) {
      const ampliconStart = Math.max(0, Math.min(maxStart, idealStart + offset));
      const ampliconEnd = ampliconStart + ampliconLength;
      const forward = seq.slice(ampliconStart, ampliconStart + primerLength);
      const reverse = reverseComplement(seq.slice(Math.max(0, ampliconEnd - primerLength), ampliconEnd));
      if (forward.length !== primerLength || reverse.length !== primerLength) continue;
      const ampliconCenter = ampliconStart + ampliconLength / 2;
      const centerPenalty = Math.abs(center - ampliconCenter);
      const forwardPenalty = scorePrimerSequence(forward);
      const reversePenalty = scorePrimerSequence(reverse);
      const score = centerPenalty * 3 + forwardPenalty + reversePenalty + Math.abs(ampliconLength - 475) * 0.2;
      if (!best || score < best.score) {
        best = {
          forward,
          reverse,
          ampliconLength,
          score,
        };
      }
    }
  }

  if (best) return best;
  const fallbackLength = Math.max(primerLength * 2, Math.min(seq.length, 480));
  const maxStart = Math.max(0, seq.length - fallbackLength);
  const ampliconStart = Math.max(0, Math.min(maxStart, Math.round(center - fallbackLength / 2)));
  const ampliconEnd = Math.min(seq.length, ampliconStart + fallbackLength);
  return {
    forward: seq.slice(ampliconStart, ampliconStart + primerLength),
    reverse: reverseComplement(seq.slice(Math.max(0, ampliconEnd - primerLength), ampliconEnd)),
    ampliconLength: ampliconEnd - ampliconStart,
  };
}

const KO_LONG_DELETION_THRESHOLD = 1000;
const KO_DELETION_SCREEN_FLANK = 250;

function pickDeletionScreenPrimerPair(seq, leftCut, rightCut, flank = KO_DELETION_SCREEN_FLANK, primerLength = 24) {
  const maxStart = Math.max(0, seq.length - primerLength);
  const desiredForwardStart = Math.max(0, Math.min(maxStart, leftCut - flank));
  const desiredReverseStart = Math.max(0, Math.min(maxStart, rightCut + flank - primerLength));
  let best = null;
  for (let forwardOffset = -20; forwardOffset <= 20; forwardOffset += 1) {
    const forwardStart = Math.max(0, Math.min(maxStart, desiredForwardStart + forwardOffset));
    const forward = seq.slice(forwardStart, forwardStart + primerLength);
    if (forward.length !== primerLength) continue;
    for (let reverseOffset = -20; reverseOffset <= 20; reverseOffset += 1) {
      const reverseStart = Math.max(forwardStart + primerLength + 50, Math.min(maxStart, desiredReverseStart + reverseOffset));
      const reverse = reverseComplement(seq.slice(reverseStart, reverseStart + primerLength));
      if (reverse.length !== primerLength) continue;
      const wtAmpliconLength = reverseStart + primerLength - forwardStart;
      const deletionAmpliconLength = Math.max(primerLength * 2, (leftCut - forwardStart) + ((reverseStart + primerLength) - rightCut));
      const leftFlankPenalty = Math.abs((leftCut - forwardStart) - flank);
      const rightFlankPenalty = Math.abs(((reverseStart + primerLength) - rightCut) - flank);
      const score = scorePrimerSequence(forward)
        + scorePrimerSequence(reverse)
        + leftFlankPenalty * 0.15
        + rightFlankPenalty * 0.15
        + Math.abs(deletionAmpliconLength - 500) * 0.2;
      if (!best || score < best.score) {
        best = { forward, reverse, wtAmpliconLength, deletionAmpliconLength, score };
      }
    }
  }
  if (best) return best;
  const forwardStart = desiredForwardStart;
  const reverseStart = Math.max(forwardStart + primerLength + 50, desiredReverseStart);
  return {
    forward: seq.slice(forwardStart, forwardStart + primerLength),
    reverse: reverseComplement(seq.slice(reverseStart, reverseStart + primerLength)),
    wtAmpliconLength: reverseStart + primerLength - forwardStart,
    deletionAmpliconLength: Math.max(primerLength * 2, (leftCut - forwardStart) + ((reverseStart + primerLength) - rightCut)),
  };
}

function selectKoGuidePair(guides, maxSpacing = 140) {
  const candidatePairs = [];
  for (let leftIndex = 0; leftIndex < guides.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < guides.length; rightIndex += 1) {
      const leftGuide = guides[leftIndex];
      const rightGuide = guides[rightIndex];
      const spacing = Math.abs(rightGuide.cut - leftGuide.cut);
      if (spacing > maxSpacing) continue;
      candidatePairs.push({
        guides: leftGuide.cut <= rightGuide.cut ? [leftGuide, rightGuide] : [rightGuide, leftGuide],
        spacing,
        preferredSpacing: spacing >= 40 && spacing <= 140,
        oppositeStrands: leftGuide.str !== rightGuide.str,
        score: leftGuide.gc + rightGuide.gc,
      });
    }
  }
  candidatePairs.sort((left, right) => {
    if (left.preferredSpacing !== right.preferredSpacing) return left.preferredSpacing ? -1 : 1;
    if (left.oppositeStrands !== right.oppositeStrands) return left.oppositeStrands ? -1 : 1;
    if (right.score !== left.score) return right.score - left.score;
    if (left.preferredSpacing && right.preferredSpacing) return Math.abs(left.spacing - 90) - Math.abs(right.spacing - 90);
    return right.spacing - left.spacing;
  });
  return candidatePairs[0] || null;
}

function selectInsertGuidesWithFallback(model, targetPos) {
  const windows = [10, 20, 30];
  for (const window of windows) {
    const guides = selectNearbyGuidesForModel(model, reverseComplement, targetPos, window);
    if (!guides.length) continue;
    return {
      guides,
      window,
      tier: window === 10 ? "preferred" : window === 20 ? "fallback" : "distant fallback",
    };
  }
  return null;
}

function normalizeCustomSpacer(spacer) {
  return String(spacer || "").toUpperCase().replace(/[^ACGT]/g, "");
}

function findGuideMatchesForSpacer(model, spacer, targetPos = null) {
  const seq = getGenomicSequence(model);
  const cleanSpacer = normalizeCustomSpacer(spacer);
  if (cleanSpacer.length !== 20) return [];
  const matches = [];
  for (let pos = 0; pos <= seq.length - 23; pos += 1) {
    const plusSpacer = seq.slice(pos, pos + 20);
    const plusPam = seq.slice(pos + 20, pos + 23);
    if (plusSpacer === cleanSpacer && /GG$/.test(plusPam)) {
      const cut = pos + 17;
      matches.push({
        sp: cleanSpacer,
        pam: plusPam,
        str: "+",
        cut,
        d: Number.isFinite(targetPos) ? cut - targetPos : null,
        gc: Math.round((cleanSpacer.split("").filter((base) => base === "G" || base === "C").length / 20) * 100),
        ps: pos,
      });
    }
    const minusPam = seq.slice(pos, pos + 3);
    const minusSpacer = reverseComplement(seq.slice(pos + 3, pos + 23));
    if (minusSpacer === cleanSpacer && /^CC/.test(minusPam)) {
      const cut = pos + 6;
      matches.push({
        sp: cleanSpacer,
        pam: reverseComplement(minusPam),
        str: "-",
        cut,
        d: Number.isFinite(targetPos) ? cut - targetPos : null,
        gc: Math.round((cleanSpacer.split("").filter((base) => base === "G" || base === "C").length / 20) * 100),
        ps: pos,
      });
    }
  }
  matches.sort((left, right) => {
    const leftDistance = Number.isFinite(left.d) ? Math.abs(left.d) : Number.MAX_SAFE_INTEGER;
    const rightDistance = Number.isFinite(right.d) ? Math.abs(right.d) : Number.MAX_SAFE_INTEGER;
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    return left.cut - right.cut;
  });
  return matches;
}

function resolveCustomGuides(model, spacers, targetPos, options = {}) {
  const maxDistance = Number.isFinite(options.maxDistance) ? options.maxDistance : null;
  const desiredCount = Number.isFinite(options.desiredCount) ? options.desiredCount : 2;
  const seenSites = new Set();
  const selected = [];
  for (const rawSpacer of spacers || []) {
    const cleanSpacer = normalizeCustomSpacer(rawSpacer);
    if (!cleanSpacer) continue;
    if (cleanSpacer.length !== 20) return { err: `Custom gRNA "${rawSpacer}" must be a 20 nt spacer.` };
    const matches = findGuideMatchesForSpacer(model, cleanSpacer, targetPos).filter((guide) => {
      if (maxDistance === null) return true;
      return Number.isFinite(guide.d) && Math.abs(guide.d) <= maxDistance;
    });
    if (!matches.length) {
      if (maxDistance === null) return { err: `Custom gRNA ${cleanSpacer} could not be mapped to the reference sequence.` };
      return { err: `Custom gRNA ${cleanSpacer} does not map within ${maxDistance} bp of the target site.` };
    }
    const chosen = matches.find((guide) => !seenSites.has(`${guide.ps}:${guide.str}`)) || matches[0];
    seenSites.add(`${chosen.ps}:${chosen.str}`);
    selected.push(chosen);
    if (selected.length >= desiredCount) break;
  }
  if (!selected.length) return null;
  return {
    guides: selected,
    window: selected.reduce((max, guide) => Math.max(max, Number.isFinite(guide.d) ? Math.abs(guide.d) : 0), 0),
    tier: "custom",
  };
}

function buildInsertGuideNote(guide, anchorLabel, tier, window) {
  if (tier === "custom") return `Custom gRNA | cut ${Math.abs(guide.d)} bp ${guide.d < 0 ? "5-prime" : "3-prime"} of ${anchorLabel}`;
  const relativeLabel = guide.d < 0 ? "5-prime" : "3-prime";
  const tierLabel = tier === "preferred" ? "preferred window" : tier === "fallback" ? "fallback window" : "distant fallback";
  return `Cut ${Math.abs(guide.d)} bp ${relativeLabel} of ${anchorLabel} | ${tierLabel} <=${window} bp`;
}

function buildPointMutationGuideNote(guide, tier, window) {
  if (tier === "custom") return `Custom gRNA | cut-to-edit distance ${Math.abs(guide.d)} bp`;
  const tierLabel = tier === "preferred" ? "preferred window" : tier === "fallback" ? "fallback window" : "distant fallback";
  return `Cut-to-edit distance ${Math.abs(guide.d)} bp | ${tierLabel} <=${window} bp`;
}

function appendGuideContext(note, model, guide) {
  const context = describeGuidePlacementFromModel(model, guide);
  if (!context?.label) return note;
  return `${note} | ${context.label}: ${context.detail}`;
}

function getGuideSpan(guide) {
  return { start: guide.ps, end: guide.ps + 23 };
}

function guideOverlapsReplacement(guide, replaceStart, replaceEnd) {
  const { start, end } = getGuideSpan(guide);
  return start < replaceEnd && end > replaceStart;
}

function parsePointMutationInput(value) {
  const normalized = String(value || "").trim().replace(/^p\./i, "").replace(/\s+/g, "").toUpperCase();
  const canonical = normalized.match(/^([A-Z])(\d+)([A-Z])$/);
  if (canonical) return { wtAA: canonical[1], aaNumber: parseInt(canonical[2], 10), mutAA: canonical[3] };

  const reversed = normalized.match(/^(\d+)([A-Z])([A-Z])$/);
  if (reversed) {
    return {
      err: `Use mutation format ${reversed[2]}${reversed[1]}${reversed[3]}, not ${normalized}. The app expects WT-position-mutant, for example G96S.`,
    };
  }

  const delimited = normalized.match(/^([A-Z])[-_/]?(\d+)[-_/]?([A-Z])$/);
  if (delimited) return { wtAA: delimited[1], aaNumber: parseInt(delimited[2], 10), mutAA: delimited[3] };

  return { err: "Cannot parse mutation. Use WT-position-mutant format such as G96S or p.G96S." };
}

function parseInternalSiteInput(value) {
  const normalized = String(value || "").trim().replace(/^after\s+/i, "").replace(/\s+/g, "").toUpperCase();
  const withResidue = normalized.match(/^([A-Z])(\d+)$/);
  if (withResidue) return { wtAA: withResidue[1], aaNumber: parseInt(withResidue[2], 10) };
  const numeric = normalized.match(/^(\d+)$/);
  if (numeric) return { wtAA: "", aaNumber: parseInt(numeric[1], 10) };
  return { err: "Use an internal insertion site such as P155 or 155." };
}

function mkInternalOdn(model, guide, insertionPos, insertSequence, silentMutations = []) {
  const seq = getGenomicSequence(model);
  let donorStart;
  let donorEnd;
  if (guide.str === "+") { donorStart = guide.cut - 36; donorEnd = guide.cut + 91; }
  else { donorStart = guide.cut - 91; donorEnd = guide.cut + 36; }
  const desiredLength = donorEnd - donorStart;
  if (donorStart < 0) {
    donorEnd = Math.min(seq.length, donorEnd - donorStart);
    donorStart = 0;
  }
  if (donorEnd > seq.length) {
    donorStart = Math.max(0, donorStart - (donorEnd - seq.length));
    donorEnd = seq.length;
  }
  if (donorEnd - donorStart < desiredLength && seq.length >= desiredLength) {
    donorStart = Math.max(0, donorEnd - desiredLength);
    donorEnd = Math.min(seq.length, donorStart + desiredLength);
  }
  if (donorStart < 0 || donorEnd > seq.length || donorEnd - donorStart < desiredLength) return null;

  const wtWindow = seq.slice(donorStart, donorEnd);
  const payload = wtWindow.split("");
  const insertIndex = insertionPos - donorStart;
  if (insertIndex < 0 || insertIndex > payload.length) return null;
  payload.splice(insertIndex, 0, ...insertSequence.split(""));

  silentMutations.forEach((mutation) => {
    let donorIndex = mutation.gp - donorStart;
    if (mutation.gp >= insertionPos) donorIndex += insertSequence.length;
    if (donorIndex >= 0 && donorIndex < payload.length) payload[donorIndex] = mutation.nb;
  });

  const donorSense = payload.join("");
  const orderSequence = guide.str === "+" ? reverseComplement(donorSense) : donorSense;
  const wtOrder = guide.str === "+" ? reverseComplement(wtWindow) : wtWindow;
  const orderedInsertStart = guide.str === "+" ? donorSense.length - (insertIndex + insertSequence.length) : insertIndex;
  const orderedInsertEnd = orderedInsertStart + insertSequence.length;
  const silentIndexes = silentMutations
    .map((mutation) => {
      let donorIndex = mutation.gp - donorStart;
      if (mutation.gp >= insertionPos) donorIndex += insertSequence.length;
      return guide.str === "+" ? donorSense.length - 1 - donorIndex : donorIndex;
    })
    .filter((index) => Number.isFinite(index))
    .sort((left, right) => left - right);
  const sitePositions = guide.str === "+"
    ? Array.from({ length: 20 }, (_, index) => guide.ps + index)
    : Array.from({ length: 20 }, (_, index) => guide.ps + 3 + index);
  const pamPositions = guide.str === "+"
    ? [guide.ps + 20, guide.ps + 21, guide.ps + 22]
    : [guide.ps, guide.ps + 1, guide.ps + 2];
  const toOrderedIndex = (genomicPos) => {
    let donorIndex = genomicPos - donorStart;
    if (genomicPos >= insertionPos) donorIndex += insertSequence.length;
    if (donorIndex < 0 || donorIndex >= donorSense.length) return -1;
    return guide.str === "+" ? donorSense.length - 1 - donorIndex : donorIndex;
  };

  return {
    od: orderSequence,
    wo: wtOrder,
    sl: guide.str === "+" ? "- strand target" : "+ strand target",
    donorSenseLength: donorSense.length,
    insertSequence,
    insertStart: orderedInsertStart,
    insertEnd: orderedInsertEnd,
    silentIndexes,
    guideSiteIndexes: sitePositions.map((position) => toOrderedIndex(position)).filter((index) => index >= 0),
    guidePamIndexes: pamPositions.map((position) => toOrderedIndex(position)).filter((index) => index >= 0),
    silentMutations,
  };
}

function buildInternalProteinPreview(model, aaNumber, insertAa) {
  const wtProtein = [];
  for (let index = 1; index <= model.proteinLength; index += 1) {
    const codonInfo = getCodonAtAa(model, index, toAA);
    wtProtein.push(codonInfo?.aa || "?");
  }
  const donorProtein = wtProtein.slice(0, aaNumber).concat(insertAa.split(""), wtProtein.slice(aaNumber));
  const prefix = Math.max(0, aaNumber - 8);
  const suffix = Math.min(wtProtein.length, aaNumber + 8);
  return {
    wtPrefix: wtProtein.slice(prefix, aaNumber).join(""),
    wtAnchor: wtProtein[aaNumber - 1] || "?",
    wtSuffix: wtProtein.slice(aaNumber, suffix).join(""),
    donorPrefix: donorProtein.slice(prefix, aaNumber).join(""),
    insertAa,
    donorSuffix: donorProtein.slice(aaNumber + insertAa.length, aaNumber + insertAa.length + (suffix - aaNumber)).join(""),
  };
}

function buildInternalCodingPreview(model, aaNumber, insertSequence, insertAa) {
  const prefixStart = Math.max(1, aaNumber - 7);
  const suffixEnd = Math.min(model.proteinLength, aaNumber + 8);
  const prefixEntries = [];
  const suffixEntries = [];
  for (let index = prefixStart; index <= aaNumber; index += 1) {
    const codonInfo = getCodonAtAa(model, index, toAA);
    if (codonInfo) prefixEntries.push({ codon: codonInfo.cod, aa: codonInfo.aa === "*" ? "Stop" : codonInfo.aa });
  }
  for (let index = aaNumber + 1; index <= suffixEnd; index += 1) {
    const codonInfo = getCodonAtAa(model, index, toAA);
    if (codonInfo) suffixEntries.push({ codon: codonInfo.cod, aa: codonInfo.aa === "*" ? "Stop" : codonInfo.aa });
  }
  const insertCodons = [];
  const upperInsert = String(insertSequence || "").toUpperCase();
  for (let index = 0; index < upperInsert.length; index += 3) insertCodons.push(upperInsert.slice(index, index + 3));
  return {
    note: `Insert ${insertAa} after residue ${aaNumber}.`,
    wtCodons: prefixEntries.map((entry) => entry.codon).concat(suffixEntries.map((entry) => entry.codon)),
    donorCodons: prefixEntries.map((entry) => entry.codon).concat(insertCodons, suffixEntries.map((entry) => entry.codon)),
    wtAas: prefixEntries.map((entry) => entry.aa).concat(suffixEntries.map((entry) => entry.aa)),
    donorAas: prefixEntries.map((entry) => entry.aa).concat(insertAa.split(""), suffixEntries.map((entry) => entry.aa)),
    insertCodonStart: prefixEntries.length,
    insertCodonLength: insertCodons.length,
    insertAaStart: prefixEntries.length,
    insertAaLength: insertAa.length,
  };
}

function translateDnaToAaTokens(sequence) {
  const tokens = [];
  const upper = String(sequence || "").toUpperCase();
  const limit = Math.floor(upper.length / 3) * 3;
  for (let index = 0; index < limit; index += 3) {
    const aa = toAA(upper.slice(index, index + 3));
    tokens.push(aa === "*" ? "Stop" : aa);
  }
  return tokens;
}

function translateDnaToCodonEntries(sequence) {
  const entries = [];
  const upper = String(sequence || "").toUpperCase();
  const limit = Math.floor(upper.length / 3) * 3;
  for (let index = 0; index < limit; index += 3) {
    const codon = upper.slice(index, index + 3);
    const aa = toAA(codon);
    entries.push({ codon, aa: aa === "*" ? "Stop" : aa });
  }
  return entries;
}

function buildInsertValidation(expectedSequence, actualSequence, options = {}) {
  const allowTerminalStop = !!options.allowTerminalStop;
  const segments = Array.isArray(options.segments) ? options.segments : [];
  const expected = String(expectedSequence || "").toUpperCase();
  const actual = String(actualSequence || "").toUpperCase();
  const expectedEntries = translateDnaToCodonEntries(expected);
  const actualEntries = translateDnaToCodonEntries(actual);
  const expectedAas = expectedEntries.map((entry) => entry.aa);
  const actualAas = actualEntries.map((entry) => entry.aa);
  const unexpectedStop = actualEntries.some((entry, index) => entry.aa === "Stop" && !(allowTerminalStop && index === actualEntries.length - 1));
  const terminalStopPresent = allowTerminalStop ? actualEntries[actualEntries.length - 1]?.aa === "Stop" : false;
  let cursor = 0;
  const canonicalChecks = segments
    .map((segment) => {
      const start = cursor;
      const end = cursor + String(segment.seq || "").length;
      cursor = end;
      if (!segment.referenceProtein?.aa) return null;
      const actualSegmentSequence = actual.slice(start, end);
      const actualSegmentAas = translateDnaToCodonEntries(actualSegmentSequence).map((entry) => entry.aa).join("");
      return {
        label: segment.referenceProtein.label || segment.label,
        expectedAas: segment.referenceProtein.aa,
        actualAas: actualSegmentAas,
        matches: actualSegmentAas === segment.referenceProtein.aa,
        sourceUrl: segment.referenceProtein.sourceUrl || "",
      };
    })
    .filter(Boolean);
  return {
    expectedSequence: expected,
    actualSequence: actual,
    expectedLengthBp: expected.length,
    actualLengthBp: actual.length,
    expectedAas,
    actualAas,
    matchesPreset: expected === actual,
    framePreserved: actual.length > 0 && actual.length % 3 === 0 && !unexpectedStop && (!allowTerminalStop || terminalStopPresent),
    unexpectedStop,
    terminalStopPresent,
    canonicalChecks,
  };
}

function buildKnockinProteinPreview(model, orientation, preset) {
  const wtEntries = [];
  for (let index = 1; index <= model.proteinLength; index += 1) {
    const codonInfo = getCodonAtAa(model, index, toAA);
    if (codonInfo) wtEntries.push({ codon: codonInfo.cod, aa: codonInfo.aa === "*" ? "Stop" : codonInfo.aa });
  }
  const insertEntries = translateDnaToCodonEntries(preset?.seq || "");

  if (orientation === "ct") {
    const tailLength = Math.min(8, wtEntries.length);
    const wtTail = wtEntries.slice(wtEntries.length - tailLength);
    return {
      mode: "ct",
      note: "Coding frame view across the C-terminal junction. The edited protein appends the translated knock-in before the terminal stop.",
      wtCodons: wtTail.map((entry) => entry.codon),
      donorCodons: wtTail.map((entry) => entry.codon).concat(insertEntries.map((entry) => entry.codon)),
      wtAas: wtTail.map((entry) => entry.aa),
      donorAas: wtTail.map((entry) => entry.aa).concat(insertEntries.map((entry) => entry.aa)),
      insertCodonStart: wtTail.length,
      insertCodonLength: insertEntries.length,
      insertAaStart: wtTail.length,
      insertAaLength: insertEntries.length,
    };
  }

  const headLength = Math.min(8, wtEntries.length);
  const wtHead = wtEntries.slice(0, headLength);
  const resumedWt = wtEntries.slice(1, 1 + headLength);
  return {
    mode: "nt",
    note: "Coding frame view across the N-terminal junction. The edited protein starts with the translated knock-in and then resumes the native CDS after the original start codon.",
    wtCodons: wtHead.map((entry) => entry.codon),
    donorCodons: insertEntries.map((entry) => entry.codon).concat(resumedWt.map((entry) => entry.codon)),
    wtAas: wtHead.map((entry) => entry.aa),
    donorAas: insertEntries.map((entry) => entry.aa).concat(resumedWt.map((entry) => entry.aa)),
    insertCodonStart: 0,
    insertCodonLength: insertEntries.length,
    insertAaStart: 0,
    insertAaLength: insertEntries.length,
  };
}

export function designPM(gb, mutationString, options = {}) {
  const cds = getCdsFromModel(gb);
  if (!cds) return { err: "No CDS annotation found in GenBank file." };
  const seq = getGenomicSequence(gb);
  const mutation = parsePointMutationInput(mutationString);
  if (mutation.err) return { err: mutation.err };
  const { wtAA, aaNumber, mutAA } = mutation;
  const codonInfo = getCodonAtAa(gb, aaNumber, toAA);
  if (!codonInfo) return { err: `Cannot map amino acid ${aaNumber} to the genomic sequence.` };
  if (codonInfo.aa !== wtAA.toUpperCase()) return { err: `Expected ${wtAA.toUpperCase()} at position ${aaNumber} but found ${codonInfo.aa} (${codonInfo.cod}).` };

  let bestMutantCodon = null;
  let bestChanges = [];
  for (const base1 of "ACGT") {
    for (const base2 of "ACGT") {
      for (const base3 of "ACGT") {
        const mutantCodon = `${base1}${base2}${base3}`;
        if (toAA(mutantCodon) !== mutAA.toUpperCase()) continue;
        const changes = [];
        for (let index = 0; index < 3; index += 1) {
          if (codonInfo.cod[index] !== mutantCodon[index]) {
            changes.push({ p: codonInfo.genomicPositions[index], w: codonInfo.cod[index], m: mutantCodon[index] });
          }
        }
        if (!bestMutantCodon || changes.length < bestChanges.length) { bestMutantCodon = mutantCodon; bestChanges = changes; }
      }
    }
  }
  if (!bestMutantCodon) return { err: `No codon encodes ${mutAA.toUpperCase()}.` };

  const mutationPositions = bestChanges.map((change) => change.p);
  const mutationBases = bestChanges.map((change) => change.m);
  const customGuideSelection = options.customGuides?.length ? resolveCustomGuides(gb, options.customGuides, codonInfo.g, { maxDistance: 30, desiredCount: 2 }) : null;
  if (customGuideSelection?.err) return { err: customGuideSelection.err };
  const guideSelection = customGuideSelection || selectInsertGuidesWithFallback(gb, codonInfo.g);
  if (!guideSelection) return { err: "No gRNAs found with cut sites within 30 bp of the mutation site." };
  const { guides: selectedGuides, window: guideWindow, tier: guideTier } = guideSelection;
  const blockedPositions = new Set(mutationPositions);

  const result = { type: "pm", gene: gb.gene, an: aaNumber, wA: wtAA.toUpperCase(), mA: mutAA.toUpperCase(), wC: codonInfo.cod, mC: bestMutantCodon, gp: codonInfo.g, ch: bestChanges, gs: [], os: [], ss: [], ps: [], guideWindow, guideTier };
  selectedGuides.forEach((guide, index) => {
    const silent = findSilent(gb, guide, blockedPositions);
    const donor = mkODN(gb, guide, mutationPositions, mutationBases, silent ? [silent] : []);
    const guideName = makeGuideName(gb.gene, "pm", index, mutationString);
    result.gs.push({ n: guideName, sp: guide.sp, pm: guide.pam, str: guide.str, gc: guide.gc, d: guide.d, arm: appendGuideContext(buildPointMutationGuideNote(guide, guideTier, guideWindow), gb, guide) });
    if (donor) result.os.push({ ...donor, n: `ssODN${index + 1}`, gi: index, guideName, guideStrand: guide.str });
    if (silent) result.ss.push({ ...silent, gi: index + 1 });
  });

  const primerPair = pickCenteredPrimerPair(seq, codonInfo.g, 450, 500, 24);
  result.ps = [
    { n: makePrimerName(gb.gene, "pm", "Fw", mutationString), s: primerPair.forward },
    { n: makePrimerName(gb.gene, "pm", "Rev", mutationString), s: primerPair.reverse },
  ];
  result.amp = `~${primerPair.ampliconLength} bp`;
  return result;
}

export function designIT(gb, siteString, tag, options = {}) {
  const cds = getCdsFromModel(gb);
  if (!cds) return { err: "No CDS annotation found in GenBank file." };
  const site = parseInternalSiteInput(siteString);
  if (site.err) return { err: site.err };
  const { wtAA, aaNumber } = site;
  if (!aaNumber || aaNumber < 1 || aaNumber >= gb.proteinLength) return { err: "Internal insertion site must be within the coding sequence and before the final amino acid." };
  const codonInfo = getCodonAtAa(gb, aaNumber, toAA);
  if (!codonInfo) return { err: `Cannot map amino acid ${aaNumber} to the coding sequence.` };
  if (wtAA && codonInfo.aa !== wtAA) return { err: `Expected ${wtAA} at position ${aaNumber} but found ${codonInfo.aa} (${codonInfo.cod}).` };
  const nextCodonInfo = getCodonAtAa(gb, aaNumber + 1, toAA);
  const preset = INTERNAL_TAGS[tag];
  if (!preset) return { err: `Internal tag "${tag}" is not available.` };

  const insertionPos = codingPosToGenomic(gb, aaNumber * 3);
  if (insertionPos === null || insertionPos === undefined) return { err: `Cannot map insertion point after amino acid ${aaNumber}.` };

  const customGuideSelection = options.customGuides?.length ? resolveCustomGuides(gb, options.customGuides, insertionPos, { maxDistance: 30, desiredCount: 2 }) : null;
  if (customGuideSelection?.err) return { err: customGuideSelection.err };
  const guideSelection = customGuideSelection || selectInsertGuidesWithFallback(gb, insertionPos);
  if (!guideSelection) return { err: "No gRNAs found with cut sites within 30 bp of the internal insertion site." };
  const { guides, window: guideWindow, tier: guideTier } = guideSelection;

  const blockedPositions = new Set();
  const donors = [];
  const allBlockingMutations = [];
  guides.slice(0, 2).forEach((guide, index) => {
    const blocking = findSilent(gb, guide, blockedPositions, { allowNonCoding: true });
    if (blocking) blockedPositions.add(blocking.gp);
    const donor = mkInternalOdn(gb, guide, insertionPos, preset.seq, blocking ? [{ ...blocking, gi: index + 1 }] : []);
    const guideName = makeGuideName(gb.gene, "it", index, `AFTER_${wtAA || ""}${aaNumber}`, tag);
    if (donor) {
      const annotationBase = [
        { label: "5' arm", color: DONOR_COLORS.HA5, start: 0, end: donor.insertStart, priority: 1, badgeLabel: "5' arm" },
        { label: tag, color: DONOR_COLORS.TAG, start: donor.insertStart, end: donor.insertEnd, priority: 1, badgeLabel: tag, title: `${tag} insert` },
        { label: "3' arm", color: DONOR_COLORS.HA3, start: donor.insertEnd, end: donor.od.length, priority: 1, badgeLabel: "3' arm" },
      ];
      const blockingAnnotations = buildSilentAnnotations(blocking ? [{ ...blocking, gi: index + 1 }] : [], (mutation) => donor.silentIndexes[0] ?? -1);
      const guideAnnotations = buildGuideAnnotationsFromIndexes(guide, index + 1, donor.guideSiteIndexes, donor.guidePamIndexes);
      donors.push({
        ...donor,
        n: `ssODN${index + 1}`,
        gi: index,
        guideName,
        guideStrand: guide.str,
        donorAnnotations: annotationBase.concat(guideAnnotations, blockingAnnotations),
      });
    }
    if (blocking) allBlockingMutations.push({ ...blocking, gi: index + 1 });
  });

  const proteinPreview = buildInternalProteinPreview(gb, aaNumber, preset.aa);
  const codingPreview = buildInternalCodingPreview(gb, aaNumber, preset.seq, preset.aa);
  const seq = getGenomicSequence(gb);
  const primerPair = pickCenteredPrimerPair(seq, insertionPos, 450, 500, 24);
  const insertValidation = donors[0]
    ? buildInsertValidation(preset.seq, donors[0].od.slice(donors[0].insertStart, donors[0].insertEnd))
    : buildInsertValidation(preset.seq, "");
  return {
    type: "it",
    gene: gb.gene,
    prot: gb.proteinLength,
    an: aaNumber,
    wA: codonInfo.aa,
    nextAA: nextCodonInfo?.aa || "?",
    tag,
    td: `${tag} (${preset.seq.length} bp)`,
    il: preset.seq.length,
    gp: insertionPos,
    guideWindow,
    guideTier,
    proteinPreview,
    codingPreview,
    insertValidation,
    gs: guides.slice(0, 2).map((guide, index) => ({
      n: makeGuideName(gb.gene, "it", index, `AFTER_${wtAA || ""}${aaNumber}`, tag),
      sp: guide.sp,
      pm: guide.pam,
      str: guide.str,
      gc: guide.gc,
      d: guide.d,
      arm: appendGuideContext(`Cut-to-insert distance ${Math.abs(guide.d)} bp | ${guideTier === "preferred" ? "preferred window" : guideTier === "fallback" ? "fallback window" : "distant fallback"} <=${guideWindow} bp`, gb, guide),
    })),
    os: donors,
    ss: allBlockingMutations,
    ps: [
      { n: makePrimerName(gb.gene, "it", "Fw", `AFTER_${wtAA || ""}${aaNumber}`, tag), s: primerPair.forward },
      { n: makePrimerName(gb.gene, "it", "Rev", `AFTER_${wtAA || ""}${aaNumber}`, tag), s: primerPair.reverse },
    ],
    amp: `~${primerPair.ampliconLength} bp`,
  };
}

export function designCT(gb, tag, homologyArmLength, options = {}) {
  const cds = getCdsFromModel(gb);
  if (!cds) return { err: "No CDS annotation found in GenBank file." };
  const seq = getGenomicSequence(gb);
  const lastSegment = gb.cdsSegments[gb.cdsSegments.length - 1];
  const stopStart = lastSegment[1] - 3;
  const stopCodon = seq.slice(stopStart, stopStart + 3);
  if (!["TAA", "TAG", "TGA"].includes(stopCodon)) return { err: `Expected a stop codon at the end of the CDS, found ${stopCodon}.` };
  const preset = getInsertPreset(tag, "ct");
  if (!preset) return { err: `Tag "${tag}" is not available.` };

  const armLength = parseInt(homologyArmLength, 10) || 250;
  const homology5Start = Math.max(0, stopStart - armLength);
  const homology3End = Math.min(seq.length, stopStart + 3 + armLength);
  const homology5 = seq.slice(homology5Start, stopStart);
  const homology3 = seq.slice(stopStart + 3, homology3End);
  const customGuideSelection = options.customGuides?.length ? resolveCustomGuides(gb, options.customGuides, stopStart, { maxDistance: 30, desiredCount: 2 }) : null;
  if (customGuideSelection?.err) return { err: customGuideSelection.err };
  const guideSelection = customGuideSelection || selectInsertGuidesWithFallback(gb, stopStart);
  if (!guideSelection) return { err: "No SpCas9 gRNAs found with cut sites within 30 bp of the stop codon." };
  const { guides, window: guideWindow, tier: guideTier } = guideSelection;

  const silentMutations = [];
  const blockedPositions = new Set();
  guides.slice(0, 2).forEach((guide, index) => {
    const silent = findSilent(gb, guide, blockedPositions, { allowNonCoding: true });
    const inHomology5 = silent && silent.gp >= homology5Start && silent.gp < stopStart;
    const inHomology3 = silent && silent.gp >= stopStart + 3 && silent.gp < homology3End;
    if (inHomology5 || inHomology3) {
      silentMutations.push({ ...silent, gi: index + 1 });
      blockedPositions.add(silent.gp);
    }
  });
  const homology5Array = homology5.split("");
  const homology3Array = homology3.split("");
  silentMutations.forEach((mutation) => {
    const homology5Index = mutation.gp - homology5Start;
    if (homology5Index >= 0 && homology5Index < homology5Array.length) {
      homology5Array[homology5Index] = mutation.nb;
      return;
    }
    const homology3Index = mutation.gp - (stopStart + 3);
    if (homology3Index >= 0 && homology3Index < homology3Array.length) homology3Array[homology3Index] = mutation.nb;
  });

  const donor = `${homology5Array.join("")}${preset.seq}${homology3Array.join("")}`;
  const insertValidation = buildInsertValidation(
    preset.seq,
    donor.slice(homology5.length, homology5.length + preset.seq.length),
    { allowTerminalStop: true, segments: preset.segments },
  );
  const toCtDonorIndex = (genomicPos) => {
    const homology5Index = genomicPos - homology5Start;
    if (homology5Index >= 0 && homology5Index < homology5.length) return homology5Index;
    const homology3Index = genomicPos - (stopStart + 3);
    if (homology3Index >= 0 && homology3Index < homology3.length) return homology5.length + preset.seq.length + homology3Index;
    return -1;
  };
  const donorAnnotations = buildDonorAnnotations(
    homology5.length,
    preset.segments,
    homology3.length,
    buildSilentAnnotations(silentMutations, toCtDonorIndex).concat(
      guides.slice(0, 2).flatMap((guide, index) => buildGuideAnnotationsForMappedDonor(guide, index + 1, toCtDonorIndex)),
    ),
  );
  const lastAA = getCodonAtAa(gb, gb.proteinLength, toAA);
  const guideProtection = guides.slice(0, 2).map((guide, index) => {
    const guideIndex = index + 1;
    const mutation = silentMutations.find((entry) => entry.gi === guideIndex) || null;
    const byInsertion = guideOverlapsReplacement(guide, stopStart, stopStart + 3);
    return {
      guideIndex,
      byMutation: !!mutation,
      byInsertion,
      protected: !!mutation || byInsertion,
    };
  });
  return {
    type: "ct",
    gene: gb.gene,
    stop: stopCodon,
    sp: stopStart + 1,
    prot: gb.proteinLength,
    lastAA: lastAA ? `${lastAA.aa}${gb.proteinLength}` : "?",
    tag,
    td: `${tag} (${preset.seq.length} bp)`,
    il: preset.seq.length,
    hl: armLength,
    h5l: homology5.length,
    h3l: homology3.length,
    dl: donor.length,
    donor,
    donorAnnotations,
    proteinPreview: buildKnockinProteinPreview(gb, "ct", preset),
    insertValidation,
    guideWindow: guideWindow,
    guideTier,
    guideProtection,
    gs: guides.slice(0, 2).map((guide, index) => ({ n: makeGuideName(gb.gene, "ct", index, "", tag), sp: guide.sp, pm: guide.pam, str: guide.str, gc: guide.gc, d: guide.d, note: appendGuideContext(buildInsertGuideNote(guide, "stop", guideTier, guideWindow), gb, guide) })),
    ss: silentMutations,
    ps: [
      { n: makePrimerName(gb.gene, "ct", "Fw", "", tag), s: pickPrimerOutsideLeft(seq, homology5Start) },
      { n: makePrimerName(gb.gene, "ct", "Rev", "", tag), s: pickPrimerOutsideRight(seq, homology3End) },
    ],
    amp: `WT ~${homology3End + 49 - homology5Start + 50} bp | KI ~${homology3End + 49 - homology5Start + 50 + preset.seq.length} bp`,
  };
}

export function designKO(gb, options = {}) {
  const cds = getCdsFromModel(gb);
  if (!cds) return { err: "No CDS annotation found." };
  if (gb.cdsSegments.length < 2) return { err: "Not enough coding exons available for KO design." };
  let selectedPair;
  let exonStart;
  let exonEnd;
  let bestLength;
  let exonNumber;
  if (options.customGuides?.length) {
    const customGuideSelection = resolveCustomGuides(gb, options.customGuides, null, { desiredCount: 2 });
    if (customGuideSelection?.err) return { err: customGuideSelection.err };
    if (!customGuideSelection || customGuideSelection.guides.length < 2) return { err: "Paste two custom gRNAs for knockout design." };
    const guides = customGuideSelection.guides
      .slice(0, 2)
      .sort((left, right) => left.cut - right.cut)
      .map((guide) => ({ ...guide, d: null }));
    selectedPair = {
      guides,
      spacing: Math.abs(guides[1].cut - guides[0].cut),
    };
    const contexts = guides.map((guide) => describeKoGenomicContextFromModel(gb, guide.cut));
    const exonMatch = contexts[0]?.label?.match(/Exon\s+(\d+)/i);
    exonNumber = exonMatch ? parseInt(exonMatch[1], 10) : null;
    const exon = Array.isArray(gb.exons) ? gb.exons.find((entry) => entry.exonNumber === exonNumber) : null;
    exonStart = exon?.start ?? 0;
    exonEnd = exon?.end ?? 0;
    bestLength = exon ? (exon.end - exon.start) : 0;
  } else {
    const target = findKoDesignTargetFromModel(gb, reverseComplement, selectKoGuidePair);
    if (!target) return { err: "No gRNA pair found with cut-site spacing up to 140 bp across non-terminal coding exons, preferentially exons 2-4, including exon-intron boundaries." };
    ({ start: exonStart, end: exonEnd, exonLength: bestLength, exonNumber, pair: selectedPair } = target);
  }
  const seq = getGenomicSequence(gb);
  const cutCenter = Math.round(selectedPair.guides.reduce((sum, guide) => sum + guide.cut, 0) / selectedPair.guides.length);
  const sortedCuts = selectedPair.guides.map((guide) => guide.cut).filter(Number.isFinite).sort((left, right) => left - right);
  const longDeletion = sortedCuts.length === 2 && selectedPair.spacing > KO_LONG_DELETION_THRESHOLD;
  const primerPair = longDeletion
    ? pickDeletionScreenPrimerPair(seq, sortedCuts[0], sortedCuts[1], KO_DELETION_SCREEN_FLANK, 24)
    : pickCenteredPrimerPair(seq, cutCenter, 450, 500, 24);

  return {
    type: "ko",
    gene: gb.gene,
    exon: `Exon ${exonNumber} (${exonStart + 1}-${exonEnd}, ${bestLength} bp)`,
    exSz: bestLength,
    prot: gb.proteinLength,
    gs: selectedPair.guides.map((guide, index) => {
      const context = describeKoGenomicContextFromModel(gb, guide.cut);
      const placement = describeGuidePlacementFromModel(gb, guide);
      return {
        n: makeGuideName(gb.gene, "ko", index),
        sp: guide.sp,
        pm: guide.pam,
        str: guide.str,
        gc: guide.gc,
        cut: guide.cut,
        d: guide.d,
        note: `Cut at ${guide.cut + 1}, ${context.label} (${context.detail}) | ${placement.label}: ${placement.detail} | pair spacing ${selectedPair.spacing} bp`,
      };
    }),
    ps: [
      { n: makePrimerName(gb.gene, "ko", "Fw"), s: primerPair.forward },
      { n: makePrimerName(gb.gene, "ko", "Rev"), s: primerPair.reverse },
    ],
    amp: longDeletion
      ? `WT ~${primerPair.wtAmpliconLength} bp | deletion ~${primerPair.deletionAmpliconLength} bp`
      : `~${primerPair.ampliconLength} bp`,
    strat: longDeletion
      ? "NHEJ-mediated deletion using dual Cas9 guides. Screen with flanking junction PCR, then confirm the deletion by sequencing."
      : "NHEJ-mediated frameshift using Cas9 RNP. Screen by Sanger sequencing plus ICE/TIDE, then confirm protein loss.",
    primerStrategy: longDeletion ? "deletion-screen" : "centered",
  };
}

export function designNT(gb, tag, homologyArmLength, options = {}) {
  const cds = getCdsFromModel(gb);
  if (!cds) return { err: "No CDS annotation found." };
  const seq = getGenomicSequence(gb);
  const startCodonPos = gb.cdsSegments[0][0];
  if (seq.slice(startCodonPos, startCodonPos + 3) !== "ATG") return { err: `Expected ATG at CDS start, found ${seq.slice(startCodonPos, startCodonPos + 3)}.` };
  const preset = getInsertPreset(tag, "nt");
  if (!preset) return { err: `Unknown tag: ${tag}.` };

  const armLength = parseInt(homologyArmLength, 10) || 250;
  const insertionSite = startCodonPos;
  const codingResume = startCodonPos + 3;
  const homology5Start = Math.max(0, insertionSite - armLength);
  const homology3End = Math.min(seq.length, codingResume + armLength);
  const homology5 = seq.slice(homology5Start, insertionSite);
  const homology3 = seq.slice(codingResume, homology3End);
  const customGuideSelection = options.customGuides?.length ? resolveCustomGuides(gb, options.customGuides, startCodonPos, { maxDistance: 30, desiredCount: 2 }) : null;
  if (customGuideSelection?.err) return { err: customGuideSelection.err };
  const guideSelection = customGuideSelection || selectInsertGuidesWithFallback(gb, startCodonPos);
  if (!guideSelection) return { err: "No gRNAs found with cut sites within 30 bp of the start codon." };
  const { guides, window: guideWindow, tier: guideTier } = guideSelection;

  const silentMutations = [];
  const blockedPositions = new Set();
  guides.slice(0, 2).forEach((guide, index) => {
    const silent = findSilent(gb, guide, blockedPositions, { allowNonCoding: true });
    if (silent && silent.gp >= homology5Start && silent.gp < homology3End) {
      silentMutations.push({ ...silent, gi: index + 1 });
      blockedPositions.add(silent.gp);
    }
  });

  const homology5Array = homology5.split("");
  const homology3Array = homology3.split("");
  silentMutations.forEach((mutation) => {
    const homology5Index = mutation.gp - homology5Start;
    if (homology5Index >= 0 && homology5Index < homology5Array.length) { homology5Array[homology5Index] = mutation.nb; return; }
    const homology3Index = mutation.gp - codingResume;
    if (homology3Index >= 0 && homology3Index < homology3Array.length) homology3Array[homology3Index] = mutation.nb;
  });

  const donor = `${homology5Array.join("")}${preset.seq}${homology3Array.join("")}`;
  const insertValidation = buildInsertValidation(
    preset.seq,
    donor.slice(homology5.length, homology5.length + preset.seq.length),
    { segments: preset.segments },
  );
  const toNtDonorIndex = (genomicPos) => {
    const homology5Index = genomicPos - homology5Start;
    if (homology5Index >= 0 && homology5Index < homology5.length) return homology5Index;
    const homology3Index = genomicPos - codingResume;
    if (homology3Index >= 0 && homology3Index < homology3.length) return homology5.length + preset.seq.length + homology3Index;
    return -1;
  };
  const donorAnnotations = buildDonorAnnotations(
    homology5.length,
    preset.segments,
    homology3.length,
    buildSilentAnnotations(silentMutations, toNtDonorIndex).concat(
      guides.slice(0, 2).flatMap((guide, index) => buildGuideAnnotationsForMappedDonor(guide, index + 1, toNtDonorIndex)),
    ),
  );
  const guideProtection = guides.slice(0, 2).map((guide, index) => {
    const guideIndex = index + 1;
    const mutation = silentMutations.find((entry) => entry.gi === guideIndex) || null;
    const byInsertion = guideOverlapsReplacement(guide, startCodonPos, startCodonPos + 3);
    return {
      guideIndex,
      byMutation: !!mutation,
      byInsertion,
      protected: !!mutation || byInsertion,
    };
  });
  return {
    type: "nt",
    gene: gb.gene,
    prot: gb.proteinLength,
    tag,
    td: `${tag} (${preset.seq.length} bp)`,
    il: preset.seq.length,
    hl: armLength,
    h5l: homology5.length,
    h3l: homology3.length,
    dl: donor.length,
    donor,
    donorAnnotations,
    proteinPreview: buildKnockinProteinPreview(gb, "nt", preset),
    insertValidation,
    guideWindow: guideWindow,
    guideTier,
    guideProtection,
    gs: guides.slice(0, 2).map((guide, index) => ({ n: makeGuideName(gb.gene, "nt", index, "", tag), sp: guide.sp, pm: guide.pam, str: guide.str, gc: guide.gc, d: guide.d, note: appendGuideContext(buildInsertGuideNote(guide, "start codon replacement site", guideTier, guideWindow), gb, guide) })),
    ss: silentMutations,
    ps: [
      { n: makePrimerName(gb.gene, "nt", "Fw", "", tag), s: pickPrimerOutsideLeft(seq, homology5Start) },
      { n: makePrimerName(gb.gene, "nt", "Rev", "", tag), s: pickPrimerOutsideRight(seq, homology3End) },
    ],
    amp: `WT ~${homology3End + 49 - homology5Start + 50} bp | KI ~${homology3End + 49 - homology5Start + 50 + preset.seq.length - 3} bp`,
  };
}

export function runDesignFromTranscriptModel(projectType, model, mutation, tag, homologyArmLength, options = {}) {
  if (!model?.genomicSequence) return { err: "Transcript model is missing genomic sequence." };
  if (!projectType) return { err: "Select a project type first." };
  const cds = getCdsFromModel(model);
  if (!cds) return { err: "Transcript model is missing CDS segments." };

  let designResult;
  if (projectType === "pm") {
    if (!mutation) return { err: "Enter a mutation such as L72S." };
    designResult = designPM(model, mutation, options);
  } else if (projectType === "it") {
    if (!mutation) return { err: "Enter an internal insertion site such as P155." };
    designResult = designIT(model, mutation, tag, options);
  } else if (projectType === "ct") designResult = designCT(model, tag, homologyArmLength, options);
  else if (projectType === "nt") designResult = designNT(model, tag, homologyArmLength, options);
  else designResult = designKO(model, options);

  return {
    gb: model,
    cds,
    dbg: `Parsed ${model.genomicSequence.length} bp with ${getFeatureCount(model)} features. CDS: ${model.gene}, ${model.cdsSegments.length} segments, ${model.proteinLength} aa.`,
    ...designResult,
  };
}

export function runDesign(projectType, gbRaw, mutation, tag, homologyArmLength, options = {}) {
  let model = null;
  if (options.rawReference?.sequence) {
    model = normalizeRawSequenceToTranscriptModel(options.rawReference);
    if (!model?.genomicSequence) return { err: "Could not normalize the raw DNA input into a transcript model. Check the DNA sequence and CDS coordinates." };
  } else {
    if (!gbRaw) return { err: "Upload a GenBank file first." };
    const parsedGenBank = parseGB(gbRaw);
    if (!parsedGenBank.seq) return { err: "Could not parse a DNA sequence from the file." };
    model = normalizeGenBankToTranscriptModel(parsedGenBank);
  }
  if (!model?.genomicSequence) return { err: "Could not normalize the GenBank file into a transcript model." };
  return runDesignFromTranscriptModel(projectType, model, mutation, tag, homologyArmLength, options);
}
