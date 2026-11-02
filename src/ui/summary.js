import { formatCents } from '#money';
import { intlTag } from '#i18n';
import { $, el, ui, state, t, lang } from '#ui/context';

// The Summary section: what maney pushed, read only (SUM-3). Nothing here changes the doc.

const COUNTS = ['ok', 'review', 'missing', 'pending'];

const format = (options, value) => new Intl.DateTimeFormat(intlTag(lang), options).format(value);

// A calendar day or a month is read and written in UTC; `generatedAt` is a time, shown in the local zone.
const dayText = (day) => format({ day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }, new Date(`${day}T00:00:00Z`));
const monthText = (month) => {
  const text = format({ month: 'long', year: 'numeric', timeZone: 'UTC' }, new Date(`${month}-01T00:00:00Z`));
  return text.charAt(0).toLocaleUpperCase(intlTag(lang)) + text.slice(1);
};
const updatedText = (time) => format({ day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }, new Date(time));

// A line: the main text with a muted line below it, and the amount at the end.
const line = (text, meta, amount) =>
  el('li', { className: 'summary-line' }, [
    el('span', { className: 'summary-line-text' }, [
      el('span', { className: 'summary-line-label', textContent: text }),
      el('small', { className: 'summary-line-meta', textContent: meta }),
    ]),
    el('span', { className: 'summary-line-amount', textContent: amount }),
  ]);

const dueLine = ({ date, label, amountCents, state: when }) => {
  const node = line(label, `${dayText(date)} · ${t(`summary.state.${when}`)}`, formatCents(amountCents));
  node.dataset.state = when;
  return node;
};

const holdingLine = ({ name, provider, valueCents, valuedOn }) =>
  line(name, provider ? `${provider} · ${dayText(valuedOn)}` : dayText(valuedOn), formatCents(valueCents));

export const renderSummary = () => {
  $('summary').hidden = ui.view !== 'summary';
  const { summary } = state;
  $('summary-empty').hidden = summary !== null;
  $('summary-body').hidden = summary === null;
  if (summary === null) return;
  $('summary-month').textContent = monthText(summary.month);
  $('summary-updated').textContent = t('summary.updated', { date: updatedText(summary.generatedAt) });
  for (const name of COUNTS) $(`summary-${name}`).textContent = String(summary.status[name]);
  $('summary-next-group').hidden = summary.nextDue.length === 0;
  $('summary-next').replaceChildren(...summary.nextDue.map(dueLine));
  $('summary-investments-group').hidden = summary.investments.length === 0;
  $('summary-investments').replaceChildren(...summary.investments.map(holdingLine));
};

export const bind = () => {};
