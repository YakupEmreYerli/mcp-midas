#!/usr/bin/env python3
"""Midas SMS kodu penceresi.

`MIDAS_LOGIN_METHOD=sms` girişinde sunucu (src/session.ts) kodu bu pencereyle sorar: yerel
masaüstünde kendiliğinden, başka bir yerde `MIDAS_SMS_CODE_COMMAND` ile (ör. ssh üzerinden).
Onay penceresiyle (onay.py) aynı yapı ve görünüm: QtWebEngine, tek parça data: URL, CSP nonce,
gömülü Geist / Geist Mono, çerçevesiz pencere, künye şeridi ve geri sayım bandı.

Girdi (isteğe bağlı, stdin JSON): {"hesapEtiketi": "...", "sureSn": 480, "dil": "tr"}. Seçenekler:
--tema acik|koyu, --sure <sn>, --hesap <etiket> (stdin'deki değer önce gelir; ikisi de yoksa
MIDAS_ACCOUNT_LABEL), --dil tr|en. Dil: stdin'deki `dil` (sunucu onu yalnız `MIDAS_LANG` açıkça
verilmişse gönderir), sonra --dil, ikisi de yoksa pencerenin açıldığı cihazın dili (dil.py). Böylece
ssh ile başka bir makinede açılan pencere o makinenin dilinde açılır.

Çıkış protokolü:
    stdout: yalnız kod (4-8 rakam) ve satır sonu   çıkış kodu 0
    İptal düğmesi, Esc, kapatma, süre dolması       çıkış kodu 1 (stdout boş)
    hata (sebep stderr'e)                          çıkış kodu 2

Kod hiçbir yere yazılmaz: ne loga ne stderr'e; yalnız stdout'a bir kez.
Sayfadan Python'a tek kanal sayfa başlığıdır ("midas-sms:<tür>:<değer>:<sıra>"); ilk
yüklemeden sonraki her gezinme ve data: dışındaki her istek engellenir.
"""

from __future__ import annotations

import base64
import json
import os
import re
import secrets
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import dil  # noqa: E402
from onay import APP_ID, FONTS, KWIN_SCRIPT, LOGO, WIDTH, embed_json  # noqa: E402

DEFAULT_SECONDS = 480  # src/session.ts: SMS kodu için 8 dakika
MAX_SECONDS = 900
CODE = re.compile(r"^\d{4,8}$")

# Python tarafının metinleri (pencere başlığı ve hata sebepleri). Sayfanın metinleri sms.js'te.
METIN = {
    "tr": {
        "on_ek": "sms penceresi",
        "baslik": "midas-mcp SMS kodu",
        "hesap": "Hesap",
        "tema": "--tema acik|koyu olmalı",
        "dil": "--dil tr|en olmalı",
        "secenek": "bilinmeyen seçenek: {flag}",
        "nesne": "stdin verisi JSON nesnesi olmalı",
        "qt_yok": "PySide6/QtWebEngine yüklenemedi: {error}",
        "sayfa_yuklenemedi": "sayfa yüklenemedi",
        "sayfa_hazir_degil": "sayfa 10 sn içinde hazır olmadı",
        "beklenmedik": "pencere beklenmedik biçimde kapandı",
    },
    "en": {
        "on_ek": "sms window",
        "baslik": "midas-mcp SMS code",
        "hesap": "Account",
        "tema": "--tema must be acik or koyu",
        "dil": "--dil must be tr or en",
        "secenek": "unknown option: {flag}",
        "nesne": "stdin data must be a JSON object",
        "qt_yok": "couldn't load PySide6/QtWebEngine: {error}",
        "sayfa_yuklenemedi": "couldn't load the page",
        "sayfa_hazir_degil": "the page wasn't ready within 10 seconds",
        "beklenmedik": "the window closed unexpectedly",
    },
}
_lang = "tr"


def t(key: str, **values: object) -> str:
    return METIN[_lang][key].format(**values)


_done = False
_cleanup: list = []


def finish(code: int, output: str = "") -> None:
    global _done
    if _done:
        return
    _done = True
    for step in _cleanup:
        try:
            step()
        except Exception:  # noqa: BLE001
            pass
    try:
        if output:
            sys.stdout.write(output + "\n")
            sys.stdout.flush()
    finally:
        os._exit(code)


def fail(reason: object) -> None:
    sys.stderr.write(f"{t('on_ek')}: {' '.join(str(reason).split())[:300]}\n")
    finish(2)


def parse_args(argv: list[str]) -> dict:
    options: dict = {"tema": None, "sure": None, "hesap": None, "dil": None}
    rest = list(argv)
    while rest:
        flag = rest.pop(0)
        if flag == "--tema" and rest:
            value = rest.pop(0)
            if value not in ("acik", "koyu"):
                raise ValueError(t("tema"))
            options["tema"] = value
        elif flag == "--sure" and rest:
            options["sure"] = int(rest.pop(0))
        elif flag == "--hesap" and rest:
            options["hesap"] = rest.pop(0)
        elif flag == "--dil" and rest:
            options["dil"] = rest.pop(0)
            if options["dil"] not in METIN:
                raise ValueError(t("dil"))
        else:
            raise ValueError(t("secenek", flag=flag))
    return options


def read_input() -> dict:
    """Sunucunun stdin'den verdiği JSON; elle çalıştırmada (terminal) ya da boşsa {}."""
    if sys.stdin is None or sys.stdin.isatty():
        return {}
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError(t("nesne"))
    return data


def clean_label(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    label = value.strip()
    if not label or re.search(r"[\x00-\x1f\x7f]", label):
        return None
    return label[:40]


def choose_language(data: dict, cli_lang: str | None, locale_files=dil.LOCALE_FILES) -> str:
    """stdin'deki `dil`, sonra --dil, sonra cihazın dili. `locale_files` yalnız testler için verilir."""
    if data.get("dil") in METIN:
        return data["dil"]
    if cli_lang in METIN:
        return cli_lang
    return dil.device_language(locale_files=locale_files)


def main(locale_files=dil.LOCALE_FILES) -> None:
    global _lang
    try:
        options = parse_args(sys.argv[1:])
        data = read_input()
        _lang = choose_language(data, options["dil"], locale_files)
        label = clean_label(data.get("hesapEtiketi")) or clean_label(options["hesap"]) or clean_label(
            os.environ.get("MIDAS_ACCOUNT_LABEL")
        )
        seconds = options["sure"] or data.get("sureSn") or DEFAULT_SECONDS
        seconds = max(1, min(MAX_SECONDS, int(seconds)))
        template = (HERE / "sms.html").read_text(encoding="utf-8")
        css = (HERE / "onay.css").read_text(encoding="utf-8") + "\n" + (HERE / "sms.css").read_text(encoding="utf-8")
        script = (HERE / "sms.js").read_text(encoding="utf-8")
    except Exception as error:  # noqa: BLE001
        fail(error)
        return

    for marker, path in FONTS.items():
        try:
            font = base64.b64encode(path.read_bytes()).decode("ascii")
        except OSError:
            font = ""
        css = css.replace(marker, font)

    if os.environ.get("MIDAS_ONAY_X11"):
        os.environ["QT_QPA_PLATFORM"] = "xcb"
    elif not os.environ.get("QT_QPA_PLATFORM"):
        if os.environ.get("WAYLAND_DISPLAY"):
            os.environ["QT_QPA_PLATFORM"] = "wayland;xcb"
        elif os.environ.get("DISPLAY"):
            os.environ["QT_QPA_PLATFORM"] = "xcb"
    os.environ.setdefault("QTWEBENGINE_CHROMIUM_FLAGS", "--disable-background-networking --no-pings")

    try:
        from PySide6.QtCore import QTimer, QUrl, Qt
        from PySide6.QtGui import QCursor, QGuiApplication, QIcon, QKeySequence, QShortcut
        from PySide6.QtWebEngineCore import (
            QWebEnginePage,
            QWebEngineProfile,
            QWebEngineSettings,
            QWebEngineUrlRequestInterceptor,
        )
        from PySide6.QtWebEngineWidgets import QWebEngineView
        from PySide6.QtWidgets import QApplication, QVBoxLayout, QWidget
    except Exception as error:  # noqa: BLE001
        fail(t("qt_yok", error=error))
        return

    app = QApplication(sys.argv[:1])
    app.setApplicationName(APP_ID)
    app.setDesktopFileName(APP_ID)
    icon = QIcon()
    for size in (16, 32, 128, 256, 512):
        png = LOGO / f"logo-{size}.png"
        if png.is_file():
            icon.addFile(str(png))
    if not icon.isNull():
        app.setWindowIcon(icon)
    wayland = app.platformName() == "wayland"

    theme = options["tema"]
    if theme is None:
        scheme = QGuiApplication.styleHints().colorScheme()
        theme = "acik" if scheme == Qt.ColorScheme.Light else "koyu"

    nonce = secrets.token_urlsafe(18)
    html = (
        template.replace("__CSS__", css)
        .replace("__JS__", script)
        .replace("__NONCE__", nonce)
        .replace("__TEMA__", theme)
        .replace("__DIL__", _lang)
        .replace("__VERI__", embed_json({"hesapEtiketi": label, "sureSn": seconds, "dil": _lang}))
    )

    class Guard(QWebEngineUrlRequestInterceptor):
        def interceptRequest(self, info):  # noqa: N802
            if info.requestUrl().scheme() != "data":
                info.block(True)

    class Page(QWebEnginePage):
        def __init__(self, profile):
            super().__init__(profile)
            self._loaded_once = False

        def acceptNavigationRequest(self, url, nav_type, is_main_frame):  # noqa: N802
            if not self._loaded_once and is_main_frame:
                self._loaded_once = True
                return True
            return False

        def createWindow(self, _type):  # noqa: N802
            return None

        def javaScriptConsoleMessage(self, level, message, line, source):  # noqa: N802
            sys.stderr.write(f"js: {message} ({source}:{line})\n")

    profile = QWebEngineProfile(app)  # adsız profil: diske yazmaz
    guard = Guard(app)
    profile.setUrlRequestInterceptor(guard)
    settings = profile.settings()
    for attribute, value in (
        (QWebEngineSettings.WebAttribute.JavascriptEnabled, True),
        (QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, False),
        (QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, False),
        (QWebEngineSettings.WebAttribute.JavascriptCanOpenWindows, False),
        (QWebEngineSettings.WebAttribute.JavascriptCanAccessClipboard, False),
        (QWebEngineSettings.WebAttribute.PluginsEnabled, False),
        (QWebEngineSettings.WebAttribute.PdfViewerEnabled, False),
        (QWebEngineSettings.WebAttribute.NavigateOnDropEnabled, False),
        (QWebEngineSettings.WebAttribute.ErrorPageEnabled, False),
        (QWebEngineSettings.WebAttribute.WebGLEnabled, False),
    ):
        settings.setAttribute(attribute, value)

    class Window(QWidget):
        def closeEvent(self, event):  # noqa: N802
            finish(1)

    window = Window()
    shown: list[bool] = []

    def on_message(kind: str, value: str) -> None:
        if kind == "iptal":
            finish(1)
        elif kind == "gonder":
            if shown and CODE.match(value):
                finish(0, value)
        elif kind == "tasi":
            handle = window.windowHandle()
            if handle is not None:
                handle.startSystemMove()
        elif kind in ("hazir", "boyut"):
            try:
                height = int(value)
            except ValueError:
                height = 480
            if kind == "hazir":
                present(height)
            else:
                fit(height)

    view = QWebEngineView(window)
    page = Page(profile)

    def on_title(title: str) -> None:
        parts = title.split(":")
        if len(parts) >= 3 and parts[0] == "midas-sms":
            on_message(parts[1], parts[2])

    page.titleChanged.connect(on_title)
    view.setPage(page)
    view.setContextMenuPolicy(Qt.ContextMenuPolicy.NoContextMenu)
    layout = QVBoxLayout(window)
    layout.setContentsMargins(0, 0, 0, 0)
    layout.addWidget(view)

    window.setWindowTitle(t("baslik") + (f" — {t('hesap')}: {label}" if label else ""))
    window.setWindowFlags(
        Qt.WindowType.Window | Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint
    )
    window.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
    view.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
    view.setStyleSheet("background: transparent")
    page.setBackgroundColor(Qt.GlobalColor.transparent)

    def fit(content_height: int) -> None:
        screen = QGuiApplication.screenAt(QCursor.pos()) or QGuiApplication.primaryScreen()
        area = screen.availableGeometry()
        height = max(300, min(content_height, area.height() - 80))
        if window.height() == height and window.isVisible():
            return
        window.setFixedSize(WIDTH, height)
        if not wayland:
            window.move(area.x() + (area.width() - WIDTH) // 2, area.y() + (area.height() - height) // 2)

    def kwin_place() -> None:
        """Wayland + KWin: pencereyi üstte tutar, ortalar, öne alır (onay.py ile aynı betik)."""
        try:
            from PySide6.QtDBus import QDBusConnection, QDBusInterface, QDBusMessage
        except Exception:  # noqa: BLE001
            return
        bus = QDBusConnection.sessionBus()
        if not bus.isConnected() or not bus.interface().isServiceRegistered("org.kde.KWin").value():
            return
        pid = os.getpid()
        plugin = f"{APP_ID}-sms-{pid}"
        path = Path(os.environ.get("XDG_RUNTIME_DIR") or "/tmp") / f"{plugin}.js"
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(KWIN_SCRIPT.replace("__PID__", str(pid)))
            _cleanup.append(lambda: path.unlink(missing_ok=True))
            scripting = QDBusInterface("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting", bus)
            scripting.setTimeout(2000)
            reply = scripting.call("loadScript", str(path), plugin)
            if reply.type() != QDBusMessage.MessageType.ReplyMessage or not reply.arguments():
                return
            script_id = int(reply.arguments()[0])
            if script_id < 0:
                return
            _cleanup.append(lambda: scripting.call("unloadScript", plugin))
            runner = QDBusInterface("org.kde.KWin", f"/Scripting/Script{script_id}", "org.kde.kwin.Script", bus)
            runner.setTimeout(2000)
            runner.call("run")
        except Exception:  # noqa: BLE001
            return

    def present(content_height: int) -> None:
        if shown:
            return
        fit(content_height)
        if wayland:
            kwin_place()
        window.show()
        if not wayland:
            window.raise_()
            window.activateWindow()
        view.setFocus()
        shown.append(True)
        page.runJavaScript("window.midasGoster && window.midasGoster()")
        QTimer.singleShot(seconds * 1000, lambda: finish(1))
        shot = os.environ.get("MIDAS_SMS_DEBUG_GORUNTU")
        if shot:
            # Yalnız geliştirme: pencerenin kendi görüntüsü.
            QTimer.singleShot(1500, lambda: window.grab().save(shot))

    page.loadFinished.connect(lambda ok: None if ok else fail(t("sayfa_yuklenemedi")))
    QShortcut(QKeySequence(Qt.Key.Key_Escape), window, activated=lambda: finish(1))
    QTimer.singleShot(10_000, lambda: None if shown else fail(t("sayfa_hazir_degil")))

    window.resize(WIDTH, 560)
    page.setHtml(html, QUrl("about:blank"))
    app.exec()
    if not _done:
        fail(t("beklenmedik"))


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except BaseException as error:  # noqa: BLE001
        fail(error)
