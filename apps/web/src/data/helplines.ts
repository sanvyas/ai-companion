// Stand-in for the remote-config helplines table (PRD §6.4, GET /helplines).
// MUST be configurable remotely and verified quarterly. Last verified against PRD v2 text.
// TODO(remote-config): load from GET /helplines?lang=&city= and cache for offline use.
export interface Helpline {
  id: string;
  name: string;
  desc: string;
  num: string; // display
  tel: string; // tel: target
}

export const TELE_MANAS: Helpline = { id: 'telemanas', name: 'Tele-MANAS', desc: 'Free, any time, in many Indian languages.', num: '14416', tel: '14416' };
export const KIRAN: Helpline = { id: 'kiran', name: 'KIRAN', desc: 'Free mental health support, 24 hours.', num: '1800-599-0019', tel: '18005990019' };
export const EMERGENCY: Helpline = { id: 'emergency', name: 'Emergency services', desc: 'Police, ambulance, fire.', num: '112', tel: '112' };
export const CHILDLINE: Helpline = { id: 'childline', name: 'Childline', desc: 'For anyone under 18. Free, any time.', num: '1098', tel: '1098' };

export const HELPLINES: Helpline[] = [TELE_MANAS, KIRAN, EMERGENCY];
export const YOUTH_HELPLINES: Helpline[] = [KIRAN, CHILDLINE];
