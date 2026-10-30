import { openPlayer } from '../state/actions';

/** Start a meditation or sleep story by its id in the calm catalogue. The third design reads aloud on its own: no background sound. */
export const playCalm = (id: string) => openPlayer(id, { sounds: false });
