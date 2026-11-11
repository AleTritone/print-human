---
title: "06 — human rights"
slug: "human-rights"
summary: "Dignity, freedom, and equality must be guaranteed to every person."
featured_line: "person.rights >= HUMANRIGHTS"
translation: |
  Dignity, freedom, equality.
  Rights of every person.

  Until they are guaranteed to everyone,
  we keep taking a stand.
reflection: |
  Borders change,
  governments change,
  people change.

  Rights should remain the same.
date: 2026-10-15
episode: 6
tags: [python, humanity, rights, equality]
published: true
---

```python
HUMANRIGHTS = frozenset({"dignity", "freedom", "equality"})

while not all(
    person.rights >= HUMANRIGHTS
    for person in humanity
):
    stand_up()
```
