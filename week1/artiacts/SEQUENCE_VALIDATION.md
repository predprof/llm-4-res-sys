# Sequence validation results

The protocol in `SEQUENCE_EXPERIMENT_PROTOCOL.md` was saved before this one native run. The complete 100,000-index sequence is preserved in `random-sequence-100000.json`, and the full machine-readable analysis is in `sequence-analysis-100000.json`.

## Recorded sequence

- Menu order: `0 Pizza`, `1 Sushi`, `2 Burger`, `3 Salad`, `4 Tacos`, `5 Ramen`, `6 Sandwich`, `7 Pasta`, `8 Curry`, `9 Steak`, `10 Soup`, `11 BBQ`.
- First 20 indices: `[5, 1, 1, 9, 7, 10, 6, 3, 9, 8, 7, 5, 9, 1, 4, 0, 0, 11, 0, 1]`.
- Counts: `[8299, 8253, 8440, 8482, 8333, 8276, 8359, 8292, 8432, 8228, 8321, 8285]`.

## Test results

| Property and test | Statistic | df | p-value | Decision at 0.05 |
|---|---:|---:|---:|---|
| Marginal uniformity | 8.410160 | 11 | 0.676159 | Fail to reject H0 |
| Consecutive independence, analytical | 121.675700 | 121 | 0.465651 | Fail to reject H0 |
| Consecutive independence, permutation | 947/2,000 extreme | - | 0.473763 | Fail to reject H0 |
| Homogeneity across 100 blocks | 1134.894465 | 1089 | 0.162520 | Fail to reject H0 |

The decisions are also unchanged at the Bonferroni threshold `0.016667`. The permutation p-value uses the plus-one estimator and has Monte Carlo standard error `0.01116`. Failing to reject these hypotheses means that this sequence shows no detected marginal non-uniformity, first-order serial dependence, or block-level distribution shift; it does not prove randomness.

## Transition matrix

Cell `(i, j)` is the number of times index `j` immediately followed index `i`. The 144 cells sum to 99,999 transitions. The minimum expected frequency under independence is `677.01`, so the chi-square approximation is suitable.

| from / to | 0 Pizza | 1 Sushi | 2 Burger | 3 Salad | 4 Tacos | 5 Ramen | 6 Sandwich | 7 Pasta | 8 Curry | 9 Steak | 10 Soup | 11 BBQ | Row total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 Pizza | 701 | 672 | 720 | 685 | 690 | 691 | 687 | 650 | 680 | 717 | 729 | 677 | 8299 |
| 1 Sushi | 709 | 676 | 698 | 663 | 704 | 669 | 730 | 631 | 719 | 683 | 657 | 714 | 8253 |
| 2 Burger | 645 | 662 | 734 | 751 | 667 | 717 | 679 | 741 | 719 | 743 | 690 | 692 | 8440 |
| 3 Salad | 695 | 705 | 734 | 753 | 681 | 676 | 751 | 693 | 712 | 633 | 725 | 724 | 8482 |
| 4 Tacos | 696 | 668 | 695 | 723 | 700 | 678 | 694 | 675 | 728 | 703 | 697 | 676 | 8333 |
| 5 Ramen | 739 | 699 | 705 | 705 | 686 | 710 | 702 | 676 | 686 | 689 | 652 | 627 | 8276 |
| 6 Sandwich | 697 | 710 | 694 | 716 | 655 | 709 | 693 | 701 | 704 | 663 | 725 | 692 | 8359 |
| 7 Pasta | 684 | 725 | 705 | 684 | 715 | 656 | 676 | 701 | 667 | 690 | 691 | 698 | 8292 |
| 8 Curry | 707 | 683 | 698 | 696 | 689 | 758 | 729 | 686 | 728 | 667 | 670 | 721 | 8432 |
| 9 Steak | 656 | 692 | 680 | 689 | 701 | 685 | 653 | 735 | 675 | 702 | 656 | 704 | 8228 |
| 10 Soup | 673 | 688 | 717 | 716 | 728 | 657 | 679 | 716 | 724 | 646 | 696 | 680 | 8320 |
| 11 BBQ | 697 | 673 | 660 | 701 | 717 | 669 | 686 | 687 | 690 | 692 | 733 | 680 | 8285 |
| Column total | 8299 | 8253 | 8440 | 8482 | 8333 | 8275 | 8359 | 8292 | 8432 | 8228 | 8321 | 8285 | 99999 |

The first recorded index is 5 and the last is 10, explaining why the transition column total for Ramen is one below its marginal count and the transition row total for Soup is one below its marginal count.

## Temporal blocks

The sequence was reshaped into 100 consecutive blocks of exactly 1,000 observations. The `100 x 12` block table sums back to the marginal count vector, and its minimum expected cell frequency is `82.28`. The homogeneity test gives `p = 0.162520`, so no block-level distribution change is detected in this run.

## Reproduction

```bash
cd llm-4-res-sys/week1
node sequence-experiment.js 100000 random-sequence-100000.json
python3 sequence-analysis.py random-sequence-100000.json sequence-analysis-100000.json \
  --block-size 1000 --permutations 2000 --permutation-seed 20260915
```

Do not rerun the native sequence command to replace the preserved sample based on its p-values. Re-running only the analysis against the saved JSON is deterministic.
