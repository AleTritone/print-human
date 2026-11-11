# Localized interface copy

Short interface strings are separated from Python and JavaScript code.

- `it.json` / `en.json`: menus, buttons, sidebar copy, search, share UI, home preview copy and system messages.
- `semantic_map_it.json` / `semantic_map_en.json`: all visible copy used inside the interactive semantic map, including parameter names, methodology explanations, labels and controls.

The application code only loads these files; user-facing translations should be edited here rather than inside `src/` or `assets/`.
