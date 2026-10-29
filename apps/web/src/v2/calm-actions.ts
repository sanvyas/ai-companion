import { openPlayer } from '../state/actions';

/** Start a meditation or sleep story. The new design plays the reading alone: no background sounds. */
export const playCalmById = (id: string) => openPlayer(id, { sounds: false });
