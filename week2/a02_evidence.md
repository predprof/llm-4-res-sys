# A02 implementation evidence

Date: 2026-09-20

This ledger records checks performed by the AI assistant. It does not claim that the student personally performed them.

| Claim | Evidence | Result | Checked by |
|---|---|---|---|
| Both JavaScript files are syntactically valid | `node --check data.js && node --check script.js` with Node.js v23.7.0 | Passed | AI assistant |
| Cosine similarity is correct for a transparent example | Genres A = `{Action, Comedy}` and B = `{Action, Drama}`; dot product = 1 and both magnitudes are `sqrt(2)` | `1 / (sqrt(2) * sqrt(2)) = 0.5` | AI assistant |
| Jaccard baseline still works for the same example | One shared genre and three genres in the union | `1 / 3 = 0.333333...` | AI assistant |
| Zero-length genre vectors are handled | Automated assertion against `calculateCosineSimilarity(new Set(), second)` | Returned `0` without division by zero | AI assistant |
| MovieLens genres are parsed at the correct offset | Parsed `u.item` and asserted movie IDs 1 and 2 | Toy Story: Animation, Children's, Comedy; GoldenEye: Action, Adventure, Thriller | AI assistant |
| The UI can run both methods | Browser test through a local HTTP server, selecting Toy Story | Cosine: 1.000 and 0.866; Jaccard: 1.000 and 0.750 for the same two displayed candidates | AI assistant |
| Recommendations are numbered, sorted, and fully scored | Browser accessibility-tree check of the rendered ordered list for Toy Story | Items were numbered 1 and 2; cosine scores were 1.000 then 0.866, and Jaccard scores were 1.000 then 0.750 | AI assistant |
| Profile-based mode uses the complete rating history safely | Parsed `u.data` and ran `getProfileRecommendations(1)` | Loaded 100,000 ratings for 943 users; all five recommendations were absent from User 1's 272 rated items | AI assistant |
| User profiles average three movie genre vectors | Inspected User 1's three deterministic profile movies and `buildUserProfile` output | Comedy = 1, Romance = 1/3, Sci-Fi = 1/3; every other genre = 0 | AI assistant |
| Profile-based Top-5 is ordered and fully scored | Automated descending-order assertions plus browser accessibility-tree inspection | Five numbered unseen movies were rendered, each with score 0.905; equal-score ties were ordered alphabetically | AI assistant |
| The offline comparison is deterministic | Ran `node artifacts/compare_item_profile.js` twice and compared the complete JSON after removing only `generatedAt` | Outputs were identical | AI assistant |
| Item-to-item and profile-based methods were evaluated without using the held-out interaction | For every eligible user, selected the latest 5-star rating as the target and built both inputs only from earlier ratings | 917 of 943 users were eligible | AI assistant |
| The single-item method recovered more held-out targets in Top-5 | Recomputed `hitsAt5 / evaluatedUsers` from `artifacts/item_profile_results.json` | Single item: `13 / 917 = 0.014177` (1.418%); profile: `10 / 917 = 0.010905` (1.091%) | AI assistant |
| The methods usually returned different Top-5 lists | Recomputed overlap and exact-list equality across all eligible users | Mean overlap: `0.978 / 5` (19.564%); identical lists: `102 / 917` (11.123%) | AI assistant |
| Coverage fractions match the distinct recommended movie counts | Recomputed each distinct-count fraction using the 1,682-movie catalog | Single item: `505 / 1682 = 30.024%`; profile: `463 / 1682 = 27.527%` | AI assistant |
| The UI comparison reproduces the saved experiment case | `node artifacts/test_comparison_ui.js` plus browser execution for User 1 | Five-star held-out target, active movie, profile movies, both Top-5 lists, misses, scores, and full overlap matched the saved JSON | AI assistant |
| The UI clearly marks a successful held-out recommendation | Browser execution of comparison mode for User 8 | Both methods had Hit@5 `yes`; *Star Trek III: The Search for Spock (1984)* appeared at rank 2 with scores 1.000 and 0.927 | AI assistant |
| Each algorithm reports how it evaluates the target | Compared UI logic with the saved User 1 experiment case | Single item: cosine 0.500, positive-similarity rank 340; profile: cosine 0.577350, rank 297 | AI assistant |
| Browser and offline target ranks use the same parsing and tie-breaking | Investigation of a rank mismatch found engine-sensitive `localeCompare`, different Latin-1/Web TextDecoder mappings, and an offline exact-string genre check | Both paths now use the same TextDecoder, numeric genre parsing, and explicit code-point title ordering; browser and saved JSON both showed ranks 340 and 297 | AI assistant |
| Extra genre tags do not automatically increase cosine similarity | Controlled derivation plus `node artifacts/analyze_mainstream_bias.js` over every catalog movie for 917 user models | For one fixed shared genre, score is `1 / sqrt(query tags * candidate tags)`; empirical genre-count/score correlations were 0.003 and 0.037. Recommended items still averaged 2.10/2.73 genres versus 1.72 in the catalog, so multi-genre exposure enrichment exists without a general score boost | AI assistant |
| Recommendations show aggregate popularity enrichment but not universal mainstream domination | Used full-dataset rating count only as post-ranking metadata; defined high visibility as the catalog's top quartile (at least 80 ratings) | High-visibility exposure: catalog 25.1%, single item 33.0%, profile 42.6%; rating-count/recommendation-frequency correlations were only 0.040 and 0.105 | AI assistant |
| A declared niche-profile case contradicts the strong “every Top-5 item is mainstream” claim | Selected the eligible user with the lowest mean rating count across the three profile inputs before inspecting recommendations | User 707's input counts were 15, 8, and 4; both algorithms returned 0 of 5 top-quartile-popularity movies | AI assistant |
| The proposed self-similarity collapse condition is too permissive | `node artifacts/analyze_profile_collapse.js` compared each averaged profile with its three inputs | 902/917 users (98.4%) had all three values below the trivial self-similarity baseline of 1, so this condition does not distinguish ordinary averaging from harmful washout | AI assistant |
| Diverse inputs produce more hybrid centroid matches and omitted tastes | Sorted users by mean pairwise similarity among the three profile inputs and compared fixed-size extreme quartiles | Centroid-preferred Top-5 share was 47.1% versus 16.3%; at least one input was absent from all Top-5 genres for 57/230 diverse users versus 0/230 coherent users | AI assistant |
| The deterministic most-diverse case exhibits complete centroid hybridization | Selected the lowest-coherence user before inspecting recommendations; user ID broke ties | User 3 had three zero-similarity input pairs, and all 5 profile recommendations scored higher against the centroid than against every individual input | AI assistant |
| Top-5 recommendations exclude watched inputs | `node artifacts/run_report_checks.js` intersected every result with the history visible to that recommender | Comparison mode: 0 violations in 9,170 occurrences for 917 users; ordinary profile mode: 0 in 4,715 for 943 users | AI assistant |
| User 1's Top-5 popularity distribution is fully listed | Counted every movie's occurrences in `u.data`; declared high visibility as at least 80 ratings | Counts were 54, 180, 53, 86, and 102; 3/5 rather than all five were high visibility | AI assistant |
| Both cosine implementations normalize vectors | Executed binary-item and numeric-profile examples with raw dot product 1 and two magnitudes of `sqrt(2)` | Both returned 0.500 rather than raw dot product 1 | AI assistant |

## Failure and fix

- Symptom: the original parser mapped the `unknown` flag to `Action`, shifted every genre label, and omitted `Western`.
- Root cause: `genreNames` contains the 18 named genres, but parsing started at field 5, where MovieLens stores the separate `unknown` flag.
- Change: parse fields 6 through 23 with `fields.slice(6, 24)`.
- Confirmation: the automated data check produced the expected genre arrays for Toy Story and GoldenEye.

## Student verification still required

Before using this evidence in the report, the student should manually verify at least one calculation or browser result and describe that verification in their own words.

Suggested transparent check for the ordinary full-history profile mode for User 1:
the profile vector has nonzero values
`Comedy = 1`, `Romance = 1/3`, and `Sci-Fi = 1/3`. A Comedy-only candidate has
cosine score `1 / sqrt(1 + 1/9 + 1/9) = 3 / sqrt(11) = 0.904534...`, which
matches the displayed `0.905` after rounding.

## Item-to-item vs. profile-based experiment

Command:

```bash
node artifacts/compare_item_profile.js
```

Protocol: for each MovieLens user, order ratings by timestamp, hold out the latest
5-star rating that has at least three earlier ratings, and use only the
earlier ratings as training history. The single-item arm uses the genre vector of the
highest-rated training movie, with recency and movie ID as deterministic tie-breakers.
The profile arm averages the binary genre vectors of the three highest-rated training
movies. Both arms use cosine similarity, the same unseen candidate pool, Top-5 cutoff,
and deterministic title/movie-ID tie-breaking.

Measured aggregate results:

| Metric | Single active item | Aggregated profile |
|---|---:|---:|
| Hit Rate@5 | 0.014177 (13/917) | 0.010905 (10/917) |
| MRR@5 | 0.008270 | 0.005071 |
| NDCG@5 | 0.009765 | 0.006506 |
| Catalog coverage | 0.300238 (505/1682) | 0.275268 (463/1682) |

The mean Top-5 overlap was 0.978 movies, or 0.195638 of each five-item list.
Exactly 102 of 917 users (0.111232) had identical ordered Top-5 lists. For User 1,
the two Top-5 lists were identical, and neither method retrieved the held-out movie.
Across all users, the single-item method had three more hits and higher MRR@5 and
NDCG@5, although all accuracy values were very low.

The label “item-to-item” in this experiment means content similarity from one active
movie. It does not implement classical item-item collaborative filtering based on the
ratings of many users.

## Interactive comparison check

The method selector now includes `Experiment: single item vs. profile (5-star holdout)`. After a user
is selected, the page applies the same chronological holdout rule as the offline
script and displays:

- the held-out positive movie and number of earlier training ratings;
- the active movie and three profile movies;
- the target's cosine similarity and positive-similarity rank for each method;
- two numbered Top-5 lists with a score for every movie;
- Hit@5 for each method and the Top-5 overlap count;
- a visible marker if the held-out target occurs in either list.

The automated UI-logic check compares User 1 directly with
`artifacts/item_profile_results.json`. The browser check also exercised User 8 so
that the successful-target marker was tested rather than only the miss state.

The interface distinguishes the actual user rating from the algorithms' output:
the held-out movie has a real 5-star rating, while each recommender assigns a cosine
similarity from 0 to 1. The rank counts only candidates with positive similarity;
a zero-similarity target is shown as having no positive-similarity rank.

## Mainstream-domination diagnostic

Command:

```bash
node artifacts/analyze_mainstream_bias.js
```

The saved result is `artifacts/mainstream_bias_results.json`. Popularity is the
full MovieLens rating count and is used only to annotate already-generated rankings.
The high-visibility threshold is the top catalog quartile: at least 80 ratings.
User 1's shared Top-5 rating counts were 54, 180, 53, 86, and 102, so three of five
were high-visibility rather than all five. Across all users, high-visibility movies
formed 33.0% of single-item exposures and 42.6% of profile exposures versus 25.1%
of the catalog. User 707, chosen by the declared lowest-profile-popularity rule, had
zero high-visibility movies in either Top-5. These results support a bounded claim of
aggregate popularity enrichment, not the strong claim of universal mainstream
domination or direct popularity scoring. Recommended occurrences averaged 2.10
genres for single-item and 2.73 for profile scoring versus 1.72 in the catalog;
genre-count/recommendation-frequency correlations were 0.120 and 0.336. This
supports multi-genre exposure enrichment, especially for profiles, but the near-zero
genre-count/score correlations do not support the proposed automatic score increase.

## Profile-averaging collapse diagnostic

Command:

```bash
node artifacts/analyze_profile_collapse.js
```

The saved result is `artifacts/profile_collapse_results.json`. The original test's
self-similarity baseline marked 902/917 users, so a stronger diagnostic compared each
Top-5 candidate's profile score with its maximum score against any individual input.
For the lowest-coherence quartile, 47.1% of recommendation occurrences were preferred
by the centroid over every input, versus 16.3% for the highest-coherence quartile.
At least one input taste had zero similarity to every Top-5 item for 57/230 (24.8%)
low-coherence users and 0/230 high-coherence users. User 3, selected by the declared
minimum pairwise-similarity rule, had three mutually disjoint input genre vectors and
five of five centroid-preferred recommendations. This supports a bounded genre-space
hybridization/washout claim, not the subjective claim that every output is generic.

## Required report checks

Command:

```bash
node artifacts/run_report_checks.js
```

The saved result is `artifacts/report_check_results.json`. It records the zero-overlap
result for both experiment and ordinary profile modes, the five User 1 popularity
counts and 3/5 high-visibility result, and normalized cosine outputs of 0.500 for both
binary-item and numeric-profile implementations. It also preserves the Toy Story
cosine/Jaccard and User 1 full-history profile sanity cases quoted in the report.
