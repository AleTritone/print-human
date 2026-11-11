---
title: "07 — old friends"
slug: "old-friends"
summary: "Friends who stay in our thoughts, even when everyday commitments make it hard to keep in touch."
featured_line: "in_mind = set(friends)"
translation: |
  I keep my friends in mind.

  The days go by.
  When they are full, I put it off.

  When there is time,
  I reach out again.
reflection: |
  There are friends I rarely speak to
  and often think about.

  Between work, family,
  and everything there is to do,
  sometimes I put off even a message.
  Then weeks go by.

  When we finally meet again,
  I realize how much
  I would have liked to tell them
  along the way.
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
