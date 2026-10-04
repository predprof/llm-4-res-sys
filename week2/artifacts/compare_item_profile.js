const fs = require('fs');
const path = require('path');

const TOP_K = 5;
const PROFILE_SIZE = 3;
const HELD_OUT_RATING = 5;

const genreNames = [
    'Action', 'Adventure', 'Animation', "Children's", 'Comedy',
    'Crime', 'Documentary', 'Drama', 'Fantasy', 'Film-Noir',
    'Horror', 'Musical', 'Mystery', 'Romance', 'Sci-Fi',
    'Thriller', 'War', 'Western'
];

function compareTitles(firstTitle, secondTitle) {
    if (firstTitle < secondTitle) return -1;
    if (firstTitle > secondTitle) return 1;
    return 0;
}

const weekDirectory = path.resolve(__dirname, '..');
const outputPath = path.join(__dirname, 'item_profile_results.json');

function parseMovies(text) {
    return text.trim().split('\n').map(line => {
        const fields = line.split('|');
        return {
            id: Number(fields[0]),
            title: fields[1],
            genres: genreNames.map((genre, index) =>
                Number(fields[index + 6]) === 1 ? genre : null
            ).filter(Boolean)
        };
    });
}

function parseRatings(text) {
    return text.trim().split('\n').map(line => {
        const [userId, itemId, rating, timestamp] = line.split('\t').map(Number);
        return { userId, itemId, rating, timestamp };
    });
}

function cosineForSets(firstGenres, secondGenres) {
    const shared = [...firstGenres].filter(genre => secondGenres.has(genre)).length;
    const magnitudeProduct = Math.sqrt(firstGenres.size * secondGenres.size);
    return magnitudeProduct > 0 ? shared / magnitudeProduct : 0;
}

function averageGenreProfile(sourceRatings, moviesById) {
    const vector = Array(genreNames.length).fill(0);

    sourceRatings.forEach(rating => {
        const genres = new Set(moviesById.get(rating.itemId).genres);
        genreNames.forEach((genre, index) => {
            vector[index] += genres.has(genre) ? 1 : 0;
        });
    });

    return vector.map(value => value / sourceRatings.length);
}

function cosineForProfile(profileVector, candidateGenres) {
    const candidateVector = genreNames.map(genre => candidateGenres.has(genre) ? 1 : 0);
    const dotProduct = profileVector.reduce(
        (sum, value, index) => sum + value * candidateVector[index],
        0
    );
    const profileMagnitude = Math.sqrt(
        profileVector.reduce((sum, value) => sum + value * value, 0)
    );
    const candidateMagnitude = Math.sqrt(
        candidateVector.reduce((sum, value) => sum + value * value, 0)
    );
    const magnitudeProduct = profileMagnitude * candidateMagnitude;
    return magnitudeProduct > 0 ? dotProduct / magnitudeProduct : 0;
}

function rankCandidates(movies, excludedIds, scoreMovie) {
    return movies
        .filter(movie => !excludedIds.has(movie.id))
        .map(movie => ({
            id: movie.id,
            title: movie.title,
            score: scoreMovie(movie)
        }))
        .filter(movie => movie.score > 0)
        .sort((a, b) =>
            b.score - a.score ||
            compareTitles(a.title, b.title) ||
            a.id - b.id
        );
}

function rankOfItem(recommendations, itemId) {
    const index = recommendations.findIndex(movie => movie.id === itemId);
    return index === -1 ? null : index + 1;
}

function reciprocalRank(rank) {
    return rank === null ? 0 : 1 / rank;
}

function ndcg(rank) {
    return rank === null ? 0 : 1 / Math.log2(rank + 1);
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

function selectProfileRatings(trainingRatings) {
    return [...trainingRatings]
        .sort((a, b) =>
            b.rating - a.rating ||
            b.timestamp - a.timestamp ||
            a.itemId - b.itemId
        )
        .slice(0, PROFILE_SIZE);
}

function summarizeRecommendation(movie, testItemId) {
    return {
        id: movie.id,
        title: movie.title,
        score: Number(movie.score.toFixed(6)),
        isHeldOutTarget: movie.id === testItemId
    };
}

function main() {
    const movies = parseMovies(
        new TextDecoder('iso-8859-1').decode(
            fs.readFileSync(path.join(weekDirectory, 'u.item'))
        )
    );
    const ratings = parseRatings(
        fs.readFileSync(path.join(weekDirectory, 'u.data'), 'utf8')
    );
    const moviesById = new Map(movies.map(movie => [movie.id, movie]));
    const ratingsByUser = new Map();

    ratings.forEach(rating => {
        if (!ratingsByUser.has(rating.userId)) {
            ratingsByUser.set(rating.userId, []);
        }
        ratingsByUser.get(rating.userId).push(rating);
    });

    const userResults = [];

    [...ratingsByUser.keys()].sort((a, b) => a - b).forEach(userId => {
        const split = chooseSplit(ratingsByUser.get(userId));
        if (!split) return;

        const profileRatings = selectProfileRatings(split.trainingRatings);
        if (profileRatings.length < PROFILE_SIZE) return;

        const activeRating = profileRatings[0];
        const activeMovie = moviesById.get(activeRating.itemId);
        const testMovie = moviesById.get(split.testRating.itemId);
        if (!activeMovie || !testMovie) return;

        const excludedIds = new Set(split.trainingRatings.map(rating => rating.itemId));
        const activeGenres = new Set(activeMovie.genres);
        const profileVector = averageGenreProfile(profileRatings, moviesById);

        const itemScoreMovie = movie =>
            cosineForSets(activeGenres, new Set(movie.genres));
        const profileScoreMovie = movie =>
            cosineForProfile(profileVector, new Set(movie.genres));
        const itemRanking = rankCandidates(
            movies,
            excludedIds,
            itemScoreMovie
        );
        const profileRanking = rankCandidates(
            movies,
            excludedIds,
            profileScoreMovie
        );
        const itemRecommendations = itemRanking.slice(0, TOP_K);
        const profileRecommendations = profileRanking.slice(0, TOP_K);

        const itemRank = rankOfItem(itemRecommendations, testMovie.id);
        const profileRank = rankOfItem(profileRecommendations, testMovie.id);
        const itemTargetRank = rankOfItem(itemRanking, testMovie.id);
        const profileTargetRank = rankOfItem(profileRanking, testMovie.id);
        const itemTargetScore = itemScoreMovie(testMovie);
        const profileTargetScore = profileScoreMovie(testMovie);
        const itemIds = new Set(itemRecommendations.map(movie => movie.id));
        const overlapCount = profileRecommendations
            .filter(movie => itemIds.has(movie.id))
            .length;

        userResults.push({
            userId,
            trainingCount: split.trainingRatings.length,
            testRating: split.testRating,
            testMovie,
            activeRating,
            activeMovie,
            profileRatings,
            itemRecommendations,
            profileRecommendations,
            itemRank,
            profileRank,
            itemTargetRank,
            profileTargetRank,
            itemTargetScore,
            profileTargetScore,
            overlapCount
        });
    });

    const evaluatedUsers = userResults.length;
    const sum = (selector) => userResults.reduce((total, result) => total + selector(result), 0);
    const itemHits = sum(result => result.itemRank === null ? 0 : 1);
    const profileHits = sum(result => result.profileRank === null ? 0 : 1);
    const identicalTop5 = sum(result => {
        const itemIds = result.itemRecommendations.map(movie => movie.id).join(',');
        const profileIds = result.profileRecommendations.map(movie => movie.id).join(',');
        return itemIds === profileIds ? 1 : 0;
    });
    const itemCatalog = new Set(
        userResults.flatMap(result => result.itemRecommendations.map(movie => movie.id))
    );
    const profileCatalog = new Set(
        userResults.flatMap(result => result.profileRecommendations.map(movie => movie.id))
    );
    const caseStudy = userResults.find(result => result.userId === 1);

    const output = {
        generatedAt: new Date().toISOString(),
        environment: {
            node: process.version,
            dependencies: 'Node.js standard library only',
            randomness: 'None; deterministic ordering and tie-breaking'
        },
        dataset: {
            movies: movies.length,
            ratings: ratings.length,
            users: ratingsByUser.size
        },
        protocol: {
            topK: TOP_K,
            profileSize: PROFILE_SIZE,
            heldOutRating: HELD_OUT_RATING,
            testItem: 'Latest 5-star rating after at least three earlier ratings',
            trainingData: 'Ratings ordered before the held-out item',
            activeItem: 'Highest-rated training item; newest timestamp breaks ties',
            profile: 'Mean of binary genre vectors for the top three training ratings',
            candidates: 'All movies absent from the training history',
            scoring: 'Cosine similarity for both methods',
            tieBreak: 'Title ascending, then movie ID ascending'
        },
        metrics: {
            evaluatedUsers,
            itemToItem: {
                hitsAt5: itemHits,
                hitRateAt5: itemHits / evaluatedUsers,
                mrrAt5: sum(result => reciprocalRank(result.itemRank)) / evaluatedUsers,
                ndcgAt5: sum(result => ndcg(result.itemRank)) / evaluatedUsers,
                catalogCoverageCount: itemCatalog.size,
                catalogCoverageFraction: itemCatalog.size / movies.length
            },
            profileBased: {
                hitsAt5: profileHits,
                hitRateAt5: profileHits / evaluatedUsers,
                mrrAt5: sum(result => reciprocalRank(result.profileRank)) / evaluatedUsers,
                ndcgAt5: sum(result => ndcg(result.profileRank)) / evaluatedUsers,
                catalogCoverageCount: profileCatalog.size,
                catalogCoverageFraction: profileCatalog.size / movies.length
            },
            comparison: {
                meanOverlapCountAt5: sum(result => result.overlapCount) / evaluatedUsers,
                meanOverlapFractionAt5: sum(result => result.overlapCount / TOP_K) / evaluatedUsers,
                identicalTop5Users: identicalTop5,
                identicalTop5Fraction: identicalTop5 / evaluatedUsers
            }
        },
        caseStudyUser1: caseStudy ? {
            trainingCount: caseStudy.trainingCount,
            heldOutTarget: {
                id: caseStudy.testMovie.id,
                title: caseStudy.testMovie.title,
                rating: caseStudy.testRating.rating,
                timestamp: caseStudy.testRating.timestamp
            },
            activeItem: {
                id: caseStudy.activeMovie.id,
                title: caseStudy.activeMovie.title,
                rating: caseStudy.activeRating.rating,
                timestamp: caseStudy.activeRating.timestamp
            },
            profileItems: caseStudy.profileRatings.map(rating => ({
                id: rating.itemId,
                title: moviesById.get(rating.itemId).title,
                rating: rating.rating,
                timestamp: rating.timestamp
            })),
            itemToItemTop5: caseStudy.itemRecommendations.map(movie =>
                summarizeRecommendation(movie, caseStudy.testMovie.id)
            ),
            profileBasedTop5: caseStudy.profileRecommendations.map(movie =>
                summarizeRecommendation(movie, caseStudy.testMovie.id)
            ),
            targetEvaluation: {
                itemToItem: {
                    cosineSimilarity: Number(caseStudy.itemTargetScore.toFixed(6)),
                    positiveSimilarityRank: caseStudy.itemTargetRank,
                    hitAt5: caseStudy.itemRank !== null
                },
                profileBased: {
                    cosineSimilarity: Number(caseStudy.profileTargetScore.toFixed(6)),
                    positiveSimilarityRank: caseStudy.profileTargetRank,
                    hitAt5: caseStudy.profileRank !== null
                }
            },
            overlapCountAt5: caseStudy.overlapCount
        } : null
    };

    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
    console.log(JSON.stringify(output, null, 2));
}

main();
