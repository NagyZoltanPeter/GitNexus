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
import type { SyntaxNode } from '../utils/ast-helpers.js';
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

/** Nim routine declaration node types — these are the overloadable routines. */
const NIM_ROUTINE_NODES: ReadonlySet<string> = new Set([
  'proc_declaration',
  'func_declaration',
  'method_declaration',
  'iterator_declaration',
  'template_declaration',
  'macro_declaration',
  'converter_declaration',
]);

/**
 * Overload-disambiguating ID suffix for Nim routines.
 *
 * Nim overloads on parameter type, so same-name same-arity routines in one
 * file would otherwise collapse to a single graph node. The suffix is the
 * per-parameter type sequence, e.g. `proc makeSound(d: Dog)` → `~Dog` and
 * `proc encode(x: int, y: string)` → `~int,string`. Multi-symbol parameter
 * groups (`a, b: int`) expand to one entry per symbol so the sequence length
 * matches the routine's arity.
 *
 * Pure function of the node: returns `''` for non-routine nodes and for
 * zero-parameter routines (whose IDs then stay unchanged).
 */
const nimOverloadDisambiguator = (node: SyntaxNode): string => {
  if (!NIM_ROUTINE_NODES.has(node.type)) return '';
  const paramList = node.childForFieldName('parameters');
  if (!paramList) return '';

  const types: string[] = [];
  for (let i = 0; i < paramList.namedChildCount; i++) {
    const paramDecl = paramList.namedChild(i);
    if (!paramDecl || paramDecl.type !== 'parameter_declaration') continue;

    let symbolCount = 0;
    let typeText = '_';
    for (let j = 0; j < paramDecl.namedChildCount; j++) {
      const child = paramDecl.namedChild(j);
      if (!child) continue;
      if (child.type === 'symbol_declaration_list') {
        symbolCount = child.namedChildren.filter((c) => c.type === 'symbol_declaration').length;
      } else if (child.type === 'type_expression') {
        typeText = child.text.replace(/\s+/g, '');
      }
    }
    for (let k = 0; k < Math.max(symbolCount, 1); k++) types.push(typeText);
  }

  return types.length > 0 ? `~${types.join(',')}` : '';
};

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
  overloadDisambiguator: nimOverloadDisambiguator,
  builtInNames: BUILT_INS,
});
