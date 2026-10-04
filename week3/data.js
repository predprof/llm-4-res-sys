// Global variables for storing movie and rating data
let movies = [];
let ratings = [];

// Collaborative filtering structures (populated by buildRatingMatrix)
let numUsers = 0;          // highest user id found in u.data
let numMovies = 0;         // number of parsed movies
let ratingMatrix = null;   // (numUsers + 1) x (numMovies + 1); 0 = "not rated"
let ratingsByUser = [];    // sparse rows: [{ itemId, rating }]
let ratingsByMovie = [];   // sparse columns: [{ userId, rating }]
let movieById = new Map();

// u.item has 19 flags: "unknown" first, followed by 18 named genres.
const genreNames = [
    "Unknown", "Action", "Adventure", "Animation", "Children's", "Comedy",
    "Crime", "Documentary", "Drama", "Fantasy", "Film-Noir",
    "Horror", "Musical", "Mystery", "Romance", "Sci-Fi",
    "Thriller", "War", "Western"
];

// Primary function to load data from files
async function loadData() {
    try {
        movies = [];
        ratings = [];

        // Load and parse movie data
        const moviesResponse = await fetch('u.item');
        if (!moviesResponse.ok) {
            throw new Error(`Failed to load movie data: ${moviesResponse.status}`);
        }
        // MovieLens u.item is Latin-1, not UTF-8.
        const moviesText = new TextDecoder('iso-8859-1').decode(await moviesResponse.arrayBuffer());
        parseItemData(moviesText);

        // Load and parse rating data
        const ratingsResponse = await fetch('u.data');
        if (!ratingsResponse.ok) {
            throw new Error(`Failed to load rating data: ${ratingsResponse.status}`);
        }
        const ratingsText = await ratingsResponse.text();
        parseRatingData(ratingsText);

        // Derive matrix dimensions, then build the rating matrix
        numUsers = ratings.reduce((max, r) => Math.max(max, r.userId), 0);
        numMovies = movies.length;
        buildRatingMatrix();
    } catch (error) {
        console.error('Error loading data:', error);
        const errorTarget = document.getElementById('user-based-result');
        if (errorTarget) {
            errorTarget.innerHTML = `<p class="error">Error: ${error.message}. Please make sure u.item and u.data are in the correct location.</p>`;
        }
        const itemErrorTarget = document.getElementById('item-based-result');
        if (itemErrorTarget) {
            itemErrorTarget.innerHTML = '<p class="error">Movie data could not be loaded.</p>';
        }
        throw error; // Re-throw so script.js can handle the error
    }
}

// Parse movie data from u.item format
function parseItemData(text) {
    const lines = text.split('\n');

    for (const line of lines) {
        if (line.trim() === '') continue;

        const fields = line.split('|');
        if (fields.length < 24) continue; // Skip incomplete rows

        const id = parseInt(fields[0]);
        const title = fields[1];

        const genreValues = fields.slice(5, 24);
        const genres = genreNames.filter((_, index) => genreValues[index] === '1');

        movies.push({ id, title, genres });
    }
}

// Keep the raw title in `movies`, but identify a missing source title in the UI.
function movieTitle(itemId) {
    const movie = movieById.get(itemId);
    if (!movie) return `Unknown movie (ID ${itemId})`;
    return movie.title.trim().toLowerCase() === 'unknown'
        ? `Unknown title (movie ID ${itemId})`
        : movie.title;
}

function hasKnownMovieTitle(itemId) {
    const movie = movieById.get(itemId);
    return Boolean(movie && movie.title.trim().toLowerCase() !== 'unknown');
}

// Parse rating data from u.data format
function parseRatingData(text) {
    const lines = text.split('\n');

    for (const line of lines) {
        if (line.trim() === '') continue;

        const fields = line.split('\t');
        if (fields.length < 4) continue; // Skip invalid lines

        const userId = parseInt(fields[0]);
        const itemId = parseInt(fields[1]);
        const rating = parseFloat(fields[2]);
        const timestamp = parseInt(fields[3]);

        ratings.push({ userId, itemId, rating, timestamp });
    }
}

// ---------------------------------------------------------------------------
// Build the user-item rating matrix.
//
// Shape: (numUsers + 1) x (numMovies + 1), indexed by raw id, so that
//   ratingMatrix[userId][movieId] === rating
// and a missing entry is 0. MovieLens ratings are 1-5, so 0 is unambiguous.
//
// Store the result in the global variable `ratingMatrix`.
// ---------------------------------------------------------------------------
function buildRatingMatrix() {
    ratingMatrix = Array.from(
        { length: numUsers + 1 },
        () => new Uint8Array(numMovies + 1)
    );
    ratingsByUser = Array.from({ length: numUsers + 1 }, () => []);
    ratingsByMovie = Array.from({ length: numMovies + 1 }, () => []);
    movieById = new Map(movies.map(movie => [movie.id, movie]));

    for (const { userId, itemId, rating } of ratings) {
        if (!ratingMatrix[userId] || !movieById.has(itemId)) continue;
        ratingMatrix[userId][itemId] = rating;
        ratingsByUser[userId].push({ itemId, rating });
        ratingsByMovie[itemId].push({ userId, rating });
    }

    // Sorted sparse columns let item similarity visit only users who rated
    // either film, rather than scanning every entry of the dense matrix.
    for (const column of ratingsByMovie) {
        column.sort((a, b) => a.userId - b.userId);
    }
}
