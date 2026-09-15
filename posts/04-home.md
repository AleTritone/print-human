---
title: "04 — home"
slug: "home"
summary: "Il pianeta è casa nostra. Prendercene cura significa rispettarlo nelle scelte che facciamo ogni giorno."
featured_line: "with planet as home:"
translation: |
  Se il pianeta è casa nostra,
  prendiamocene cura.

  Cerchiamo di non sprecare l’acqua,
  di non danneggiare il suolo
  e di non distruggere le foreste.

  Facciamo più attenzione
  a quello che consumiamo,
  a quello che sprechiamo
  e alle conseguenze delle nostre scelte.

  Non possiamo fare tutto,
  ma possiamo fare meglio.

  E continuare a provarci.
reflection: |
  Rispettare l’ambiente
  richiede attenzione e qualche sacrificio.

  Significa sprecare meno,
  consumare con più consapevolezza
  e pensare un po' di più
  alle conseguenze delle nostre scelte.

  Non serve aspettare il momento giusto.
  Possiamo cominciare da semplici piccole azioni, ogni giorno.
date: 2026-09-25
episode: 4
tags: [python, planet, environment, care]
published: true
---

```python
with planet as home:
    care()

    harm = {
        water: waste,
        soil: damage,
        forests: destroy,
    }

    for resource, action in harm.items():
        avoid(action, resource)

    for choice in daily_choices:
        choose(choice, responsibly=True)

    repeat()
```