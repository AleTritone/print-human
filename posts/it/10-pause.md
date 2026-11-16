---
title: "10 — pause"
slug: "pause"
summary: "La fatica di fermarmi prima di aver raggiunto un obiettivo."
featured_line: "uneasy = not goal.reached()"
translation: |
  Mi concentro su un obiettivo
  e continuo a lavorarci finché non l’ho raggiunto.

  A volte vorrei dedicarmi anche ad altro,
  ma faccio fatica a lasciare andare finché non ho concluso.
  E se non concludo mi rimane dentro e mi rende inquieto.
  E molte volte, il resto della mia vita aspetta.
  So che non dovrebbe essere così.
reflection: |
  Mi dico spesso: finisco questa cosa e poi mi fermo.

  Poi trovo un altro dettaglio da sistemare,
  un altro tentativo da fare.

  Lasciare un problema irrisolto mi dà fastidio.
  Rimandare una telefonata, una passeggiata
  o una serata tranquilla mi sembra più facile.

  Sul momento penso che ci sarà tempo dopo.
  Mi accorgo solo più tardi
  che ho rimandato anche cose a cui tenevo.
date: 2026-12-15
episode: 10
tags: [python, rest, limits, care]
published: true
---

```python
from asyncio import gather, sleep
async def work():
    while not goal.reached():
        step(goal)
        uneasy = not goal.reached()
        if not uneasy or can_let_go(): await sleep(0)
async def day():
    await gather(work(), rest_of_life())
```
