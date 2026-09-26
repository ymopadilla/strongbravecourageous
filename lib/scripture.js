/*
  Scripture detection — finds Bible references in story text at build time.
  -------------------------------------------------------------------------
  Used by build.js. Nothing here is edited by Becky: she writes naturally
  ("Joshua 1:9", "Ps 23", "1 Cor. 13:4-7", "John 3:16, 17") and the site finds,
  normalizes, tags, and links every reference.

  Exports:
    BIBLE_VERSION          – translation used for BibleGateway links (one constant to change)
    BOOKS                  – canonical book table in Bible order (name + accepted short names)
    findReferences(text)   – [{ book, order, chapter, verse, canonical, index, length }]
    canonicalRefs(text)    – unique canonical references, Bible order
    gatewayUrl(reference)  – BibleGateway URL for a canonical reference
    linkReferences(html)   – wraps detected references in story HTML with BibleGateway links
    sortRefs(refs)         – sorts canonical reference strings in Bible order

  Rules (see README → Scripture detection):
    • A book name is required, so times like "10:30" never match.
    • Numbered books accept "1", "2", "3", "I", "II", "III", "First", "Second", "Third".
    • Chapter-only references ("Psalm 23") are accepted for every book EXCEPT books whose
      name is also a common first name (John, Mark, Luke, James, Ruth, Daniel, Job…) —
      those need chapter:verse so "John 3 came over" stays a person, not a passage.
    • "Josh" is NOT accepted as short for Joshua on this site — Josh is one of the people
      the site celebrates. Write "Joshua". ("Jos" and "Jsh" are accepted.)
    • Ranges accept a hyphen or an en dash; output uses an en dash ("13:4–7").
*/

const BIBLE_VERSION = 'NIV';

/* [canonical name, [short names…], nameLike] — Bible order. Number prefixes are handled separately. */
const BOOK_TABLE = [
  ['Genesis', ['Gen', 'Ge', 'Gn']],
  ['Exodus', ['Exod', 'Exo', 'Ex']],
  ['Leviticus', ['Lev', 'Le', 'Lv']],
  ['Numbers', ['Num', 'Nu', 'Nm', 'Nb']],
  ['Deuteronomy', ['Deut', 'Deu', 'Dt']],
  ['Joshua', ['Jos', 'Jsh']],
  ['Judges', ['Judg', 'Jdg', 'Jg', 'Jdgs']],
  ['Ruth', ['Rth', 'Ru'], true],
  ['1 Samuel', ['Sam', 'Sa', 'Sm'], false, 1],
  ['2 Samuel', ['Sam', 'Sa', 'Sm'], false, 2],
  ['1 Kings', ['Kgs', 'Ki', 'Kin'], false, 1],
  ['2 Kings', ['Kgs', 'Ki', 'Kin'], false, 2],
  ['1 Chronicles', ['Chron', 'Chr', 'Ch'], false, 1],
  ['2 Chronicles', ['Chron', 'Chr', 'Ch'], false, 2],
  ['Ezra', ['Ezr'], true],
  ['Nehemiah', ['Neh', 'Ne']],
  ['Esther', ['Esth', 'Est', 'Es'], true],
  ['Job', ['Jb'], true],
  ['Psalm', ['Psalms', 'Pslm', 'Psa', 'Psm', 'Pss', 'Ps']],
  ['Proverbs', ['Prov', 'Pro', 'Prv', 'Pr']],
  ['Ecclesiastes', ['Eccles', 'Eccl', 'Ecc', 'Ec', 'Qoh']],
  ['Song of Songs', ['Song of Solomon', 'Song', 'SOS', 'Canticles', 'Cant']],
  ['Isaiah', ['Isa']],
  ['Jeremiah', ['Jer', 'Je', 'Jr']],
  ['Lamentations', ['Lam', 'La']],
  ['Ezekiel', ['Ezek', 'Eze', 'Ezk']],
  ['Daniel', ['Dan', 'Da', 'Dn'], true],
  ['Hosea', ['Hos', 'Ho']],
  ['Joel', ['Jl'], true],
  ['Amos', [], true],
  ['Obadiah', ['Obad', 'Ob']],
  ['Jonah', ['Jnh', 'Jon'], true],
  ['Micah', ['Mic', 'Mc'], true],
  ['Nahum', ['Nah', 'Na']],
  ['Habakkuk', ['Hab', 'Hb']],
  ['Zephaniah', ['Zeph', 'Zep', 'Zp']],
  ['Haggai', ['Hag', 'Hg']],
  ['Zechariah', ['Zech', 'Zec', 'Zc']],
  ['Malachi', ['Mal', 'Ml']],
  ['Matthew', ['Matt', 'Mt'], true],
  ['Mark', ['Mrk', 'Mk', 'Mr'], true],
  ['Luke', ['Luk', 'Lk'], true],
  ['John', ['Joh', 'Jhn', 'Jn'], true],
  ['Acts', ['Act', 'Ac']],
  ['Romans', ['Rom', 'Ro', 'Rm']],
  ['1 Corinthians', ['Corinthians', 'Cor', 'Co'], false, 1],
  ['2 Corinthians', ['Corinthians', 'Cor', 'Co'], false, 2],
  ['Galatians', ['Gal', 'Ga']],
  ['Ephesians', ['Eph', 'Ephes']],
  ['Philippians', ['Phil', 'Php', 'Pp']],
  ['Colossians', ['Col', 'Co']],
  ['1 Thessalonians', ['Thessalonians', 'Thess', 'Thes', 'Th'], false, 1],
  ['2 Thessalonians', ['Thessalonians', 'Thess', 'Thes', 'Th'], false, 2],
  ['1 Timothy', ['Timothy', 'Tim', 'Ti'], false, 1],
  ['2 Timothy', ['Timothy', 'Tim', 'Ti'], false, 2],
  ['Titus', ['Tit'], true],
  ['Philemon', ['Philem', 'Phm', 'Pm'], true],
  ['Hebrews', ['Heb']],
  ['James', ['Jas', 'Jm'], true],
  ['1 Peter', ['Peter', 'Pet', 'Pe', 'Pt'], false, 1],
  ['2 Peter', ['Peter', 'Pet', 'Pe', 'Pt'], false, 2],
  ['1 John', ['John', 'Joh', 'Jhn', 'Jn'], false, 1],
  ['2 John', ['John', 'Joh', 'Jhn', 'Jn'], false, 2],
  ['3 John', ['John', 'Joh', 'Jhn', 'Jn'], false, 3],
  ['Jude', ['Jud', 'Jd'], true],
  ['Revelation', ['Revelations', 'Rev', 'Re', 'The Revelation']],
];

const BOOKS = BOOK_TABLE.map(([name, aliases, nameLike, number], i) => ({
  name, aliases, nameLike: !!nameLike, number: number || 0, order: i + 1,
  base: number ? name.replace(/^\d\s+/, '') : name,
}));

const NUMBER_WORDS = { '1': 1, '2': 2, '3': 3, 'i': 1, 'ii': 2, 'iii': 3, 'first': 1, 'second': 2, 'third': 3 };

/* Every accepted spelling, longest first so "Song of Solomon" wins over "Song" and "1 Cor" over "Co". */
const NAME_LOOKUP = new Map(); // lower-case spelling → [{ book, needsNumber }]
BOOKS.forEach((b) => {
  const spellings = [b.base, ...b.aliases];
  spellings.forEach((sp) => {
    const key = sp.toLowerCase();
    if (!NAME_LOOKUP.has(key)) NAME_LOOKUP.set(key, []);
    NAME_LOOKUP.get(key).push(b);
  });
});
const ALL_SPELLINGS = [...NAME_LOOKUP.keys()].sort((a, b) => b.length - a.length);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/*
  Pattern, in words:
    optional number ("1", "II", "First") + space
    book name (with optional trailing period)
    space + chapter number
    optional  :verse  (optional -range)  (optional ", verse" list items)
  Followed by a non-digit so "Psalm 234x" is rejected, and NOT followed by ":" so "John 3:16" isn't half-matched.
*/
const REF_RE = new RegExp(
  '(?<![A-Za-z])' +
  '(?:(1|2|3|I{1,3}|First|Second|Third)\\s+)?' +
  '(' + ALL_SPELLINGS.map(escapeRe).join('|') + ')\\.?' +
  '\\s+' +
  '(\\d{1,3})' +
  '(?::(\\d{1,3})' +
    '(?:\\s?[-–—]\\s?(\\d{1,3})(?::(\\d{1,3}))?)?' +
    '((?:\\s?,\\s?\\d{1,3}(?:\\s?[-–—]\\s?\\d{1,3})?)*)' +
  ')?' +
  '(?![\\d:])',
  'gi'
);

function resolveBook(numberToken, nameToken) {
  const candidates = NAME_LOOKUP.get(nameToken.toLowerCase());
  if (!candidates) return null;
  const n = numberToken ? NUMBER_WORDS[numberToken.toLowerCase()] : 0;
  if (n) return candidates.find((b) => b.number === n) || null;
  // No number: only an unnumbered book may match ("John" → John, never 1 John; "Cor 13" alone → nothing)
  return candidates.find((b) => b.number === 0) || null;
}

function findReferences(text) {
  const out = [];
  if (!text) return out;
  REF_RE.lastIndex = 0;
  let m;
  while ((m = REF_RE.exec(text))) {
    const [full, numTok, nameTok, chapter, verse, rangeEnd, rangeEndVerse, list] = m;
    const book = resolveBook(numTok, nameTok);
    if (!book) continue;
    if (!verse && book.nameLike) continue; // "John 3" → a person, not a passage
    let ref = `${book.name} ${parseInt(chapter, 10)}`;
    if (verse) {
      ref += `:${parseInt(verse, 10)}`;
      if (rangeEnd) ref += `–${rangeEndVerse ? `${parseInt(rangeEnd, 10)}:${parseInt(rangeEndVerse, 10)}` : parseInt(rangeEnd, 10)}`;
      if (list) {
        const items = list.split(',').map((s) => s.trim()).filter(Boolean)
          .map((s) => s.replace(/\s?[-–—]\s?/, '–').split('–').map((n) => parseInt(n, 10)).join('–'));
        if (items.length) ref += `, ${items.join(', ')}`;
      }
    }
    out.push({
      book: book.name, order: book.order, chapter: parseInt(chapter, 10), verse: verse ? parseInt(verse, 10) : 0,
      canonical: ref, index: m.index, length: full.length, text: full,
    });
  }
  return out;
}

function refSortKey(ref) {
  const m = String(ref).match(/^(.*?)\s(\d+)(?::(\d+))?/);
  if (!m) return [999, 0, 0];
  const book = BOOKS.find((b) => b.name === m[1]);
  return [book ? book.order : 999, parseInt(m[2], 10), m[3] ? parseInt(m[3], 10) : 0];
}
function sortRefs(refs) {
  return [...refs].sort((a, b) => {
    const ka = refSortKey(a), kb = refSortKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || a.localeCompare(b);
  });
}

function canonicalRefs(text) {
  return sortRefs([...new Set(findReferences(text).map((r) => r.canonical))]);
}

function bookOf(ref) {
  const m = String(ref).match(/^(.*?)\s\d/);
  return m ? m[1] : ref;
}

function gatewayUrl(reference, version = BIBLE_VERSION) {
  const q = String(reference).replace(/–|—/g, '-').replace(/\s+/g, ' ');
  return `https://www.biblegateway.com/passage/?search=${encodeURIComponent(q)}&version=${encodeURIComponent(version)}`;
}

const escapeHtml = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Wrap references inside story HTML. Only text nodes are touched; text already inside <a>…</a>
   is left alone. Becky's words are unchanged — the link wraps exactly what she typed. */
function linkReferences(html, version = BIBLE_VERSION) {
  if (!html) return html;
  const parts = html.split(/(<[^>]+>)/);
  let inAnchor = 0;
  return parts.map((part) => {
    if (!part) return part;
    if (part[0] === '<') {
      if (/^<a[\s>]/i.test(part)) inAnchor++;
      else if (/^<\/a>/i.test(part)) inAnchor = Math.max(0, inAnchor - 1);
      return part;
    }
    if (inAnchor) return part;
    const refs = findReferences(part);
    if (!refs.length) return part;
    let out = '', cursor = 0;
    refs.forEach((r) => {
      out += part.slice(cursor, r.index);
      out += `<a class="verse-link" href="${gatewayUrl(r.canonical, version)}" target="_blank" rel="noopener" title="${escapeHtml(r.canonical)} (${version}) on BibleGateway">${part.slice(r.index, r.index + r.length)}</a>`;
      cursor = r.index + r.length;
    });
    return out + part.slice(cursor);
  }).join('');
}

module.exports = { BIBLE_VERSION, BOOKS, findReferences, canonicalRefs, sortRefs, bookOf, gatewayUrl, linkReferences, refSortKey };
