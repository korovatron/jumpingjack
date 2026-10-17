// Client-side name filter. Names are limited to A-Z, 0-9, space, _ and - by the Firestore rules.

// Blocked anywhere in the name (spaces and punctuation ignored)
const BLOCKED_ANYWHERE = [
    'fuck', 'shit', 'cunt', 'bitch', 'bastard', 'whore', 'slut', 'wank', 'twat', 'pussy',
    'nigg', 'faggot', 'retard', 'rapist', 'nazi', 'hitler', 'porn', 'penis', 'vagina', 'dildo',
    'blowjob', 'handjob', 'cumshot', 'asshole', 'arsehole', 'dickhead', 'cocksuck', 'bollock',
    'negro', 'negress'
];

// Blocked only as a whole word, because they appear inside innocent words (class, Essex, peacock...)
const BLOCKED_WHOLE_WORD = [
    'ass', 'arse', 'anus', 'dick', 'cock', 'cum', 'tit', 'tits', 'boob', 'boobs', 'sex', 'rape',
    'paki', 'coon', 'spic', 'chink', 'kike', 'dyke', 'fag', 'gook', 'tard', 'piss', 'prick'
];

const LEET_MAP = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

// Each letter may be repeated, so "fuuuck" matches "fuck" but "niger" does not match "nigg"
function repeatTolerantPattern(word, whole) {
    const body = word.split('').map(c => c + '+').join('');
    return new RegExp(whole ? '^' + body + '$' : body);
}

const anywherePatterns = BLOCKED_ANYWHERE.map(w => repeatTolerantPattern(w, false));
const wholeWordPatterns = BLOCKED_WHOLE_WORD.map(w => repeatTolerantPattern(w, true));

function normaliseForFilter(text) {
    return text.toLowerCase()
        .replace(/[013457@$!]/g, c => LEET_MAP[c] || c)
        .replace(/[^a-z]/g, '');
}

function isNameAllowed(name) {
    const tokens = String(name).split(/[\s_-]+/).map(normaliseForFilter).filter(t => t.length > 0);
    const joined = tokens.join('');
    if (anywherePatterns.some(p => p.test(joined))) {
        return false;
    }
    return !tokens.some(token => wholeWordPatterns.some(p => p.test(token)));
}

// Used when showing names fetched from the database
function cleanNameForDisplay(name) {
    return isNameAllowed(name) ? name : '*'.repeat(name.length);
}
