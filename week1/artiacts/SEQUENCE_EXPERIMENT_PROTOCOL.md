# Pre-specified sequence experiment

This protocol was saved before generating the analyzed sequence. The run must be preserved regardless of its p-values; it must not be replaced by a more convenient run.

## Data generation

- Source: the registered click handler from `script.js`, executed through the same minimal DOM harness used by `distribution-test.js`.
- Random source: native Node.js `Math.random()`.
- Recorded sample: 100,000 menu indices in chronological order.
- The application's automatic page-load selection is allowed to consume one random value but is excluded from the recorded sequence.
- Output: `random-sequence-100000.json`, including the complete index sequence, menu order, counts, and Node.js version.

## Primary tests

All tests use `alpha = 0.05`. Because three primary hypotheses are examined, results will also be compared with the Bonferroni threshold `0.05 / 3 = 0.0166667`.

1. **Marginal uniformity**
   - H0: every index has probability `1/12`.
   - Test: Pearson chi-square goodness-of-fit, 11 degrees of freedom.

2. **Independence of consecutive selections**
   - Construct a `12 x 12` matrix whose cell `(i, j)` counts transitions from index `i` to index `j` across 99,999 adjacent pairs.
   - H0: the next index is independent of the current index.
   - Tests: Pearson chi-square test of independence and a permutation robustness check.
   - Permutation test: 2,000 random reorderings of the fixed observed sequence, seed `20260915`, with plus-one p-value `(extreme + 1) / (permutations + 1)`.

3. **Homogeneity over time**
   - Split the sequence into 100 consecutive, non-overlapping blocks of 1,000 observations.
   - H0: all blocks share the same 12-category distribution.
   - Test: Pearson chi-square test of homogeneity with `(100 - 1) x (12 - 1) = 1089` degrees of freedom.

## Reporting rules

- Preserve the complete sequence and analysis output.
- Report raw p-values, the `alpha = 0.05` decisions, Bonferroni decisions, expected-frequency diagnostics, and effect sizes.
- “Fail to reject” is not proof that selections are random or independent.
- If analytical and permutation independence tests disagree, prefer the permutation result as the robustness check and discuss the disagreement.

