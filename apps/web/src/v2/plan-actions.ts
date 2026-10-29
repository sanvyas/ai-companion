import { api } from '../api';
import { errMsg, toast } from '../state/actions';
import { getState, set } from '../state/store';

/** Reword a step on today's list. */
export async function renamePlanItem(id: string, label: string): Promise<boolean> {
  const text = label.trim();
  const was = getState().plan;
  if (!text) return false;
  set(s => ({ plan: s.plan.map(p => (p.id === id ? { ...p, label: text, source: 'user' as const } : p)) }));
  try { await api.updatePlan(id, { label: text }); return true; } catch (e) { set({ plan: was }); toast(errMsg(e)); return false; }
}

/** Take a step off today's list. Whatever it already grew stays. */
export async function deletePlanItem(id: string): Promise<void> {
  const was = getState().plan;
  set(s => ({ plan: s.plan.filter(p => p.id !== id) }));
  try { await api.removePlan(id); } catch (e) { set({ plan: was }); toast(errMsg(e)); }
}
