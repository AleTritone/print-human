from __future__ import annotations

import json
from functools import lru_cache

from babel.dates import format_date

from src.config import CONTENT_DIR, LOCALES_DIR


def _read_text(path):
    for encoding in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            pass

    return path.read_text(encoding="utf-8", errors="replace")


LANGUAGES = {"it", "en"}
DEFAULT_LANGUAGE = "it"


def normalize_language(value: str | None) -> str:
    return "en" if value == "en" else DEFAULT_LANGUAGE


@lru_cache(maxsize=None)
def _load_locale(language: str) -> dict:
    language = normalize_language(language)
    path = LOCALES_DIR / f"{language}.json"

    if not path.exists() and language != DEFAULT_LANGUAGE:
        path = LOCALES_DIR / f"{DEFAULT_LANGUAGE}.json"

    if not path.exists():
        return {}

    try:
        return json.loads(_read_text(path))
    except (OSError, json.JSONDecodeError):
        return {}


@lru_cache(maxsize=None)
def semantic_map_copy(language: str) -> dict:
    language = normalize_language(language)
    path = LOCALES_DIR / f"semantic_map_{language}.json"

    if not path.exists() and language != DEFAULT_LANGUAGE:
        path = LOCALES_DIR / f"semantic_map_{DEFAULT_LANGUAGE}.json"

    if not path.exists():
        return {}

    try:
        return json.loads(_read_text(path))
    except (OSError, json.JSONDecodeError):
        return {}


def ui(language: str, key: str, default: str = "") -> str:
    locale = _load_locale(language)
    value = locale.get(key, default)
    return str(value) if value is not None else default


def content_path(language: str, name: str):
    language = normalize_language(language)
    localized = CONTENT_DIR / language / name

    if localized.exists():
        return localized

    return CONTENT_DIR / DEFAULT_LANGUAGE / name


def content_text(language: str, name: str, default: str = "") -> str:
    path = content_path(language, name)
    if not path.exists():
        return default
    return _read_text(path)


def format_date_for_language(value, language: str) -> str:
    locale = "en_US" if normalize_language(language) == "en" else "it_IT"
    fallback = "%B %d, %Y" if locale == "en_US" else "%d/%m/%Y"

    try:
        return format_date(value, format="long", locale=locale)
    except Exception:
        return value.strftime(fallback)
