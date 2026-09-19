import { chromium, type BrowserContext, type Page } from "playwright";
import * as fs from "node:fs";
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

const SUBMIT_READY = "button[type=submit]:not([disabled])";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

/**
 * Tek oturumlu Playwright oturumunun sahibi.
 *
 * Kimlik doğrulama tamamen çerezle yapılır; bu yüzden GraphQL çağrıları sayfa bağlamının
 * içinden yapılır (bkz. api.ts). API ayrıca `x-midas-rid` başlığı ister: web uygulamasının
 * profil başına ürettiği bir istek kimliği. Yeniden hesaplamaya çalışmak yerine
 * uygulamanın kendi isteklerinden gözlenir.
 */
export class MidasSession {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private rid: string | null = null;
  private memberUid: string | null = null;
  private starting: Promise<void> | null = null;
  private readonly headless: boolean;
  /** Açık bağlam gizlenmiş giriş penceresi mi; kapanışta KWin betikleri kaldırılır. */
  private hiddenWindow = false;

  constructor(options: { headless?: boolean } = {}) {
    this.headless = options.headless ?? config.headless;
  }

  async ensureStarted(): Promise<void> {
    if (await this.awaitPendingStart()) return;
    if (this.page && !this.page.isClosed()) return;
    this.starting ??= this.start().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  /**
   * Süresi dolan oturumu çalışan MCP süreci içinde yeniden kurar. Eşzamanlı çağıranlar
   * `starting` üzerinden bu tek görünür giriş akışını paylaşır.
   */
  async reauthenticate(): Promise<void> {
    if (await this.awaitPendingStart()) return;
    // Bekleme sırasında başka bir çağıran girişi başlatmış olabilir; ona katılınır.
    this.starting ??= (async () => {
      await this.closeContext();
      await this.start();
    })().finally(() => {
      this.starting = null;
    });
    return this.starting;
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
    if (this.page && !this.page.isClosed()) return;
    this.starting = this.start(false).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async start(interactive = true): Promise<void> {
    await this.launch(this.headless ? "headless" : "visible");

    if (this.needsLogin() || !(await this.isAuthenticated())) {
      if (!interactive) {
        await this.closeContext();
        throw new SessionUnavailable();
      }
      // Kayıtlı durum bayat (refresh_token ~24 sa yaşar) ve başsız tarayıcı SSO formundaki
      // Turnstile doğrulamasını ve bildirim onayını güvenilir biçimde geçemez. Giriş
      // `MIDAS_LOGIN_WINDOW` kipine göre (varsayılan: gizlenmiş görünür pencere) yapılır,
      // taze token'ların anlık görüntüsü alınır, sonra çağıranın istediği moda dönülür.
      // Önce bayat anlık görüntü silinir: localStorage'ı her gezinmede bir init betiğiyle
      // yeniden yüklenir; bu da geri dönüşten hemen sonra taze token'ları ezer ve uygulamayı
      // /dashboard'dan /login'e geri atar.
      await this.closeContext();
      fs.rmSync(config.stateFile, { force: true });
      await this.interactiveLogin(this.headless ? config.loginWindow : "visible");
      await this.saveState();
      if (this.headless) {
        await this.closeContext();
        await this.launch("headless");
      }
    }

    await this.waitForRid();
    await this.readMemberUid();
    await this.saveState();
  }

  /**
   * Giriş akışı. `headless` kipinde Turnstile başsız geçmezse form gönderilmeden (telefona
   * bildirim gitmeden) `hidden` kipine düşülür. `hidden` kipinde doğrulama kullanıcı
   * etkileşimi isterse pencere görünür yapılır ve masaüstü bildirimi gönderilir.
   */
  private async interactiveLogin(mode: LoginWindowMode): Promise<void> {
    {
      if (mode === "headless") {
        await this.launch("headless", { fullChromium: true });
        if (!this.needsLogin() && (await this.isAuthenticated())) return;
        await this.clearAppStorage();
        if (await this.submitLoginForm(20_000)) {
          await this.awaitApproval();
          await this.assertAuthenticated();
          return;
        }
        console.error("giriş: Turnstile başsız doğrulanamadı; form gönderilmedi, gizli pencereye geçiliyor");
        await this.closeContext();
        mode = "hidden";
      }

      await this.launch(mode === "visible" ? "visible" : "hidden");
      if (!this.needsLogin() && (await this.isAuthenticated())) return;
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
  }

  private async assertAuthenticated(): Promise<void> {
    if (!(await this.isAuthenticated())) {
      throw new Error("Midas girişi tamamlandı ama API oturumu hâlâ reddediyor (HTTP 401).");
    }
  }

  private async closeContext(): Promise<void> {
    await this.context?.close().catch(() => {});
    this.context = null;
    this.page = null;
    this.rid = null;
    await this.releaseHiddenWindow();
  }

  /** Gizli pencerenin KWin betikleri pencere kapandıktan sonra kaldırılır; önce kaldırmak pencereyi gösterebilir. */
  private async releaseHiddenWindow(): Promise<void> {
    if (!this.hiddenWindow) return;
    this.hiddenWindow = false;
    await unloadKwinScript(KWIN_HIDE_PLUGIN);
    await unloadKwinScript(KWIN_REVEAL_PLUGIN);
  }

  private async launch(mode: LaunchMode, options: { fullChromium?: boolean } = {}): Promise<void> {
    const hidden = mode === "hidden";
    this.hiddenWindow = hidden;
    // Betik pencere açılmadan yüklenir ki KWin pencereyi eşleme anında yakalasın.
    const kwinHides = hidden ? await loadKwinScript(KWIN_HIDE_PLUGIN, kwinHideScript()) : false;
    this.context = await chromium.launchPersistentContext(config.sessionDir, {
      headless: mode === "headless",
      // Yeni başsız kip tam Chromium'u kullanır; headless shell'e göre gerçek tarayıcıya yakındır.
      ...(options.fullChromium ? { channel: "chromium" } : {}),
      viewport: { width: 1440, height: 900 },
      locale: "tr-TR",
      // Başsız Chromium kendini "HeadlessChrome" olarak tanıtır ve bu ipuçlarını göndermez;
      // API geçidi de isteği yönlendirmeden önce 403 ile reddeder.
      userAgent: USER_AGENT,
      extraHTTPHeaders: {
        "sec-ch-ua": '"Chromium";v="151", "Not=A?Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
      },
      args: ["--disable-blink-features=AutomationControlled", ...(hidden ? hiddenLaunchArgs() : [])],
    });
    this.page = this.context.pages()[0] ?? (await this.context.newPage());
    if (hidden && !kwinHides) await this.minimizeWindow();

    this.page.on("request", (req) => {
      if (req.url().includes("router-graphql")) {
        const observed = req.headers()["x-midas-rid"];
        if (observed) this.rid = observed;
      }
    });

    await this.restoreState();
    await this.page.goto(config.atlasUrl, { waitUntil: "domcontentloaded" });
    await this.page.waitForTimeout(3000);
  }

  /**
   * Atlas kimliği oturum ömürlü depoda tutar: Chromium tarayıcı kapanınca oturum çerezlerini
   * atar, bu yüzden kalıcı profil tek başına oturumu kapalı açılır. Playwright'ın
   * storageState() yöntemi bellekteki bu çerezleri *görür*; burada anlık görüntüleri alınır
   * ve sonraki açılışta geri yüklenir. Yeniden başlatmanın yeni bir bildirim onayı istemeden
   * sessiz geçmesini sağlayan budur.
   */
  private async saveState(): Promise<AuthExpiry | null> {
    try {
      const state = await this.context!.storageState();
      fs.writeFileSync(config.stateFile, JSON.stringify(state), { mode: 0o600 });
      return describeAuthExpiry(state, new URL(config.atlasUrl).origin);
    } catch {
      // Anlık görüntü bir iyileştirmedir; alınamaması oturumu bozmamalı.
      return null;
    }
  }

  private async restoreState(): Promise<void> {
    if (!fs.existsSync(config.stateFile)) return;
    try {
      const state = JSON.parse(fs.readFileSync(config.stateFile, "utf8"));
      if (state.cookies?.length) await this.context!.addCookies(state.cookies);
      for (const origin of state.origins ?? []) {
        const items = origin.localStorage ?? [];
        if (!items.length) continue;
        await this.context!.addInitScript(
          `(() => { if (location.origin !== ${JSON.stringify(origin.origin)}) return;
             for (const [k, v] of ${JSON.stringify(items.map((i: any) => [i.name, i.value]))}) {
               try { if (localStorage.getItem(k) === null) localStorage.setItem(k, v); } catch {}
             } })()`
        );
      }
    } catch {
      // Bozuk anlık görüntü yalnızca yeni bir giriş demektir.
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
    for (let i = 0; i < 40 && !this.rid; i++) await page.waitForTimeout(250);
    if (!this.rid) return false;
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
             "x-midas-rid": ${JSON.stringify(this.rid)},
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
    await page.waitForTimeout(3000);
    if (!this.needsLogin()) {
      await page.goto(new URL("login", config.atlasUrl).href, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(3000);
    }
  }

  private needsLogin(): boolean {
    const url = this.page!.url();
    return url.includes("sso.getmidas.com") || url.includes("/login");
  }

  /**
   * Uygulama sayfayı giriş ekranına geri attığında true döner; süresi dolan oturum istek
   * ortasında böyle görünür.
   */
  isLoggedOut(): boolean {
    return !this.page || this.page.isClosed() || this.needsLogin();
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
    await page.waitForSelector("#phone", { timeout: 30_000 });
    await page.fill("#phone", config.phone);
    await page.fill("#password", config.password);
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
    notifyDesktop("Midas girişi", "Telefonundaki Midas bildirimini onayla.");
    return true;
  }

  /** Kullanıcının Midas mobil uygulamasındaki bildirimi onaylamasını bekler. */
  private async awaitApproval(): Promise<void> {
    const page = this.page!;
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const url = page.url();
      if (url.startsWith(config.atlasUrl) && !url.includes("/auth/") && !url.includes("/login")) return;
      await page.waitForTimeout(1000);
    }
    notifyDesktop("Midas girişi başarısız", "Bildirim 3 dakika içinde onaylanmadı.", "critical");
    throw new Error(
      "Giriş 3 dakika sonra zaman aşımına uğradı: Midas uygulamasındaki bildirim onaylanmadı."
    );
  }

  /** Uygulamanın x-midas-rid başlığı gönderdiği görülene kadar gerekirse sayfayı yeniler. */
  private async waitForRid(): Promise<void> {
    const page = this.page!;
    for (let attempt = 0; attempt < 3 && !this.rid; attempt++) {
      if (attempt > 0) await page.reload({ waitUntil: "domcontentloaded" });
      for (let i = 0; i < 40 && !this.rid; i++) await page.waitForTimeout(250);
    }
    if (!this.rid) {
      throw new Error("Uygulamanın x-midas-rid başlığı gözlenemedi; oturum geçersiz olabilir.");
    }
  }

  private async readMemberUid(): Promise<void> {
    this.memberUid = (await this.page!.evaluate(
      `localStorage.getItem("midas:member-uid")`
    )) as string | null;
    if (!this.memberUid) {
      throw new Error("midas:member-uid okunamadı; giriş yapılmamış olabilir.");
    }
  }

  async getPage(): Promise<Page> {
    await this.ensureStarted();
    return this.page!;
  }

  async getRid(): Promise<string> {
    await this.ensureStarted();
    return this.rid!;
  }

  async getMemberUid(): Promise<string> {
    await this.ensureStarted();
    return this.memberUid!;
  }

  isStarted(): boolean {
    return !!this.page && !this.page.isClosed();
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
    if (this.needsLogin()) return { status: "logged-out" };
    if (!(await this.isAuthenticated())) {
      await this.page!.reload({ waitUntil: "domcontentloaded" });
      await this.page!.waitForTimeout(3000);
      if (this.needsLogin() || !(await this.isAuthenticated())) return { status: "logged-out" };
    }
    return { status: "alive", expiry: await this.saveState() };
  }

  async close(): Promise<void> {
    // Kapanmadan önce son token'lar kaydedilir; yeniden başlatma bayat anlık görüntüyle açılmaz.
    if (!this.starting && this.isStarted() && !this.needsLogin()) await this.saveState();
    await this.context?.close();
    this.context = null;
    this.page = null;
  }
}

export const session = new MidasSession();
