---
title: "09 — let go"
slug: "let-go"
summary: "I pensieri che continuo a trattenere e quello che posso fare oggi."
featured_line: "held &= within_reach(day)"
translation: |
  Mi porto dietro delle preoccupazioni.

  Ogni giorno mi concentro
  su ciò che posso cambiare.

  Lascio andare il resto
  e faccio un passo alla volta.
reflection: |
  Mi capita di ripensare a qualcosa che mi ha fatto male,
  anche quando so di aver fatto tutto il possibile.

  Quando provo a pensare ad altro,
  mi sembra quasi di sminuire quello che è successo.

  Come se dovessi continuare a starci male
  per dimostrare, anche solo a me stesso,
  quanto ci tenevo.
date: 2026-12-01
episode: 9
tags: [python, acceptance, change, life]
published: true
---

```python
held = set(worries)

for day in life:
    held &= within_reach(day)
    for thing in held:
        take_one_step(thing)
```
