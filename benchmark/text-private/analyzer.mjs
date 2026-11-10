// Client-side approximation of Lucene 10.4.0 `new EnglishAnalyzer()`:
// StandardTokenizer (UAX #29 words, max 255 UTF-16 units) -> EnglishPossessiveFilter
// -> LowerCaseFilter -> StopFilter(ENGLISH_STOP_WORDS_SET) -> PorterStemFilter.
// The Porter stemmer below is a direct port of Lucene's PorterStemmer.java
// (Apache License 2.0, derived from Martin Porter's Release 3 Java implementation).

export const ENGLISH_STOP_WORDS = Object.freeze(new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'if', 'in', 'into', 'is',
    'it', 'no', 'not', 'of', 'on', 'or', 'such', 'that', 'the', 'their', 'then', 'there',
    'these', 'they', 'this', 'to', 'was', 'will', 'with',
]));
const MAX_TOKEN_LENGTH = 255;
const segmenter = new Intl.Segmenter('en', { granularity: 'word' });
// StandardTokenizer emits each Han ideograph and Hiragana character as its own token.
const SINGLE = /[\p{Script=Han}\p{Script=Hiragana}]/u;
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

const WORD = /[\p{L}\p{N}]/u;
// Lucene has no dictionary for these scripts: it keeps contiguous runs (and Hangul
// attached to adjacent letters/digits) together, whereas ICU splits them.
const JOINED = /[\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

function* segments(text) {
    let previous = null;
    for (const { segment, index, isWordLike } of segmenter.segment(text)) {
        const word = isWordLike && WORD.test(segment);
        if (word && previous && previous.end === index && (JOINED.test(segment) || JOINED.test(previous.text))) {
            previous.text += segment; previous.end += segment.length; continue;
        }
        if (previous) yield previous.text;
        previous = null;
        // ICU marks underscore-only runs word-like; Lucene emits no token for them.
        if (word) previous = { text: segment, end: index + segment.length };
        else if (EMOJI.test(segment)) yield segment;
    }
    if (previous) yield previous.text;
}

function* words(text) {
    for (const segment of segments(text)) {
        if (SINGLE.test(segment)) {
            // Split ideographs/hiragana; keep other runs (e.g. Latin, Katakana) together.
            let run = '';
            for (const char of segment) {
                if (SINGLE.test(char)) { if (run) yield run; run = ''; yield char; } else run += char;
            }
            if (run) yield run;
        } else yield segment;
    }
}

export function tokenize(text) {
    const tokens = [];
    for (const word of words(text)) {
        for (let i = 0; i < word.length; i += MAX_TOKEN_LENGTH) tokens.push(word.slice(i, i + MAX_TOKEN_LENGTH));
    }
    return tokens;
}

export function possessive(token) {
    const n = token.length;
    return n >= 2 && "'’＇".includes(token[n - 2]) && (token[n - 1] === 's' || token[n - 1] === 'S') ? token.slice(0, n - 2) : token;
}

// Java Character.toLowerCase(int) uses simple case mapping; JS uses full mapping.
// U+0130 is the only code point whose full lowercase mapping has two code points.
export function lowercase(token) {
    let out = '';
    for (const char of token) out += String.fromCodePoint(char.toLowerCase().codePointAt(0));
    return out;
}

export function analyze(text) {
    const terms = [];
    for (const token of tokenize(text)) {
        const term = lowercase(possessive(token));
        if (!ENGLISH_STOP_WORDS.has(term)) terms.push(porterStem(term));
    }
    return terms;
}

export function porterStem(word) {
    const b = word.split(''); // UTF-16 code units, as Lucene's char[] buffer.
    let k = b.length - 1, j = 0;
    const k0 = 0;
    const cons = i => {
        switch (b[i]) {
            case 'a': case 'e': case 'i': case 'o': case 'u': return false;
            case 'y': return i === k0 ? true : !cons(i - 1);
            default: return true;
        }
    };
    const m = () => {
        let n = 0, i = k0;
        for (;;) { if (i > j) return n; if (!cons(i)) break; i++; }
        i++;
        for (;;) {
            for (;;) { if (i > j) return n; if (cons(i)) break; i++; }
            i++; n++;
            for (;;) { if (i > j) return n; if (!cons(i)) break; i++; }
            i++;
        }
    };
    const vowelinstem = () => { for (let i = k0; i <= j; i++) if (!cons(i)) return true; return false; };
    const doublec = x => x >= k0 + 1 && b[x] === b[x - 1] && cons(x);
    const cvc = i => {
        if (i < k0 + 2 || !cons(i) || cons(i - 1) || !cons(i - 2)) return false;
        return !(b[i] === 'w' || b[i] === 'x' || b[i] === 'y');
    };
    const ends = s => {
        const l = s.length, o = k - l + 1;
        if (o < k0) return false;
        for (let i = 0; i < l; i++) if (b[o + i] !== s[i]) return false;
        j = k - l;
        return true;
    };
    const setto = s => { for (let i = 0; i < s.length; i++) b[j + 1 + i] = s[i]; k = j + s.length; };
    const r = s => { if (m() > 0) setto(s); };
    const step1 = () => {
        if (b[k] === 's') {
            if (ends('sses')) k -= 2;
            else if (ends('ies')) setto('i');
            else if (b[k - 1] !== 's') k--;
        }
        if (ends('eed')) { if (m() > 0) k--; }
        else if ((ends('ed') || ends('ing')) && vowelinstem()) {
            k = j;
            if (ends('at')) setto('ate');
            else if (ends('bl')) setto('ble');
            else if (ends('iz')) setto('ize');
            else if (doublec(k)) { const ch = b[k--]; if (ch === 'l' || ch === 's' || ch === 'z') k++; }
            else if (m() === 1 && cvc(k)) setto('e');
        }
    };
    const step2 = () => { if (ends('y') && vowelinstem()) b[k] = 'i'; };
    const step3 = () => {
        if (k === k0) return;
        const rules = {
            a: [['ational', 'ate'], ['tional', 'tion']], c: [['enci', 'ence'], ['anci', 'ance']], e: [['izer', 'ize']],
            l: [['bli', 'ble'], ['alli', 'al'], ['entli', 'ent'], ['eli', 'e'], ['ousli', 'ous']],
            o: [['ization', 'ize'], ['ation', 'ate'], ['ator', 'ate']],
            s: [['alism', 'al'], ['iveness', 'ive'], ['fulness', 'ful'], ['ousness', 'ous']],
            t: [['aliti', 'al'], ['iviti', 'ive'], ['biliti', 'ble']], g: [['logi', 'log']],
        }[b[k - 1]] || [];
        for (const [suffix, replacement] of rules) if (ends(suffix)) { r(replacement); break; }
    };
    const step4 = () => {
        const rules = { e: [['icate', 'ic'], ['ative', ''], ['alize', 'al']], i: [['iciti', 'ic']],
            l: [['ical', 'ic'], ['ful', '']], s: [['ness', '']] }[b[k]] || [];
        for (const [suffix, replacement] of rules) if (ends(suffix)) { r(replacement); break; }
    };
    const step5 = () => {
        if (k === k0) return;
        let hit = false;
        switch (b[k - 1]) {
            case 'a': hit = ends('al'); break;
            case 'c': hit = ends('ance') || ends('ence'); break;
            case 'e': hit = ends('er'); break;
            case 'i': hit = ends('ic'); break;
            case 'l': hit = ends('able') || ends('ible'); break;
            case 'n': hit = ends('ant') || ends('ement') || ends('ment') || ends('ent'); break;
            case 'o': hit = (ends('ion') && j >= 0 && (b[j] === 's' || b[j] === 't')) || ends('ou'); break;
            case 's': hit = ends('ism'); break;
            case 't': hit = ends('ate') || ends('iti'); break;
            case 'u': hit = ends('ous'); break;
            case 'v': hit = ends('ive'); break;
            case 'z': hit = ends('ize'); break;
            default: return;
        }
        if (hit && m() > 1) k = j;
    };
    const step6 = () => {
        j = k;
        if (b[k] === 'e') { const a = m(); if (a > 1 || (a === 1 && !cvc(k - 1))) k--; }
        if (b[k] === 'l' && doublec(k) && m() > 1) k--;
    };
    if (k > k0 + 1) { step1(); step2(); step3(); step4(); step5(); step6(); }
    return b.slice(0, k + 1).join('');
}
