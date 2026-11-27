"""Format plain-text previews within the public gateway limit."""

import re


def recipe_preview(text: str) -> str:
    limit = 240
    # The Java gateway measures string length in UTF-16 code units.
    encoded = text.encode("utf-16-le")
    if len(encoded) <= limit * 2:
        return text

    prefix = encoded[: (limit - 1) * 2].decode("utf-16-le", errors="ignore")
    if not text[len(prefix)].isspace():
        prefix = re.sub(r"\S+$", "", prefix)
    return prefix.rstrip() + "…"
