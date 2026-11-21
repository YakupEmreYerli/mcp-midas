"""Pencerenin açıldığı cihazın dili (onay.py ve sms.py ortak kullanır).

Sunucu `MIDAS_LANG` ile dili açıkça seçmişse pencereye `dil` gönderir ve o geçerlidir. Seçmemişse
pencere dili burada bulunur: ortamda LC_ALL → LC_MESSAGES → LANG; üçü de boşsa (ssh ile açılan
pencerede sık olur) sistemin yerel dosyasındaki LANG (/etc/locale.conf, yoksa /etc/default/locale).
"tr" ile başlayan Türkçe, gerisi İngilizce.
"""

from __future__ import annotations

import os
from collections.abc import Iterable, Mapping

LOCALE_FILES = ("/etc/locale.conf", "/etc/default/locale")


def _language_of(value: str) -> str:
    return "tr" if value.strip().lower().startswith("tr") else "en"


def _lang_from_file(path: str) -> str | None:
    try:
        with open(path, encoding="utf-8") as handle:
            lines = handle.read(65536).splitlines()
    except (OSError, UnicodeDecodeError):
        return None
    for line in lines:
        key, sep, value = line.strip().partition("=")
        if sep and key.strip() == "LANG":
            value = value.strip().strip("\"'").strip()
            if value:
                return value
    return None


def device_language(env: Mapping[str, str] | None = None, locale_files: Iterable[str] = LOCALE_FILES) -> str:
    """Cihazın dili: "tr" ya da "en". `env` ve `locale_files` yalnız testler için verilir."""
    env = os.environ if env is None else env
    for key in ("LC_ALL", "LC_MESSAGES", "LANG"):
        value = (env.get(key) or "").strip()
        if value:
            return _language_of(value)
    for path in locale_files:
        value = _lang_from_file(path)
        if value:
            return _language_of(value)
    return "en"
