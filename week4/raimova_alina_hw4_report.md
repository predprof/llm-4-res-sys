# Association Rules for Online Retail Baskets

**Student:** Raimova Alina  
**Team:** Individual  
**Email:** aaraimova@edu.hse.ru  
**Date:** 2026-10-06  
**Assignment:** Association Rules (Week 4, HW4)  
**Github link:** https://github.com/predprof/products-association-rules

## Abstract

This study asks whether products bought on the same invoice reveal useful retail association rules. It builds 17,080 invoice baskets from the UCI Online Retail data, implements FP-Growth in a browser app, and uses a notebook to compare Apriori, thresholds, and time periods. At 2% minimum support and 30% minimum confidence, 96 rules remain, all with lift above 1. A teacup rule is worth testing as a cross-sell recommendation, but historical co-purchases alone cannot establish that the recommendation will increase sales.

**Index Terms -** association rules, market basket analysis, FP-Growth, Apriori, cross-sell

## 1. Introduction

**Problem statement.**

The task is to turn invoice lines into baskets and find products bought together more often than expected. Each `InvoiceNo` is one transaction, `StockCode` identifies a product, and `Description` labels it. The app reports support, confidence, and lift for each selected rule.

**Motivation.**

A co-purchase count alone can be misleading when one product is common. A rule should be screened for both frequency and strength before a retailer considers a recommendation or bundle.

**Concrete example.**

Of 17,080 cleaned invoices, 541 contain both GREEN REGENCY TEACUP AND SAUCER [22697] and ROSES REGENCY TEACUP AND SAUCER [22699]. The analysis checks whether that pairing is strong enough to investigate and whether it persists later.

**Contributions.**

- Implement FP-Growth, rule generation, and support/confidence/lift display in the four-file browser app; its self-checks pass 11/11.
- Compare Apriori and FP-Growth in a separate executed notebook, then examine thresholds, rule direction, and a historical time split.

## 2. Related Work

The UCI record defines the source fields and notes that many customers are wholesalers [1]. Apriori searches frequent itemsets with candidate generation and downward-closure pruning [2], while FP-Growth mines conditional FP-trees without Apriori's candidate-generation step [3]. Randomized online experiments can estimate whether a proposed recommendation changes behavior, unlike retrospective association analysis [4]. The official documentation for the notebook's tools is listed in [5]–[7].

[1] D. Chen, “Online Retail,” *UCI Machine Learning Repository*, 2015, doi: 10.24432/C5BW33. [Online]. Available: [https://archive.ics.uci.edu/dataset/352/online+retail](https://archive.ics.uci.edu/dataset/352/online+retail). Accessed: Oct. 6, 2026.

[2] R. Agrawal and R. Srikant, “Fast Algorithms for Mining Association Rules in Large Databases,” in *Proc. 20th Int. Conf. Very Large Data Bases*, 1994, pp. 487–499. [Online]. Available: [https://www.vldb.org/conf/1994/P487.PDF](https://www.vldb.org/conf/1994/P487.PDF). Accessed: Oct. 6, 2026.

[3] J. Han, J. Pei, and Y. Yin, “Mining Frequent Patterns without Candidate Generation,” in *Proc. ACM SIGMOD Int. Conf. Management of Data*, 2000. [Online]. Available: [https://sigmodrecord.org/publications/sigmodRecord/0006/pdfs/Mining%20Frequent%20Patterns%20without%20Candidate%20Generation.pdf](https://sigmodrecord.org/publications/sigmodRecord/0006/pdfs/Mining%20Frequent%20Patterns%20without%20Candidate%20Generation.pdf). Accessed: Oct. 6, 2026.

[4] R. Kohavi, R. M. Henne, and D. Sommerfield, “Practical Guide to Controlled Experiments on the Web: Listen to Your Customers not to the HiPPO,” in *Proc. 13th ACM SIGKDD Int. Conf. Knowledge Discovery and Data Mining*, 2007. [Online]. Available: [https://ai.stanford.edu/~ronnyk/GuideControlledExperiments.pdf](https://ai.stanford.edu/~ronnyk/GuideControlledExperiments.pdf). Accessed: Oct. 6, 2026.

[5] Python Software Foundation, “Python 3.13 Documentation.” [Online]. Available: [https://docs.python.org/3.13/](https://docs.python.org/3.13/). Accessed: Oct. 6, 2026.

[6] pandas development team, “pandas Documentation.” [Online]. Available: [https://pandas.pydata.org/docs/](https://pandas.pydata.org/docs/). Accessed: Oct. 6, 2026.

[7] openpyxl project, “openpyxl Documentation.” [Online]. Available: [https://openpyxl.readthedocs.io/en/stable/](https://openpyxl.readthedocs.io/en/stable/). Accessed: Oct. 6, 2026.

**Alternatives considered.**

- **Apriori:** retained as a transparent baseline; it produced the same itemset counts as FP-Growth in the notebook.
- **Confidence-only selection:** rejected because it ignores the consequent's base rate; lift supplies that comparison.

## 3. Method

**Approach.**

The browser app mines frequent itemsets with FP-Growth and generates both directions of each nonempty rule split. For antecedent A, consequent B, and N baskets, support is `count(A∪B)/N`, confidence is `count(A∪B)/count(A)`, and lift is `confidence/[count(B)/N]`. Zero denominators produce an undefined metric rather than `NaN` or infinity.

**Pipeline.**

1. Start with the 541,909-row UCI workbook [1]. Remove cancellations and adjustments, nonpositive quantity or price, blank descriptions or customer IDs, and nonproduct codes; normalize stock codes and labels according to `readme.md`.
2. Group by `InvoiceNo`, deduplicate `StockCode` within each invoice, and exclude baskets with fewer than two distinct items. The conceptual invoice–item matrix has **17,080 rows**, **3,653 product columns**, and **384,911 present invoice–item cells**; `transactions.js` stores it compactly.
3. Mine itemsets, generate directed rules, and report their counts and metrics. Screen at support **≥2%** (at least **342** joint invoices), confidence **≥30%**, and lift **>1**.
4. Reconstruct dated baskets from the original workbook's `InvoiceDate` and compare January–August 2011 with September–November 2011. The app export has no dates, so the notebook uses the original dates; none were simulated.

**Tools and libraries.**

- Plain browser JavaScript runs the four-file app without a build step; the browser version was not recorded.
- Python **3.13.7** [5] runs the analysis notebook and mining benchmarks.
- pandas **3.0.3** [6] and openpyxl **3.1.5** [7] read and clean the original workbook for the time check.

**Key design decisions.**

- **Basket identity:** one `InvoiceNo` is one transaction, and repeated stock lines count once; this measures invoice co-occurrence, not quantities sold.
- **Thresholds:** 2% support keeps at least 342 joint invoices, while 30% confidence leaves 96 rules to inspect; the notebook's sweep shows how looser and stricter values change that number.
- **Time check:** the teacup rule was chosen on the full dataset before its later-period check; other product checks are exploratory and are not substituted after seeing the results.

**Configuration.**

The notebook used the same 17,080 loaded baskets for both algorithms. Its 1% benchmark requires 171 baskets, uses deterministic item ordering and no random seed, alternates method order over five timing repeats, and excludes data loading. Peak `tracemalloc` allocation is measured in separate runs, not as total process RAM. The notebook ran on Darwin; CPU and total RAM were not recorded. December 2010 and incomplete December 2011 are excluded from the two full-month comparison periods.

## 4. Experiments

### 4.1 Apriori versus FP-Growth

**Setup.**

The saved notebook output and a fresh execution of all its code cells compared posting-set Apriori with FP-Growth on the same baskets at 1% support. Each mining time is the median of five runs; traced peak allocation comes from a separate run. The browser app's 11 self-checks were also rerun against its five-basket fixture.

**Results.**

**Table 1. Frequent-itemset benchmark at 1% support.** Both timing columns are notebook-code results; the first is saved in the notebook and the second is the fresh rerun for this report.

| Algorithm | Itemsets | Saved median | Fresh median | Peak traced allocation in both runs |
|---|---:|---:|---:|---:|
| Apriori | 1,219 | 1.899 s | 1.251 s | 28.6 MiB |
| FP-Growth | 1,219 | 1.103 s | 0.617 s | 59.5 MiB |

Both methods returned exactly the same itemsets and counts in both executions. FP-Growth was faster in both, while Apriori used less traced memory. Absolute times changed between executions; the comparison is specific to these Python implementations, and execution conditions were not fully recorded.

### 4.2 Thresholds, useful and misleading rules, and direction

**Setup.**

The notebook first mined at 0.5% support, then applied several support and confidence filters to the same candidate rules. The chosen screen was 2% support, 30% confidence, and lift >1. Rule counts come from the notebook; the three rule examples were also checked against the app's basket counts.

**Results.**

At 0.5% support, the notebook found 5,255 itemsets and 21,026 possible directed rules. Its histograms show **20,918** candidate rules below 2% support and **10,303** below 30% confidence. Table 2 shows the trade-off; every listed rule had lift >1.

**Table 2. Threshold sweep from the notebook.**

| Support | Confidence | Itemsets | Rules |
|---:|---:|---:|---:|
| 0.5% | 30% | 5,255 | 10,723 |
| 1% | 30% | 1,219 | 950 |
| 2% | 30% | 294 | 96 |
| 3% | 30% | 115 | 12 |
| 2% | 60% | 294 | 20 |

Raising support removes rare itemsets and their possible rules because a superset cannot be more frequent than its subsets. Raising confidence leaves the itemsets unchanged but removes weaker directions. Lower thresholds reveal more niche combinations and more noise; higher thresholds are easier to review but may hide useful niche patterns. The 2%/30% setting is a practical screening choice, not a universal optimum.

**Table 3. Useful and misleading examples across all 17,080 baskets.** Counts are invoices, not units.

| Judgment and rule | count(A) | count(B) | Both | Support | Confidence | Lift |
|---|---:|---:|---:|---:|---:|---:|
| **Investigate:** GREEN REGENCY TEACUP AND SAUCER [22697] → ROSES REGENCY TEACUP AND SAUCER [22699] | 691 | 780 | 541 | 3.17% | 78.29% | 17.14 |
| **Reject:** ALARM CLOCK BAKELIKE RED [22727] → WHITE HANGING HEART T-LIGHT HOLDER [85123A] | 877 | 1,959 | 98 | 0.57% | 11.17% | 0.97 |

The teacup pair has 541 joint invoices, passes the screen, and has lift far above 1, so it is worth investigating as a cross-sell. The clock-to-holder rule has 98 co-purchases but fails all three filters. The holder occurs in **11.47%** of all baskets, slightly *more* than its **11.17%** confidence after a red clock; the raw co-purchase count is therefore misleading. Because even the most common item occurs in only 11.47% of baskets, these data do not provide a high-confidence, near-unit-lift rule among the chosen high-confidence rules.

For rule direction, **JUMBO BAG PINK POLKADOT [22386] → JUMBO BAG RED RETROSPOT [85099B]** has confidence **546/869 = 62.83%**. Reverse it and confidence becomes **546/1,584 = 34.47%**. Both directions have **3.20% support** and **6.77 lift**: the shared numerator is unchanged, but confidence uses a different antecedent count.

As a transparent metric check, the teacup support is `541/17,080 = 3.1674%`, confidence is `541/691 = 78.2923%`, and lift is `(541/691)/(780/17,080) = 17.1440`. These inputs matched direct app counts.

### 4.3 Later-period validation and intervention plan

**Setup.**

The notebook rebuilt dated baskets from the original workbook and confirmed their multiset exactly matches `transactions.js`. It checked the preselected teacup rule in January–August 2011 versus September–November 2011; 1,981 invoices in December 2010 and December 2011 lie outside those full-month periods. Other product pairs were checked only as exploratory comparisons.

**Results.**

**Table 4. Teacup rule in earlier and later full-month periods.**

| Period | Baskets | Green A | Roses B | Both | Support | Confidence | Lift |
|---|---:|---:|---:|---:|---:|---:|---:|
| Jan–Aug 2011 | 9,220 | 448 | 506 | 360 | 3.90% | 80.36% | 14.64 |
| Sep–Nov 2011 | 5,879 | 192 | 218 | 144 | 2.45% | 75.00% | 20.23 |

The aggregate later period still passes 2% support, 30% confidence, and lift >1, with 144 joint invoices. Confidence fell **5.36 percentage points**; its approximate 95% change interval is **−12.50 to +1.79 points**, so a drop exceeding 10 points cannot be ruled out. November alone had **1.70% support**, below the threshold. This is a retrospective check, not an independent held-out evaluation, because the rule was selected using the full dataset. Exploratory checks found pink → red jumbo-bag confidence of 63.35% earlier and 62.32% later, while red → green alarm-clock confidence rose from 48.77% to 72.24%.

A controlled cross-sell test would randomly assign eligible customers, after they add the green teacup without the roses teacup, 50/50 to control or treatment. Treatment shows the roses teacup in the existing recommendation slot; control shows the current item in that slot, with identical prices and promotions. The primary outcome is roses-teacup purchases per eligible checkout, with gross margin, green-teacup checkout completion, and returns as guardrails. A pilot should estimate the eligible-session baseline and set sample size for 80% power against a prespecified business-relevant effect; deploy only if the planned run gives an incremental attach-rate 95% interval above zero without material guardrail harm [4]. **No live experiment was run.** The observed 75% basket confidence is not an eligible-session control rate because the dataset does not record add-to-cart order.

## 5. Discussion

**Failure case.**

Date reconstruction found **30 `InvoiceNo` values with more than one `InvoiceDate`**, at most one minute apart. Therefore, assigning an invoice date by assuming every line has the same timestamp would be unsafe.

**Root cause.**

The raw workbook records line-level timestamps, and those 30 invoices contain more than one timestamp. The evidence identifies this inconsistency; it does not establish why those timestamps differ.

**Fix and verification.**

The notebook assigns the earliest timestamp to each invoice, verifies that all affected invoices remain in the same month, and confirms that the reconstructed basket multiset exactly matches the app data. The later-period split therefore uses real source dates without changing basket membership.

**What worked.**

- FP-Growth and Apriori produced identical 1% itemsets; the 2%/30% screen reduced 950 rules at 1%/30% to 96 with at least 342 joint invoices each.
- Lift helped reject a co-purchase count that looked substantial in isolation. Lift **17.14** for the teacups means roughly 17 times the co-occurrence expected under independence, **not** 17 times more sales from a recommendation. Wholesalers may buy matching colors, or shared promotion and placement may explain the association. A randomized test is needed to estimate an intervention's causal effect [4].

**What surprised me or did not work.**

- The later-period aggregate teacup rule passed, but November support fell below 2%; the selected rule is not stable by every month. FP-Growth also used more traced memory despite its shorter mining time.
- Metric lift can be not so clear for understandong, so we need to take into account the range of rules, such as support and confidence.

## 6. AI Usage Disclosure

- **AI tools used:** Codex desktop agent; exact model/version and any other tools require confirmation from the authentic session export.
- **How AI was used:** assisted with JavaScript implementation, notebook analysis and debugging, interpretation, reference checks, and this report draft.
- **What I personally verified:** examples selection, metric and calculations, statistics.
- **What I trusted without full verification:** writing code.
- **Session log reference:** The authentic `raimova_alina_hw4_session.json` export is **not attached to this draft**. Add only the unmodified tool-native export; do not reconstruct it.


## References

See §2 (numbered [1]–[7]).
