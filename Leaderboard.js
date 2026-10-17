// Leaderboard data (Firestore via leaderboardService.js) and title screen paging.
// On the title screen the big Jack sprite shows first, then after a delay swaps out
// for a few pages of the Top 50 leaderboard, before returning to the sprite again.

const LEADERBOARD_SIZE = 50;
const LEADERBOARD_ROWS_PER_PAGE = 8;
const TITLE_SPRITE_SECONDS = 10; // how long the big title sprite shows before the leaderboard takes its place
const LEADERBOARD_PAGE_SECONDS = 8; // how long each leaderboard page shows
const TITLE_FADE_SECONDS = 0.35;
const LEADERBOARD_NAME_LENGTH = 10;
const LEADERBOARD_DATE_LENGTH = 8;
const LEADERBOARD_TIMEOUT_MS = 8000;

let leaderboardEntries = [];
let leaderboardLoaded = false;
let highlightedEntry = null; // the player's most recent entry, shown in green
const titleView = { mode: 'sprite', page: 0, timer: 0 };

// Firestore calls can hang forever when offline, so never wait on them without a limit
function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
    ]);
}

function whenLeaderboardServiceReady(callback) {
    if (window.leaderboardReady) {
        callback();
    } else {
        window.addEventListener('leaderboard-ready', callback, { once: true });
    }
}

// Resolves true if the list was refreshed from the database
function loadLeaderboard() {
    return new Promise(resolve => {
        whenLeaderboardServiceReady(() => {
            const service = window.leaderboardService;
            if (!service) {
                resolve(false);
                return;
            }
            withTimeout(service.fetchTop(LEADERBOARD_SIZE), LEADERBOARD_TIMEOUT_MS)
                .then(entries => {
                    leaderboardEntries = entries
                        .filter(e => typeof e.name === 'string' && Number.isFinite(e.score) && Number.isFinite(e.level))
                        .map(e => ({
                            name: cleanNameForDisplay(e.name),
                            score: e.score,
                            level: e.level,
                            createdAt: e.createdAt instanceof Date ? e.createdAt : null
                        }));
                    leaderboardLoaded = true;
                    resolve(true);
                })
                .catch(err => {
                    console.warn('Could not load leaderboard:', err);
                    resolve(false);
                });
        });
    });
}

function leaderboardQualifies(score) {
    if (!window.leaderboardService || !leaderboardLoaded || score <= 0) {
        return false;
    }
    return leaderboardEntries.length < LEADERBOARD_SIZE ||
        score > leaderboardEntries[leaderboardEntries.length - 1].score;
}

// Ties rank below existing entries with the same score
function leaderboardRankFor(score) {
    return leaderboardEntries.filter(e => e.score >= score).length + 1;
}

function submitLeaderboardEntry(name, score, level) {
    return withTimeout(window.leaderboardService.submit({ name, score, level }), LEADERBOARD_TIMEOUT_MS);
}

// Shows a just-submitted entry straight away, without waiting for another read
function insertLeaderboardEntryLocally(entry) {
    const index = leaderboardRankFor(entry.score) - 1;
    leaderboardEntries.splice(index, 0, entry);
    leaderboardEntries.length = Math.min(leaderboardEntries.length, LEADERBOARD_SIZE);
    highlightedEntry = entry;
    return index;
}

function showLeaderboardPageForRank(index) {
    if (index >= 0 && index < leaderboardEntries.length) {
        titleView.mode = 'leaderboard';
        titleView.page = Math.floor(index / LEADERBOARD_ROWS_PER_PAGE);
        titleView.timer = 0;
    }
}
function leaderboardPageCount() {
    return Math.ceil(leaderboardEntries.length / LEADERBOARD_ROWS_PER_PAGE);
}

function resetTitleView() {
    // Always start with the big title sprite (app start / return to title after game over),
    // then the normal sprite <-> leaderboard alternation takes over from there.
    titleView.mode = 'sprite';
    titleView.page = 0;
    titleView.timer = 0;
}

function updateTitleView(secondsPassed) {
    if (leaderboardEntries.length === 0) {
        // Nothing to page through yet, so fall back to the title sprite.
        titleView.mode = 'sprite';
        titleView.page = 0;
        titleView.timer = 0;
        return;
    }

    titleView.timer += secondsPassed;
    if (titleView.mode === 'sprite') {
        if (titleView.timer >= TITLE_SPRITE_SECONDS) {
            titleView.mode = 'leaderboard';
            titleView.page = 0;
            titleView.timer = 0;
        }
    } else if (titleView.timer >= LEADERBOARD_PAGE_SECONDS) {
        titleView.timer = 0;
        titleView.page++;
        if (titleView.page >= leaderboardPageCount()) {
            titleView.mode = 'sprite';
            titleView.page = 0;
        }
    }
}

// Fade in/out so the swap between the sprite and leaderboard pages isn't abrupt.
// Note: while leaderboard data is still loading, titleView.timer is held at 0 (see
// updateTitleView), so this naturally evaluates to 0 - the leaderboard stays hidden for that
// brief moment rather than popping to full opacity and then dipping once data arrives.
function titleViewAlpha() {
    if (leaderboardEntries.length === 0) {
        // Nothing to fade against yet (see updateTitleView) - keep the sprite fully visible
        // rather than pinned at the start of a fade-in that never progresses.
        return 1;
    }
    const duration = titleView.mode === 'sprite' ? TITLE_SPRITE_SECONDS : LEADERBOARD_PAGE_SECONDS;
    const fadeIn = Math.min(1, titleView.timer / TITLE_FADE_SECONDS);
    const fadeOut = Math.min(1, (duration - titleView.timer) / TITLE_FADE_SECONDS);
    return Math.max(0, Math.min(fadeIn, fadeOut));
}

// Short numeric date in the visitor's own locale order (e.g. 10/06/26 or 06/10/26)
function formatLeaderboardDate(date) {
    if (!(date instanceof Date) || isNaN(date)) {
        return '';
    }
    return date.toLocaleDateString(navigator.language, { year: '2-digit', month: '2-digit', day: '2-digit' });
}

function formatLeaderboardRow(rank, name, level, score, date) {
    return String(rank).padStart(2) + "  " +
        String(name).padEnd(LEADERBOARD_NAME_LENGTH) + "  " +
        String(level).padStart(3) + "  " +
        String(score).padStart(7) + "  " +
        String(date).padStart(LEADERBOARD_DATE_LENGTH);
}

function drawLeaderboardPage(ctx) {
    drawCentredText(ctx, "TOP " + LEADERBOARD_SIZE + " PLAYERS", 60, "white", 4);
    drawCentredText(ctx, formatLeaderboardRow("RK", "NAME", "LVL", "SCORE", "DATE"), 120, "#888888", 3);

    const first = titleView.page * LEADERBOARD_ROWS_PER_PAGE;
    const pageEntries = leaderboardEntries.slice(first, first + LEADERBOARD_ROWS_PER_PAGE);
    pageEntries.forEach((entry, i) => {
        const rank = first + i + 1;
        const isMine = highlightedEntry !== null && entry.name === highlightedEntry.name &&
            entry.score === highlightedEntry.score && entry.level === highlightedEntry.level;
        const colour = isMine ? "#7CFC00" : (rank <= 3 ? "yellow" : "white");
        drawCentredText(ctx, formatLeaderboardRow(rank, entry.name, entry.level, entry.score, formatLeaderboardDate(entry.createdAt)), 160 + i * 32, colour, 3);
    });
}
