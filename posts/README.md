# Posts bilingui

I contenuti editoriali vivono qui, separati per lingua:

- `posts/it/` — versione italiana
- `posts/en/` — versione inglese

Le due versioni dello stesso post devono avere **lo stesso nome file** e **lo stesso `slug`**.

Esempio:

```text
posts/
  it/
    05-new-post.md
  en/
    05-new-post.md
```

Il front matter può tradurre `title`, `summary`, `translation` e `reflection`; `date`, `episode`, `tags`, `published` e `slug` dovrebbero restare coerenti tra le due versioni.

Se un file manca in `posts/en/`, il sito usa automaticamente la corrispondente versione italiana come fallback.

La mappa semantica e gli script di build usano l'italiano come lingua sorgente predefinita.
