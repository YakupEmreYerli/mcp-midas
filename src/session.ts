import { chromium, type BrowserContext, type Page } from "playwright";
import * as fs from "node:fs";
import { config } from "./config.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

/**
 * Owns the single authenticated Playwright session.
 *
 * Auth is entirely cookie-based, so GraphQL calls are issued from inside the page
 * context (see api.ts). The API additionally requires an `x-midas-rid` header — a
 * per-profile request id the web app generates — which we observe on the app's own
 * requests rather than trying to recompute.
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
    if (this.page && !this.page.isClosed()) return;
    this.starting ??= this.start().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async start(): Promise<void> {
    await this.launch(this.headless);

    if (this.needsLogin()) {
      // The saved state is stale (refresh_token lives ~24h), and a headless browser cannot
      // show the SSO form or the push prompt. Relaunch visibly just long enough to log in,
      // snapshot the fresh tokens, then go back to the mode the caller asked for.
      if (this.headless) {
        await this.closeContext();
        await this.launch(false);
        if (this.needsLogin()) await this.login(false);
        await this.saveState();
        await this.closeContext();
        await this.launch(true);
      } else {
        await this.login(false);
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
      // Headless Chromium advertises "HeadlessChrome" and omits these hints, which the
      // API gateway rejects with a 403 before the request is ever routed.
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
   * Atlas keeps its auth in session-scoped storage: Chromium drops session cookies when
   * the browser closes, so the persistent profile alone comes back logged out. Playwright's
   * storageState() *does* see those in-memory cookies, so they are snapshotted here and
   * replayed on the next start — which is what makes a restart silent instead of asking
   * for another push approval.
   */
  private async saveState(): Promise<void> {
    try {
      const state = await this.context!.storageState();
      fs.writeFileSync(config.stateFile, JSON.stringify(state), { mode: 0o600 });
    } catch {
      // A snapshot is an optimisation; failing to take one must not break the session.
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
               try { localStorage.setItem(k, v); } catch {}
             } })()`
        );
      }
    } catch {
      // A corrupt snapshot just means a fresh login.
    }
  }

  private needsLogin(): boolean {
    const url = this.page!.url();
    return url.includes("sso.getmidas.com") || url.includes("/login");
  }

  /**
   * True once the app has bounced the page back to the login screen, which is how an
   * expired session shows up mid-request.
   */
  isLoggedOut(): boolean {
    return !this.page || this.page.isClosed() || this.needsLogin();
  }

  /**
   * Fills the SSO form and then waits for the user to approve the push notification
   * in the Midas mobile app. There is no way to complete this without the phone.
   */
  private async login(visible: boolean): Promise<void> {
    const page = this.page!;
    if (!visible) {
      throw new Error(
        "Midas session has expired and the browser is headless, so the push prompt cannot be shown."
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
      "Login timed out after 3 minutes — the push notification was not approved in the Midas app."
    );
  }

  /** Reload if needed until we observe the app sending an x-midas-rid header. */
  private async waitForRid(): Promise<void> {
    const page = this.page!;
    for (let attempt = 0; attempt < 3 && !this.rid; attempt++) {
      if (attempt > 0) await page.reload({ waitUntil: "domcontentloaded" });
      for (let i = 0; i < 40 && !this.rid; i++) await page.waitForTimeout(250);
    }
    if (!this.rid) {
      throw new Error("Could not observe the app's x-midas-rid header; the session may be invalid.");
    }
  }

  private async readMemberUid(): Promise<void> {
    this.memberUid = (await this.page!.evaluate(
      `localStorage.getItem("midas:member-uid")`
    )) as string | null;
    if (!this.memberUid) {
      throw new Error("Could not read midas:member-uid — not logged in?");
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

  async close(): Promise<void> {
    await this.context?.close();
    this.context = null;
    this.page = null;
  }
}

export const session = new MidasSession();
