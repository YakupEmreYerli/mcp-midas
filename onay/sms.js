"use strict";

// SMS kodu sayfası. Python'a tek kanal sayfa başlığıdır ("midas-sms:<tür>:<değer>:<sıra>");
// innerHTML kullanılmaz, kod hiçbir yere yazdırılmaz (console dahil).

(function () {
  // Sayfanın metinleri. Dili sunucu stdin'deki `dil` ile verir; sayfa dili kendisi seçmez.
  // İki dil aynı anahtarları taşır (test/i18n.test.ts denetler). METIN-BAŞI
  const METIN = {
    tr: {
      hesap: "Hesap",
      seritNot: "Midas girişi",
      kapat: "Kapat: İptal",
      baslik: "SMS KODU",
      kalanSure: "Kalan süre",
      sayacNot: "sonra iptal",
      ozet: "Telefonuna Midas'tan gelen kodu yaz. Giriş kendiliğinden tamamlanır.",
      kodEtiket: "SMS kodu",
      kodNot: "Boşluk ve harfler kendiliğinden atılır.",
      iptal: "İptal",
      gonder: "Kodu gönder",
      ipucu: "Enter kodu gönderir. Esc, pencereyi kapatmak ya da süre dolması iptal sayılır.",
    },
    en: {
      hesap: "Account",
      seritNot: "Midas sign-in",
      kapat: "Close: Cancel",
      baslik: "SMS CODE",
      kalanSure: "Time left",
      sayacNot: "then cancel",
      ozet: "Enter the code Midas sent to your phone. Sign-in finishes on its own.",
      kodEtiket: "SMS code",
      kodNot: "Spaces and letters are removed as you type.",
      iptal: "Cancel",
      gonder: "Send code",
      ipucu: "Enter sends the code. Esc, closing the window or running out of time cancels.",
    },
  };
  // METIN-SONU
  const $ = (id) => document.getElementById(id);
  let bitti = false;
  let sira = 0;

  function bildir(tur, deger) {
    const bilgi = tur === "hazir" || tur === "boyut" || tur === "tasi";
    if (bitti && !bilgi) return;
    if (!bilgi) bitti = true;
    sira += 1;
    document.title = "midas-sms:" + tur + ":" + (deger != null ? deger : "") + ":" + sira;
  }

  let veri = {};
  try {
    veri = JSON.parse($("veri").textContent) || {};
  } catch (hata) {
    veri = {};
  }

  const M = METIN[veri.dil] || METIN.tr; // dil yoksa (eski sunucu, elle çalıştırma) Türkçe
  for (const el of document.querySelectorAll("[data-metin]")) el.textContent = M[el.dataset.metin];
  for (const el of document.querySelectorAll("[data-metin-etiket]")) {
    el.setAttribute("aria-label", M[el.dataset.metinEtiket]);
    if (el.hasAttribute("title")) el.title = M[el.dataset.metinEtiket];
  }

  if (veri.hesapEtiketi) {
    $("hesap-etiketi").textContent = String(veri.hesapEtiketi);
    $("serit-hesap").hidden = false;
    $("serit-not").hidden = true;
  }

  // ---------- Kod alanı: yalnız rakam, 4-8 hane ----------
  const kod = $("kod");
  const gonder = $("gonder");
  const gecerli = () => /^\d{4,8}$/.test(kod.value);
  kod.addEventListener("input", () => {
    const temiz = kod.value.replace(/\D/g, "").slice(0, 8);
    if (temiz !== kod.value) kod.value = temiz;
    gonder.disabled = !gecerli();
  });
  const yolla = () => {
    if (gecerli()) bildir("gonder", kod.value);
  };
  gonder.addEventListener("click", yolla);
  $("iptal").addEventListener("click", () => bildir("iptal"));
  $("kapat").addEventListener("click", () => bildir("iptal"));

  document.addEventListener("keydown", (olay) => {
    if (olay.key === "Escape") {
      olay.preventDefault();
      bildir("iptal");
    } else if (olay.key === "Enter" && olay.target !== $("iptal")) {
      // Bu bir emir onayı değil: Enter kodu gönderir.
      olay.preventDefault();
      yolla();
    }
  });

  $("serit").addEventListener("pointerdown", (olay) => {
    if (olay.button !== 0 || olay.target.closest("#kapat")) return;
    olay.preventDefault();
    bildir("tasi");
  });

  // ---------- Geri sayım ----------
  const sure = Math.max(1, Number(veri.sureSn) || 480);
  const sayac = $("sayac");
  let bitis = Date.now() + sure * 1000;
  const yaz = () => {
    const kalan = Math.max(0, Math.ceil((bitis - Date.now()) / 1000));
    sayac.textContent = Math.floor(kalan / 60) + ":" + String(kalan % 60).padStart(2, "0");
  };
  yaz();

  const olc = () => {
    const pay = parseFloat(getComputedStyle(document.body).paddingTop) || 0;
    return Math.ceil($("panel").getBoundingClientRect().height + 2 * pay);
  };

  let gosterildi = false;
  window.midasGoster = () => {
    if (gosterildi) return;
    gosterildi = true;
    bitis = Date.now() + sure * 1000;
    yaz();
    setInterval(yaz, 250);
    $("ray").animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], {
      duration: sure * 1000,
      easing: "linear",
      fill: "forwards",
    });
    kod.focus();
    bildir("boyut", olc());
  };

  window.addEventListener("resize", () => bildir("boyut", olc()));
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    setTimeout(() => bildir("hazir", olc()), 0);
  });
})();
