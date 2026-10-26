// Outbound check-in calls (PRD 8.8). No telephony vendor selected yet. The in-app incoming-call screen and
// push notifications work without this; a PSTN call needs a vendor (Twilio, Exotel, ...) implementing this.
export interface TelephonyProvider {
  readonly name: string;
  /** Place a call that connects to the voice stream endpoint. Returns the vendor call id. */
  placeCall(opts: { toE164: string; conversationId: string; token: string }): Promise<{ callId: string }>;
}
