import { useLoad } from '../lib/api';
import { BarChart } from '../lib/charts';
import { inr, mins, num, pct } from '../lib/format';
import { Banner, Card, Dot, Loading, PageHead, Problem, Stat } from '../lib/ui';

interface System { group: 'Backend' | 'AI' | 'UI' | 'Infrastructure'; name: string; status: 'ok' | 'warn' | 'down' | 'off'; detail: string; link: string }
interface Overview {
  users: { total: number; new7: number; new30: number; dau: number; wau: number; mau: number; onboarded: number; suspended: number; pending_deletion: number; plus: number };
  consent: { total: number; remember: number; notifications: number; analytics: number };
  conversations: { today: number; week: number; avg_seconds: number; byMode: { mode: string; n: number }[] };
  today: { voice_seconds: number; turns: number };
  safety: { level: number; n: number }[];
  cost: { today: number; month: number; uncosted: number; projectedMonth: number; budget: number; budgetPct: number | null; alertPct: number };
  series: { day: string; new_users: number; conversations: number; talkers: number; cost: number }[];
  systems: System[];
}

const GROUPS: System['group'][] = ['Backend', 'AI', 'UI', 'Infrastructure'];
const GROUP_LABEL: Record<System['group'], string> = { Backend: 'Backend', AI: 'AI', UI: 'App and product', Infrastructure: 'Infrastructure' };

export function Overview() {
  const { data, error, loading, reload } = useLoad<Overview>('/overview', { every: 30_000 });
  if (error && !data) return <Problem message={error} onRetry={reload} />;
  if (!data || loading && !data) return <Loading />;
  const u = data.users, c = data.cost;
  const overBudget = c.budgetPct !== null && c.budgetPct >= c.alertPct;
  const needsAttention = data.systems.filter(s => s.status === 'down' || s.status === 'warn');
  const lvl = (l: number) => data.safety.find(s => s.level === l)?.n ?? 0;

  return (
    <>
      <PageHead title="Overview" sub="Everything in one place: who is using Saathi, what it costs, and whether each part is healthy." />

      {needsAttention.length > 0 && (
        <Banner tone={needsAttention.some(s => s.status === 'down') ? 'bad' : 'warn'}>
          <span><b>{needsAttention.length} thing{needsAttention.length === 1 ? '' : 's'} need attention:</b> {needsAttention.map(s => s.name).join(', ')}.</span>
        </Banner>
      )}
      {overBudget && <Banner tone="bad"><span><b>Budget:</b> {c.budgetPct}% of this month’s {inr(c.budget, 0)} is spent. At this pace the month ends near {inr(c.projectedMonth, 0)}.</span></Banner>}

      <div className="grid g4">
        <Stat label="People" value={num(u.total)} hint={`${num(u.new7)} new this week · ${num(u.onboarded)} finished setup`} />
        <Stat label="Active today" value={num(u.dau)} hint={`${num(u.wau)} this week · ${num(u.mau)} this month`} />
        <Stat label="Conversations today" value={num(data.conversations.today)} hint={`${num(data.conversations.week)} this week · avg ${mins(data.conversations.avg_seconds)}`} />
        <Stat label="Voice today" value={mins(data.today.voice_seconds)} hint={`${num(data.today.turns)} turns today`} />
      </div>

      <div className="grid g4">
        <Stat label="Spend today" value={inr(c.today)} hint={c.uncosted ? `${num(c.uncosted)} calls have no price yet` : 'All usage priced'} />
        <Stat label="Spend this month" value={inr(c.month, 0)} hint={`Heading for ${inr(c.projectedMonth, 0)}`}>
          {c.budget > 0 && <div className={`bar ${overBudget ? 'bad' : ''}`} style={{ marginTop: 6 }} role="img" aria-label={`${c.budgetPct}% of budget`}><i style={{ width: `${Math.min(100, c.budgetPct ?? 0)}%` }} /></div>}
        </Stat>
        <Stat label="Safety events, 7 days" value={num(lvl(2) + lvl(3))} hint={`${num(lvl(3))} crisis · ${num(lvl(2))} elevated · ${num(lvl(1))} mild`} />
        <Stat label="Consent" value={`${pct(data.consent.remember, data.consent.total)}% remember`} hint={`${pct(data.consent.notifications, data.consent.total)}% notifications · ${pct(data.consent.analytics, data.consent.total)}% analytics`} />
      </div>

      <div className="grid g3">
        <Card title="New people per day" sub="Last 14 days"><BarChart label="New people per day" data={data.series.map(s => ({ x: s.day, y: s.new_users }))} /></Card>
        <Card title="People who talked" sub="Distinct people with a conversation"><BarChart label="People who talked per day" data={data.series.map(s => ({ x: s.day, y: s.talkers }))} /></Card>
        <Card title="Spend per day" sub="Rupees, priced usage only"><BarChart label="Spend per day" data={data.series.map(s => ({ x: s.day, y: s.cost }))} format={n => inr(n, n < 10 ? 1 : 0)} /></Card>
      </div>

      {GROUPS.map(g => (
        <Card key={g} title={GROUP_LABEL[g]} sub="Click a card to open the page that controls it">
          <div className="grid g3">
            {data.systems.filter(s => s.group === g).map(s => (
              <a key={s.name} className="sys" href={`#/${s.link}`}><Dot status={s.status} /><div><b>{s.name}</b><span>{s.detail}</span></div></a>
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}
