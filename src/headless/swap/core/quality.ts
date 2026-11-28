// The quality settings, for the fight with nothing drawn: no shadows to set, the level the lowest.
import type * as Real from '../../../core/quality';

export const applyShadowDetail: typeof Real.applyShadowDetail = () => undefined;
export const qualityLevel: typeof Real.qualityLevel = () => 'verylow';
