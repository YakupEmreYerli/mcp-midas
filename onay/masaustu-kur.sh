#!/usr/bin/env bash
# Onay penceresinin masaüstü kaydı: Wayland'de başlık çubuğu ve görev çubuğu simgesi
# pencerenin app_id'sine (midas-mcp-onay) karşılık gelen .desktop dosyasından okunur.
# Yalnız kullanıcı dizinine yazar; root gerekmez. Kaldırmak için: onay/masaustu-kur.sh --kaldir
set -euo pipefail

AD="midas-mcp-onay"
DEPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERI="${XDG_DATA_HOME:-$HOME/.local/share}"
DESKTOP="$VERI/applications/$AD.desktop"
SIMGE="$VERI/icons/hicolor"

yenile() {
  command -v update-desktop-database >/dev/null && update-desktop-database -q "$VERI/applications" || true
  command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q -t "$SIMGE" 2>/dev/null || true
  command -v kbuildsycoca6 >/dev/null && kbuildsycoca6 --noincremental >/dev/null 2>&1 || true
}

if [[ "${1:-}" == "--kaldir" ]]; then
  rm -f "$DESKTOP"
  for boy in 16 32 128 256 512; do rm -f "$SIMGE/${boy}x${boy}/apps/$AD.png"; done
  rm -f "$SIMGE/scalable/apps/$AD.svg"
  yenile
  echo "kaldırıldı: $DESKTOP ve $AD simgeleri"
  exit 0
fi

# Simge temaya (hicolor) kurulur; hicolor yazılamıyorsa (ör. root'a ait) .desktop depodaki
# logoyu tam yoluyla gösterir.
simgeleri_kur() {
  local boy
  for boy in 16 32 128 256 512; do
    install -Dm644 "$DEPO/docs/brand/logo-$boy.png" "$SIMGE/${boy}x${boy}/apps/$AD.png" || return 1
  done
  install -Dm644 "$DEPO/docs/brand/logo.svg" "$SIMGE/scalable/apps/$AD.svg"
}
ICON="$AD"
if ! simgeleri_kur 2>/dev/null; then
  ICON="$DEPO/docs/brand/logo.svg"
  echo "not: $SIMGE yazılamıyor; simge tam yolla verildi ($ICON)"
fi

mkdir -p "$(dirname "$DESKTOP")"
cat >"$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=Midas-MCP emir onayı
Comment=Midas-MCP sunucusunun açtığı emir onay penceresi
Icon=$ICON
# Pencereyi yalnız MCP sunucusu açar (önizleme stdin'den gelir); menüde görünmez.
Exec=/usr/bin/python3 $DEPO/onay/onay.py
NoDisplay=true
Terminal=false
StartupWMClass=$AD
EOF
chmod 644 "$DESKTOP"
yenile
echo "kuruldu: $DESKTOP"
echo "simge:   $ICON"
