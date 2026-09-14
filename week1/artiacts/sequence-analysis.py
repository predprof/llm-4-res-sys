#!/usr/bin/env python3
"""Analyze marginal frequencies, serial transitions, and temporal homogeneity."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import scipy
from scipy.stats import chi2_contingency, chisquare


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--block-size", type=int, default=1000)
    parser.add_argument("--permutations", type=int, default=2000)
    parser.add_argument("--permutation-seed", type=int, default=20260915)
    parser.add_argument("--alpha", type=float, default=0.05)
    return parser.parse_args()


def transition_counts(sequence, categories):
    encoded = sequence[:-1] * categories + sequence[1:]
    return np.bincount(encoded, minlength=categories * categories).reshape(
        categories, categories
    )


def chi_square_statistic(observed):
    row_totals = observed.sum(axis=1, keepdims=True)
    column_totals = observed.sum(axis=0, keepdims=True)
    expected = row_totals @ column_totals / observed.sum()
    return float(np.sum((observed - expected) ** 2 / expected))


def decision(p_value, threshold):
    return "reject H0" if p_value < threshold else "fail to reject H0"


def main():
    args = parse_args()
    if args.block_size <= 0 or args.permutations <= 0:
        raise ValueError("Block size and permutation count must be positive.")

    experiment = json.loads(args.input.read_text(encoding="utf-8"))
    sequence = np.asarray(experiment["sequence"], dtype=np.int64)
    menu = experiment["menu"]
    categories = len(menu)
    sample_size = len(sequence)

    if categories != 12:
        raise ValueError(f"Expected 12 categories, found {categories}.")
    if sample_size % args.block_size != 0:
        raise ValueError("Sequence length must be divisible by block size.")
    if sequence.min() < 0 or sequence.max() >= categories:
        raise ValueError("Sequence contains an out-of-range menu index.")

    counts = np.bincount(sequence, minlength=categories)
    uniform_expected = np.full(categories, sample_size / categories)
    uniform_statistic, uniform_p = chisquare(counts, uniform_expected)
    uniform_effect = math.sqrt(float(uniform_statistic) / sample_size)

    transitions = transition_counts(sequence, categories)
    independence_statistic, independence_p, independence_df, independence_expected = (
        chi2_contingency(transitions, correction=False)
    )
    independence_effect = math.sqrt(
        float(independence_statistic)
        / ((sample_size - 1) * min(categories - 1, categories - 1))
    )

    rng = np.random.default_rng(args.permutation_seed)
    permuted = sequence.copy()
    extreme = 0
    permutation_statistics = []
    for _ in range(args.permutations):
        rng.shuffle(permuted)
        permuted_transitions = transition_counts(permuted, categories)
        statistic = chi_square_statistic(permuted_transitions)
        permutation_statistics.append(statistic)
        if statistic >= independence_statistic:
            extreme += 1
    permutation_p = (extreme + 1) / (args.permutations + 1)
    permutation_se = math.sqrt(
        permutation_p * (1 - permutation_p) / (args.permutations + 1)
    )

    number_of_blocks = sample_size // args.block_size
    block_counts = np.zeros((number_of_blocks, categories), dtype=np.int64)
    for block_index, block in enumerate(sequence.reshape(number_of_blocks, args.block_size)):
        block_counts[block_index] = np.bincount(block, minlength=categories)
    homogeneity_statistic, homogeneity_p, homogeneity_df, homogeneity_expected = (
        chi2_contingency(block_counts, correction=False)
    )
    homogeneity_effect = math.sqrt(
        float(homogeneity_statistic)
        / (sample_size * min(number_of_blocks - 1, categories - 1))
    )

    bonferroni_alpha = args.alpha / 3
    result = {
        "input": str(args.input),
        "environment": {
            "python": ".".join(map(str, __import__("sys").version_info[:3])),
            "numpy": np.__version__,
            "scipy": scipy.__version__,
        },
        "configuration": {
            "sample_size": sample_size,
            "categories": categories,
            "alpha": args.alpha,
            "bonferroni_alpha_for_three_primary_tests": bonferroni_alpha,
            "block_size": args.block_size,
            "number_of_blocks": number_of_blocks,
            "permutations": args.permutations,
            "permutation_seed": args.permutation_seed,
        },
        "menu": menu,
        "first20Indices": sequence[:20].tolist(),
        "uniformity": {
            "hypothesis": "Each index has probability 1/12.",
            "counts": counts.tolist(),
            "expected_per_category": sample_size / categories,
            "chi_square": float(uniform_statistic),
            "degrees_of_freedom": categories - 1,
            "p_value": float(uniform_p),
            "cramers_v": uniform_effect,
            "decision_at_alpha": decision(uniform_p, args.alpha),
            "decision_with_bonferroni": decision(uniform_p, bonferroni_alpha),
        },
        "consecutive_independence": {
            "hypothesis": "The next index is independent of the current index.",
            "transition_count": sample_size - 1,
            "transition_matrix": transitions.tolist(),
            "chi_square": float(independence_statistic),
            "degrees_of_freedom": int(independence_df),
            "p_value": float(independence_p),
            "minimum_expected_frequency": float(independence_expected.min()),
            "cramers_v": independence_effect,
            "decision_at_alpha": decision(independence_p, args.alpha),
            "decision_with_bonferroni": decision(independence_p, bonferroni_alpha),
            "permutation_test": {
                "permutations": args.permutations,
                "seed": args.permutation_seed,
                "extreme_count": extreme,
                "p_value_plus_one": permutation_p,
                "monte_carlo_standard_error": permutation_se,
                "permuted_statistic_mean": float(np.mean(permutation_statistics)),
                "permuted_statistic_std": float(np.std(permutation_statistics, ddof=1)),
                "decision_at_alpha": decision(permutation_p, args.alpha),
                "decision_with_bonferroni": decision(permutation_p, bonferroni_alpha),
            },
        },
        "temporal_homogeneity": {
            "hypothesis": "All consecutive blocks share the same category distribution.",
            "block_counts": block_counts.tolist(),
            "chi_square": float(homogeneity_statistic),
            "degrees_of_freedom": int(homogeneity_df),
            "p_value": float(homogeneity_p),
            "minimum_expected_frequency": float(homogeneity_expected.min()),
            "cramers_v": homogeneity_effect,
            "decision_at_alpha": decision(homogeneity_p, args.alpha),
            "decision_with_bonferroni": decision(homogeneity_p, bonferroni_alpha),
        },
        "interpretation_rule": (
            "Failing to reject a null hypothesis is evidence of no detected departure, "
            "not proof of randomness, independence, or stationarity."
        ),
    }

    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(args.output),
        "first20Indices": result["first20Indices"],
        "uniformity": result["uniformity"],
        "consecutive_independence": {
            key: value
            for key, value in result["consecutive_independence"].items()
            if key != "transition_matrix"
        },
        "temporal_homogeneity": {
            key: value
            for key, value in result["temporal_homogeneity"].items()
            if key != "block_counts"
        },
    }, indent=2))


if __name__ == "__main__":
    main()
