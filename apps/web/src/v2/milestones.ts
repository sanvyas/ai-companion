import type { Garden } from '../api';

// Things to be proud of, worked out from what the garden already knows. They only ever appear; none is ever taken away.
export interface Milestone { id: string; label: string; detail: string; have: number; need: number; done: boolean }

const m = (id: string, label: string, detail: string, have: number, need: number): Milestone => ({ id, label, detail, have: Math.min(have, need), need, done: have >= need });

export function milestones(g: Garden): Milestone[] {
  const c = g.counts;
  const calm = (c.breathe ?? 0) + (c.meditate ?? 0);
  const outing = (c.walk ?? 0) + (c.event ?? 0);
  const harvests = g.plants.reduce((n, p) => n + p.picks, 0);
  const made = g.rangolis + g.boats + g.jarCount;
  return [
    m('d1', 'First day', 'You showed up.', g.activeDays, 1),
    m('d3', '3 days', 'Three days of showing up.', g.activeDays, 3),
    m('d7', 'A week', 'Seven days of showing up.', g.activeDays, 7),
    m('d14', 'Two weeks', 'Fourteen days of showing up.', g.activeDays, 14),
    m('d30', 'A month', 'Thirty days of showing up.', g.activeDays, 30),
    m('d60', 'Two months', 'Sixty days of showing up.', g.activeDays, 60),
    m('d100', '100 days', 'A hundred days of showing up.', g.activeDays, 100),
    m('f1', 'First flower', 'Your first journal page.', c.journal ?? 0, 1),
    m('f10', 'A full bed', 'Ten journal pages.', c.journal ?? 0, 10),
    m('t1', 'First talk', 'You said it out loud.', c.talk ?? 0, 1),
    m('t5', 'A lantern in the tree', 'Five talks.', c.talk ?? 0, 5),
    m('c1', 'First lily', 'Your first calm moment.', calm, 1),
    m('c10', 'A pond in bloom', 'Ten calm moments.', calm, 10),
    m('o1', 'First stepping stone', 'You went outside.', outing, 1),
    m('h1', 'First harvest', 'You picked something you grew.', harvests, 1),
    m('p1', 'Made something', 'A rangoli, a boat or a jar note.', made, 1),
    m('s1', 'A hard day, still here', 'A gold seam on a hard day.', g.keepsakes.potSeams + g.keepsakes.pots * 6, 1),
    m('g1', 'A golden day', 'Check-in, one small thing and words, all in one day.', g.visitors.kingfisher ? 1 : 0, 1),
  ];
}

/** The nearest one still to come, for a gentle "next" line. */
export const nextMilestone = (list: Milestone[]) => list.filter(x => !x.done).sort((a, b) => (b.have / b.need) - (a.have / a.need))[0] ?? null;
