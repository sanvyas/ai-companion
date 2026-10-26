import webpush from 'web-push';
import type { Config } from '../config.js';

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

export function createPush(cfg: Pick<Config, 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY' | 'VAPID_SUBJECT'>): PushProvider {
  if (!cfg.VAPID_PUBLIC_KEY || !cfg.VAPID_PRIVATE_KEY) return new DisabledPush();
  webpush.setVapidDetails(cfg.VAPID_SUBJECT, cfg.VAPID_PUBLIC_KEY, cfg.VAPID_PRIVATE_KEY);
  return new WebPushProvider(cfg.VAPID_PUBLIC_KEY);
}
