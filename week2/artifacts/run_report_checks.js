const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROFILE_SIZE = 3;
const HELD_OUT_RATING = 5;
const weekDirectory = path.resolve(__dirname, '..');
const outputPath = path.join(__dirname, 'report_check_results.json');

function compareTitles(firstTitle, secondTitle) {
    if (firstTitle < secondTitle) return -1;
    if (firstTitle > secondTitle) return 1;
    return 0;
}

function chooseSplit(userRatings) {
    const chronological = [...userRatings].sort((a, b) =>
        a.timestamp - b.timestamp || a.itemId - b.itemId
    );

    for (let index = chronological.length - 1; index >= PROFILE_SIZE; index -= 1) {
        if (chronological[index].rating === HELD_OUT_RATING) {
            return {
                trainingRatings: chronological.slice(0, index),
                testRating: chronological[index]
            };
        }
    }

    return null;
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
    const userIds = [...new Set(ratings.map(rating => rating.userId))].sort((a, b) => a - b);
    const ratingsByUser = new Map(userIds.map(userId => [userId, []]));
    const ratingCounts = new Map(movies.map(movie => [movie.id, 0]));

    ratings.forEach(rating => {
        ratingsByUser.get(rating.userId).push(rating);
        ratingCounts.set(rating.itemId, ratingCounts.get(rating.itemId) + 1);
    });

    const comparisonViolations = [];
    let evaluatedComparisonUsers = 0;
    let comparisonRecommendationOccurrences = 0;

    for (const userId of userIds) {
        const split = chooseSplit(ratingsByUser.get(userId));
        if (!split) continue;

        let comparison;
        try {
            comparison = vm.runInContext(`getComparisonRecommendations(${userId})`, context);
        } catch {
            continue;
        }

        evaluatedComparisonUsers += 1;
        const trainingMovieIds = new Set(
            split.trainingRatings.map(rating => rating.itemId)
        );

        for (const [method, recommendations] of [
            ['singleItem', Array.from(comparison.itemRecommendations)],
            ['profileBased', Array.from(comparison.profileRecommendations)]
        ]) {
            comparisonRecommendationOccurrences += recommendations.length;
            const overlap = recommendations
                .filter(movie => trainingMovieIds.has(movie.id))
                .map(movie => movie.id);
            if (overlap.length > 0) {
                comparisonViolations.push({ userId, method, movieIds: overlap });
            }
        }
    }

    const standardProfileViolations = [];
    let standardProfileRecommendationOccurrences = 0;

    for (const userId of userIds) {
        const watchedMovieIds = new Set(
            ratingsByUser.get(userId).map(rating => rating.itemId)
        );
        const result = vm.runInContext(`getProfileRecommendations(${userId})`, context);
        const recommendations = Array.from(result.recommendations);
        standardProfileRecommendationOccurrences += recommendations.length;
        const overlap = recommendations
            .filter(movie => watchedMovieIds.has(movie.id))
            .map(movie => movie.id);
        if (overlap.length > 0) {
            standardProfileViolations.push({ userId, movieIds: overlap });
        }
    }

    const comparisonUser1 = vm.runInContext('getComparisonRecommendations(1)', context);
    const standardProfileUser1 = vm.runInContext('getProfileRecommendations(1)', context);
    const sortedCounts = movies
        .map(movie => ratingCounts.get(movie.id))
        .sort((a, b) => a - b);
    const topQuartileThreshold = sortedCounts[Math.ceil(0.75 * movies.length) - 1];
    const user1Popularity = Array.from(
        comparisonUser1.profileRecommendations,
        movie => ({
            id: movie.id,
            title: movie.title,
            ratingCount: ratingCounts.get(movie.id),
            releaseYear: Number(movie.title.match(/\((\d{4})\)$/)?.[1]) || null,
            highVisibility: ratingCounts.get(movie.id) >= topQuartileThreshold
        })
    );

    const binaryCosine = vm.runInContext(
        'calculateCosineSimilarity(new Set(["Action", "Comedy"]), new Set(["Action", "Drama"]))',
        context
    );
    const profileCosine = vm.runInContext(
        'calculateProfileCosineSimilarity(genreNames.map(genre => genre === "Action" || genre === "Comedy" ? 1 : 0), new Set(["Action", "Drama"]))',
        context
    );

    const toyStory = movies.find(movie => movie.id === 1);
    const toyGenres = new Set(toyStory.genres);
    const methodSanity = {};
    for (const method of ['cosine', 'jaccard']) {
        methodSanity[method] = movies
            .filter(movie => movie.id !== toyStory.id)
            .map(movie => {
                context.firstGenres = toyGenres;
                context.secondGenres = new Set(movie.genres);
                context.method = method;
                return {
                    title: movie.title,
                    score: vm.runInContext(
                        'calculateSimilarity(firstGenres, secondGenres, method)',
                        context
                    )
                };
            })
            .sort((a, b) =>
                b.score - a.score || compareTitles(a.title, b.title)
            )
            .slice(0, 2)
            .map(movie => ({
                title: movie.title,
                score: Number(movie.score.toFixed(6))
            }));
    }

    const output = {
        generatedAt: new Date().toISOString(),
        overlapCheck: {
            definition: 'Watched means the history visible to the recommender; the held-out target is intentionally not part of training.',
            comparisonMode: {
                users: evaluatedComparisonUsers,
                recommendationOccurrences: comparisonRecommendationOccurrences,
                violations: comparisonViolations.length,
                passed: comparisonViolations.length === 0
            },
            standardProfileMode: {
                users: userIds.length,
                recommendationOccurrences: standardProfileRecommendationOccurrences,
                violations: standardProfileViolations.length,
                passed: standardProfileViolations.length === 0
            }
        },
        distributionCheck: {
            case: 'User 1 shared profile/single-item Top-5',
            popularityProxy: 'Full u.data rating count',
            highVisibilityThreshold: topQuartileThreshold,
            movies: user1Popularity,
            allHighVisibility: user1Popularity.every(movie => movie.highVisibility),
            highVisibilityCount: user1Popularity.filter(
                movie => movie.highVisibility
            ).length
        },
        formulaCheck: {
            section3Formula: 'cosine(x,y) = dot(x,y) / (norm(x) * norm(y))',
            binaryExample: {
                rawDotProduct: 1,
                firstMagnitude: Math.sqrt(2),
                secondMagnitude: Math.sqrt(2),
                implementationResult: binaryCosine,
                expectedNormalizedResult: 0.5
            },
            profileExample: {
                rawDotProduct: 1,
                profileMagnitude: Math.sqrt(2),
                candidateMagnitude: Math.sqrt(2),
                implementationResult: profileCosine,
                expectedNormalizedResult: 0.5
            },
            passed:
                Math.abs(binaryCosine - 0.5) < 1e-12 &&
                Math.abs(profileCosine - 0.5) < 1e-12
        },
        methodSanityCheck: {
            queryMovie: toyStory.title,
            top2: methodSanity
        },
        standardProfileSanityCheck: {
            userId: 1,
            profileInputs: Array.from(standardProfileUser1.profileMovies, entry => ({
                title: entry.movie.title,
                rating: entry.rating.rating,
                genres: Array.from(entry.movie.genres)
            })),
            top5: Array.from(standardProfileUser1.recommendations, movie => ({
                title: movie.title,
                score: Number(movie.score.toFixed(6)),
                genres: Array.from(movie.genres)
            }))
        }
    };

    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
    console.log(JSON.stringify(output, null, 2));
}

main();
