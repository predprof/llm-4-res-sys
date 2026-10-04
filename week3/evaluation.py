"""Reproducible, train-only evaluation for MovieLens-style explicit ratings."""

from dataclasses import dataclass
from time import perf_counter

import numpy as np
import pandas as pd


NEIGHBOR_METHODS = ("co_rated", "user_mean", "common_weight")


def chronological_split(ratings, train_fraction=0.70, validation_fraction=0.15):
    """Split each user's ratings by timestamp, breaking ties by item ID."""
    if not 0 < train_fraction < 1 or not 0 < validation_fraction < 1 - train_fraction:
        raise ValueError("Fractions must leave room for a test set")
    ordered = ratings.sort_values(
        ["user_id", "timestamp", "item_id"], kind="mergesort"
    )
    train_parts, validation_parts, test_parts = [], [], []
    for _, history in ordered.groupby("user_id", sort=False):
        size = len(history)
        if size >= 3:
            train_end = min(max(1, int(size * train_fraction)), size - 2)
            validation_size = min(max(1, int(size * validation_fraction)), size - train_end - 1)
        elif size == 2:
            train_end, validation_size = 1, 0
        else:
            train_end, validation_size = size, 0
        train_parts.append(history.iloc[:train_end])
        validation_parts.append(history.iloc[train_end:train_end + validation_size])
        test_parts.append(history.iloc[train_end + validation_size:])
    columns = ratings.columns
    def combine(parts):
        return pd.concat(parts, ignore_index=True)[columns]
    return combine(train_parts), combine(validation_parts), combine(test_parts)


@dataclass
class TrainingData:
    train: pd.DataFrame
    user_ids: np.ndarray
    item_ids: np.ndarray
    user_index: dict
    item_index: dict
    values: np.ndarray
    observed: np.ndarray
    user_counts: np.ndarray
    item_counts: np.ndarray
    user_means: np.ndarray
    item_means: np.ndarray
    global_mean: float
    rating_min: float
    rating_max: float
    event_users: np.ndarray
    event_items: np.ndarray
    event_ratings: np.ndarray


def build_training_data(train, all_user_ids, all_item_ids):
    """Build values and a separate observed mask so a real zero stays observed."""
    if train.empty:
        raise ValueError("Training ratings cannot be empty")
    user_ids = np.asarray(sorted(set(all_user_ids)), dtype=int)
    item_ids = np.asarray(sorted(set(all_item_ids)), dtype=int)
    user_index = {int(identifier): position for position, identifier in enumerate(user_ids)}
    item_index = {int(identifier): position for position, identifier in enumerate(item_ids)}
    event_users = train.user_id.map(user_index).to_numpy(dtype=int)
    event_items = train.item_id.map(item_index).to_numpy(dtype=int)
    if np.any(pd.isna(event_users)) or np.any(pd.isna(event_items)):
        raise ValueError("Training IDs must belong to the supplied catalog")
    event_ratings = train.rating.to_numpy(dtype=float)
    shape = (len(user_ids), len(item_ids))
    values = np.zeros(shape, dtype=float)
    observed = np.zeros(shape, dtype=bool)
    if len(set(zip(event_users, event_items))) != len(train):
        raise ValueError("Duplicate user-item ratings")
    values[event_users, event_items] = event_ratings
    observed[event_users, event_items] = True
    user_counts = observed.sum(axis=1)
    item_counts = observed.sum(axis=0)
    global_mean = float(event_ratings.mean())
    user_means = np.divide(
        values.sum(axis=1), user_counts,
        out=np.full(len(user_ids), global_mean), where=user_counts > 0,
    )
    item_means = np.divide(
        values.sum(axis=0), item_counts,
        out=np.full(len(item_ids), global_mean), where=item_counts > 0,
    )
    return TrainingData(
        train.copy(), user_ids, item_ids, user_index, item_index,
        values, observed, user_counts, item_counts, user_means, item_means,
        global_mean, float(event_ratings.min()), float(event_ratings.max()),
        event_users, event_items, event_ratings,
    )


def common_rating_weight(n_common, threshold=50):
    """Linear significance weight, capped at one; threshold is configurable."""
    if threshold <= 0:
        raise ValueError("threshold must be positive")
    return np.minimum(np.asarray(n_common, dtype=float) / threshold, 1.0)


def co_rated_similarity(data):
    """Cosine similarity with pair-specific norms over shared observed items."""
    values = data.values
    mask = data.observed.astype(float)
    common = mask @ mask.T
    dot = values @ values.T
    left_norm_squared = (values * values) @ mask.T
    denominator = np.sqrt(left_norm_squared * left_norm_squared.T)
    similarity = np.divide(dot, denominator, out=np.zeros_like(dot), where=denominator > 0)
    similarity[common == 0] = 0
    np.fill_diagonal(similarity, 0)
    return similarity, common


def user_similarity(data, method, common_threshold=50):
    if method not in NEIGHBOR_METHODS:
        raise ValueError(f"Unknown neighborhood method: {method}")
    if method == "user_mean":
        filled = np.where(data.observed, data.values, data.user_means[:, None])
        norms = np.linalg.norm(filled, axis=1)
        denominator = norms[:, None] * norms[None, :]
        similarity = np.divide(
            filled @ filled.T, denominator,
            out=np.zeros((len(norms), len(norms))), where=denominator > 0,
        )
        np.fill_diagonal(similarity, 0)
        return similarity
    similarity, common = co_rated_similarity(data)
    if method == "common_weight":
        similarity *= common_rating_weight(common, common_threshold)
    return similarity


def fallback_matrix(data):
    """Item train mean, then user train mean for an item unseen in train."""
    return np.where(
        data.item_counts[None, :] > 0,
        data.item_means[None, :], data.user_means[:, None],
    ).copy()


def score_neighborhood(data, similarity, neighbor_count=20):
    """Weighted average of observed neighbor ratings; return scores and support mask."""
    if neighbor_count < 1:
        raise ValueError("neighbor_count must be positive")
    scores = fallback_matrix(data)
    supported = np.zeros_like(data.observed)
    neighbor_order = np.argsort(-similarity, axis=1, kind="stable")[:, :neighbor_count]
    for user in range(len(data.user_ids)):
        neighbors = neighbor_order[user]
        weights = similarity[user, neighbors]
        positive = weights > 0
        neighbors, weights = neighbors[positive], weights[positive]
        if not len(neighbors):
            continue
        numerator = weights @ data.values[neighbors]
        denominator = weights @ data.observed[neighbors].astype(float)
        usable = denominator > 0
        scores[user, usable] = numerator[usable] / denominator[usable]
        supported[user, usable] = True
    np.clip(scores, data.rating_min, data.rating_max, out=scores)
    return scores, supported


@dataclass
class FactorModel:
    user_bias: np.ndarray
    item_bias: np.ndarray
    user_factors: np.ndarray
    item_factors: np.ndarray


def fit_factor_model(data, rank=12, regularization=0.05, epochs=40,
                     learning_rate=0.15, seed=42):
    """Regularized, bias-aware factorization fitted on observed train events only."""
    if rank < 1 or epochs < 1 or regularization < 0 or learning_rate <= 0:
        raise ValueError("Invalid factorization hyperparameters")
    rng = np.random.default_rng(seed)
    user_count, item_count = data.values.shape
    user_factors = rng.normal(0, 0.10, size=(user_count, rank))
    item_factors = rng.normal(0, 0.10, size=(item_count, rank))
    user_bias = np.zeros(user_count)
    item_bias = np.zeros(item_count)
    users, items, ratings = data.event_users, data.event_items, data.event_ratings
    user_denominator = np.maximum(data.user_counts, 1)[:, None]
    item_denominator = np.maximum(data.item_counts, 1)[:, None]
    for epoch in range(epochs):
        estimate = (data.global_mean + user_bias[users] + item_bias[items]
                    + np.sum(user_factors[users] * item_factors[items], axis=1))
        error = ratings - estimate
        user_factor_gradient = np.column_stack([
            np.bincount(users, weights=error * item_factors[items, factor], minlength=user_count)
            for factor in range(rank)
        ]) / user_denominator
        item_factor_gradient = np.column_stack([
            np.bincount(items, weights=error * user_factors[users, factor], minlength=item_count)
            for factor in range(rank)
        ]) / item_denominator
        step = learning_rate / (1 + epoch * 0.03)
        user_bias += step * (
            np.bincount(users, weights=error, minlength=user_count) / user_denominator[:, 0]
            - regularization * user_bias
        )
        item_bias += step * (
            np.bincount(items, weights=error, minlength=item_count) / item_denominator[:, 0]
            - regularization * item_bias
        )
        user_factors += step * (user_factor_gradient - regularization * user_factors)
        item_factors += step * (item_factor_gradient - regularization * item_factors)
    return FactorModel(user_bias, item_bias, user_factors, item_factors)


def score_factor_model(data, model):
    scores = (data.global_mean + model.user_bias[:, None] + model.item_bias[None, :]
              + model.user_factors @ model.item_factors.T)
    supported = (data.user_counts[:, None] > 0) & (data.item_counts[None, :] > 0)
    scores = np.where(supported, scores, fallback_matrix(data))
    np.clip(scores, data.rating_min, data.rating_max, out=scores)
    return scores, supported


def holdout_positions(data, holdout):
    users = holdout.user_id.map(data.user_index).to_numpy(dtype=int)
    items = holdout.item_id.map(data.item_index).to_numpy(dtype=int)
    return users, items


def rating_metrics(data, scores, supported, holdout):
    users, items = holdout_positions(data, holdout)
    truth = holdout.rating.to_numpy(dtype=float)
    predictions = scores[users, items]
    error = predictions - truth
    return {
        "MAE": float(np.mean(np.abs(error))),
        "RMSE": float(np.sqrt(np.mean(error * error))),
        "prediction_coverage": float(supported[users, items].mean()),
    }


def top_k_items(data, scores, k=5):
    """Rank all catalog items absent from each user's TRAIN history."""
    candidate_scores = scores.copy()
    candidate_scores[data.observed] = -np.inf
    order = np.argsort(-candidate_scores, axis=1, kind="stable")[:, :k]
    return order


def ranking_metrics(data, scores, holdout, cutoffs=(5,)):
    """Compute cutoffs from one ranking of unseen training items.

    Recommendation coverage uses the largest requested cutoff.
    """
    if not cutoffs or any(k < 1 for k in cutoffs):
        raise ValueError("cutoffs must contain positive integers")
    top_items = top_k_items(data, scores, max(cutoffs))
    relevant = holdout.loc[holdout.rating >= 4, ["user_id", "item_id"]]
    relevance_by_user = {
        data.user_index[int(user_id)]: set(group.item_id.map(data.item_index))
        for user_id, group in relevant.groupby("user_id")
    }
    discounts = 1 / np.log2(np.arange(2, max(cutoffs) + 2))
    per_user = []
    for user_position, user_id in enumerate(data.user_ids):
        positives = relevance_by_user.get(user_position, set())
        if not positives:
            continue
        hits = np.fromiter(
            (item in positives for item in top_items[user_position]),
            dtype=bool, count=max(cutoffs),
        )
        result = {
            "user_id": int(user_id),
            "n_relevant": len(positives),
        }
        for cutoff in cutoffs:
            ideal = discounts[:min(len(positives), cutoff)].sum()
            result[f"Recall@{cutoff}"] = float(hits[:cutoff].sum() / len(positives))
            result[f"NDCG@{cutoff}"] = float(
                (hits[:cutoff] * discounts[:cutoff]).sum() / ideal
            )
        per_user.append(result)
    details = pd.DataFrame(per_user)
    metrics = {key: float(details[key].mean()) for cutoff in cutoffs
               for key in (f"Recall@{cutoff}", f"NDCG@{cutoff}")}
    metrics.update({
        "recommendation_coverage": float(len(np.unique(top_items)) / len(data.item_ids)),
        "ranking_users": len(details),
    })
    return metrics, details


def history_groups(data, scores, holdout, ranking_details):
    """Paired cohorts defined only from train history lengths."""
    boundaries = [-1, 19, 49, 99, np.inf]
    labels = ["1–19", "20–49", "50–99", "100+"]
    user_groups = pd.Series(
        pd.cut(data.user_counts, bins=boundaries, labels=labels),
        index=data.user_ids,
    )
    users, items = holdout_positions(data, holdout)
    prediction_rows = pd.DataFrame({
        "user_id": holdout.user_id.to_numpy(),
        "error": scores[users, items] - holdout.rating.to_numpy(),
    })
    prediction_rows["group"] = prediction_rows.user_id.map(user_groups)
    ranking_rows = ranking_details.copy()
    ranking_rows["group"] = ranking_rows.user_id.map(user_groups)
    results = []
    for label in labels:
        subset = prediction_rows.loc[prediction_rows.group == label]
        ranked = ranking_rows.loc[ranking_rows.group == label]
        if subset.empty:
            continue
        results.append({
            "train_history": label,
            "users": int((user_groups == label).sum()),
            "test_ratings": len(subset),
            "RMSE": float(np.sqrt(np.mean(subset.error.to_numpy() ** 2))),
            "Recall@5": float(ranked["Recall@5"].mean()) if len(ranked) else np.nan,
            "NDCG@5": float(ranked["NDCG@5"].mean()) if len(ranked) else np.nan,
        })
    return pd.DataFrame(results)


def evaluate_method(data, test, method, neighbor_count=20, common_threshold=50,
                    factor_config=None, return_details=False):
    """Time fitting, prediction and metric computation, excluding data loading."""
    start = perf_counter()
    if method in NEIGHBOR_METHODS:
        similarity = user_similarity(data, method, common_threshold)
        scores, supported = score_neighborhood(data, similarity, neighbor_count)
    elif method == "matrix_factorization":
        model = fit_factor_model(data, **(factor_config or {}))
        scores, supported = score_factor_model(data, model)
    else:
        raise ValueError(method)
    metrics = rating_metrics(data, scores, supported, test)
    rank_metrics, per_user = ranking_metrics(data, scores, test)
    metrics.update(rank_metrics)
    groups = history_groups(data, scores, test, per_user)
    metrics["runtime_seconds"] = perf_counter() - start
    if return_details:
        return metrics, groups, scores, per_user
    return metrics, groups
