---
title: "05 — work"
slug: "work"
summary: "What work teaches us, including the beliefs it makes us let go of."
featured_line: "known -= disproved(project)"
translation: |
  I begin without answers.

  With each project,
  I add what I discover.
  I remove what is disproved.
reflection: |
  Some things I learned through work.

  Others I took for granted,
  until work
  made me change my mind.
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
