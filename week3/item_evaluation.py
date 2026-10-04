"""Train-only item-neighborhood evaluation using the shared MovieLens protocol."""

from time import perf_counter

import numpy as np
import pandas as pd

import evaluation as ev


def item_similarity(data, method, common_threshold=50):
    """Cosine between item columns; default norms use only common raters."""
    if method not in ev.NEIGHBOR_METHODS:
        raise ValueError(f"Unknown item-neighborhood method: {method}")
    if method == "user_mean":
        filled = np.where(data.observed, data.values, data.user_means[:, None])
        norms = np.linalg.norm(filled, axis=0)
        denominator = norms[:, None] * norms[None, :]
        similarity = np.divide(
            filled.T @ filled, denominator,
            out=np.zeros((len(norms), len(norms))), where=denominator > 0,
        )
    else:
        # The mask includes a genuine observed zero. Matrix zeros are used for
        # arithmetic only; the mask determines which users rated both items.
        ratings = data.values
        observed = data.observed.astype(float)
        common = observed.T @ observed
        dot = ratings.T @ ratings
        left_norm_squared = (ratings * ratings).T @ observed
        denominator = np.sqrt(left_norm_squared * left_norm_squared.T)
        similarity = np.divide(
            dot, denominator, out=np.zeros_like(dot), where=denominator > 0,
        )
        similarity[common == 0] = 0
        if method == "common_weight":
            similarity *= ev.common_rating_weight(common, common_threshold)
    # There is no train evidence for a completely unseen item, even when its
    # imputed column is numerically nonzero.
    cold = data.item_counts == 0
    similarity[cold, :] = 0
    similarity[:, cold] = 0
    np.fill_diagonal(similarity, 0)
    return similarity


def score_item_neighborhood_grid(data, similarity, neighbor_counts):
    """Score from each user's real rated items; share sorting across K values."""
    counts = sorted(set(neighbor_counts))
    if not counts or counts[0] < 1:
        raise ValueError("neighbor_counts must contain positive integers")
    if similarity.shape != (len(data.item_ids), len(data.item_ids)):
        raise ValueError("Item similarity matrix has the wrong shape")
    results = {
        k: (ev.fallback_matrix(data), np.zeros_like(data.observed))
        for k in counts
    }
    for user in range(len(data.user_ids)):
        rated = np.flatnonzero(data.observed[user])
        if not len(rated):
            continue
        weights = similarity[:, rated]
        order = np.argsort(-weights, axis=1, kind="stable")[:, :min(counts[-1], len(rated))]
        chosen_weights = np.maximum(np.take_along_axis(weights, order, axis=1), 0)
        chosen_ratings = data.values[user, rated][order]
        weighted_sum = np.cumsum(chosen_weights * chosen_ratings, axis=1)
        weight_sum = np.cumsum(chosen_weights, axis=1)
        for k in counts:
            column = min(k, len(rated)) - 1
            denominator = weight_sum[:, column]
            usable = denominator > 0
            scores, supported = results[k]
            scores[user, usable] = weighted_sum[usable, column] / denominator[usable]
            supported[user, usable] = True
    for scores, _ in results.values():
        np.clip(scores, data.rating_min, data.rating_max, out=scores)
    return results


def score_item_neighborhood(data, similarity, neighbor_count=20):
    return score_item_neighborhood_grid(data, similarity, [neighbor_count])[neighbor_count]


def item_popularity_groups(data, scores, supported, holdout):
    """Paired test cases grouped by the target item's TRAIN rating count."""
    users, items = ev.holdout_positions(data, holdout)
    top_five = ev.top_k_items(data, scores, 5)
    cases = pd.DataFrame({
        "popularity": data.item_counts[items],
        "error": scores[users, items] - holdout.rating.to_numpy(dtype=float),
        "supported": supported[users, items],
        "relevant": holdout.rating.to_numpy() >= 4,
        "hit_at_five": np.any(top_five[users] == items[:, None], axis=1),
        "item_id": holdout.item_id.to_numpy(),
    })
    cases["group"] = pd.cut(
        cases.popularity, bins=[-1, 4, 19, 49, np.inf],
        labels=["0–4", "5–19", "20–49", "50+"],
    )
    rows = []
    for label in ["0–4", "5–19", "20–49", "50+"]:
        subset = cases.loc[cases.group == label]
        if subset.empty:
            continue
        relevant = subset.loc[subset.relevant]
        error = subset.error.to_numpy()
        rows.append({
            "train_item_ratings": label,
            "test_ratings": len(subset),
            "test_items": subset.item_id.nunique(),
            "MAE": float(np.mean(np.abs(error))),
            "RMSE": float(np.sqrt(np.mean(error * error))),
            "prediction_coverage": float(subset.supported.mean()),
            "relevant_test_ratings": len(relevant),
            "relevant_item_hit_rate@5": float(relevant.hit_at_five.mean()) if len(relevant) else np.nan,
        })
    return pd.DataFrame(rows)


def evaluate_item_method(data, test, method, neighbor_count=20,
                         common_threshold=50, factor_config=None,
                         return_details=False):
    """Evaluate one method with shared train-derived fallback and Top-5 pool."""
    start = perf_counter()
    if method in ev.NEIGHBOR_METHODS:
        similarity = item_similarity(data, method, common_threshold)
        scores, supported = score_item_neighborhood(data, similarity, neighbor_count)
    elif method == "matrix_factorization":
        model = ev.fit_factor_model(data, **(factor_config or {}))
        scores, supported = ev.score_factor_model(data, model)
    else:
        raise ValueError(method)
    metrics = ev.rating_metrics(data, scores, supported, test)
    ranking, per_user = ev.ranking_metrics(data, scores, test, cutoffs=(5,))
    metrics.update(ranking)
    groups = item_popularity_groups(data, scores, supported, test)
    metrics["runtime_seconds"] = perf_counter() - start
    if return_details:
        return metrics, groups, scores, per_user
    return metrics, groups
