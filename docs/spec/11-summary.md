# Summary

The summary of the month. Maney pushes it as the record `summary` with the key `current`. The phone
only reads it. Its files are `src/summary.js` and `src/ui/summary.js`.

- **SUM-1** The summary is `{ v: 1, generatedAt, month, status, nextDue, investments }`. `generatedAt`
  is an ISO-8601 time and `month` is `YYYY-MM`. `status` holds the integers `ok`, `review`,
  `missing` and `pending`. A `nextDue` line is `{ date, label, amountCents, state }` with `state` one
  of `expected`, `late` or `unknown`; `amountCents` is an integer that keeps its sign. An
  `investments` line is `{ name, provider, valueCents, valuedOn }`.
- **SUM-2** `normalizeSummary` gives null for another `v`, a count that is not an integer, a bad
  date, a bad `state`, or more than 10 `nextDue` lines. It drops unknown fields and returns
  `nextDue` oldest date first.

## Screen

- **SUM-3** The Summary section shows the summary of the doc, in one column centred from 600px. With
  no summary it shows `summary.empty`. Else it shows the month as month and year in the language of
  the screen; `summary.updated` with the day and the time of `generatedAt`; the four counts of
  `status` (`summary.status.ok`, `.review`, `.missing`, `.pending`), two by two and in one row from
  600px; under `summary.nextDue` a line for each `nextDue` line, with the label, the date, the state
  (`summary.state.expected`, `.late`, `.unknown`; a late one in the colour of danger) and the amount
  through `formatCents` with its sign; under `summary.investments` a line for each investment, with
  the name, the provider, `valuedOn` and the value through `formatCents`. A group with no line does
  not show. The section has no control: nothing in it changes the doc.
