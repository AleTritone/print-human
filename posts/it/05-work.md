---
title: "05 — work"
slug: "work"
summary: "Quello che il lavoro ci insegna, comprese le convinzioni che ci fa abbandonare."
featured_line: "known -= disproved(project)"
translation: |
  Comincio senza risposte.

  A ogni progetto,
  aggiungo ciò che scopro.
  Tolgo ciò che viene smentito.
reflection: |
  Alcune cose le ho imparate lavorando.

  Altre le davo per certe,
  finché il lavoro
  mi ha fatto cambiare idea.
date: 2026-10-01
episode: 5
tags: [python, work, learning, experience]
published: true
---

```python
known = set()

for project in projects:
    known |= discover(project)
    known -= disproved(project)
```
