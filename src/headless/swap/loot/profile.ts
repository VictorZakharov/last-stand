// The player's profile, for the fight with nothing drawn: the server is no one's hero, so it banks and saves nothing
// (each hero's game banks its own spoils, as in co-op now).
import type * as Real from '../../../loot/profile';

export const saveProfile: typeof Real.saveProfile = () => undefined;
export const bankItems: typeof Real.bankItems = () => ({ lost: [], replaced: [] });
