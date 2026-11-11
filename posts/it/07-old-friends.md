---
title: "07 — old friends"
slug: "old-friends"
summary: "Gli amici che restano nei pensieri, anche quando gli impegni rendono difficile sentirsi."
featured_line: "in_mind = set(friends)"
translation: |
  Tengo gli amici nei pensieri.

  I giorni passano.
  Quando sono pieni, rimando.

  Quando c’è tempo,
  torno a cercarli.
reflection: |
  Ci sono amici che sento poco
  e a cui penso spesso.

  Tra il lavoro, la famiglia
  e le cose da fare,
  a volte rimando anche un messaggio.
  Poi passano settimane.

  Quando finalmente ci ritroviamo,
  mi accorgo di quante cose,
  nel frattempo,
  avrei voluto raccontargli.
date: 2026-11-01
episode: 7
tags: [python, friendship, time, relationships]
published: true
---

```python
in_mind = set(friends)

for day in life:
    if day.is_full():
        continue
    for friend in in_mind:
        reconnect(friend)
```
