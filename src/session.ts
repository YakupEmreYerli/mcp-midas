import { chromium, type BrowserContext, type Page } from "playwright";
import * as fs from "node:fs";
import { config } from "./config.js";

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

  constructor(options: { headless?: boolean } = {}) {
    this.headless = options.headless ?? config.headless;
  }

  async ensureStarted(): Promise<void> {
    if (this.starting) return this.starting;
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
    if (this.starting) return this.starting;
    this.starting = (async () => {
      await this.closeContext();
      await this.start();
    })().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async start(): Promise<void> {
    await this.launch(this.headless);

    if (this.needsLogin() || !(await this.isAuthenticated())) {
      // Kayıtlı durum bayat (refresh_token ~24 sa yaşar) ve başsız tarayıcı SSO formunu ya
      // da bildirim onayını gösteremez. Giriş yapacak kadar görünür aç, taze token'ların
      // anlık görüntüsünü al, sonra çağıranın istediği moda dön.
      // Önce bayat anlık görüntü silinir: localStorage'ı her gezinmede bir init betiğiyle
      // yeniden yüklenir; bu da geri dönüşten hemen sonra taze token'ları ezer ve uygulamayı
      // /dashboard'dan /login'e geri atar.
      await this.closeContext();
      fs.rmSync(config.stateFile, { force: true });
      await this.launch(false);
      if (this.needsLogin() || !(await this.isAuthenticated())) {
        await this.clearAppStorage();
        await this.login(true);
        if (!(await this.isAuthenticated())) {
          throw new Error("Midas girişi tamamlandı ama API oturumu hâlâ reddediyor (HTTP 401).");
        }
      }
      await this.saveState();
      if (this.headless) {
        await this.closeContext();
        await this.launch(true);
      }
    }

    await this.waitForRid();
    await this.readMemberUid();
    await this.saveState();
  }

  private async closeContext(): Promise<void> {
    await this.context?.close().catch(() => {});
    this.context = null;
    this.page = null;
    this.rid = null;
  }

  private async launch(headless: boolean): Promise<void> {
    this.context = await chromium.launchPersistentContext(config.sessionDir, {
      headless,
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
      args: ["--disable-blink-features=AutomationControlled"],
    });
    this.page = this.context.pages()[0] ?? (await this.context.newPage());

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
  private async saveState(): Promise<void> {
    try {
      const state = await this.context!.storageState();
      fs.writeFileSync(config.stateFile, JSON.stringify(state), { mode: 0o600 });
    } catch {
      // Anlık görüntü bir iyileştirmedir; alınamaması oturumu bozmamalı.
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

  /**
   * SSO formunu doldurur, ardından kullanıcının Midas mobil uygulamasındaki bildirimi
   * onaylamasını bekler. Telefon olmadan tamamlanamaz.
   */
  private async login(visible: boolean): Promise<void> {
    const page = this.page!;
    if (!visible) {
      throw new Error(
        "Midas oturumunun süresi doldu ve tarayıcı başsız çalışıyor; bildirim onayı gösterilemez."
      );
    }

    await page.waitForSelector("#phone", { timeout: 30_000 });
    await page.fill("#phone", config.phone);
    await page.fill("#password", config.password);
    await page.click("button[type=submit]:not([disabled])");

    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const url = page.url();
      if (url.startsWith(config.atlasUrl) && !url.includes("/auth/") && !url.includes("/login")) return;
      await page.waitForTimeout(1000);
    }
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
   * Boşta duran, zaten açık oturumu yeniler ve anlık görüntüsünü alır. Kendiliğinden tarayıcı
   * ya da giriş başlatmaz: kimsenin istemediği bir bildirim onayı yalnızca zaman aşımına uğrar.
   */
  async keepAlive(): Promise<void> {
    if (this.starting || !this.isStarted() || this.needsLogin()) return;
    await this.page!.reload({ waitUntil: "domcontentloaded" });
    await this.page!.waitForTimeout(3000);
    if (this.needsLogin()) return;
    await this.saveState();
  }

  async close(): Promise<void> {
    await this.context?.close();
    this.context = null;
    this.page = null;
  }
}

export const session = new MidasSession();
