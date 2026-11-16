---
title: "10 — pause"
slug: "pause"
summary: "The difficulty of stopping before I have reached a goal."
featured_line: "uneasy = not goal.reached()"
translation: |
  I focus on a goal
  and keep working on it until I have reached it.

  Sometimes I would like to turn my attention to other things,
  but I find it hard to let go before I am done.
  And if I do not finish, it stays on my mind and leaves me restless.
  And often, the rest of my life has to wait.
  I know it should not be this way.
reflection: |
  I often tell myself: I'll finish this one thing and then stop.

  Then I find another detail to fix,
  one more thing to try.

  Leaving a problem unresolved bothers me.
  Putting off a phone call, a walk,
  or a quiet evening feels easier.

  In the moment, I assume there will be time later.
  Only afterwards do I realize
  that I have also put off things I cared about.
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
