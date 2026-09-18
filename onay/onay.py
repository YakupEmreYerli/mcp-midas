#!/usr/bin/env python3
"""Midas emir onay penceresi.

Sunucu süreci (src/desktop-confirmation.ts) bu betiği başlatır ve onay modelini
(src/confirmation-view.ts: buildDialogModel) JSON olarak STDIN'den verir. Betik
yerel HTML'i (onay.html + onay.css + onay.js) bir QWebEngineView içinde çizer.

Çıkış protokolü (stdout, satır satır):
    ACILDI                 pencere sayfa yüklendikten sonra gösterildi
    SONUC evet             çıkış kodu 0
    SONUC hayir            çıkış kodu 1  (Hayır düğmesi, Esc, pencereyi kapatma)
    SONUC zaman-asimi      çıkış kodu 2  (120 sn cevap yok = Hayır)
    SONUC hata <sebep>     çıkış kodu 2

Güvenlik:
- Ağ ve dosya erişimi yok: sayfa tek parça data: URL; CSS/JS CSP nonce'uyla, Martian Mono
  data: URL olarak gömülü (font dosyasını betik okur, sayfa değil),
  data: dışındaki her istek engellenir.
- Sayfadan Python'a tek kanal sayfa başlığıdır ("midas-onay:<tür>:<değer>:<sıra>");
  ilk yüklemeden sonraki her gezinme engellenir. Türler: hazir, boyut, tasi (bilgi; karar
  değil), hayir (Hayır düğmesi, Esc, şeritteki kapat düğmesi) ve evet (yalnız basılı tutma).
- Pencere çerçevesizdir; başlık çubuğu sayfanın künye şerididir (taşıma, kapat = Hayır).
- Önizleme metni HTML'e JSON olarak gömülür, JS yalnız textContent ile yazar.
- Evet ancak düğme basılı tutulunca gelir; pencere açıldıktan sonraki ilk 0,6 sn'de
  gelen Evet yok sayılır (önceki bir tıklamanın sızması).
"""

from __future__ import annotations

import base64
import json
import os
import secrets
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
MAX_SECONDS = 120
MIN_SECONDS_BEFORE_YES = 0.6
PANEL_WIDTH = 560
SHADOW = 12  # onay.css --golge-pay: çerçevesiz pencerede gölge için şeffaf pay
WIDTH = PANEL_WIDTH + 2 * SHADOW
FONT = HERE / "fontlar" / "MartianMono.woff2"  # SIL OFL 1.1, onay/fontlar/OFL-MartianMono.txt
LOGO = HERE.parent / "docs" / "brand"
APP_ID = "midas-mcp-onay"  # Wayland app_id / X11 WM_CLASS; onay/masaustu-kur.sh aynı adla .desktop kurar

_decided = False


_cleanup: list = []


def finish(code: int, verdict: str) -> None:
    """Sonucu yazar ve süreci hemen bitirir (QtWebEngine kapanışındaki çökme riskini atlar)."""
    global _decided
    if _decided:
        return
    _decided = True
    for step in _cleanup:
        try:
            step()
        except Exception:  # noqa: BLE001 (temizlik sonucu değiştirmez)
            pass
    try:
        sys.stdout.write(f"SONUC {verdict}\n")
        sys.stdout.flush()
    finally:
        os._exit(code)


def fail(reason: str) -> None:
    finish(2, f"hata {' '.join(str(reason).split())[:300]}")


# KWin betiği (Wayland): yalnız bu PID'nin penceresine dokunur. Açılışta ortalar, üstte tutar ve
# öne alır; içerik yüksekliği değişirse (boyut değişimi, taşıma değil) yeniden ortalar.
KWIN_SCRIPT = """
const PID = __PID__;
function ortala(w) {
    const alan = workspace.clientArea(KWin.PlacementArea, workspace.activeScreen, workspace.currentDesktop);
    const g = w.frameGeometry;
    w.frameGeometry = {
        x: Math.round(alan.x + (alan.width - g.width) / 2),
        y: Math.round(alan.y + (alan.height - g.height) / 2),
        width: g.width, height: g.height
    };
}
function izle(w) {
    if (!w || w.pid !== PID || !w.normalWindow) return;
    w.keepAbove = true;
    ortala(w);
    workspace.activeWindow = w;
    w.frameGeometryChanged.connect(function (eski) {
        const g = w.frameGeometry;
        if (eski.width !== g.width || eski.height !== g.height) ortala(w);
    });
}
workspace.windowAdded.connect(izle);
workspace.windowList().forEach(izle);
"""


def parse_args(argv: list[str]) -> tuple[str | None, int]:
    theme: str | None = None
    seconds = MAX_SECONDS
    rest = list(argv)
    while rest:
        flag = rest.pop(0)
        if flag == "--tema" and rest:
            value = rest.pop(0)
            if value not in ("acik", "koyu"):
                raise ValueError("--tema acik|koyu olmalı")
            theme = value
        elif flag == "--sure" and rest:
            # Yalnız kısaltmak için (deneme); 120 sn üst sınırdır.
            seconds = max(1, min(MAX_SECONDS, int(rest.pop(0))))
        else:
            raise ValueError(f"bilinmeyen seçenek: {flag}")
    return theme, seconds


def read_model() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        raise ValueError("stdin'de önizleme verisi yok")
    model = json.loads(raw)
    if not isinstance(model, dict) or model.get("islem") not in ("ALIŞ", "SATIŞ", "İPTAL", "DEĞİŞTİR"):
        raise ValueError("önizleme verisi geçersiz")
    return model


def embed_json(model: dict) -> str:
    text = json.dumps(model, ensure_ascii=False)
    # <script type="application/json"> içinden çıkılamasın.
    return text.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026") \
        .replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def main() -> None:
    try:
        theme, seconds = parse_args(sys.argv[1:])
        model = read_model()
        template = (HERE / "onay.html").read_text(encoding="utf-8")
        css = (HERE / "onay.css").read_text(encoding="utf-8")
        script = (HERE / "onay.js").read_text(encoding="utf-8")
    except Exception as error:  # noqa: BLE001
        fail(error)
        return

    # Martian Mono data: URL olarak gömülür (CSP font-src data:). Dosya yoksa pencere yine
    # açılır; başlık ve rakamlar sistem fontlarına düşer.
    try:
        font = base64.b64encode(FONT.read_bytes()).decode("ascii")
    except OSError:
        font = ""
    css = css.replace("__MARTIAN__", font)

    # Wayland oturumunda yerel Wayland penceresi (masaüstünün kendi başlık çubuğu ve simgesi);
    # Wayland eklentisi yüklenemezse Qt kendisi xcb'ye (XWayland/X11) düşer.
    # MIDAS_ONAY_X11=1 eski davranışı (her zaman xcb) zorlar.
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
        from PySide6.QtWidgets import QApplication, QWidget, QVBoxLayout
    except Exception as error:  # noqa: BLE001
        fail(f"PySide6/QtWebEngine yüklenemedi: {error}")
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

    if theme is None:
        scheme = QGuiApplication.styleHints().colorScheme()
        theme = "acik" if scheme == Qt.ColorScheme.Light else "koyu"

    # Sayfa data: URL olarak yüklenir (dosya erişimi yok); CSS ve JS nonce'la gömülür.
    # Veri en son yerleştirilir ki içindeki metin hiçbir yer tutucuyu tetiklemesin.
    nonce = secrets.token_urlsafe(18)
    html = (
        template.replace("__CSS__", css)
        .replace("__JS__", script)
        .replace("__NONCE__", nonce)
        .replace("__TEMA__", theme)
        .replace("__VERI__", embed_json(model))
    )

    class Guard(QWebEngineUrlRequestInterceptor):
        def interceptRequest(self, info):  # noqa: N802 (Qt API)
            url = info.requestUrl()
            scheme_name = url.scheme()
            if scheme_name == "data":
                return
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

    profile = QWebEngineProfile(app)  # adsız profil = kayıt dışı, diske yazmaz
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
            finish(1, "hayir")

    window = Window()
    shown_at: list[float] = []

    def on_message(kind: str, value: str) -> None:
        if kind == "hayir":
            finish(1, "hayir")
        elif kind == "evet":
            if shown_at and time.monotonic() - shown_at[0] >= MIN_SECONDS_BEFORE_YES:
                finish(0, "evet")
        elif kind == "tasi":
            # Şeritte basılı sürükleme: pencere yöneticisi taşır (Wayland ve X11). Karar değildir.
            handle = window.windowHandle()
            if handle is not None:
                handle.startSystemMove()
        elif kind in ("hazir", "boyut"):
            try:
                height = int(value)
            except ValueError:
                height = 640
            if kind == "hazir":
                present(height)
            else:
                fit(height)

    view = QWebEngineView(window)
    page = Page(profile)

    def on_title(title: str) -> None:
        parts = title.split(":")
        if len(parts) >= 3 and parts[0] == "midas-onay":
            on_message(parts[1], parts[2])

    page.titleChanged.connect(on_title)
    view.setPage(page)
    view.setContextMenuPolicy(Qt.ContextMenuPolicy.NoContextMenu)
    layout = QVBoxLayout(window)
    layout.setContentsMargins(0, 0, 0, 0)
    layout.addWidget(view)

    title = f"Midas-MCP emir onayı — {model.get('islem', '')} {model.get('sembol', '')}".strip()
    window.setWindowTitle(title)
    # Çerçevesiz pencere: başlık çubuğu sayfanın künye şerididir (taşıma + kapat = Hayır).
    # Köşeler ve gölge sayfada çizilir, bu yüzden pencere ve sayfa zemini şeffaftır.
    # Sabit boyut büyütmeyi kapatır. Wayland'de üstte kalma ve ortalama istemciden yapılamaz,
    # KWin betiği yapar (kwin_place).
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
        height = max(320, min(content_height, area.height() - 80))
        if window.height() == height and window.isVisible():
            return
        window.setFixedSize(WIDTH, height)
        if not wayland:
            window.move(area.x() + (area.width() - WIDTH) // 2, area.y() + (area.height() - height) // 2)

    def kwin_place() -> None:
        """Wayland: KWin betiğiyle yalnız bu sürecin penceresini üstte tutar, ortalar, öne alır.

        KWin yoksa ya da betik yüklenemezse sessizce atlanır (pencere yine açılır).
        """
        try:
            from PySide6.QtDBus import QDBusConnection, QDBusInterface, QDBusMessage
        except Exception:  # noqa: BLE001
            return
        bus = QDBusConnection.sessionBus()
        if not bus.isConnected() or not bus.interface().isServiceRegistered("org.kde.KWin").value():
            return
        pid = os.getpid()
        plugin = f"{APP_ID}-{pid}"
        source = KWIN_SCRIPT.replace("__PID__", str(pid))
        runtime = Path(os.environ.get("XDG_RUNTIME_DIR") or "/tmp")
        path = runtime / f"{plugin}.js"
        try:
            scripting = QDBusInterface("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting", bus)
            scripting.setTimeout(2000)
            # Öldürülmüş (SIGTERM/SIGKILL) eski onay süreçlerinden kalan betik ve dosyaları temizle.
            for stale in runtime.glob(f"{APP_ID}-*.js"):
                old_pid = stale.stem.rsplit("-", 1)[-1]
                if old_pid.isdigit() and int(old_pid) != pid and not Path(f"/proc/{old_pid}").exists():
                    scripting.call("unloadScript", stale.stem)
                    stale.unlink(missing_ok=True)
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(source)
            _cleanup.append(lambda: path.unlink(missing_ok=True))
            scripting.call("unloadScript", plugin)
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
        # KWin dosyayı run() sonrasında eşzamansız okur; dosya karar anında (finish) silinir.

    def present(content_height: int) -> None:
        if shown_at:
            return
        fit(content_height)
        if wayland:
            kwin_place()
        window.show()
        if not wayland:
            window.raise_()
            window.activateWindow()
        view.setFocus()
        shown_at.append(time.monotonic())
        page.runJavaScript("window.midasGoster && window.midasGoster()")
        sys.stdout.write("ACILDI\n")
        sys.stdout.flush()
        QTimer.singleShot(seconds * 1000, lambda: finish(2, "zaman-asimi"))
        shot = os.environ.get("MIDAS_ONAY_DEBUG_GORUNTU")
        if shot:
            # Yalnız geliştirme: pencerenin kendi görüntüsü (başka pencere yakalanmaz).
            QTimer.singleShot(1500, lambda: window.grab().save(shot))

    def on_loaded(ok: bool) -> None:
        if not ok:
            fail("onay sayfası yüklenemedi")

    page.loadFinished.connect(on_loaded)
    QShortcut(QKeySequence(Qt.Key.Key_Escape), window, activated=lambda: finish(1, "hayir"))

    # Sayfa 10 sn içinde hazır demezse pencere açılamamış sayılır (hata, ret değil).
    QTimer.singleShot(10_000, lambda: None if shown_at else fail("onay sayfası 10 sn içinde hazır olmadı"))

    window.resize(WIDTH, 720)  # sayfa gösterilmeden önce gerçek genişlikte ölçülsün
    page.setHtml(html, QUrl("about:blank"))
    app.exec()
    if not _decided:
        fail("pencere beklenmedik biçimde kapandı")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except BaseException as error:  # noqa: BLE001
        fail(error)
