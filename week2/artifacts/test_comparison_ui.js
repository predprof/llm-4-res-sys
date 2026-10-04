const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const weekDirectory = path.resolve(__dirname, '..');
const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    window: {},
    document: {}
});

vm.runInContext(
    fs.readFileSync(path.join(weekDirectory, 'data.js'), 'utf8'),
    context,
    { filename: 'data.js' }
);
vm.runInContext(
    fs.readFileSync(path.join(weekDirectory, 'script.js'), 'utf8'),
    context,
    { filename: 'script.js' }
);

context.movieText = new TextDecoder('iso-8859-1').decode(
    fs.readFileSync(path.join(weekDirectory, 'u.item'))
);
context.ratingText = fs.readFileSync(path.join(weekDirectory, 'u.data'), 'utf8');
vm.runInContext('parseItemData(movieText); parseRatingData(ratingText);', context);

const comparison = vm.runInContext('getComparisonRecommendations(1)', context);
const savedCase = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'item_profile_results.json'), 'utf8')
).caseStudyUser1;

assert.strictEqual(comparison.heldOutMovie.id, savedCase.heldOutTarget.id);
assert.strictEqual(comparison.activeMovie.id, savedCase.activeItem.id);
assert.deepStrictEqual(
    Array.from(comparison.profileMovies, entry => entry.movie.id),
    savedCase.profileItems.map(movie => movie.id)
);
assert.deepStrictEqual(
    Array.from(comparison.itemRecommendations, movie => movie.id),
    savedCase.itemToItemTop5.map(movie => movie.id)
);
assert.deepStrictEqual(
    Array.from(comparison.profileRecommendations, movie => movie.id),
    savedCase.profileBasedTop5.map(movie => movie.id)
);
assert.strictEqual(comparison.overlapCount, savedCase.overlapCountAt5);
assert.strictEqual(
    comparison.itemHit,
    savedCase.itemToItemTop5.some(movie => movie.isHeldOutTarget)
);
assert.strictEqual(
    comparison.profileHit,
    savedCase.profileBasedTop5.some(movie => movie.isHeldOutTarget)
);
assert.strictEqual(comparison.heldOutRating.rating, 5);
assert.strictEqual(
    Number(comparison.itemTargetEvaluation.score.toFixed(6)),
    savedCase.targetEvaluation.itemToItem.cosineSimilarity
);
assert.strictEqual(
    comparison.itemTargetEvaluation.positiveSimilarityRank,
    savedCase.targetEvaluation.itemToItem.positiveSimilarityRank
);
assert.strictEqual(
    Number(comparison.profileTargetEvaluation.score.toFixed(6)),
    savedCase.targetEvaluation.profileBased.cosineSimilarity
);
assert.strictEqual(
    comparison.profileTargetEvaluation.positiveSimilarityRank,
    savedCase.targetEvaluation.profileBased.positiveSimilarityRank
);

for (const recommendations of [
    comparison.itemRecommendations,
    comparison.profileRecommendations
]) {
    assert.strictEqual(recommendations.length, 5);
    recommendations.forEach((movie, index) => {
        assert(Number.isFinite(movie.score));
        if (index > 0) {
            assert(recommendations[index - 1].score >= movie.score);
        }
    });
}

console.log('Comparison UI logic matches the saved User 1 experiment result.');
