import { api, ApiError, type Garden, type GardenPlant } from '../api';
import { toast } from '../state/actions';
import { loadGarden, takeGarden } from './garden';
import { closeSheet, openSheet } from './ui';

// The things in the garden that a person chooses to do. Each returns the whole garden, so the screen shows exactly what the server says.

const say = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export const openPlant = (slot: number | 'auto') => openSheet({ id: 'plant', slot });

export async function plantNow(kind: GardenPlant['kind'], slot: number): Promise<boolean> {
  try {
    takeGarden(await api.plant(kind, slot), { celebrate: true });
    closeSheet();
    toast('Planted. It grows on the days you show up.');
    return true;
  } catch (e) {
    toast(say(e, 'I couldn’t plant that just now.'));
    void loadGarden({ quiet: true });
    return false;
  }
}

export async function pickPlantNow(id: string): Promise<boolean> {
  try {
    takeGarden(await api.pickPlant(id), { celebrate: true });
    toast('Picked. It starts growing again.');
    return true;
  } catch (e) {
    toast(say(e, 'It isn’t ready just yet.'));
    void loadGarden({ quiet: true });
    return false;
  }
}

/** Spend what a quiet game was earned with: a gold seam, a flag, a new sky. A paper boat spends nothing. */
export async function keepsake(kind: 'seam' | 'flag' | 'sky' | 'boat'): Promise<Garden | null> {
  try {
    const g = await api.addKeepsake(kind);
    takeGarden(g, { celebrate: true });
    return g;
  } catch (e) {
    toast(say(e, 'That didn’t save. Please try again.'));
    void loadGarden({ quiet: true });
    return null;
  }
}
