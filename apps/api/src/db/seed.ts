import type { Db } from './pool.js';
import { withSystem } from './pool.js';
import calm from './reference/calm.json';

interface CalmJson { id: string; kind: 'med' | 'sleep'; cat: string; title: string; mins: number; desc: string; tint: string; bg?: string; lines?: string[] }

// Numbers come from the PRD (section 6.4). They have NOT been independently verified: verified_at is left
// NULL so ops tooling reports them as stale until someone calls each line and records the date.
const HELPLINES = [
  { id: 'telemanas', name: 'Tele-MANAS', description: 'Free, any time, in many Indian languages.', number: '14416', tel: '14416', kind: 'crisis', languages: ['en', 'hi'], sort: 10 },
  { id: 'telemanas-alt', name: 'Tele-MANAS (toll free)', description: 'The same service on its toll-free number.', number: '1-800-891-4416', tel: '18008914416', kind: 'crisis', languages: ['en', 'hi'], sort: 11 },
  { id: 'kiran', name: 'KIRAN', description: 'Free mental health support, 24 hours.', number: '1800-599-0019', tel: '18005990019', kind: 'crisis', languages: ['en', 'hi'], sort: 20 },
  { id: 'emergency', name: 'Emergency services', description: 'Police, ambulance, fire.', number: '112', tel: '112', kind: 'emergency', languages: ['en', 'hi'], sort: 30 },
  { id: 'childline', name: 'Childline', description: 'For anyone under 18. Free, any time.', number: '1098', tel: '1098', kind: 'youth', languages: ['en', 'hi'], sort: 40 },
];

export async function seedReference(db: Db): Promise<void> {
  await withSystem(db, async tx => {
    for (const h of HELPLINES) {
      await tx.query(
        `INSERT INTO helplines (id,name,description,number,tel,kind,languages,sort)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, number=EXCLUDED.number,
           tel=EXCLUDED.tel, kind=EXCLUDED.kind, languages=EXCLUDED.languages, sort=EXCLUDED.sort`,
        [h.id, h.name, h.description, h.number, h.tel, h.kind, h.languages, h.sort],
      );
    }
    let i = 0;
    for (const c of calm as CalmJson[]) {
      await tx.query(
        `INSERT INTO calm_items (id,kind,category,title,minutes,description,tint,lines,default_bg,sort)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET kind=EXCLUDED.kind, category=EXCLUDED.category, title=EXCLUDED.title,
           minutes=EXCLUDED.minutes, description=EXCLUDED.description, tint=EXCLUDED.tint, lines=EXCLUDED.lines,
           default_bg=EXCLUDED.default_bg, sort=EXCLUDED.sort`,
        [c.id, c.kind === 'med' ? 'meditation' : 'sleep', c.cat, c.title, c.mins, c.desc, c.tint, c.lines ? JSON.stringify(c.lines) : null, c.bg ?? null, (i += 10)],
      );
    }
  });
}

/** Development only. Events in production come from the partner feed or ops, never from this file. */
export async function seedDemoEvents(db: Db): Promise<void> {
  const next = (dow: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + ((dow + 7 - d.getDay()) % 7 || 7));
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const rows = [
    ['demo-walk', 'Bengaluru', 'Sunday morning walking group', 'Cubbon Park', next(0, 7), 'About ten people', 'walk', 'Free', { tags: ['Solo-friendly', 'Small group', 'Quiet'], why: 'A slow loop, mostly in silence.', like: 'About ten people walk one loop of the park, then some stay for chai. Nobody asks you to introduce yourself.', stay: '30 minutes is plenty. You can leave whenever you like.', how: 'Metro to Cubbon Park, then a 4-minute walk to the bandstand gate.' }],
    ['demo-pottery', 'Bengaluru', 'Beginner pottery taster', 'Indiranagar', next(6, 16), 'Six people', 'craft', '₹600', { tags: ['Solo-friendly', 'Quiet'], why: 'Something to do with your hands.', like: 'Six people at wheels, with an instructor who helps each one.', stay: 'The class is 90 minutes. Leaving early is fine.', how: 'Auto, or a 20-minute bus ride. Step-free entrance.' }],
    ['demo-games', 'Bengaluru', 'Board-game afternoon', 'Koramangala', next(6, 14), 'Small groups', 'games', '₹150', { tags: ['Small group', 'Daytime'], why: 'Low-talk and easy to join.', like: 'Hosts match people to short, simple games.', stay: 'One game takes about 30 minutes.', how: '15 minutes by auto. Ground floor.' }],
  ] as const;
  await withSystem(db, async tx => {
    for (const r of rows) {
      await tx.query(
        `INSERT INTO events (id,city,title,venue,starts_at,group_size,category,price,organiser,details)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Demo listing',$9)
         ON CONFLICT (id) DO UPDATE SET starts_at=EXCLUDED.starts_at`,
        [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], JSON.stringify(r[8])],
      );
    }
  });
}
