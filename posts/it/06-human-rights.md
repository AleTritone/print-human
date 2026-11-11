---
title: "06 — human rights"
slug: "human-rights"
summary: "Dignità, libertà e uguaglianza devono essere garantite a ogni persona."
featured_line: "person.rights >= HUMANRIGHTS"
translation: |
  Dignità, libertà, uguaglianza.
  Diritti di ogni persona.

  Finché non sono garantiti a tutti,
  continuiamo a prendere posizione.
reflection: |
  Cambiano i confini,
  i governi,
  le persone.

  I diritti dovrebbero restare gli stessi.
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
