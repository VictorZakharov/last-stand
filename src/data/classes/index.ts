// Registry of playable classes. Add a new class by creating a data file next
// to mage.js, a model in entities/models/, and any new skill impls.
import type { ClassDef } from '../../types';
import mage from './mage';

export const CLASSES: Record<string, ClassDef> = { mage };
export const DEFAULT_CLASS = 'mage';
