// The model ends answers with a hidden line: [[followups: q1 | q2 | q3]]. Pull it out of the visible text.
export const splitAnswer = (raw: string): { text: string; followups: string[] } => {
  const closed = /\s*\[\[followups:([^\]]*)\]\]\s*/i;
  const m = raw.match(closed);
  if (m) {
    const followups = m[1].split('|').map((q) => q.trim()).filter(Boolean).slice(0, 3);
    return { text: raw.replace(closed, '\n\n').trim(), followups };
  }
  // still streaming: hide a half-written marker
  const idx = raw.lastIndexOf('[[');
  if (idx >= 0) {
    const tail = raw.slice(idx).toLowerCase();
    if ('[[followups:'.startsWith(tail) || tail.startsWith('[[followups')) return { text: raw.slice(0, idx).trimEnd(), followups: [] };
  }
  return { text: raw, followups: [] };
};

// "Article 21" / "Articles 14, 15 and 21" / "अनुच्छेद 21" -> markdown links like [Article 21](#coi-21)
const GROUP = /((?:\b(?:Articles?|Art\.?))|अनुच्छेद|कलम)\s*((?:\d{1,3}(?!\d)[A-Za-z]{0,2}(?![A-Za-z])(?:\([^)]{1,6}\))*(?:\s*(?:,|and|&|to|व|आणि|और)\s*)?)+)/gi;

export const linkifyArticles = (text: string): string =>
  text.replace(GROUP, (_full, label: string, nums: string) => {
    let first = true;
    return nums.replace(/(\([^)]*\))|(\d{1,3}(?!\d)[A-Za-z]{0,2})(?![A-Za-z])/g, (m: string, paren?: string, num?: string) => {
      if (paren || !num) return m;
      const link = `[${first ? `${label.trim()} ${num}` : num}](#coi-${num.toUpperCase()})`;
      first = false;
      return link;
    });
  });
