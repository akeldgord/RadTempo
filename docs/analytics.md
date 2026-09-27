# Analytics methodology

RadTempo's benchmarks are entirely personal: every number on your dashboard is derived from your own history, never from other users, departments, or any external standard. This page explains how those numbers are actually computed, in plain language.

## Eligibility

A case counts toward your analytics if it's **COMPLETED** and none of its tags are marked "exclude from benchmark." Excluded cases (e.g. ones you tagged "Interrupted") still show up in your history, volume, and total active time — they just don't feed the benchmark math, since they'd distort your real pace.

## Complexity factors (learned per user)

Not every case of a given study type is equally hard, and complexity ratings (Easy/Typical/Difficult) are inherently subjective from person to person. So RadTempo learns _your own_ complexity factors per study type, rather than using a fixed multiplier:

- For a study type with at least 5 eligible cases, RadTempo computes the median raw duration for that study type.
- Each eligible case's duration is expressed as a ratio to that median.
- Ratios are pooled by complexity level, and the median ratio per complexity level becomes that level's factor, normalized so Typical always equals 1.0.
- If a complexity level has fewer than 5 ratios to work with (or Typical itself doesn't have enough), RadTempo falls back to a factor of 1.0 for that level and marks it **provisional** — meaning it hasn't learned enough yet to have real confidence in the adjustment.

Your "complexity-adjusted" duration for a case is its raw duration divided by the factor for its complexity level.

## Recent and comparison windows

For each study type, ordered by when cases finished:

- **Recent window:** your last 10 eligible complexity-adjusted durations. Their median is your **recent pace**.
- **Comparison window:** up to the 20 eligible cases immediately before the recent window. Their median is your **comparison pace**.

## Improvement

```
improvement = (comparison_pace − recent_pace) / comparison_pace
```

A positive number means you're reading faster now than in the comparison window. Displayed rounded to at most one decimal place.

## Benchmark

Your benchmark for a study type is simply your recent pace, as defined above — always "have you gotten faster than your own prior self," never a comparison to anyone else.

## Maturity

How much you should trust a benchmark depends on how much data it's built on:

- **1–4 eligible cases:** Early
- **5–14 eligible cases:** Building
- **15+ eligible cases:** Established

## Personal percentile

"This read was faster than 72% of your previous comparable CT A/P +C reads" — this is the fraction of your own prior eligible, complexity-adjusted reads of that same study type that this particular read beat. It's a way of contextualizing a single case against your own history without reducing everything to a single average.

## Timed cases/hour

```
Timed cases/hour = completed timed cases / total active reading time (in hours)
```

Displayed with the exact label "Timed cases/hour." Active reading time excludes paused time.

## Why medians, and why no outlier removal

RadTempo uses medians everywhere (not means) because a small number of unusually long or short cases — an interruption you forgot to tag, a genuinely unusual case — shouldn't swing your benchmark. Medians are naturally resistant to that.

For the same reason, RadTempo never discards outliers. Rather than deciding on your behalf which of your own real reads don't "count," it relies on medians to keep the numbers stable, and lets you use tags (like "Interrupted") to explicitly exclude cases you know shouldn't be part of your benchmark.
