import webpush from 'web-push';

export interface PushPayload {
  title: string;
  body: string;
  /** In-app route to open: 'checkin', 'plan', 'event:<id>', 'letter' ... */
  route: string;
  tag?: string;
  actions?: { action: string; title: string }[];
  timeSensitive?: boolean;
}

export interface PushProvider {
  readonly enabled: boolean;
  readonly publicKey: string | null;
  /** Resolves false when the subscription is gone (410/404) so the caller can delete it. */
  send(subscription: unknown, payload: PushPayload): Promise<boolean>;
}

class WebPushProvider implements PushProvider {
  readonly enabled = true;
  constructor(readonly publicKey: string) {}
  async send(subscription: unknown, payload: PushPayload): Promise<boolean> {
    try {
      await webpush.sendNotification(subscription as webpush.PushSubscription, JSON.stringify(payload), { TTL: 3600, urgency: payload.timeSensitive ? 'high' : 'normal' });
      return true;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return false;
      throw e;
    }
  }
}

class DisabledPush implements PushProvider {
  readonly enabled = false;
  readonly publicKey = null;
  async send(): Promise<boolean> {
    return true;
  }
}

/** Web push whose VAPID keys come from the credential store, so saving them in the portal enables notifications. */
class LivePush implements PushProvider {
  private inner: WebPushProvider | null = null;
  private innerKey = '';
  constructor(private readonly get: (name: 'public_key' | 'private_key' | 'subject') => string | undefined) {}
  private resolve(): WebPushProvider | null {
    const pub = this.get('public_key'), priv = this.get('private_key');
    if (!pub || !priv) return null;
    const subject = this.get('subject') ?? 'mailto:support@example.com';
    const sig = `${pub}|${priv}|${subject}`;
    if (!this.inner || this.innerKey !== sig) {
      webpush.setVapidDetails(subject, pub, priv);
      this.inner = new WebPushProvider(pub);
      this.innerKey = sig;
    }
    return this.inner;
  }
  get enabled() { try { return !!this.resolve(); } catch { return false; } }
  get publicKey() { return this.enabled ? (this.get('public_key') ?? null) : null; }
  async send(subscription: unknown, payload: PushPayload): Promise<boolean> {
    const p = this.resolve();
    return p ? p.send(subscription, payload) : true;
  }
}

export function createPush(get: (name: 'public_key' | 'private_key' | 'subject') => string | undefined): PushProvider {
  return new LivePush(get);
}

export { DisabledPush };
