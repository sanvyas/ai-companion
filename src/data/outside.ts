// Curated event feed stand-in (PRD §8.4). TODO(outside-service): GET /outside/events?city=&from=
export interface OutsideEvent {
  id: string;
  title: string;
  when: string;
  where: string;
  far: string;
  price: string;
  tags: string[];
  why: string;
  like: string;
  stay: string;
  how: string;
  img: string;
  readback: string;
}

export const EVENTS: OutsideEvent[] = [
  { id: 'walk', title: 'Sunday morning walking group', when: 'Sun, 7:30 a.m.', where: 'Cubbon Park', far: '12 min away', price: 'Free', tags: ['Solo-friendly', 'Small group', 'Quiet'], why: 'You said walks are easier with music. This group walks slowly, mostly in silence.', like: 'About ten people walk one loop of the park, then some stay for chai. Nobody asks you to introduce yourself.', stay: '30 minutes is plenty. You can leave whenever you like.', how: 'Metro to Cubbon Park, then a 4-minute walk to the bandstand gate.', img: 'photo · morning park walk', readback: 'Sunday, 7:30 a.m., Cubbon Park, 12 minutes away, free. Shall I RSVP?' },
  { id: 'pot', title: 'Beginner pottery taster', when: 'Sat, 4:00 p.m.', where: 'Indiranagar', far: '20 min away', price: '₹600', tags: ['Solo-friendly', 'Quiet'], why: 'You mentioned wanting to do something with your hands again.', like: 'Six people at wheels, with an instructor who helps each one. Mostly quiet, hands busy.', stay: 'The class is 90 minutes. Leaving early is completely fine.', how: 'Auto, or a 20-minute bus ride. Step-free entrance.', img: 'photo · pottery studio', readback: 'Saturday, 4 p.m., a studio in Indiranagar, 20 minutes away, ₹600. Shall I RSVP?' },
  { id: 'games', title: 'Board-game afternoon', when: 'Sat, 2:00 p.m.', where: 'Koramangala', far: '15 min away', price: '₹150', tags: ['Small group', 'Daytime'], why: 'Low-talk and easy to join. You can just watch a round first.', like: 'Hosts match people to short, simple games. Talk is mostly about the game.', stay: 'One game takes about 30 minutes. Stay for one.', how: '15 minutes by auto. Ground floor.', img: 'photo · board-game café', readback: 'Saturday, 2 p.m., a café in Koramangala, 15 minutes away, ₹150. Shall I RSVP?' },
];

export const SMALL_STEPS = [
  'Stand on the balcony for two minutes, with your chai.',
  'Open the window and take three slow breaths.',
  'Put your feet on the floor and stretch, once.',
];

export const HOBBIES = [
  { title: 'Sketching', desc: 'A pencil and the view from your window.', bg: '#E6E2F6' },
  { title: 'Cook one new dish', desc: 'Something your mother makes. Ask her how.', bg: '#FBE3CF' },
  { title: 'Guitar basics', desc: 'Three chords, ten minutes.', bg: '#DCEBE6' },
  { title: 'A small plant', desc: 'Tulsi or mint, on the balcony.', bg: '#CFE3F0' },
];
