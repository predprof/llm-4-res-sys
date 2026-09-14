# Uniformity validation experiment

## Confirmatory protocol

The protocol was fixed before generating the confirmatory sample:

- invoke the application's registered click handler 100,000 times;
- test 12 categories against equal probabilities of `1/12`;
- use a chi-square goodness-of-fit test with `alpha = 0.05`;
- run the confirmatory sample once and preserve its result regardless of the p-value.

The experiment uses `distribution-test.js 100000` to exercise the same random-index
expression and registered handler as `script.js`. The observed counts are stored in
`confirmatory-distribution-100000.json`.

## Confirmatory result

The expected count was `100000 / 12 = 8333.333` for every menu item. The test gave:

- chi-square statistic: `31.47704`;
- degrees of freedom: `11`;
- p-value: `0.0009248233`;
- critical value at `alpha = 0.05`: `19.67514`.

The confirmatory sample rejects the uniform null hypothesis at the chosen significance
level, reproducing the direction of the original 1,000-selection result.

## Test-harness validation

`harness-validation.js` replaces `Math.random` with the same seeded generator in two
paths: direct index calculation and the application's registered click handler. Their
100,000-selection count vectors matched exactly. This checks that the DOM test harness
does not change the mapping from random values to menu items.

An additional diagnostic, not a replacement for the pre-specified confirmatory result,
used the direct expression `Math.floor(Math.random() * 12)` for 1,000,000 selections.
It produced `chi-square = 11.796104`, `df = 11`, and `p = 0.379163`, which did not reject
uniformity.

## Interpretation

The confirmatory sample validates that the first rejection was reproducible in one new
pre-specified run. It does not by itself prove a persistent defect in `Math.random` or
the index formula. The deterministic harness comparison and the separate million-draw
diagnostic found no mapping error. A future investigation should pre-specify multiple
independent batches and analyze their rejection rate rather than rerunning until a
preferred p-value appears.
