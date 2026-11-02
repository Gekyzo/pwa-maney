// The pages of the walkthrough of the first start, in their order.
export const PAGES = ['welcome', 'offline'];

// The walkthrough shows at the start of a new install only: no seen flag and no stored state.
export const shouldShow = ({ seen, hasState }) => !seen && !hasState;

// The index of the page after a move of `direction` (1, -1 or 0). It stays in the pages.
export const step = (index, direction) => Math.min(Math.max(index + direction, 0), PAGES.length - 1);

export const isLast = (index) => index === PAGES.length - 1;

// A key that starts with `#name` shows the icon `name` of the sprite, then the rest of its text.
const keyPart = (text) => {
  const match = text.match(/^#([a-z][\w-]*)(?: (.*))?$/s);
  return match ? { text: match[2] ?? '', key: true, icon: match[1] } : { text, key: true };
};

// The parts of a page text. A text between two backticks is a key, such as `↻` or `+`; a
// backtick with no pair stays in the text. A text between two `**` outside a key is bold: its
// parts, keys too, get `strong: true`. A `**` with no pair stays in the text.
export const textParts = (text) => {
  const pieces = text.split('`');
  // An even count of pieces means that the last backtick has no pair.
  const open = pieces.length % 2 === 0 ? pieces.splice(-2).join('`') : null;
  const raw = pieces.map((piece, index) => ({ text: piece, key: index % 2 === 1 }));
  if (open !== null) raw.push({ text: open, key: false });
  // The `**` marks of the plain text. With an odd count, the last one has no pair.
  const marks = raw.reduce((count, part) => count + (part.key ? 0 : part.text.split('**').length - 1), 0);
  let paired = marks - (marks % 2);
  let strong = false;
  const parts = raw.flatMap((part) => {
    if (part.key) return [{ ...part, strong }];
    return part.text.split('**').map((piece, index) => {
      if (index === 0) return { text: piece, key: false, strong };
      if (paired === 0) return { text: `**${piece}`, key: false, strong };
      paired -= 1;
      strong = !strong;
      return { text: piece, key: false, strong };
    });
  });
  return parts
    .filter((part) => part.text)
    .reduce((joined, part) => {
      const last = joined.at(-1);
      if (last && !last.key && !part.key && Boolean(last.strong) === part.strong) last.text += part.text;
      else {
        const next = part.key ? keyPart(part.text) : { text: part.text, key: false };
        joined.push(part.strong ? { ...next, strong: true } : next);
      }
      return joined;
    }, []);
};
