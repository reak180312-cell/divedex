// Normalization + lightweight fuzzy scoring shared by the search pipeline.
const HEB_FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

export const hasHebrew = (s) => /[֐-׿]/.test(s);

export function norm(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[֑-ׇ]/g, '')          // Hebrew niqqud & cantillation
    .replace(/[̀-ͯ]/g, '')          // Latin diacritics
    .replace(/[ךםןףץ]/g, (c) => HEB_FINALS[c])
    .replace(/[׳״'"`’]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let prev2 = null;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}

/**
 * Score how well normalized query `q` matches normalized candidate `c` (0 = no match, 1 = exact).
 * Handles prefixes (autocomplete), word prefixes ("ocel" -> "amphiprion ocellaris") and typos.
 */
export function fuzzyScore(q, c) {
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.startsWith(q)) return 0.92 - Math.min(0.2, (c.length - q.length) * 0.005);
  const words = c.split(' ');
  if (words.some((w) => w.startsWith(q))) return 0.82;
  if (c.includes(q)) return 0.7;
  const qWords = q.split(' ');
  if (qWords.length > 1 && qWords.every((qw) => words.some((w) => w.startsWith(qw)))) return 0.78;
  // typo tolerance: compare against whole string and each word / word-prefix of equal length
  const max = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
  let best = lev(q, c, max);
  for (const w of words) {
    best = Math.min(best, lev(q, w, max), lev(q, w.slice(0, q.length), max));
  }
  if (best <= max) return 0.62 - best * 0.08;
  return 0;
}
