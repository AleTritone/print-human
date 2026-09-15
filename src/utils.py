from datetime import date, datetime
from pathlib import Path

import streamlit as st
from babel.dates import format_date


def read_text_any(path: Path) -> str:
    for encoding in (
        "utf-8",
        "utf-8-sig",
        "cp1252",
        "latin-1"
    ):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            pass

    return path.read_text(
        encoding="utf-8",
        errors="replace"
    )


def parse_date_any(value) -> date | None:
    if isinstance(value, datetime):
        return value.date()

    if isinstance(value, date):
        return value

    if isinstance(value, str):
        value = value.strip()

        formats = (
            "%Y-%m-%d",
            "%Y/%m/%d",
            "%d/%m/%Y",
            "%d-%m-%Y",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
        )

        for fmt in formats:
            try:
                return datetime.strptime(
                    value,
                    fmt
                ).date()
            except ValueError:
                pass

        try:
            return datetime.fromisoformat(
                value.replace("Z", "+00:00")
            ).date()
        except (ValueError, TypeError):
            pass

    return None


def format_date_it(value: date) -> str:
    try:
        return format_date(
            value,
            format="long",
            locale="it_IT"
        )
    except Exception:
        return value.strftime("%d/%m/%Y")


def normalize_tags(tags) -> list[str]:
    if not tags:
        return []

    if isinstance(tags, str):
        tags = tags.split(",")

    result = []

    for tag in tags:
        tag = str(tag).strip()

        if tag and tag not in result:
            result.append(tag)

    return result


def normalize_published(value) -> bool:
    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        return value.strip().lower() not in {
            "false",
            "no",
            "0",
            "off"
        }

    return bool(value)


def get_query_param(name: str) -> str | None:
    value = st.query_params.get(name)

    if value is None:
        return None

    if isinstance(value, list):
        if not value:
            return None

        value = value[0]

    value = str(value).strip()

    return value or None