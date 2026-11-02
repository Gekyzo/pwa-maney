# Summary

The summary of the month. Maney pushes it as the record `summary` with the key `current`. The phone
only reads it.

- **SUM-1** The summary is `{ v: 1, generatedAt, month, status, nextDue, investments }`. `generatedAt`
  is an ISO-8601 time and `month` is `YYYY-MM`. `status` holds the integers `ok`, `review`,
  `missing` and `pending`. A `nextDue` line is `{ date, label, amountCents, state }` with `state` one
  of `expected`, `late` or `unknown`; `amountCents` is an integer that keeps its sign. An
  `investments` line is `{ name, provider, valueCents, valuedOn }`.
- **SUM-2** `normalizeSummary` gives null for another `v`, a count that is not an integer, a bad
  date, a bad `state`, or more than 10 `nextDue` lines. It drops unknown fields and returns
  `nextDue` oldest date first.
