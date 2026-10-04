const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TOP_K = 5;
const weekDirectory = path.resolve(__dirname, '..');
const outputPath = path.join(__dirname, 'mainstream_bias_results.json');

function mean(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
}

function pearson(firstValues, secondValues) {
    const firstMean = mean(firstValues);
    const secondMean = mean(secondValues);
    let covariance = 0;
    let firstVariance = 0;
    let secondVariance = 0;

    firstValues.forEach((firstValue, index) => {
        const firstDifference = firstValue - firstMean;
        const secondDifference = secondValues[index] - secondMean;
        covariance += firstDifference * secondDifference;
        firstVariance += firstDifference * firstDifference;
        secondVariance += secondDifference * secondDifference;
    });

    const denominator = Math.sqrt(firstVariance * secondVariance);
    return denominator > 0 ? covariance / denominator : 0;
}

function cosineForSets(firstGenres, secondGenres) {
    const shared = [...firstGenres].filter(genre => secondGenres.has(genre)).length;
    const magnitudeProduct = Math.sqrt(firstGenres.size * secondGenres.size);
    return magnitudeProduct > 0 ? shared / magnitudeProduct : 0;
}

function buildProfileVector(profileMovies, genreNames) {
    return genreNames.map(genre =>
        profileMovies.filter(({ movie }) => movie.genres.includes(genre)).length /
        profileMovies.length
    );
}

function cosineForProfile(profileVector, movie, genreNames) {
    const movieGenres = new Set(movie.genres);
    const candidateVector = genreNames.map(genre => movieGenres.has(genre) ? 1 : 0);
    const dotProduct = profileVector.reduce(
        (sum, value, index) => sum + value * candidateVector[index],
        0
    );
    const profileMagnitude = Math.sqrt(
        profileVector.reduce((sum, value) => sum + value * value, 0)
    );
    const candidateMagnitude = Math.sqrt(movie.genres.length);
    const denominator = profileMagnitude * candidateMagnitude;
    return denominator > 0 ? dotProduct / denominator : 0;
}

function releaseYear(title) {
    const match = title.match(/\((\d{4})\)$/);
    return match ? Number(match[1]) : null;
}

function main() {
    const context = vm.createContext({
        console,
        setTimeout,
        clearTimeout,
        window: {},
        document: {}
    });

    for (const filename of ['data.js', 'script.js']) {
        vm.runInContext(
            fs.readFileSync(path.join(weekDirectory, filename), 'utf8'),
            context,
            { filename }
        );
    }

    context.movieText = new TextDecoder('iso-8859-1').decode(
        fs.readFileSync(path.join(weekDirectory, 'u.item'))
    );
    context.ratingText = fs.readFileSync(path.join(weekDirectory, 'u.data'), 'utf8');
    vm.runInContext('parseItemData(movieText); parseRatingData(ratingText);', context);

    const movies = Array.from(vm.runInContext('movies', context));
    const ratings = Array.from(vm.runInContext('ratings', context));
    const genreNames = Array.from(vm.runInContext('genreNames', context));
    const ratingCounts = new Map(movies.map(movie => [movie.id, 0]));
    const userIds = [...new Set(ratings.map(rating => rating.userId))].sort((a, b) => a - b);

    ratings.forEach(rating => {
        ratingCounts.set(rating.itemId, ratingCounts.get(rating.itemId) + 1);
    });

    const catalogRatingCounts = movies.map(movie => ratingCounts.get(movie.id));
    const sortedCatalogCounts = [...catalogRatingCounts].sort((a, b) => a - b);
    const topQuartileThreshold = sortedCatalogCounts[Math.ceil(0.75 * movies.length) - 1];
    const popularityPercentile = count =>
        100 * sortedCatalogCounts.filter(value => value <= count).length / movies.length;
    const summarizeMovie = movie => ({
        id: movie.id,
        title: movie.title,
        score: Number(movie.score.toFixed(6)),
        ratingCount: ratingCounts.get(movie.id),
        popularityPercentile: Number(popularityPercentile(ratingCounts.get(movie.id)).toFixed(2)),
        releaseYear: releaseYear(movie.title),
        genreCount: movie.genres.length
    });

    const userResults = [];
    const allItemScores = [];
    const allProfileScores = [];
    const allScoreGenreCounts = [];

    for (const userId of userIds) {
        let comparison;
        try {
            comparison = vm.runInContext(`getComparisonRecommendations(${userId})`, context);
        } catch {
            continue;
        }

        const profileVector = buildProfileVector(comparison.profileMovies, genreNames);
        const activeGenres = new Set(comparison.activeMovie.genres);
        movies.forEach(movie => {
            allScoreGenreCounts.push(movie.genres.length);
            allItemScores.push(cosineForSets(activeGenres, new Set(movie.genres)));
            allProfileScores.push(cosineForProfile(profileVector, movie, genreNames));
        });

        userResults.push({
            userId,
            target: comparison.heldOutMovie,
            profileMovies: Array.from(comparison.profileMovies),
            profileInputMeanRatingCount: mean(
                Array.from(comparison.profileMovies, ({ movie }) => ratingCounts.get(movie.id))
            ),
            itemRecommendations: Array.from(comparison.itemRecommendations),
            profileRecommendations: Array.from(comparison.profileRecommendations)
        });
    }

    const nicheProxyCase = [...userResults].sort((a, b) =>
        a.profileInputMeanRatingCount - b.profileInputMeanRatingCount ||
        a.userId - b.userId
    )[0];
    const user1Case = userResults.find(result => result.userId === 1);

    function aggregateRecommendations(selector) {
        const recommendationOccurrences = userResults.flatMap(selector);
        const counts = recommendationOccurrences.map(movie => ratingCounts.get(movie.id));
        const genreCounts = recommendationOccurrences.map(movie => movie.genres.length);
        const scores = recommendationOccurrences.map(movie => movie.score);
        const recommendationFrequency = new Map(movies.map(movie => [movie.id, 0]));
        recommendationOccurrences.forEach(movie => {
            recommendationFrequency.set(
                movie.id,
                recommendationFrequency.get(movie.id) + 1
            );
        });

        return {
            recommendationOccurrences: recommendationOccurrences.length,
            distinctRecommendedMovies: new Set(
                recommendationOccurrences.map(movie => movie.id)
            ).size,
            meanRatingCount: mean(counts),
            medianRatingCount: median(counts),
            topPopularityQuartileShare: counts.filter(
                count => count >= topQuartileThreshold
            ).length / counts.length,
            meanGenreCount: mean(genreCounts),
            scoreGenreCountPearson: pearson(scores, genreCounts),
            recommendationFrequencyRatingCountPearson: pearson(
                movies.map(movie => ratingCounts.get(movie.id)),
                movies.map(movie => recommendationFrequency.get(movie.id))
            ),
            recommendationFrequencyGenreCountPearson: pearson(
                movies.map(movie => movie.genres.length),
                movies.map(movie => recommendationFrequency.get(movie.id))
            )
        };
    }

    function summarizeCase(result) {
        const itemToItemTop5 = result.itemRecommendations.map(summarizeMovie);
        const profileBasedTop5 = result.profileRecommendations.map(summarizeMovie);

        return {
            selection: result.userId === 1
                ? 'Existing report case study'
                : 'Eligible user with the lowest mean full-dataset rating count across the three profile inputs',
            userId: result.userId,
            target: {
                title: result.target.title,
                ratingCount: ratingCounts.get(result.target.id),
                popularityPercentile: Number(
                    popularityPercentile(ratingCounts.get(result.target.id)).toFixed(2)
                )
            },
            profileInputMeanRatingCount: result.profileInputMeanRatingCount,
            profileInputs: result.profileMovies.map(({ movie, rating }) => ({
                title: movie.title,
                userRating: rating.rating,
                ratingCount: ratingCounts.get(movie.id),
                popularityPercentile: Number(
                    popularityPercentile(ratingCounts.get(movie.id)).toFixed(2)
                ),
                genreCount: movie.genres.length
            })),
            itemToItemTop5,
            itemToItemTopPopularityQuartileCount: itemToItemTop5.filter(
                movie => movie.ratingCount >= topQuartileThreshold
            ).length,
            profileBasedTop5,
            profileBasedTopPopularityQuartileCount: profileBasedTop5.filter(
                movie => movie.ratingCount >= topQuartileThreshold
            ).length
        };
    }

    const output = {
        generatedAt: new Date().toISOString(),
        hypothesis: {
            claim: 'Movies with more genre tags automatically score higher under cosine and make Top-5 mainstream.',
            controlledResult: 'For a fixed number of shared genres, adding unmatched tags increases the candidate norm and lowers cosine similarity.',
            oneSharedGenreFormula: 'score = 1 / sqrt(queryGenreCount * candidateGenreCount)'
        },
        protocol: {
            evaluatedUsers: userResults.length,
            topK: TOP_K,
            popularityProxy: 'Full MovieLens u.data rating count for each movie',
            highVisibilityDefinition: `Top catalog quartile by rating count (at least ${topQuartileThreshold} ratings)`,
            unusualPreferenceProxy: 'Lowest mean rating count across the three profile-input movies among all eligible users',
            empiricalScoreTest: 'Pearson correlation between movie genre count and cosine score over every catalog movie for every eligible-user model'
        },
        catalogBaseline: {
            movieCount: movies.length,
            meanRatingCount: mean(catalogRatingCounts),
            medianRatingCount: median(catalogRatingCounts),
            topQuartileRatingCountThreshold: topQuartileThreshold,
            topPopularityQuartileShare: catalogRatingCounts.filter(
                count => count >= topQuartileThreshold
            ).length / catalogRatingCounts.length,
            meanGenreCount: mean(movies.map(movie => movie.genres.length))
        },
        empiricalScoreGenreCorrelation: {
            itemToItemPearson: pearson(allItemScores, allScoreGenreCounts),
            profileBasedPearson: pearson(allProfileScores, allScoreGenreCounts)
        },
        recommendationExposure: {
            itemToItem: aggregateRecommendations(result => result.itemRecommendations),
            profileBased: aggregateRecommendations(result => result.profileRecommendations)
        },
        caseStudies: {
            user1: summarizeCase(user1Case),
            lowestPopularityProfileInputs: summarizeCase(nicheProxyCase)
        },
        interpretationBoundary: 'Rating count is not an input to either recommender. Association between popularity and recommendation exposure cannot establish that the model is directly scoring popularity.'
    };

    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
    console.log(JSON.stringify(output, null, 2));
}

main();
