"use strict";

// Onay sayfası: modeli textContent ile çizer, kararı Python'a sayfa başlığıyla
// ("midas-onay:<tür>:<değer>") bildirir; Python titleChanged sinyalini dinler.
// innerHTML kullanılmaz.

(function () {
  const TUTMA_MS = 900; // Evet'in kalkması için basılı tutma süresi
  const KILIT_MS = 700; // pencere açıldıktan sonra Evet'in kilitli kaldığı süre

  const $ = (id) => document.getElementById(id);
  let bildirildi = false;
  let sira = 0;

  function bildir(tur, deger) {
    const bilgi = tur === "hazir" || tur === "boyut";
    if (bildirildi && !bilgi) return;
    if (!bilgi) bildirildi = true;
    sira += 1; // aynı başlık iki kez yazılırsa da sinyal gelsin
    document.title = "midas-onay:" + tur + ":" + (deger != null ? deger : "") + ":" + sira;
  }

  let veri;
  try {
    veri = JSON.parse($("veri").textContent);
  } catch (hata) {
    // Veri bozuksa pencere hiç açılmaz; Python 10 sn sonra hata döner.
    return;
  }

  const metin = (id, deger) => { $(id).textContent = deger == null ? "" : String(deger); };

  // ---------- Çizim ----------
  const panel = $("panel");
  panel.dataset.ton = veri.ton;
  metin("islem", veri.islem);
  metin("ozet", veri.ozet);
  metin("sembol", veri.sembol);
  metin("ad", veri.ad);
  metin("soru", veri.soru);
  metin("evet-yazi", veri.evet);
  metin("hayir", veri.hayir);

  if (veri.ton === "alis") {
    // Alış: yuvarlak içinde artı. Tehlike ve dikkat: üçgen uyarı.
    $("piktogram").querySelector(".piktogram-ucgen").setAttribute("d", "M24 3a21 21 0 1 1 0 42 21 21 0 0 1 0-42z");
    $("piktogram").querySelector(".piktogram-isaret").setAttribute("d", "M21.5 13h5v8.5H35v5h-8.5V35h-5v-8.5H13v-5h8.5z");
  }

  const kunye = $("kunye");
  const etiket = (yazi, yon) => {
    const el = document.createElement("span");
    el.className = "etiket";
    el.textContent = yazi;
    if (yon) el.dataset.yon = yon;
    kunye.appendChild(el);
  };
  etiket(veri.pazar);
  etiket(veri.yon === "SATIŞ" ? "Satış" : "Alış", veri.yon);
  etiket(veri.emirTipi);

  const satirlar = Array.isArray(veri.satirlar) ? veri.satirlar : [];
  const govde = $("satirlar-govde");
  for (const satir of satirlar) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = satir.etiket;
    const td = document.createElement("td");
    td.textContent = satir.deger;
    tr.append(th, td);
    govde.appendChild(tr);
  }
  metin("tutar-etiket", veri.tutar && veri.tutar.etiket);
  metin("tutar", veri.tutar && veri.tutar.deger);
  $("satirlar").hidden = false;
  if (veri.tutarVurgulu === false) $("satirlar").dataset.hafif = "evet";

  const degisiklikler = Array.isArray(veri.degisiklikler) ? veri.degisiklikler : [];
  if (degisiklikler.length) {
    const dgovde = $("degisim-govde");
    for (const d of degisiklikler) {
      const tr = document.createElement("tr");
      tr.dataset.degisti = d.degisti ? "evet" : "hayir";
      const eski = document.createElement("td");
      eski.className = "d-eski";
      eski.textContent = d.eski;
      const alan = document.createElement("td");
      alan.className = "d-alan";
      alan.textContent = d.etiket;
      const yeni = document.createElement("td");
      yeni.className = "d-yeni";
      yeni.textContent = d.degisti ? d.yeni : "aynı";
      if (!d.degisti) yeni.title = d.yeni;
      tr.append(eski, alan, yeni);
      dgovde.appendChild(tr);
    }
    $("degisim").hidden = false;
  }

  const kimlik = $("kimlik");
  const kimlikSatiri = (ad, deger) => {
    if (!deger) return;
    const span = document.createElement("span");
    span.append(ad + " ");
    const code = document.createElement("code");
    code.textContent = deger;
    span.appendChild(code);
    kimlik.appendChild(span);
  };
  kimlikSatiri("Emir", veri.emirNo);
  kimlikSatiri("Hesap", veri.hesap);

  // ---------- Geri sayım ----------
  // Python pencereyi gösterince midasGoster() çağırır; sayaç ve Evet kilidi o andan başlar.
  const sure = Math.max(1, Number(veri.sureSn) || 120);
  const sayac = $("sayac");
  let bitis = Date.now() + sure * 1000;
  const yaz = () => {
    const kalan = Math.max(0, Math.ceil((bitis - Date.now()) / 1000));
    sayac.textContent = Math.floor(kalan / 60) + ":" + String(kalan % 60).padStart(2, "0");
  };
  yaz();

  // ---------- Hayır ----------
  const hayir = $("hayir");
  hayir.addEventListener("click", () => bildir("hayir"));
  // Varsayılan odak Hayır; halka pencere odağı gidip gelse de görünür kalır.
  // Halka yalnız odak sayfa içinde başka bir öğeye (Evet) geçince kalkar.
  hayir.addEventListener("focus", () => hayir.classList.add("odakta"));
  document.addEventListener("focusin", (olay) => {
    if (olay.target !== hayir) hayir.classList.remove("odakta");
  });
  hayir.focus();
  hayir.classList.add("odakta");

  // ---------- Evet: kapaklı anahtar ----------
  const evet = $("evet");
  evet.style.setProperty("--tutma", TUTMA_MS + "ms");
  let acilis = Infinity; // gösterilene kadar Evet kilitli
  evet.classList.add("kilitli");

  let zamanlayici = null;
  const basla = () => {
    if (bildirildi || !(Date.now() - acilis >= KILIT_MS) || zamanlayici) return;
    evet.classList.add("tutuluyor");
    zamanlayici = setTimeout(() => {
      zamanlayici = null;
      bildir("evet");
    }, TUTMA_MS);
  };
  const birak = () => {
    if (!zamanlayici) return;
    clearTimeout(zamanlayici);
    zamanlayici = null;
    evet.classList.remove("tutuluyor");
  };
  const itti = () => {
    evet.classList.remove("itti");
    void evet.offsetWidth;
    evet.classList.add("itti");
  };

  evet.addEventListener("pointerdown", (olay) => {
    if (olay.button !== 0) return;
    evet.setPointerCapture(olay.pointerId);
    basla();
  });
  evet.addEventListener("pointerup", birak);
  evet.addEventListener("pointercancel", birak);
  evet.addEventListener("lostpointercapture", birak);
  // Tek tıklama hiçbir şey onaylamaz; yalnız nasıl onaylanacağını hatırlatır.
  evet.addEventListener("click", (olay) => {
    olay.preventDefault();
    if (!evet.classList.contains("tutuluyor")) itti();
  });

  document.addEventListener("keydown", (olay) => {
    if (olay.key === "Escape") {
      olay.preventDefault();
      bildir("hayir");
      return;
    }
    if (olay.target === evet) {
      if (olay.key === "Enter") {
        olay.preventDefault();
        itti();
      } else if (olay.key === " ") {
        olay.preventDefault();
        if (!olay.repeat) basla();
      }
    }
  });
  document.addEventListener("keyup", (olay) => {
    if (olay.target === evet && olay.key === " ") {
      olay.preventDefault();
      birak();
    }
  });
  evet.addEventListener("blur", birak);
  window.addEventListener("blur", birak);

  window.midasGoster = () => {
    if (acilis !== Infinity) return;
    acilis = Date.now();
    bitis = acilis + sure * 1000;
    yaz();
    setInterval(yaz, 250);
    $("ray").animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], {
      duration: sure * 1000,
      easing: "linear",
      fill: "forwards",
    });
    setTimeout(() => evet.classList.remove("kilitli"), KILIT_MS);
    bildir("boyut", olc());
  };

  // ---------- Hazır: Python pencereyi içerik yüksekliğinde gösterir ----------
  const olc = () => Math.ceil(panel.getBoundingClientRect().height);
  window.addEventListener("resize", () => bildir("boyut", olc()));
  // Pencere henüz gizli: requestAnimationFrame çalışmaz, düzen yine de hesaplanır.
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    setTimeout(() => bildir("hazir", olc()), 0);
  });
})();
