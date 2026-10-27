import { useState } from 'react';
import { useLoad } from '../lib/api';
import { BarChart } from '../lib/charts';
import { num, pct } from '../lib/format';
import { Banner, Card, Loading, PageHead, Problem, Stat, Table } from '../lib/ui';

interface Data {
  days: number; enabled: boolean; totals: { events: number; sessions: number; people: number };
  screens: { screen: string; views: number; people: number; avg_seconds: number; total_minutes: number }[];
  clicks: { el: string; screen: string | null; clicks: number; people: number }[];
  daily: { day: string; events: number; people: number }[]; steps: { step: string; people: number }[]; platforms: { platform: string; people: number }[];
  optIn: { total: number; opted_in: number };
  signInFunnel: { codes_requested: number; codes_used: number; accounts: number; onboarded: number; talked: number };
}

export function Analytics() {
  const [days, setDays] = useState(14);
  const { data, error, reload } = useLoad<Data>(`/analytics?days=${days}`);
  if (error) return <Problem message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const f = data.signInFunnel;
  const maxMin = Math.max(1, ...data.screens.map(s => s.total_minutes));
  const funnel = [['Sign-in codes requested', f.codes_requested], ['Codes used', f.codes_used], ['Accounts created', f.accounts], ['Finished setup', f.onboarded], ['Had a conversation', f.talked]] as const;

  return (
    <>
      <PageHead title="Usage analytics" sub="Which screens and buttons people use and for how long. Only people who turned on “Share how I use Saathi” are included, and nothing here can contain what someone wrote or said." actions={<select className="input" style={{ width: 140 }} value={days} onChange={e => setDays(Number(e.target.value))} aria-label="Period"><option value={7}>Last 7 days</option><option value={14}>Last 14 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>} />
      {!data.enabled && <Banner tone="bad"><span>Analytics collection is switched off under Settings and flags. Nothing new is being recorded.</span></Banner>}
      <div className="grid g4">
        <Stat label="Sharing with us" value={`${pct(data.optIn.opted_in, data.optIn.total)}%`} hint={`${num(data.optIn.opted_in)} of ${num(data.optIn.total)} people opted in`} />
        <Stat label="People seen" value={num(data.totals.people)} />
        <Stat label="Sessions" value={num(data.totals.sessions)} />
        <Stat label="Events" value={num(data.totals.events)} />
      </div>
      {data.optIn.total > 0 && data.optIn.opted_in < 5 && <Banner tone="info"><span>Only {data.optIn.opted_in} people have opted in, so these numbers are a small sample. Ask friends to switch on “Share how I use Saathi” in Privacy Center.</span></Banner>}

      <Card title="Sign-ups to first conversation" sub="Counted by the server for everyone, with no tracking.">
        <div className="stack">{funnel.map(([label, n], i) => (
          <div key={label}><div className="row" style={{ justifyContent: 'space-between' }}><span>{label}</span><b className="num">{num(n)}{i > 0 && funnel[i - 1][1] > 0 ? <span className="faint"> · {pct(n, funnel[i - 1][1])}%</span> : ''}</b></div><div className="bar"><i style={{ width: `${pct(n, Math.max(1, funnel[0][1]))}%` }} /></div></div>
        ))}</div>
      </Card>

      <Card title="Events per day"><BarChart label="Events per day" data={data.daily.map(d => ({ x: d.day, y: d.events }))} /></Card>
      <Card flush title="Time on each screen" sub="Ordered by total minutes. Short average time on a screen people should linger on is a sign to look closer.">
        <Table rows={data.screens} rowKey={s => s.screen} empty="No screen data yet." cols={[
          { head: 'Screen', cell: s => <span className="mono">{s.screen}</span> }, { head: 'Views', cell: s => num(s.views), right: true }, { head: 'People', cell: s => num(s.people), right: true },
          { head: 'Avg time', cell: s => `${s.avg_seconds}s`, right: true }, { head: 'Total', cell: s => <div className="row" style={{ justifyContent: 'flex-end' }}><div className="bar" style={{ width: 90 }}><i style={{ width: `${(s.total_minutes / maxMin) * 100}%` }} /></div><span className="num">{s.total_minutes} min</span></div>, right: true },
        ]} />
      </Card>
      <div className="cols">
        <Card flush title="Most tapped buttons"><Table rows={data.clicks} rowKey={c => `${c.el}|${c.screen}`} empty="No taps recorded yet." cols={[{ head: 'Button', cell: c => <span className="mono">{c.el}</span> }, { head: 'On screen', cell: c => <span className="mono faint">{c.screen ?? '–'}</span> }, { head: 'Taps', cell: c => num(c.clicks), right: true }, { head: 'People', cell: c => num(c.people), right: true }]} /></Card>
        <div className="stack">
          <Card flush title="Steps reached"><Table rows={data.steps} rowKey={s => s.step} empty="None yet." cols={[{ head: 'Step', cell: s => <span className="mono">{s.step}</span> }, { head: 'People', cell: s => num(s.people), right: true }]} /></Card>
          <Card flush title="Platforms"><Table rows={data.platforms} rowKey={p => p.platform} empty="–" cols={[{ head: 'Platform', cell: p => p.platform }, { head: 'People', cell: p => num(p.people), right: true }]} /></Card>
        </div>
      </div>
    </>
  );
}
