import { SupportedLanguages } from 'gitnexus-shared';
import type { ImportResolutionConfig } from '../types.js';
import { createStandardStrategy } from '../standard.js';

export const nimImportConfig: ImportResolutionConfig = {
  language: SupportedLanguages.Nim,
  strategies: [createStandardStrategy(SupportedLanguages.Nim)],
};
