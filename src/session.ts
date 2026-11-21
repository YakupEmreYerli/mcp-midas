import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { chromium, type BrowserContext, type Page } from "playwright";
import { config } from "./config.js";
import { describeAuthExpiry, type AuthExpiry } from "./auth-expiry.js";
import {
  hiddenLaunchArgs,
  KWIN_HIDE_PLUGIN,
  KWIN_REVEAL_PLUGIN,
  kwinHideScript,
  kwinRevealScript,
  loadKwinScript,
  notifyDesktop,
  unloadKwinScript,
  type LoginWindowMode,
} from "./login-window.js";

/** Tarayıcının nasıl açılacağı: başsız, görünür ya da göz önünden gizlenmiş görünür pencere. */
type LaunchMode = "headless" | "visible" | "hidden";

/** Canlı tutma turunun sonucu; HTTP servisi loga yazar. */
export type KeepAliveResult =
  | { status: "alive"; expiry: AuthExpiry | null }
  | { status: "skipped"; reason: string }
  | { status: "logged-out" };

/** Sessiz açılışta kayıtlı oturum geçersizse fırlatılır; görünür giriş başlatılmaz. */
export class SessionUnavailable extends Error {
  constructor() {
    super("Kayıtlı Midas oturumu geçersiz; giriş bir sonraki araç çağrısına bırakıldı.");
    this.name = "SessionUnavailable";
  }
}

/** Oturum durumu (get_session_status); hiçbir koşulda giriş başlatmadan üretilir. */
export interface SessionStatus {
  status: "logged-in" | "logged-out" | "starting";
  /** Tarayıcı şu an açık mı. */
  browser: boolean;
  /** Durumun nereden okunduğu: açık sayfadan canlı sorgu, kayıtlı durumla sessiz açılış ya da yalnız dosya. */
  checked: "live" | "quiet-start" | "saved-state" | "none";
  expiry: AuthExpiry | null;
}

const SUBMIT_READY = "button[type=submit]:not([disabled])";

/**
 * Başsız Chromium kendini "HeadlessChrome" diye tanıtır ve istemci ipuçlarını göndermez;
 * geçit böyle istekleri yönlendirmeden 403 ile reddeder. Sıradan bir masaüstü Chrome'u
 * gibi görünmek için kullanıcı aracısı ve ipuçları elle verilir.
 */
const CHROME_MAJOR = 151;
/** Each host claims its own OS, so the user agent matches what the browser really runs on. */
const PLATFORM_IDENTITY: Record<string, { ua: string; hint: string }> = {
  darwin: { ua: "Macintosh; Intel Mac OS X 10_15_7", hint: "macOS" },
  linux: { ua: "X11; Linux x86_64", hint: "Linux" },
  win32: { ua: "Windows NT 10.0; Win64; x64", hint: "Windows" },
};
const PLATFORM = PLATFORM_IDENTITY[process.platform] ?? PLATFORM_IDENTITY.win32;

/** Without MIDAS_PHONE and MIDAS_PASSWORD the login form is left to the user. */
function hasCredentials(): boolean {
  return Boolean(config.phone && config.password);
}
const DESKTOP_IDENTITY = {
  userAgent:
    `Mozilla/5.0 (${PLATFORM.ua}) AppleWebKit/537.36 (KHTML, like Gecko) ` +
    `Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`,
  extraHTTPHeaders: {
    "sec-ch-ua": `"Chromium";v="${CHROME_MAJOR}", "Not=A?Brand";v="99"`,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": `"${PLATFORM.hint}"`,
  },
};

/** Sayfa yüklendikten sonra uygulamanın kendini toparlaması için beklenen süre. */
const SETTLE_MS = 3000;

/** `test` doğru olana ya da `tries × stepMs` dolana dek sayfada bekler. */
async function pollUntil(page: Page, test: () => boolean, tries = 40, stepMs = 250): Promise<boolean> {
  for (let i = 0; i < tries && !test(); i++) await page.waitForTimeout(stepMs);
  return test();
}

/**
 * Atlas oturumunu taşıyan tek Playwright tarayıcısı.
 *
 * Kimlik çerezlerle taşındığı için GraphQL istekleri bu tarayıcının sayfasından yapılır
 * (api.ts). Geçit ayrıca `x-midas-rid` başlığını ister; bu kimlik hesaplanmaz, web
 * uygulamasının kendi isteklerinden okunur.
 */
export class MidasSession {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  /** Uygulamanın gönderdiği son `x-midas-rid`. */
  private requestId: string | null = null;
  /** localStorage'daki `midas:member-uid`. */
  private memberId: string | null = null;
  /** Süren açılış ya da giriş; eşzamanlı çağıranlar bunu paylaşır. */
  private starting: Promise<void> | null = null;
  private readonly headless: boolean;
  /** Açık bağlam gizlenmiş giriş penceresi mi; kapanışta KWin betikleri kaldırılır. */
  private hiddenWindow = false;

  constructor(options: { headless?: boolean } = {}) {
    this.headless = options.headless ?? config.headless;
  }

  /** Yeni açılışı tek seferlik paylaşılan iş olarak başlatır. */
  private share(job: () => Promise<void>): Promise<void> {
    this.starting = job().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  /** Tarayıcı açık ve oturumlu değilse açar; gerekirse giriş akışını çalıştırır. */
  async ensureStarted(): Promise<void> {
    if (await this.awaitPendingStart()) return;
    if (this.isStarted()) return;
    return this.starting ?? this.share(() => this.start());
  }

  /**
   * Süresi dolan oturumu çalışan MCP süreci içinde yeniden kurar. Eşzamanlı çağıranlar
   * `starting` üzerinden bu tek görünür giriş akışını paylaşır.
   */
  async reauthenticate(): Promise<void> {
    if (await this.awaitPendingStart()) return;
    // Bekleme sırasında başka bir çağıran girişi başlatmış olabilir; ona katılınır.
    return (
      this.starting ??
      this.share(async () => {
        await this.shutdownBrowser();
        await this.start();
      })
    );
  }

  /**
   * Süren bir açılış varsa onu bekler ve true döner. Canlı tutmanın sessiz açılışı oturumu
   * geçersiz bulduysa false döner: gerçek araç çağrısı o zaman kendi giriş akışını başlatır.
   */
  private async awaitPendingStart(): Promise<boolean> {
    if (!this.starting) return false;
    try {
      await this.starting;
      return true;
    } catch (error) {
      if (error instanceof SessionUnavailable) return false;
      throw error;
    }
  }

  /**
   * Sessiz açılış: yalnız kayıtlı durumla başsız açar. Oturum geçersizse giriş başlatmaz,
   * `SessionUnavailable` fırlatır ve tarayıcıyı kapatır. Canlı tutma döngüsü bunu kullanır.
   */
  async ensureStartedQuietly(): Promise<void> {
    if (this.starting) return this.starting;
    if (this.isStarted()) return;
    return this.share(() => this.start(false));
  }

  private async start(interactive = true): Promise<void> {
    await this.openBrowser(this.headless ? "headless" : "visible");

    if (this.onLoginScreen() || !(await this.isAuthenticated())) {
      if (!interactive) {
        await this.shutdownBrowser();
        throw new SessionUnavailable();
      }
      // Kayıtlı durum bayat (refresh_token ~24 sa yaşar) ve başsız tarayıcı SSO formundaki
      // Turnstile doğrulamasını ve bildirim onayını güvenilir biçimde geçemez. Giriş
      // `MIDAS_LOGIN_WINDOW` kipine göre (varsayılan: gizlenmiş görünür pencere) yapılır,
      // taze token'ların anlık görüntüsü alınır, sonra çağıranın istediği moda dönülür.
      // Önce bayat anlık görüntü silinir: localStorage'ı her gezinmede bir init betiğiyle
      // yeniden yüklenir; bu da geri dönüşten hemen sonra taze token'ları ezer ve uygulamayı
      // /dashboard'dan /login'e geri atar.
      await this.shutdownBrowser();
      rmSync(config.stateFile, { force: true });
      await this.interactiveLogin(this.headless ? config.loginWindow : "visible");
      await this.persistState();
      if (this.headless) {
        // Giriş görünür (ya da gizli) pencerede yapıldı; çalışmaya başsız devam edilir.
        await this.shutdownBrowser();
        await this.openBrowser("headless");
      }
    }

    await this.awaitRequestId();
    await this.loadMemberUid();
    await this.persistState();
  }

  /**
   * Giriş akışı. `headless` kipinde Turnstile başsız geçmezse form gönderilmeden (telefona
   * bildirim gitmeden) `hidden` kipine düşülür. `hidden` kipinde doğrulama kullanıcı
   * etkileşimi isterse pencere görünür yapılır ve masaüstü bildirimi gönderilir.
   */
  private async interactiveLogin(mode: LoginWindowMode): Promise<void> {
    // Without credentials the user signs in by hand, which a headless browser cannot show.
    if (mode === "headless" && !hasCredentials()) mode = "hidden";
    if (mode === "headless") {
      await this.openBrowser("headless", { fullChromium: true });
      if (!this.onLoginScreen() && (await this.isAuthenticated())) return;
      await this.clearAppStorage();
      if (await this.submitLoginForm(20_000)) {
        await this.awaitApproval();
        await this.assertAuthenticated();
        return;
      }
      console.error("giriş: Turnstile başsız doğrulanamadı; form gönderilmedi, gizli pencereye geçiliyor");
      await this.shutdownBrowser();
      mode = "hidden";
    }

    await this.openBrowser(mode === "visible" ? "visible" : "hidden");
    if (!this.onLoginScreen() && (await this.isAuthenticated())) return;
    await this.clearAppStorage();
    let submitted = await this.submitLoginForm(30_000);
    if (!submitted && mode === "hidden") {
      await this.revealLoginWindow();
      notifyDesktop(
        "Midas girişi: doğrulama gerekiyor",
        "Açılan tarayıcı penceresinde doğrulamayı tamamla; ardından telefonundaki bildirimi onayla.",
        "critical"
      );
      submitted = await this.submitLoginForm(120_000);
    }
    if (!submitted) {
      throw new Error("Midas giriş formu gönderilemedi: doğrulama (Turnstile) tamamlanmadı.");
    }
    await this.awaitApproval();
    await this.assertAuthenticated();
  }

  private async assertAuthenticated(): Promise<void> {
    if (!(await this.isAuthenticated())) {
      throw new Error("Midas girişi tamamlandı ama API oturumu hâlâ reddediyor (HTTP 401).");
    }
  }

  /** Tarayıcıyı kapatır ve sayfaya bağlı her şeyi unutur; hata vermez. */
  private async shutdownBrowser(): Promise<void> {
    const ctx = this.context;
    this.context = null;
    this.page = null;
    this.requestId = null;
    if (ctx) await ctx.close().catch(() => {});
    await this.releaseHiddenWindow();
  }

  /** Gizli pencerenin KWin betikleri pencere kapandıktan sonra kaldırılır; önce kaldırmak pencereyi gösterebilir. */
  private async releaseHiddenWindow(): Promise<void> {
    if (!this.hiddenWindow) return;
    this.hiddenWindow = false;
    await unloadKwinScript(KWIN_HIDE_PLUGIN);
    await unloadKwinScript(KWIN_REVEAL_PLUGIN);
  }

  /**
   * Kalıcı profille Chromium açar, kayıtlı oturumu geri yükler ve Atlas'a gider. Sayfanın
   * geçide giden istekleri izlenir; `x-midas-rid` oradan alınır.
   */
  private async openBrowser(mode: LaunchMode, options: { fullChromium?: boolean } = {}): Promise<void> {
    const hidden = mode === "hidden";
    this.hiddenWindow = hidden;
    // Betik pencere açılmadan yüklenir ki KWin pencereyi eşleme anında yakalasın.
    const kwinHides = hidden ? await loadKwinScript(KWIN_HIDE_PLUGIN, kwinHideScript()) : false;

    const ctx = await chromium.launchPersistentContext(config.sessionDir, {
      ...DESKTOP_IDENTITY,
      headless: mode === "headless",
      // Yeni başsız kip tam Chromium'u kullanır; headless shell'e göre gerçek tarayıcıya yakındır.
      ...(options.fullChromium ? { channel: "chromium" } : {}),
      locale: "tr-TR",
      viewport: { width: 1440, height: 900 },
      args: ["--disable-blink-features=AutomationControlled", ...(hidden ? hiddenLaunchArgs() : [])],
    });
    this.context = ctx;
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    this.page = page;
    if (hidden && !kwinHides) await this.minimizeWindow();

    const gatewayPath = new URL(config.graphqlUrl).pathname;
    page.on("request", (request) => {
      if (!request.url().includes(gatewayPath)) return;
      const rid = request.headers()["x-midas-rid"];
      if (rid) this.requestId = rid;
    });

    await this.replayState();
    await page.goto(config.atlasUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(SETTLE_MS);
  }

  /**
   * Atlas kimliği tarayıcı oturumu boyunca yaşayan çerezlerde ve localStorage'da tutar;
   * Chromium kapanırken bu çerezleri diske yazmaz, yani kalıcı profil tek başına oturumu
   * taşımaz. `storageState()` bellekteki çerezleri de verdiği için anlık görüntü buradan
   * alınır (0600) ve sonraki açılışta `replayState` ile geri konur; yeniden başlatma böylece
   * yeni bildirim onayı istemez. Dönen değer token sürelerinin özetidir.
   */
  private async persistState(): Promise<AuthExpiry | null> {
    try {
      const snapshot = await this.context!.storageState();
      writeFileSync(config.stateFile, JSON.stringify(snapshot), { mode: 0o600 });
      return describeAuthExpiry(snapshot, new URL(config.atlasUrl).origin);
    } catch {
      // Anlık görüntü bir iyileştirmedir; alınamaması oturumu bozmamalı.
      return null;
    }
  }

  /** Kayıtlı çerezleri bağlama ekler; localStorage girdilerini her gezinmede eksikse yazar. */
  private async replayState(): Promise<void> {
    let snapshot: {
      cookies?: Parameters<BrowserContext["addCookies"]>[0];
      origins?: Array<{ origin: string; localStorage?: Array<{ name: string; value: string }> }>;
    };
    try {
      snapshot = JSON.parse(readFileSync(config.stateFile, "utf8"));
    } catch {
      // Dosya yok ya da bozuk: yeni giriş gerekecek, o kadar.
      return;
    }
    try {
      if (snapshot.cookies?.length) await this.context!.addCookies(snapshot.cookies);
      for (const { origin, localStorage = [] } of snapshot.origins ?? []) {
        if (localStorage.length === 0) continue;
        const entries = JSON.stringify(localStorage.map(({ name, value }) => [name, value]));
        // Var olan anahtar ezilmez: sayfanın yenilediği token kayıttakinden tazedir.
        await this.context!.addInitScript(`(() => {
          if (location.origin !== ${JSON.stringify(origin)}) return;
          for (const [key, value] of ${entries}) {
            try { if (localStorage.getItem(key) === null) localStorage.setItem(key, value); } catch {}
          }
        })()`);
      }
    } catch {
      // Geri yükleme yarım kalırsa da yeni giriş yolu açık.
    }
  }

  /**
   * Yalnız URL'ye güvenilmez: kimlik çerezleri gittikten sonra da kalıcı profil
   * `midas:member-uid` ve süre anahtarlarını localStorage'da tutar; uygulama ölü oturum için
   * /dashboard gösterir. Doğrudan API geçidine sorulur: çerezler yoksa ya da süresi
   * dolmuşsa 401 döner.
   */
  private async isAuthenticated(): Promise<boolean> {
    const page = this.page!;
    if (!(await pollUntil(page, () => this.requestId !== null))) return false;
    const status = (await page
      .evaluate(
        `(async () => (await fetch(${JSON.stringify(config.graphqlUrl)}, {
           method: "POST",
           credentials: "include",
           headers: {
             "content-type": "application/json",
             "midas-app-id": "midas_web",
             "x-apollo-operation-name": "__typename",
             "x-client-version": ${JSON.stringify(config.clientVersion)},
             "x-midas-rid": ${JSON.stringify(this.requestId)},
           },
           body: JSON.stringify({ query: "{__typename}" }),
         })).status)()`
      )
      .catch(() => 0)) as number;
    return status !== 0 && status !== 401 && status !== 403;
  }

  /** Uygulamanın bayat localStorage'ını siler; uygulama girişli gibi davranmayı bırakıp SSO formunu gösterir. */
  private async clearAppStorage(): Promise<void> {
    const page = this.page!;
    await page.evaluate(`localStorage.clear(); sessionStorage.clear()`).catch(() => {});
    await page.goto(config.atlasUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(SETTLE_MS);
    if (!this.onLoginScreen()) {
      await page.goto(new URL("login", config.atlasUrl).href, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(SETTLE_MS);
    }
  }

  /** Sayfa SSO alanında ya da Atlas'ın giriş ekranında mı. */
  private onLoginScreen(): boolean {
    const url = this.page!.url();
    return ["sso.getmidas.com", "/login"].some((marker) => url.includes(marker));
  }

  /**
   * Sayfa kapalıysa ya da uygulama giriş ekranına döndüyse true. Süresi dolan oturum istek
   * ortasında böyle görünür (api.ts).
   */
  isLoggedOut(): boolean {
    return !this.isStarted() || this.onLoginScreen();
  }

  /** KWin yoksa yedek yol: pencereyi CDP ile simge durumuna küçültür. */
  private async minimizeWindow(): Promise<void> {
    try {
      const cdp = await this.context!.newCDPSession(this.page!);
      const { windowId } = (await cdp.send("Browser.getWindowForTarget")) as { windowId: number };
      await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
      await cdp.detach().catch(() => {});
    } catch {
      // Küçültülemezse pencere görünür kalır; giriş yine çalışır.
    }
  }

  /** Gizli giriş penceresini kullanıcının etkileşimi için öne getirir. */
  private async revealLoginWindow(): Promise<void> {
    await unloadKwinScript(KWIN_HIDE_PLUGIN);
    const shown = await loadKwinScript(KWIN_REVEAL_PLUGIN, kwinRevealScript());
    if (shown) return;
    try {
      const cdp = await this.context!.newCDPSession(this.page!);
      const { windowId } = (await cdp.send("Browser.getWindowForTarget")) as { windowId: number };
      await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
      await cdp.detach().catch(() => {});
    } catch {
      // Gösterilemezse zaman aşımı hatası kullanıcıya yine döner.
    }
  }

  /**
   * SSO formunu doldurur ve gönderir. Gönder düğmesi etkinleşmeden ve (varsa) Turnstile
   * yanıtı dolmadan tıklanmaz; süre içinde hazır olmazsa false döner ve istek gönderilmez,
   * telefona bildirim düşmez.
   */
  private async submitLoginForm(readyTimeoutMs: number): Promise<boolean> {
    const page = this.page!;
    const phoneField = page.locator("#phone").first();
    await phoneField.waitFor({ timeout: 30_000 });
    if (!hasCredentials()) {
      if (this.hiddenWindow) await this.revealLoginWindow();
      notifyDesktop("Midas girişi", "Açılan Midas penceresinde giriş yap.", "critical");
      return true;
    }
    await phoneField.fill(config.phone);
    await page.locator("#password").first().fill(config.password);
    try {
      await page.waitForFunction(
        `(() => {
           const button = document.querySelector(${JSON.stringify(SUBMIT_READY)});
           if (!button) return false;
           if (!document.querySelector("#turnstile-container")) return true;
           const answer = document.querySelector('[name="cf-turnstile-response"]');
           return !!(answer && answer.value);
         })()`,
        undefined,
        { timeout: readyTimeoutMs, polling: 500 }
      );
    } catch {
      return false;
    }
    await page.click(SUBMIT_READY);
    if (config.loginMethod === "push") notifyDesktop("Midas girişi", "Telefonundaki Midas bildirimini onayla.");
    return true;
  }

  /** Sayfa Atlas uygulamasının içine (giriş ve yetkilendirme ekranları dışına) döndü mü. */
  private backInApp(): boolean {
    const url = this.page!.url();
    if (!url.startsWith(config.atlasUrl)) return false;
    return !["/auth/", "/login"].some((part) => url.includes(part));
  }

  /**
   * Kullanıcının Midas mobil uygulamasındaki bildirimi onaylamasını bekler. `sms` yolunda mobil
   * onay ekranında "SMS ile giriş yap" seçilir, pencere öne getirilir ve kullanıcının gelen kodu
   * pencereye yazması beklenir; kod koda ya da loga hiç girmez.
   */
  private async awaitApproval(): Promise<void> {
    const page = this.page!;
    const sms = config.loginMethod === "sms";
    const giveUpAt = Date.now() + (sms ? 480_000 : 180_000);
    let switched = false;
    for (; Date.now() < giveUpAt; await page.waitForTimeout(1000)) {
      if (this.backInApp()) return;
      if (!sms || switched || !page.url().includes("/giris/mobil-onay")) continue;
      const button = page.getByRole("button", { name: "SMS ile giriş yap" });
      if (!(await button.count())) continue;
      await button.first().click();
      switched = true;
      if (this.hiddenWindow) await this.revealLoginWindow();
      notifyDesktop("Midas girişi", "Telefonuna gelen SMS kodunu açılan Midas penceresine yaz.", "critical");
    }
    const what = sms ? "SMS kodu 8 dakika içinde girilmedi." : "Bildirim 3 dakika içinde onaylanmadı.";
    notifyDesktop("Midas girişi başarısız", what, "critical");
    throw new Error(`Midas girişi zaman aşımına uğradı: ${what}`);
  }

  /**
   * Uygulamanın ilk geçit isteğini (ve onunla `x-midas-rid`'i) bekler; gelmezse sayfayı en
   * çok iki kez yeniden yükler.
   */
  private async awaitRequestId(): Promise<void> {
    const page = this.page!;
    const seen = () => this.requestId !== null;
    if (await pollUntil(page, seen)) return;
    for (let reload = 0; reload < 2; reload++) {
      await page.reload({ waitUntil: "domcontentloaded" });
      if (await pollUntil(page, seen)) return;
    }
    throw new Error("Uygulamanın x-midas-rid başlığı gözlenemedi; oturum geçersiz olabilir.");
  }

  /** Üye kimliği uygulamanın localStorage'ından okunur; portföy sorguları bunu ister. */
  private async loadMemberUid(): Promise<void> {
    const stored = await this.page!.evaluate(`window.localStorage.getItem("midas:member-uid")`);
    if (typeof stored !== "string" || !stored) {
      throw new Error("midas:member-uid okunamadı; giriş yapılmamış olabilir.");
    }
    this.memberId = stored;
  }

  /** Oturumlu sayfa (gerekirse önce açılır). */
  async getPage(): Promise<Page> {
    await this.ensureStarted();
    return this.page!;
  }

  /** Geçit isteklerine eklenecek `x-midas-rid`. */
  async getRid(): Promise<string> {
    await this.ensureStarted();
    return this.requestId!;
  }

  /** Oturumdaki üyenin kimliği. */
  async getMemberUid(): Promise<string> {
    await this.ensureStarted();
    return this.memberId!;
  }

  isStarted(): boolean {
    return this.page !== null && !this.page.isClosed();
  }

  /**
   * Canlı tutma turu: tarayıcı kapalıysa kayıtlı durumla başsız açar, zararsız bir okuma
   * sorgusuyla oturumu yoklar (gerekirse sayfayı yeniden yükleyip uygulamanın token
   * yenilemesini tetikler) ve anlık görüntüyü kaydeder. Hiçbir koşulda giriş başlatmaz:
   * oturum düşmüşse yalnız "logged-out" döner, giriş bir sonraki gerçek araç çağrısına kalır.
   */
  async keepAlive(): Promise<KeepAliveResult> {
    if (this.starting) return { status: "skipped", reason: "giriş ya da açılış sürüyor" };
    if (!this.isStarted()) {
      try {
        await this.ensureStartedQuietly();
      } catch (error) {
        if (error instanceof SessionUnavailable) return { status: "logged-out" };
        throw error;
      }
    }
    if (this.onLoginScreen()) return { status: "logged-out" };
    if (!(await this.isAuthenticated())) {
      await this.page!.reload({ waitUntil: "domcontentloaded" });
      await this.page!.waitForTimeout(SETTLE_MS);
      if (this.onLoginScreen() || !(await this.isAuthenticated())) return { status: "logged-out" };
    }
    return { status: "alive", expiry: await this.persistState() };
  }

  /**
   * Oturumun açık olup olmadığını söyler; hiçbir koşulda giriş başlatmaz, telefona bildirim
   * göndermez. Tarayıcı açıksa sayfadan zararsız bir sorgu atılır. Kapalıysa kayıtlı durum
   * dosyasına bakılır: dosya yoksa ya da refresh_token süresi dolmuşsa tarayıcı hiç açılmadan
   * "logged-out" döner; aksi hâlde canlı tutmanın sessiz açılışı denenir (başsız, giriş yok).
   */
  async status(now = Date.now()): Promise<SessionStatus> {
    if (this.starting) return { status: "starting", browser: this.isStarted(), checked: "none", expiry: null };
    if (this.isStarted()) {
      const alive = !this.onLoginScreen() && (await this.isAuthenticated());
      const expiry = alive ? await this.persistState() : null;
      return { status: alive ? "logged-in" : "logged-out", browser: true, checked: "live", expiry };
    }
    const saved = this.readSavedExpiry();
    const limit = saved ? (saved.refreshTokenExp ?? saved.refreshExpiry) : null;
    if (!saved || (limit !== null && limit <= now)) {
      return { status: "logged-out", browser: false, checked: "saved-state", expiry: saved };
    }
    try {
      await this.ensureStartedQuietly();
    } catch (error) {
      if (error instanceof SessionUnavailable) {
        return { status: "logged-out", browser: false, checked: "quiet-start", expiry: saved };
      }
      throw error;
    }
    return { status: "logged-in", browser: this.isStarted(), checked: "quiet-start", expiry: this.readSavedExpiry() };
  }

  /** Kayıtlı durum dosyasındaki süreler; dosya yoksa ya da bozuksa null. */
  private readSavedExpiry(): AuthExpiry | null {
    try {
      const state = JSON.parse(readFileSync(config.stateFile, "utf8"));
      return describeAuthExpiry(state, new URL(config.atlasUrl).origin);
    } catch {
      return null;
    }
  }

  /** Son token'ları kaydedip tarayıcıyı kapatır; yeniden başlatma bayat görüntüyle açılmasın. */
  async close(): Promise<void> {
    if (!this.starting && this.isStarted() && !this.onLoginScreen()) await this.persistState();
    const ctx = this.context;
    this.context = null;
    this.page = null;
    await ctx?.close();
  }
}

export const session = new MidasSession();
