/**
 * Nim Language Provider
 *
 * Assembles all Nim-specific ingestion capabilities into a single
 * LanguageProvider, following the Strategy pattern used by the pipeline.
 *
 * Key Nim traits:
 *   - importSemantics: 'wildcard-leaf' (Nim `import module` brings all public symbols)
 *   - Export detection via `exported_symbol` (asterisk suffix)
 *   - UFCS: `a.foo(b)` and `foo(a, b)` resolve to the same proc
 */

import { SupportedLanguages } from 'gitnexus-shared';
import { createClassExtractor } from '../class-extractors/generic.js';
import { nimClassConfig } from '../class-extractors/configs/nim.js';
import { defineLanguage } from '../language-provider.js';
import { typeConfig as nimTypeConfig } from '../type-extractors/nim.js';
import { nimExportChecker } from '../export-detection.js';
import { createImportResolver } from '../import-resolvers/resolver-factory.js';
import { nimImportConfig } from '../import-resolvers/configs/nim.js';
import { NIM_QUERIES } from '../tree-sitter-queries.js';
import { createFieldExtractor } from '../field-extractors/generic.js';
import { nimFieldConfig } from '../field-extractors/configs/nim.js';
import { createMethodExtractor } from '../method-extractors/generic.js';
import { nimMethodConfig } from '../method-extractors/configs/nim.js';
import { createVariableExtractor } from '../variable-extractors/generic.js';
import { nimVariableConfig } from '../variable-extractors/configs/nim.js';
import { createCallExtractor } from '../call-extractors/generic.js';
import { nimCallConfig } from '../call-extractors/configs/nim.js';
import { createHeritageExtractor } from '../heritage-extractors/generic.js';

const BUILT_INS: ReadonlySet<string> = new Set([
  'echo',
  'debugEcho',
  'assert',
  'doAssert',
  'quit',
  'sizeof',
  'typeof',
  'repr',
  'len',
  'high',
  'low',
  'ord',
  'chr',
  'inc',
  'dec',
  'succ',
  'pred',
  'abs',
  'min',
  'max',
  'clamp',
  'swap',
  'add',
  'del',
  'delete',
  'insert',
  'pop',
  'contains',
  'find',
  'setLen',
  'newSeq',
  'newString',
  'newStringOfCap',
  'reset',
  'isNil',
  'cmp',
  'hash',
  'astToStr',
  'instantiationInfo',
  'compiles',
  'declared',
  'defined',
  'gorge',
  'staticExec',
  'staticRead',
  'slurp',
]);

export const nimProvider = defineLanguage({
  id: SupportedLanguages.Nim,
  extensions: ['.nim', '.nims', '.nimble'],
  entryPointPatterns: [/^main$/, /^run$/, /^start$/, /^init$/],
  treeSitterQueries: NIM_QUERIES,
  typeConfig: nimTypeConfig,
  exportChecker: nimExportChecker,
  importResolver: createImportResolver(nimImportConfig),
  importSemantics: 'wildcard-leaf',
  callExtractor: createCallExtractor(nimCallConfig),
  fieldExtractor: createFieldExtractor(nimFieldConfig),
  methodExtractor: createMethodExtractor(nimMethodConfig),
  variableExtractor: createVariableExtractor(nimVariableConfig),
  classExtractor: createClassExtractor(nimClassConfig),
  heritageExtractor: createHeritageExtractor(SupportedLanguages.Nim),
  builtInNames: BUILT_INS,
});
