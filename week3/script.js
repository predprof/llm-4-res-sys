// ---------------------------------------------------------------------------
// HW3 — Collaborative Filtering core
//
// The observed matrix always keeps 0 = "not rated". The selector changes the
// matrix used for similarity, never the observed ratings or candidate mask.
// ---------------------------------------------------------------------------

const METHOD_INFO = {
    'co-rated': {
        label: 'Default — co-rated only',
        description: 'Compare only ratings both users or both films have in common. Missing values stay missing.',
        report: 'Missing values are excluded from similarity calculations.'
    },
    'user-mean': {
        label: 'User mean imputation',
        description: 'For similarity, replace each missing value with that user’s mean observed rating. Recommendation scores still use real ratings.',
        report: 'Missing values were filled with each user’s mean for similarity; recommendation scores use observed ratings.'
    },
    'common-weight': {
        label: 'Weight by common ratings',
        description: 'No values are filled. Co-rated cosine similarity is multiplied by n / (n + 10), where n is the number of common ratings.',
        report: 'No values were filled. Each co-rated cosine similarity was multiplied by n / (n + 10), where n is the number of common ratings.'
    },
    'matrix-factorization': {
        label: 'Matrix factorization',
        description: 'Train a 12-factor model on observed ratings and use its estimates to fill missing values for similarity. Scores still use real ratings.',
        report: 'A 12-factor model estimated missing values for similarity; recommendation scores use observed ratings.'
    }
};
const COMMON_RATING_SHRINKAGE = 10;
let similarityCache = { sourceMatrix: null, dense: {} };
let predictionMovieLabels = new Map();
let predictionMovieOptions = [];
let predictionMovieMatches = [];
let predictionActiveIndex = -1;

// Initialize the application when the window loads
window.onload = async function() {
    const userBased = document.getElementById('user-based-result');
    const itemBased = document.getElementById('item-based-result');

    try {
        userBased.innerHTML = '<p>Loading movie data...</p>';
        itemBased.innerHTML = '<p>Loading movie data...</p>';

        await loadData();

        populateUserDropdown();
        updateMethodDescription();
        populatePredictionUserDropdown();
        initializePredictionControls();

        userBased.innerHTML = '<p>Data loaded. Select a user.</p>';
        itemBased.innerHTML = '<p>Data loaded. Select a user.</p>';
    } catch (error) {
        console.error('Initialization error:', error);
        document.getElementById('prediction-status').textContent = 'Movie data could not be loaded.';
        // The error message is already shown by data.js
    }
};

// Populate the user dropdown with one option per user id found in u.data
function populateUserDropdown() {
    const selectElement = document.getElementById('user-select');

    // Clear existing options except the first placeholder
    while (selectElement.options.length > 1) {
        selectElement.remove(1);
    }

    for (let userId = 1; userId <= numUsers; userId++) {
        const option = document.createElement('option');
        option.value = userId;
        option.textContent = `User ${userId}`;
        selectElement.appendChild(option);
    }
}

function populatePredictionUserDropdown() {
    const select = document.getElementById('prediction-user-select');
    for (let userId = 1; userId <= numUsers; userId++) {
        const option = document.createElement('option');
        option.value = userId;
        option.textContent = `User ${userId}`;
        select.appendChild(option);
    }
}

function initializePredictionControls() {
    document.getElementById('prediction-user-select').addEventListener('change', handlePredictionUserChange);
    const filmInput = document.getElementById('prediction-movie-input');
    filmInput.addEventListener('focus', () => openPredictionMovieList());
    filmInput.addEventListener('input', () => {
        updatePredictionSearchStatus();
        clearPredictionResult();
        openPredictionMovieList();
    });
    filmInput.addEventListener('keydown', handlePredictionMovieKeys);
    document.getElementById('prediction-movie-toggle').addEventListener('click', () => {
        const list = document.getElementById('prediction-movie-list');
        const wasOpen = !list.hidden;
        if (wasOpen) closePredictionMovieList();
        else {
            filmInput.focus();
            openPredictionMovieList(true);
        }
    });
    document.getElementById('prediction-movie-list').addEventListener('mousedown', event => {
        const option = event.target.closest('.movie-combobox-option');
        if (!option) return;
        event.preventDefault();
        selectPredictionMovie(Number(option.dataset.index));
    });
    document.addEventListener('pointerdown', event => {
        if (!document.getElementById('prediction-movie-combobox').contains(event.target)) {
            closePredictionMovieList();
        }
    });
    document.getElementById('prediction-method').addEventListener('change', () => {
        updatePredictionMethodDescription();
        clearPredictionResult();
    });
    document.getElementById('predict-rating-btn').addEventListener('click', predictSelectedRating);
    updatePredictionMethodDescription();
}

function handlePredictionUserChange() {
    const userId = Number(document.getElementById('prediction-user-select').value);
    const filmInput = document.getElementById('prediction-movie-input');
    filmInput.disabled = !Number.isInteger(userId) || userId < 1 || !ratingMatrix[userId];
    document.getElementById('prediction-movie-toggle').disabled = filmInput.disabled;
    filmInput.value = '';
    populatePredictionMovieOptions();
    closePredictionMovieList();
    clearPredictionResult();
}

function populatePredictionMovieOptions() {
    const userId = Number(document.getElementById('prediction-user-select').value);
    const hint = document.getElementById('prediction-search-status');
    predictionMovieLabels = new Map();
    predictionMovieOptions = [];
    if (!Number.isInteger(userId) || userId < 1 || !ratingMatrix[userId]) {
        hint.textContent = '';
        return;
    }
    const unrated = movies.filter(movie => ratingMatrix[userId][movie.id] === 0)
        .sort((a, b) => movieTitle(a.id).localeCompare(movieTitle(b.id)) || a.id - b.id);
    for (const movie of unrated) {
        const label = `${movieTitle(movie.id)} (ID ${movie.id})`;
        predictionMovieOptions.push({ label, itemId: movie.id });
        predictionMovieLabels.set(label, movie.id);
    }
    hint.textContent = `Choose from ${unrated.length} unrated films.`;
}

function openPredictionMovieList(showAll = false) {
    const input = document.getElementById('prediction-movie-input');
    if (input.disabled) return;
    const list = document.getElementById('prediction-movie-list');
    const query = showAll || predictionMovieLabels.has(input.value)
        ? '' : input.value.trim().toLocaleLowerCase();
    predictionMovieMatches = predictionMovieOptions.filter(option =>
        option.label.toLocaleLowerCase().includes(query)
    );
    list.replaceChildren();
    predictionActiveIndex = -1;
    for (const [index, movie] of predictionMovieMatches.entries()) {
        const option = document.createElement('div');
        option.id = `prediction-movie-option-${index}`;
        option.className = 'movie-combobox-option';
        option.dataset.index = index;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        option.textContent = movie.label;
        list.appendChild(option);
    }
    list.hidden = predictionMovieMatches.length === 0;
    input.setAttribute('aria-expanded', String(!list.hidden));
    input.removeAttribute('aria-activedescendant');
}

function closePredictionMovieList() {
    const input = document.getElementById('prediction-movie-input');
    document.getElementById('prediction-movie-list').hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    predictionActiveIndex = -1;
}

function setActivePredictionMovie(index) {
    const list = document.getElementById('prediction-movie-list');
    if (predictionActiveIndex >= 0) {
        list.children[predictionActiveIndex].setAttribute('aria-selected', 'false');
    }
    predictionActiveIndex = index;
    const option = list.children[index];
    option.setAttribute('aria-selected', 'true');
    option.scrollIntoView({ block: 'nearest' });
    document.getElementById('prediction-movie-input').setAttribute('aria-activedescendant', option.id);
}

function selectPredictionMovie(index) {
    const movie = predictionMovieMatches[index];
    if (!movie) return;
    document.getElementById('prediction-movie-input').value = movie.label;
    updatePredictionSearchStatus();
    closePredictionMovieList();
    clearPredictionResult();
}

function handlePredictionMovieKeys(event) {
    const list = document.getElementById('prediction-movie-list');
    if (event.key === 'Escape') {
        closePredictionMovieList();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (list.hidden) openPredictionMovieList();
        if (!predictionMovieMatches.length) return;
        const next = event.key === 'ArrowDown'
            ? (predictionActiveIndex + 1) % predictionMovieMatches.length
            : (predictionActiveIndex - 1 + predictionMovieMatches.length) % predictionMovieMatches.length;
        setActivePredictionMovie(next);
    } else if (event.key === 'Enter' && !list.hidden && predictionActiveIndex >= 0) {
        event.preventDefault();
        selectPredictionMovie(predictionActiveIndex);
    } else if (event.key === 'Tab') {
        closePredictionMovieList();
    }
}

function updatePredictionSearchStatus() {
    const value = document.getElementById('prediction-movie-input').value;
    const hint = document.getElementById('prediction-search-status');
    if (predictionMovieLabels.has(value)) {
        hint.textContent = 'Film selected.';
        return;
    }
    if (!value.trim()) {
        hint.textContent = `Choose from ${predictionMovieLabels.size} unrated films.`;
        return;
    }
    const query = value.toLocaleLowerCase();
    const matches = [...predictionMovieLabels.keys()].filter(label =>
        label.toLocaleLowerCase().includes(query)
    ).length;
    hint.textContent = matches
        ? `${matches} matching unrated film${matches === 1 ? '' : 's'}; choose one from the suggestions.`
        : 'No unrated films match this search.';
}

function updatePredictionMethodDescription() {
    const method = document.getElementById('prediction-method').value;
    document.getElementById('prediction-method-description').textContent =
        METHOD_INFO[method]?.description || METHOD_INFO['co-rated'].description;
}

function clearPredictionResult() {
    document.getElementById('prediction-result').hidden = true;
    document.getElementById('prediction-status').textContent = '';
}

function selectedMethod() {
    const value = document.getElementById('missing-value-method').value;
    return METHOD_INFO[value] ? value : 'co-rated';
}

function updateMethodDescription() {
    document.getElementById('method-description').textContent = METHOD_INFO[selectedMethod()].description;
}

function handleMethodChange() {
    updateMethodDescription();
    showMessage('user-based-result', 'Select a user and click Get Recommendations.');
    showMessage('item-based-result', 'Select a user and click Get Recommendations.');
    document.getElementById('user-based-explanation').hidden = true;
    document.getElementById('item-based-explanation').hidden = true;
    document.getElementById('status-message').textContent = '';
}

function ensureFreshSimilarityCache() {
    if (similarityCache.sourceMatrix !== ratingMatrix) {
        similarityCache = { sourceMatrix: ratingMatrix, dense: {} };
    }
}

function buildDenseCache(matrix) {
    const itemNorms = new Float64Array(numMovies + 1);
    for (let userId = 1; userId <= numUsers; userId++) {
        for (let itemId = 1; itemId <= numMovies; itemId++) {
            itemNorms[itemId] += matrix[userId][itemId] ** 2;
        }
    }
    for (let itemId = 1; itemId <= numMovies; itemId++) {
        itemNorms[itemId] = Math.sqrt(itemNorms[itemId]);
    }
    return { matrix, itemNorms };
}

function buildUserMeanMatrix() {
    const globalMean = ratings.reduce((sum, entry) => sum + entry.rating, 0) / ratings.length;
    const matrix = Array.from({ length: numUsers + 1 }, () => new Float32Array(numMovies + 1));
    for (let userId = 1; userId <= numUsers; userId++) {
        const observed = ratingsByUser[userId];
        const mean = observed.length
            ? observed.reduce((sum, entry) => sum + entry.rating, 0) / observed.length
            : globalMean;
        matrix[userId].fill(mean, 1);
        for (const { itemId, rating } of observed) matrix[userId][itemId] = rating;
    }
    return matrix;
}

function buildFactorizedMatrix() {
    // Deterministic regularized SGD; train on observed ratings only.
    const factors = 12;
    const epochs = 20;
    const regularization = 0.04;
    const globalMean = ratings.reduce((sum, entry) => sum + entry.rating, 0) / ratings.length;
    let seed = 42;
    const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
    const userBias = new Float32Array(numUsers + 1);
    const itemBias = new Float32Array(numMovies + 1);
    const userFactors = Array.from({ length: numUsers + 1 }, () => new Float32Array(factors));
    const itemFactors = Array.from({ length: numMovies + 1 }, () => new Float32Array(factors));

    for (let userId = 1; userId <= numUsers; userId++) {
        for (let factor = 0; factor < factors; factor++) userFactors[userId][factor] = (random() - 0.5) * 0.2;
    }
    for (let itemId = 1; itemId <= numMovies; itemId++) {
        for (let factor = 0; factor < factors; factor++) itemFactors[itemId][factor] = (random() - 0.5) * 0.2;
    }

    for (let epoch = 0; epoch < epochs; epoch++) {
        const learningRate = 0.015 / (1 + epoch * 0.05);
        for (const { userId, itemId, rating } of ratings) {
            const userVector = userFactors[userId];
            const itemVector = itemFactors[itemId];
            let estimate = globalMean + userBias[userId] + itemBias[itemId];
            for (let factor = 0; factor < factors; factor++) estimate += userVector[factor] * itemVector[factor];
            const error = rating - estimate;
            userBias[userId] += learningRate * (error - regularization * userBias[userId]);
            itemBias[itemId] += learningRate * (error - regularization * itemBias[itemId]);
            for (let factor = 0; factor < factors; factor++) {
                const oldUserValue = userVector[factor];
                userVector[factor] += learningRate * (error * itemVector[factor] - regularization * oldUserValue);
                itemVector[factor] += learningRate * (error * oldUserValue - regularization * itemVector[factor]);
            }
        }
    }

    const matrix = Array.from({ length: numUsers + 1 }, () => new Float32Array(numMovies + 1));
    for (let userId = 1; userId <= numUsers; userId++) {
        for (let itemId = 1; itemId <= numMovies; itemId++) {
            const observed = ratingMatrix[userId][itemId];
            if (observed !== 0) {
                matrix[userId][itemId] = observed;
                continue;
            }
            let estimate = globalMean + userBias[userId] + itemBias[itemId];
            for (let factor = 0; factor < factors; factor++) {
                estimate += userFactors[userId][factor] * itemFactors[itemId][factor];
            }
            matrix[userId][itemId] = Math.min(5, Math.max(1, estimate));
        }
    }
    return matrix;
}

function getDenseSimilarityCache(method) {
    if (method !== 'user-mean' && method !== 'matrix-factorization') return null;
    ensureFreshSimilarityCache();
    if (!similarityCache.dense[method]) {
        const matrix = method === 'user-mean' ? buildUserMeanMatrix() : buildFactorizedMatrix();
        similarityCache.dense[method] = buildDenseCache(matrix);
    }
    return similarityCache.dense[method];
}

// ---------------------------------------------------------------------------
// Cosine similarity between two rating vectors.
//
// Dense methods use filled rows. Sparse methods compare only co-rated entries.
// Inputs: two user rows of equal length.
// Output: a number in [0, 1].
// ---------------------------------------------------------------------------
function cosineSimilarity(a, b, method = 'co-rated') {
    const useFilledValues = method === 'user-mean' || method === 'matrix-factorization';
    let dot = 0;
    let normA = 0;
    let normB = 0;
    let commonCount = 0;

    for (let index = 1; index < a.length; index++) {
        if (!useFilledValues && (a[index] === 0 || b[index] === 0)) continue;
        dot += a[index] * b[index];
        normA += a[index] * a[index];
        normB += b[index] * b[index];
        commonCount++;
    }

    if (!normA || !normB) return 0;
    const cosine = dot / Math.sqrt(normA * normB);
    return method === 'common-weight'
        ? cosine * commonCount / (commonCount + COMMON_RATING_SHRINKAGE)
        : cosine;
}

function getNearestUsers(activeUserId, limit = 20, method = 'co-rated') {
    const dense = getDenseSimilarityCache(method);
    const matrix = dense ? dense.matrix : ratingMatrix;
    const activeRatings = matrix[activeUserId];
    if (!activeRatings) return [];

    const neighbors = [];
    for (let userId = 1; userId <= numUsers; userId++) {
        if (userId === activeUserId) continue;
        const similarity = cosineSimilarity(activeRatings, matrix[userId], method);
        if (similarity > 0) neighbors.push({ userId, similarity });
    }

    return neighbors
        .sort((a, b) => b.similarity - a.similarity || a.userId - b.userId)
        .slice(0, limit);
}

// ---------------------------------------------------------------------------
// User-Based CF.
//
// Return the top-K recommendations for the active user as an array of
// { title, score }, sorted by score descending.
//
// Suggested steps (week3/readme.md section 5.4):
//   1. compare the active user's rating vector against every other user
//   2. take the N most similar users with positive similarity (e.g. N = 20)
//   3. for each movie the active user has NOT rated, predict a score as the
//      similarity-weighted average of those users' ratings
//   4. sort and take the top K
// ---------------------------------------------------------------------------
function getUserBasedRecommendations(activeUserId, topK = 5, neighbors = null, method = 'co-rated') {
    const activeRatings = ratingMatrix[activeUserId];
    if (!activeRatings) return [];
    if (!neighbors) neighbors = getNearestUsers(activeUserId, 20, method);

    const candidates = new Map();
    for (const { userId, similarity } of neighbors) {
        for (const { itemId, rating } of ratingsByUser[userId]) {
            if (activeRatings[itemId] !== 0 || !hasKnownMovieTitle(itemId)) continue;
            if (!candidates.has(itemId)) {
                candidates.set(itemId, { itemId, weightedSum: 0, weightSum: 0, contributors: [] });
            }
            const candidate = candidates.get(itemId);
            candidate.weightedSum += similarity * rating;
            candidate.weightSum += similarity;
            candidate.contributors.push({ userId, rating, similarity });
        }
    }

    return [...candidates.values()]
        .map(candidate => ({
            itemId: candidate.itemId,
            title: movieTitle(candidate.itemId),
            score: Math.max(1, Math.min(5, candidate.weightedSum / candidate.weightSum)),
            contributors: candidate.contributors
        }))
        .sort((a, b) => b.score - a.score || b.contributors.length - a.contributors.length || a.itemId - b.itemId)
        .slice(0, topK);
}

// The same co-rated-only cosine, computed directly from sparse movie columns.
function itemSimilarity(firstItemId, secondItemId, method = 'co-rated', dense = getDenseSimilarityCache(method)) {
    if (dense) {
        const denominator = dense.itemNorms[firstItemId] * dense.itemNorms[secondItemId];
        if (!denominator) return 0;
        let dot = 0;
        for (let userId = 1; userId <= numUsers; userId++) {
            dot += dense.matrix[userId][firstItemId] * dense.matrix[userId][secondItemId];
        }
        return dot / denominator;
    }

    const first = ratingsByMovie[firstItemId];
    const second = ratingsByMovie[secondItemId];
    let firstIndex = 0;
    let secondIndex = 0;
    let dot = 0;
    let normFirst = 0;
    let normSecond = 0;
    let commonCount = 0;

    while (firstIndex < first.length && secondIndex < second.length) {
        const firstRating = first[firstIndex];
        const secondRating = second[secondIndex];
        if (firstRating.userId < secondRating.userId) {
            firstIndex++;
        } else if (firstRating.userId > secondRating.userId) {
            secondIndex++;
        } else {
            dot += firstRating.rating * secondRating.rating;
            normFirst += firstRating.rating ** 2;
            normSecond += secondRating.rating ** 2;
            commonCount++;
            firstIndex++;
            secondIndex++;
        }
    }

    if (!normFirst || !normSecond) return 0;
    const cosine = dot / Math.sqrt(normFirst * normSecond);
    return method === 'common-weight'
        ? cosine * commonCount / (commonCount + COMMON_RATING_SHRINKAGE)
        : cosine;
}

// ---------------------------------------------------------------------------
// Item-Based CF.
//
// Return the top-K recommendations for the active user as an array of
// { title, score }, sorted by score descending.
//
// Suggested steps (week3/readme.md section 5.5):
//   1. for each movie the active user has rated, compute the item-item
//      similarity against every other movie's rating column
//   2. for each candidate movie the active user has NOT rated, aggregate the
//      similarities from the rated movies, weighted by the user's rating
//   3. sort and take the top K
// ---------------------------------------------------------------------------
function getItemBasedRecommendations(activeUserId, topK = 5, method = 'co-rated') {
    const activeRatings = ratingMatrix[activeUserId];
    const ratedMovies = ratingsByUser[activeUserId];
    if (!activeRatings || !ratedMovies || ratedMovies.length === 0) return [];
    const dense = getDenseSimilarityCache(method);

    const candidates = [];
    for (let itemId = 1; itemId <= numMovies; itemId++) {
        if (activeRatings[itemId] !== 0 || !hasKnownMovieTitle(itemId)) continue;

        let weightedSum = 0;
        let weightSum = 0;
        const contributors = [];
        for (const { itemId: ratedItemId, rating } of ratedMovies) {
            const similarity = itemSimilarity(itemId, ratedItemId, method, dense);
            if (similarity <= 0) continue;
            weightedSum += similarity * rating;
            weightSum += similarity;
            contributors.push({ itemId: ratedItemId, rating, similarity });
        }

        if (weightSum > 0) {
            candidates.push({
                itemId,
                title: movieTitle(itemId),
                score: Math.max(1, Math.min(5, weightedSum / weightSum)),
                contributors
            });
        }
    }

    return candidates
        .sort((a, b) => b.score - a.score || b.contributors.length - a.contributors.length || a.itemId - b.itemId)
        .slice(0, topK);
}

function predictionFallback(userId, itemId) {
    const movieRatings = ratingsByMovie[itemId] || [];
    if (movieRatings.length) {
        const mean = movieRatings.reduce((sum, entry) => sum + entry.rating, 0) / movieRatings.length;
        return { score: mean, evidence: `No usable neighbors; using this film's average from ${movieRatings.length} observed ratings.` };
    }
    const userRatings = ratingsByUser[userId] || [];
    if (userRatings.length) {
        const mean = userRatings.reduce((sum, entry) => sum + entry.rating, 0) / userRatings.length;
        return { score: mean, evidence: `No usable neighbors or film ratings; using this user's observed average.` };
    }
    const globalMean = ratings.reduce((sum, entry) => sum + entry.rating, 0) / ratings.length;
    return { score: globalMean, evidence: 'No usable neighbors; using the overall observed average.' };
}

function predictUserBasedScore(userId, itemId, method, neighbors = null) {
    const closest = neighbors || getNearestUsers(userId, 20, method);
    let weightedSum = 0;
    let weightSum = 0;
    let contributors = 0;
    for (const { userId: neighborId, similarity } of closest) {
        const neighborRating = ratingMatrix[neighborId][itemId];
        if (neighborRating === 0) continue;
        weightedSum += similarity * neighborRating;
        weightSum += similarity;
        contributors++;
    }
    return weightSum > 0
        ? { score: weightedSum / weightSum,
            evidence: `${contributors} of the ${closest.length} closest similar users rated this film.` }
        : predictionFallback(userId, itemId);
}

function predictItemBasedScore(userId, itemId, method) {
    const dense = getDenseSimilarityCache(method);
    let weightedSum = 0;
    let weightSum = 0;
    let contributors = 0;
    for (const { itemId: ratedItemId, rating } of ratingsByUser[userId]) {
        const similarity = itemSimilarity(itemId, ratedItemId, method, dense);
        if (similarity <= 0) continue;
        weightedSum += similarity * rating;
        weightSum += similarity;
        contributors++;
    }
    return weightSum > 0
        ? { score: weightedSum / weightSum,
            evidence: `${contributors} films this user actually rated contributed to the score.` }
        : predictionFallback(userId, itemId);
}

async function predictSelectedRating() {
    const userId = Number(document.getElementById('prediction-user-select').value);
    const movieLabel = document.getElementById('prediction-movie-input').value;
    const itemId = predictionMovieLabels.get(movieLabel);
    const method = document.getElementById('prediction-method').value;
    const status = document.getElementById('prediction-status');
    const button = document.getElementById('predict-rating-btn');
    document.getElementById('prediction-result').hidden = true;
    if (!Number.isInteger(userId) || userId < 1 || !ratingMatrix?.[userId]) {
        status.textContent = 'Select a user first.';
        return;
    }
    if (!Number.isInteger(itemId) || itemId < 1 || !movieById.has(itemId)) {
        status.textContent = 'Choose an unrated film from the suggestions.';
        return;
    }
    if (ratingMatrix[userId][itemId] !== 0) {
        status.textContent = `User ${userId} already rated this film ${ratingMatrix[userId][itemId]} / 5. Choose an unrated film for a prediction.`;
        return;
    }
    if (!METHOD_INFO[method] || button.disabled) return;
    button.disabled = true;
    status.textContent = method === 'matrix-factorization'
        ? 'Training the factor model and predicting ratings...'
        : 'Predicting ratings...';
    try {
        await new Promise(resolve => setTimeout(resolve, 0));
        getDenseSimilarityCache(method);
        const neighbors = getNearestUsers(userId, 20, method);
        const userPrediction = predictUserBasedScore(userId, itemId, method, neighbors);
        const itemPrediction = predictItemBasedScore(userId, itemId, method);
        if (Number(document.getElementById('prediction-user-select').value) !== userId ||
            document.getElementById('prediction-movie-input').value !== movieLabel ||
            document.getElementById('prediction-method').value !== method) return;
        document.getElementById('prediction-context').textContent =
            `User ${userId} · ${movieTitle(itemId)}`;
        const userScore = Math.max(1, Math.min(5, userPrediction.score));
        const itemScore = Math.max(1, Math.min(5, itemPrediction.score));
        const userScoreElement = document.getElementById('prediction-user-score');
        const itemScoreElement = document.getElementById('prediction-item-score');
        userScoreElement.textContent = `${userScore.toFixed(2)} / 5`;
        itemScoreElement.textContent = `${itemScore.toFixed(2)} / 5`;
        userScoreElement.className = scoreColorClass(userScore);
        itemScoreElement.className = scoreColorClass(itemScore);
        document.getElementById('prediction-user-evidence').textContent = userPrediction.evidence;
        document.getElementById('prediction-item-evidence').textContent = itemPrediction.evidence;
        document.getElementById('prediction-result').hidden = false;
        status.textContent = '';
    } catch (error) {
        console.error('Rating prediction error:', error);
        status.textContent = 'Prediction failed. See the browser console for details.';
    } finally {
        button.disabled = false;
    }
}

async function getRecommendations() {
    const selectElement = document.getElementById('user-select');
    const userId = parseInt(selectElement.value, 10);
    const method = selectedMethod();
    const status = document.getElementById('status-message');
    const button = document.getElementById('recommend-btn');

    if (!Number.isInteger(userId) || !ratingMatrix || !ratingMatrix[userId]) {
        showMessage('user-based-result', 'Please select a user first.');
        showMessage('item-based-result', 'Please select a user first.');
        document.getElementById('user-based-explanation').hidden = true;
        document.getElementById('item-based-explanation').hidden = true;
        status.textContent = '';
        return;
    }

    if (button.disabled) return;
    button.disabled = true;
    status.textContent = method === 'matrix-factorization'
        ? 'Training the matrix factorization model and calculating recommendations...'
        : 'Calculating recommendations...';
    try {
        // Allow the status message to paint before an expensive first calculation.
        await new Promise(resolve => setTimeout(resolve, 0));
        getDenseSimilarityCache(method);
        const neighbors = getNearestUsers(userId, 20, method);
        const userRecommendations = getUserBasedRecommendations(userId, 5, neighbors, method);
        const itemRecommendations = getItemBasedRecommendations(userId, 5, method);
        renderRecommendations('user-based-result', userRecommendations);
        renderRecommendations('item-based-result', itemRecommendations);
        renderUserExplanation(userId, neighbors, userRecommendations, method);
        renderItemExplanation(itemRecommendations, method);
        status.textContent = '';
    } catch (error) {
        console.error('Recommendation error:', error);
        showMessage('user-based-result', 'Could not calculate recommendations.');
        showMessage('item-based-result', 'Could not calculate recommendations.');
        document.getElementById('user-based-explanation').hidden = true;
        document.getElementById('item-based-explanation').hidden = true;
        status.textContent = 'Calculation failed. See the browser console for details.';
    } finally {
        button.disabled = false;
    }
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

function scoreColorClass(score) {
    if (score < 3) return 'score--low';
    if (score < 4) return 'score--medium';
    return 'score--high';
}

function showMessage(elementId, message) {
    document.getElementById(elementId).innerHTML = `<p>${escapeHtml(message)}</p>`;
}

function renderRecommendations(elementId, items) {
    const el = document.getElementById(elementId);
    if (items.length === 0) {
        showMessage(elementId, 'No recommendations are available for this user.');
        return;
    }
    const entries = items
        .map(item => `<li><strong>${escapeHtml(item.title)}</strong><span class="score"><span class="score-value ${scoreColorClass(item.score)}">Predicted rating: ${item.score.toFixed(2)} / 5</span></span></li>`)
        .join('');
    el.innerHTML = `<ol class="recommendation-list">${entries}</ol>`;
}

function renderUserExplanation(activeUserId, neighbors, recommendations, method = 'co-rated') {
    const details = document.getElementById('user-based-explanation');
    if (recommendations.length === 0) {
        details.hidden = true;
        return;
    }

    const contributingUsers = neighbors.filter(neighbor =>
        recommendations.some(movie => ratingMatrix[neighbor.userId][movie.itemId] !== 0)
    );
    const selectedUsers = contributingUsers.slice(0, 3);
    for (const neighbor of neighbors) {
        if (selectedUsers.length === 3) break;
        if (!selectedUsers.includes(neighbor)) selectedUsers.push(neighbor);
    }

    const entries = selectedUsers.map(({ userId, similarity }) => {
        const supportingMovies = recommendations
            .filter(movie => ratingMatrix[userId][movie.itemId] !== 0)
            .map(movie => ({ itemId: movie.itemId, rating: ratingMatrix[userId][movie.itemId] }));
        const examples = supportingMovies.length > 0
            ? supportingMovies
            : ratingsByUser[userId].filter(movie => ratingMatrix[activeUserId][movie.itemId] === 0)
                .sort((a, b) => b.rating - a.rating || a.itemId - b.itemId).slice(0, 3);
        const label = supportingMovies.length > 0
            ? 'Recommended films rated by this user:'
            : 'Other films rated by this user that you have not seen:';
        const films = examples.map(({ itemId, rating }) =>
            `<li>${escapeHtml(movieTitle(itemId))} — rated ${rating} / 5</li>`
        ).join('');
        return `<li><strong>User ${userId}</strong> (similarity ${similarity.toFixed(3)})<ul><li>${label}<ul>${films || '<li>No unseen films.</li>'}</ul></li></ul></li>`;
    }).join('');

    const supportCounts = recommendations.map(movie =>
        `<li>${escapeHtml(movie.title)} — ${movie.contributors.length} neighbor rating${movie.contributors.length === 1 ? '' : 's'}</li>`
    ).join('');
    details.querySelector('.explanation-content').innerHTML =
        `<ul class="method-list"><li>${escapeHtml(METHOD_INFO[method].report)}</li><li>Predicted each score as a similarity-weighted average of observed ratings from up to 20 nearest users.</li><li>Ratings supporting each recommendation:<ul>${supportCounts}</ul></li><li>Three similar users and their films, prioritizing users who rated a displayed recommendation:</li></ul><ol class="evidence-list">${entries}</ol>`;
    details.hidden = false;
    details.open = false;
}

function renderItemExplanation(recommendations, method = 'co-rated') {
    const details = document.getElementById('item-based-explanation');
    if (recommendations.length === 0) {
        details.hidden = true;
        return;
    }

    const entries = recommendations.map(movie => {
        const sourceFilms = [...movie.contributors]
            .sort((a, b) => b.similarity * b.rating - a.similarity * a.rating)
            .slice(0, 3)
            .map(({ itemId, rating, similarity }) =>
                `<li>${escapeHtml(movieTitle(itemId))} — your rating ${rating} / 5; similarity ${similarity.toFixed(3)}</li>`
            ).join('');
        return `<li><strong>${escapeHtml(movie.title)}</strong> — ${movie.contributors.length} rated film${movie.contributors.length === 1 ? '' : 's'}<ul>${sourceFilms}</ul></li>`;
    }).join('');

    details.querySelector('.explanation-content').innerHTML =
        `<ul class="method-list"><li>${escapeHtml(METHOD_INFO[method].report)}</li><li>Predicted each score as a similarity-weighted average of your observed ratings.</li><li>For each recommendation, the three rated films with the largest weighted contributions are listed below.</li></ul><ol class="evidence-list">${entries}</ol>`;
    details.hidden = false;
    details.open = false;
}
