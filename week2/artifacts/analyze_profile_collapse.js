const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TOP_K = 5;
const EPSILON = 1e-12;
const weekDirectory = path.resolve(__dirname, '..');
const outputPath = path.join(__dirname, 'profile_collapse_results.json');

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

function cosineForSets(firstGenres, secondGenres) {
    const shared = [...firstGenres].filter(genre => secondGenres.has(genre)).length;
    const denominator = Math.sqrt(firstGenres.size * secondGenres.size);
    return denominator > 0 ? shared / denominator : 0;
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

function round(value) {
    return Number(value.toFixed(6));
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
    const userIds = [...new Set(ratings.map(rating => rating.userId))].sort((a, b) => a - b);
    const userResults = [];

    for (const userId of userIds) {
        let comparison;
        try {
            comparison = vm.runInContext(`getComparisonRecommendations(${userId})`, context);
        } catch {
            continue;
        }

        const profileMovies = Array.from(comparison.profileMovies);
        const profileSets = profileMovies.map(({ movie }) => new Set(movie.genres));
        const profileVector = buildProfileVector(profileMovies, genreNames);
        const pairwiseSimilarities = [];

        for (let first = 0; first < profileSets.length; first += 1) {
            for (let second = first + 1; second < profileSets.length; second += 1) {
                pairwiseSimilarities.push(
                    cosineForSets(profileSets[first], profileSets[second])
                );
            }
        }

        const profileToInputSimilarities = profileMovies.map(({ movie }) =>
            cosineForProfile(profileVector, movie, genreNames)
        );
        const recommendationDiagnostics = Array.from(
            comparison.profileRecommendations,
            movie => {
                const candidateGenres = new Set(movie.genres);
                const individualScores = profileSets.map(genres =>
                    cosineForSets(genres, candidateGenres)
                );
                const maxIndividualScore = Math.max(...individualScores);
                const bestInputIndex = individualScores.indexOf(maxIndividualScore);

                return {
                    movie,
                    profileScore: movie.score,
                    individualScores,
                    maxIndividualScore,
                    bestInputIndex,
                    centroidAdvantage: movie.score - maxIndividualScore,
                    centroidPreferredOverEveryInput:
                        movie.score > maxIndividualScore + EPSILON
                };
            }
        );
        const inputTop5MaxSimilarities = profileMovies.map((_, inputIndex) =>
            Math.max(...recommendationDiagnostics.map(
                diagnostic => diagnostic.individualScores[inputIndex]
            ))
        );

        userResults.push({
            userId,
            profileMovies,
            profileVector,
            pairwiseSimilarities,
            meanPairwiseSimilarity: mean(pairwiseSimilarities),
            profileToInputSimilarities,
            recommendationDiagnostics,
            inputTop5MaxSimilarities,
            unrepresentedInputCount: inputTop5MaxSimilarities.filter(
                similarity => similarity <= EPSILON
            ).length,
            profileHitAt5: comparison.profileHit
        });
    }

    const orderedByCoherence = [...userResults].sort((a, b) =>
        a.meanPairwiseSimilarity - b.meanPairwiseSimilarity ||
        a.userId - b.userId
    );
    const quartileSize = Math.ceil(userResults.length / 4);
    const lowestCoherenceQuartile = orderedByCoherence.slice(0, quartileSize);
    const highestCoherenceQuartile = orderedByCoherence.slice(-quartileSize);
    const mostDiverseCase = orderedByCoherence[0];
    const user1Case = userResults.find(result => result.userId === 1);

    function summarizeGroup(group) {
        const recommendations = group.flatMap(result => result.recommendationDiagnostics);
        return {
            users: group.length,
            meanInputPairwiseSimilarity: mean(
                group.map(result => result.meanPairwiseSimilarity)
            ),
            meanProfileToInputSimilarity: mean(
                group.flatMap(result => result.profileToInputSimilarities)
            ),
            centroidPreferredRecommendationShare:
                recommendations.filter(result => result.centroidPreferredOverEveryInput).length /
                recommendations.length,
            meanCentroidAdvantage: mean(
                recommendations.map(result => result.centroidAdvantage)
            ),
            usersWithUnrepresentedProfileInput: group.filter(
                result => result.unrepresentedInputCount > 0
            ).length,
            usersWithUnrepresentedProfileInputFraction: group.filter(
                result => result.unrepresentedInputCount > 0
            ).length / group.length,
            profileHitsAt5: group.filter(result => result.profileHitAt5).length,
            profileHitRateAt5:
                group.filter(result => result.profileHitAt5).length / group.length
        };
    }

    function summarizeCase(result, selection) {
        return {
            selection,
            userId: result.userId,
            meanPairwiseInputSimilarity: round(result.meanPairwiseSimilarity),
            pairwiseInputSimilarities: result.pairwiseSimilarities.map(round),
            profileInputs: result.profileMovies.map(({ movie, rating }, index) => ({
                title: movie.title,
                userRating: rating.rating,
                genres: Array.from(movie.genres),
                similarityToAveragedProfile: round(
                    result.profileToInputSimilarities[index]
                ),
                maximumSimilarityFromProfileTop5: round(
                    result.inputTop5MaxSimilarities[index]
                ),
                representedInProfileTop5:
                    result.inputTop5MaxSimilarities[index] > EPSILON
            })),
            profileTop5: result.recommendationDiagnostics.map((diagnostic, index) => ({
                rank: index + 1,
                title: diagnostic.movie.title,
                genres: Array.from(diagnostic.movie.genres),
                profileScore: round(diagnostic.profileScore),
                individualInputScores: diagnostic.individualScores.map(round),
                maxIndividualScore: round(diagnostic.maxIndividualScore),
                bestMatchingInput: result.profileMovies[diagnostic.bestInputIndex].movie.title,
                centroidAdvantage: round(diagnostic.centroidAdvantage),
                centroidPreferredOverEveryInput:
                    diagnostic.centroidPreferredOverEveryInput
            })),
            centroidPreferredTop5Count: result.recommendationDiagnostics.filter(
                diagnostic => diagnostic.centroidPreferredOverEveryInput
            ).length,
            unrepresentedProfileInputCount: result.unrepresentedInputCount,
            profileHitAt5: result.profileHitAt5
        };
    }

    const allProfileInputSimilarities = userResults.flatMap(
        result => result.profileToInputSimilarities
    );
    const allRecommendationDiagnostics = userResults.flatMap(
        result => result.recommendationDiagnostics
    );
    const allThreeBelowSelfSimilarityUsers = userResults.filter(result =>
        result.profileToInputSimilarities.every(similarity => similarity < 1 - EPSILON)
    ).length;

    const output = {
        generatedAt: new Date().toISOString(),
        hypothesis: {
            claim: 'Averaging very different movie vectors creates a centroid that matches none of the inputs and yields generic Top-5 recommendations.',
            proposedTestLimitation: 'Comparing profile-to-input similarity with each movie self-similarity of 1 flags ordinary averaging whenever the input vectors are not identical; it is not sufficient evidence of washout.',
            strongerDiagnostic: 'A recommendation is centroid-preferred when its profile score is greater than its cosine similarity to every individual profile movie.'
        },
        protocol: {
            evaluatedUsers: userResults.length,
            profileSize: 3,
            topK: TOP_K,
            diversityMeasure: 'Mean of the three pairwise cosine similarities among profile-input movies; lower means more diverse',
            mostDiverseSelection: 'Lowest mean pairwise input similarity, then smallest user ID',
            quartileComparison: 'Fixed-size lowest and highest coherence quartiles after sorting; user ID breaks ties'
        },
        aggregate: {
            meanPairwiseInputSimilarity: mean(
                userResults.map(result => result.meanPairwiseSimilarity)
            ),
            meanProfileToInputSimilarity: mean(allProfileInputSimilarities),
            medianProfileToInputSimilarity: median(allProfileInputSimilarities),
            allThreeBelowSelfSimilarityUsers,
            allThreeBelowSelfSimilarityFraction:
                allThreeBelowSelfSimilarityUsers / userResults.length,
            centroidPreferredRecommendationShare:
                allRecommendationDiagnostics.filter(
                    result => result.centroidPreferredOverEveryInput
                ).length / allRecommendationDiagnostics.length,
            meanCentroidAdvantage: mean(
                allRecommendationDiagnostics.map(result => result.centroidAdvantage)
            ),
            usersWithUnrepresentedProfileInput: userResults.filter(
                result => result.unrepresentedInputCount > 0
            ).length,
            usersWithUnrepresentedProfileInputFraction: userResults.filter(
                result => result.unrepresentedInputCount > 0
            ).length / userResults.length,
            profileHitsAt5: userResults.filter(result => result.profileHitAt5).length,
            profileHitRateAt5:
                userResults.filter(result => result.profileHitAt5).length /
                userResults.length
        },
        coherenceQuartiles: {
            lowest: summarizeGroup(lowestCoherenceQuartile),
            highest: summarizeGroup(highestCoherenceQuartile)
        },
        caseStudies: {
            user1: summarizeCase(user1Case, 'Existing report case study'),
            mostDiverse: summarizeCase(
                mostDiverseCase,
                'Eligible user with the lowest mean pairwise similarity among the three profile inputs; user ID breaks ties'
            )
        },
        interpretationBoundary: 'The diagnostic detects hybrid centroid matches in genre space. The genre-only data cannot determine whether a movie is semantically generic or whether the user experiences the recommendation as unpersonalized.'
    };

    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
    console.log(JSON.stringify(output, null, 2));
}

main();
