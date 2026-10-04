"""Focused checks for the evaluation protocol and missing-data behavior."""

import unittest

import numpy as np
import pandas as pd

from evaluation import (
    build_training_data,
    chronological_split,
    co_rated_similarity,
    common_rating_weight,
    fit_factor_model,
    ranking_metrics,
    score_factor_model,
    score_neighborhood,
    top_k_items,
    user_similarity,
)


def rows(records):
    return pd.DataFrame(records, columns=["user_id", "item_id", "rating", "timestamp"])


class EvaluationTests(unittest.TestCase):
    def test_chronological_split_uses_item_id_for_timestamp_ties(self):
        history = rows([
            (1, 4, 4, 4), (1, 3, 3, 3),
            (1, 2, 2, 1), (1, 1, 1, 1),
        ])
        train, validation, test = chronological_split(history, 0.5, 0.25)
        self.assertEqual(train.item_id.tolist(), [1, 2])
        self.assertEqual(validation.item_id.tolist(), [3])
        self.assertEqual(test.item_id.tolist(), [4])

    def test_real_zero_is_observed_and_missing_is_separate(self):
        train = rows([(1, 1, 0, 1), (1, 2, 4, 2),
                      (2, 1, 5, 1), (2, 2, 4, 2)])
        data = build_training_data(train, [1, 2], [1, 2, 3])
        self.assertTrue(data.observed[0, 0])
        self.assertEqual(data.values[0, 0], 0)
        self.assertFalse(data.observed[0, 2])
        self.assertEqual(data.user_means[0], 2)
        self.assertEqual(co_rated_similarity(data)[1][0, 1], 2)
        filled = np.where(data.observed, data.values, data.user_means[:, None])
        self.assertEqual(filled[0, 0], 0)
        self.assertEqual(filled[0, 2], 2)

    def test_means_and_models_use_training_only(self):
        history = rows([
            (1, 1, 2, 1), (1, 2, 4, 2), (1, 3, 5, 3), (1, 4, 1, 4),
            (2, 1, 3, 1), (2, 2, 5, 2), (2, 3, 1, 3), (2, 4, 4, 4),
        ])
        train, validation, test = chronological_split(history, 0.5, 0.25)
        data = build_training_data(train, [1, 2], [1, 2, 3, 4])
        self.assertEqual(len(train), 4)
        self.assertEqual(len(validation), 2)
        self.assertEqual(len(test), 2)
        self.assertEqual(data.user_means[0], 3)
        self.assertFalse(data.observed[0, 2])
        self.assertFalse(data.observed[0, 3])
        baseline_similarity = user_similarity(data, "user_mean")
        baseline_model = fit_factor_model(data, rank=2, epochs=4, seed=7)
        changed_history = history.copy()
        changed_history.loc[changed_history.timestamp >= 3, "rating"] = 0
        changed_train, changed_validation, changed_test = chronological_split(
            changed_history, 0.5, 0.25
        )
        changed_data = build_training_data(changed_train, [1, 2], [1, 2, 3, 4])
        pd.testing.assert_frame_equal(train, changed_train)
        np.testing.assert_array_equal(data.values, changed_data.values)
        np.testing.assert_array_equal(baseline_similarity, user_similarity(changed_data, "user_mean"))
        changed_model = fit_factor_model(changed_data, rank=2, epochs=4, seed=7)
        np.testing.assert_array_equal(baseline_model.user_bias, changed_model.user_bias)
        np.testing.assert_array_equal(baseline_model.user_factors, changed_model.user_factors)
        self.assertNotEqual(changed_validation.rating.tolist(), validation.rating.tolist())
        self.assertNotEqual(changed_test.rating.tolist(), test.rating.tolist())

    def test_common_weight_boundary_values(self):
        self.assertAlmostEqual(float(common_rating_weight(3, 50)), 0.06)
        self.assertAlmostEqual(float(common_rating_weight(40, 50)), 0.8)
        self.assertEqual(float(common_rating_weight(50, 50)), 1.0)
        self.assertEqual(float(common_rating_weight(80, 50)), 1.0)
        self.assertAlmostEqual(float(common_rating_weight(3, 10)), 0.3)

    def test_no_usable_neighbors_uses_train_fallback(self):
        train = rows([(1, 1, 5, 1), (2, 2, 3, 1)])
        data = build_training_data(train, [1, 2], [1, 2, 3])
        similarity = user_similarity(data, "co_rated")
        self.assertEqual(similarity[0, 1], 0)
        scores, supported = score_neighborhood(data, similarity, neighbor_count=1)
        self.assertFalse(supported[0, 1])
        self.assertFalse(supported[0, 2])
        self.assertEqual(scores[0, 1], 3)  # item mean for item 2
        self.assertEqual(scores[0, 2], 5)  # user mean for unseen item 3

    def test_ranking_excludes_training_items(self):
        data = build_training_data(rows([(1, 1, 5, 1)]), [1], [1, 2, 3])
        scores = np.array([[5.0, 4.0, 3.0]])
        ranked = top_k_items(data, scores, k=2)
        self.assertEqual(ranked.tolist(), [[1, 2]])

    def test_ranking_metrics_at_five(self):
        data = build_training_data(rows([(1, 1, 5, 1)]), [1], range(1, 13))
        scores = np.array([[100.0] + list(range(11, 0, -1))])
        holdout = rows([(1, 2, 4, 2), (1, 7, 5, 3)])
        metrics, details = ranking_metrics(data, scores, holdout)
        ideal = 1 + 1 / np.log2(3)
        self.assertEqual(details["n_relevant"].tolist(), [2])
        self.assertEqual(metrics["Recall@5"], 0.5)
        self.assertAlmostEqual(metrics["NDCG@5"], 1 / ideal)
        self.assertNotIn("Recall@10", metrics)


if __name__ == "__main__":
    unittest.main()
