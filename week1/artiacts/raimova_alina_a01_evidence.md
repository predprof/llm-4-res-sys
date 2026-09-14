# A01 evidence ledger

This ledger supports `raimova_alina_a01_report.md`. It is a drafting and verification aid, not a substitute for the student's personal checks or the authentic session export.

| Claim | Evidence artifact | How checked | Checked by | Report location |
|---|---|---|---|---|
| Three original icons did not render | Read-only `RecSys-LLMs/week1/index.html`, lines 162, 164, and 167; browser pseudo-element inspection | Compared the rendered `::before` content of all 12 original icon classes | Codex; student confirmation pending | Introduction; Discussion |
| Corrected classes render | `llm-4-res-sys/week1/script.js`, lines 7, 9, and 12 | Browser audit of all 12 corrected entries | Codex; student confirmation pending | Method; Discussion |
| Index range is 0-11 | `script.js`, line 24; ECMAScript reference [1] | Equal-interval derivation from `[0,1)` and `Math.floor` | Codex; student check pending | Method |
| Exploratory chi-square result | `distribution-1000.json`; `chi-square-test.py` | Recomputed: chi-square 26.264, df 11, p 0.00592758 | Codex on 2026-09-15 | Experiments |
| Confirmatory chi-square result | `confirmatory-distribution-100000.json`; `confirmatory-chi-square-result.json` | Recomputed: chi-square 31.47704, df 11, p 0.000924823 | Codex on 2026-09-15 | Abstract; Experiments |
| Harness preserves mapping | `harness-validation.js` | Seed 20260914 produced exact equality of direct and handler count vectors for 100,000 selections | Codex on 2026-09-15 | Method; Verification |
| New sequence has no detected marginal departure | `random-sequence-100000.json`; `sequence-analysis-100000.json` | One pre-specified native run: chi-square 8.41016, df 11, p 0.676159 | Codex on 2026-09-15 | Abstract; Experiments |
| Consecutive selections show no detected dependence | `sequence-analysis-100000.json` | Analytical p 0.465651; 2,000-permutation p 0.473763 with seed 20260915 | Codex on 2026-09-15 | Experiments |
| Distribution shows no detected block drift | `sequence-analysis-100000.json` | 100 blocks of 1,000: chi-square 1134.894, df 1089, p 0.162520 | Codex on 2026-09-15 | Experiments |
| Sequence bookkeeping is internally consistent | `random-sequence-100000.json`; `sequence-analysis-100000.json` | Checked 100,000 counts, 99,999 transitions, 100 block totals, margins, and byte-for-byte deterministic re-analysis | Codex on 2026-09-15 | Verification |
| Burger contribution is 13.280053 | `chi-square-test.py` output | Formula `(8666 - 8333.3333)^2 / 8333.3333` | Codex; student arithmetic pending | Verification |
| Sources support cited claims | References [1]-[4] | Opened official pages and checked relevant sections on 2026-09-15 | Codex | Related Work; References |
| Student personally verified a critical output | Not yet available | Student must confirm a manual or rerun check | Student confirmation required | AI Usage Disclosure |
| Authentic session log exists and matches disclosure | Not present | Requires unmodified tool-native export | Blocked pending export | AI Usage Disclosure |

## Recomputed environment

```text
Node.js v23.7.0
Python 3.7.2
SciPy 1.7.3
```

`confirmatory-chi-square-result.json` records SciPy 1.17.1 from the earlier run; this difference is disclosed in the report.

The new sequence experiment used the same current environment and stored its complete native index sequence before analysis.
