// Money is integer cents in all logic. Euros are only text, for the screen and the keyboard.
export const MAX_CENTS = 999999999;

const AMOUNT = /^\d{1,7}(?:[.,](\d{1,2}))?$/;
const euros = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

// Typed euros to cents, or null when the text is not an amount above 0 with at most two decimals.
// "1.234" is refused: a point or a comma is a decimal mark, never a thousands mark.
export const parseEuros = (text) => {
  const clean = String(text ?? '').trim().replace(/€$/, '').trim();
  const match = AMOUNT.exec(clean);
  if (!match) return null;
  const [whole] = clean.split(/[.,]/);
  const cents = Number(whole) * 100 + Number((match[1] ?? '').padEnd(2, '0'));
  return cents > 0 && cents <= MAX_CENTS ? cents : null;
};

export const formatCents = (cents) => euros.format(cents / 100);
