import json
import sys
from pathlib import Path

from scipy.stats import chi2, chisquare


ALPHA = 0.05
DATA_PATH = (
    Path(sys.argv[1])
    if len(sys.argv) > 1
    else Path(__file__).with_name("distribution-1000.json")
)


with DATA_PATH.open(encoding="utf-8") as input_file:
    experiment = json.load(input_file)

distribution = experiment["distribution"]
observed = [item["count"] for item in distribution]
number_of_categories = len(observed)
number_of_clicks = sum(observed)
expected_count = number_of_clicks / number_of_categories
expected = [expected_count] * number_of_categories

statistic, p_value = chisquare(f_obs=observed, f_exp=expected)
degrees_of_freedom = number_of_categories - 1
critical_value = chi2.ppf(1 - ALPHA, degrees_of_freedom)

contributions = [
    {
        "name": item["name"],
        "observed": item["count"],
        "expected": expected_count,
        "chi_square_contribution": (item["count"] - expected_count) ** 2 / expected_count,
    }
    for item in distribution
]

manual_statistic = sum(item["chi_square_contribution"] for item in contributions)
if abs(manual_statistic - statistic) > 1e-12:
    raise RuntimeError("Manual and SciPy chi-square statistics do not match.")

result = {
    "null_hypothesis": "Each of the 12 menu items has probability 1/12.",
    "alternative_hypothesis": "At least one menu-item probability differs from 1/12.",
    "alpha": ALPHA,
    "sample_size": number_of_clicks,
    "categories": number_of_categories,
    "expected_count_per_category": expected_count,
    "chi_square_statistic": statistic,
    "degrees_of_freedom": degrees_of_freedom,
    "p_value": p_value,
    "critical_value": critical_value,
    "decision": "reject H0" if p_value < ALPHA else "fail to reject H0",
    "contributions": sorted(
        contributions,
        key=lambda item: item["chi_square_contribution"],
        reverse=True,
    ),
}

print(json.dumps(result, indent=2))
