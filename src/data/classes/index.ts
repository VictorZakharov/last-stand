// Registry of playable classes. Add a new class by creating a data file next
// to mage.ts, a model in entities/models/, and any new skill impls.
import type { ClassDef } from '../../types';
import mage from './mage';
import warrior from './warrior';

export const CLASSES: Record<string, ClassDef> = { mage, warrior };
export const CLASS_IDS = Object.keys(CLASSES);
export const DEFAULT_CLASS = 'mage';
