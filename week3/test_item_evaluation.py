"""Focused checks for item-neighborhood evaluation and train-only evidence."""

import unittest

import numpy as np
import pandas as pd

import evaluation as ev
import item_evaluation as item_ev


def rows(records):
    return pd.DataFrame(records, columns=["user_id", "item_id", "rating", "timestamp"])


class ItemEvaluationTests(unittest.TestCase):
    def test_mean_imputation_uses_only_train_user_means(self):
        train = rows([(1, 1, 1, 1), (1, 2, 5, 2),
                      (2, 1, 5, 1), (2, 3, 5, 2)])
        data = ev.build_training_data(train, [1, 2], [1, 2, 3])
        self.assertEqual(data.user_means[0], 3)
        self.assertFalse(data.observed[0, 2])
        filled = np.array([[1., 5., 3.], [5., 5., 5.]])
        expected = np.dot(filled[:, 1], filled[:, 2]) / (
            np.linalg.norm(filled[:, 1]) * np.linalg.norm(filled[:, 2])
        )
        similarity = item_ev.item_similarity(data, "user_mean")
        self.assertAlmostEqual(similarity[1, 2], expected)
        np.testing.assert_array_equal(data.observed[0], [True, True, False])

    def test_missing_movie_remains_a_recommendation_candidate(self):
        train = rows([(1, 1, 5, 1), (2, 1, 4, 1),
                      (2, 2, 5, 2), (2, 3, 2, 3)])
        data = ev.build_training_data(train, [1, 2], [1, 2, 3])
        similarity = item_ev.item_similarity(data, "user_mean")
        scores, _ = item_ev.score_item_neighborhood(data, similarity, 2)
        self.assertFalse(data.observed[0, 1])
        self.assertFalse(data.observed[0, 2])
        self.assertEqual(ev.top_k_items(data, scores, 2)[0].tolist(), [1, 2])
        self.assertEqual(scores[0, 1], 5)  # only user 1's real rating enters

    def test_common_rater_weight_on_actual_item_similarity(self):
        for n in (3, 40, 50, 70):
            with self.subTest(common_raters=n):
                train = rows([(user, item, 5, item)
                              for user in range(1, n + 1) for item in (1, 2)])
                data = ev.build_training_data(train, range(1, n + 1), [1, 2])
                default = item_ev.item_similarity(data, "co_rated")
                weighted = item_ev.item_similarity(data, "common_weight", 50)
                self.assertAlmostEqual(default[0, 1], 1)
                self.assertAlmostEqual(weighted[0, 1], min(n / 50, 1))

    def test_changed_holdout_ratings_cannot_change_item_predictions(self):
        history = rows([(user, item, rating, item)
                        for user, ratings in [(1, [2, 4, 5, 1]),
                                              (2, [3, 5, 1, 4])]
                        for item, rating in enumerate(ratings, 1)])
        train, validation, test = ev.chronological_split(history, .5, .25)
        data = ev.build_training_data(train, [1, 2], [1, 2, 3, 4])
        changed = history.copy()
        changed.loc[changed.timestamp >= 3, "rating"] = 0
        changed_train, _, _ = ev.chronological_split(changed, .5, .25)
        changed_data = ev.build_training_data(changed_train, [1, 2], [1, 2, 3, 4])
        pd.testing.assert_frame_equal(train, changed_train)
        self.assertEqual(len(validation), 2)
        self.assertEqual(len(test), 2)
        for method in ev.NEIGHBOR_METHODS:
            with self.subTest(method=method):
                similarity = item_ev.item_similarity(data, method)
                changed_similarity = item_ev.item_similarity(changed_data, method)
                np.testing.assert_array_equal(similarity, changed_similarity)
                scores, _ = item_ev.score_item_neighborhood(data, similarity, 2)
                changed_scores, _ = item_ev.score_item_neighborhood(changed_data, changed_similarity, 2)
                np.testing.assert_array_equal(scores, changed_scores)

    def test_items_without_usable_neighbors_take_train_fallback(self):
        train = rows([(1, 1, 5, 1), (2, 2, 3, 1)])
        data = ev.build_training_data(train, [1, 2], [1, 2, 3])
        similarity = item_ev.item_similarity(data, "co_rated")
        self.assertEqual(similarity[0, 1], 0)
        scores, supported = item_ev.score_item_neighborhood(data, similarity, 1)
        self.assertFalse(supported[0, 1])
        self.assertFalse(supported[0, 2])
        self.assertEqual(scores[0, 1], 3)  # train item mean
        self.assertEqual(scores[0, 2], 5)  # train user mean for a cold item
        filled_similarity = item_ev.item_similarity(data, "user_mean")
        self.assertTrue(np.all(filled_similarity[2] == 0))


if __name__ == "__main__":
    unittest.main()
