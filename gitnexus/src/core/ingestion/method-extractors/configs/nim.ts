import { SupportedLanguages } from 'gitnexus-shared';
import type {
  MethodExtractionConfig,
  ParameterInfo,
  MethodVisibility,
} from '../../method-types.js';
import { extractSimpleTypeName } from '../../type-extractors/shared.js';
import type { SyntaxNode } from '../../utils/ast-helpers.js';

const NIM_ROUTINE_TYPES = new Set([
  'proc_declaration',
  'func_declaration',
  'method_declaration',
  'iterator_declaration',
  'template_declaration',
  'macro_declaration',
  'converter_declaration',
]);

function extractNimRoutineName(node: SyntaxNode): string | undefined {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return undefined;
  if (nameNode.type === 'exported_symbol') {
    const ident = nameNode.namedChildren.find((c: SyntaxNode) => c.type === 'identifier');
    return ident?.text;
  }
  return nameNode.text;
}

function extractNimReturnType(node: SyntaxNode): string | undefined {
  const retType = node.childForFieldName('return_type');
  if (!retType) return undefined;
  return extractSimpleTypeName(retType) ?? retType.text?.trim();
}

function extractNimParameters(node: SyntaxNode): ParameterInfo[] {
  const paramList = node.childForFieldName('parameters');
  if (!paramList) return [];
  const params: ParameterInfo[] = [];

  for (let i = 0; i < paramList.namedChildCount; i++) {
    const paramDecl = paramList.namedChild(i);
    if (!paramDecl || paramDecl.type !== 'parameter_declaration') continue;

    let typeNode: SyntaxNode | null = null;
    const names: string[] = [];
    for (let j = 0; j < paramDecl.namedChildCount; j++) {
      const child = paramDecl.namedChild(j);
      if (!child) continue;
      if (child.type === 'symbol_declaration_list') {
        for (let k = 0; k < child.namedChildCount; k++) {
          const sd = child.namedChild(k);
          if (sd?.type === 'symbol_declaration') {
            const nameChild = sd.childForFieldName('name');
            if (nameChild) names.push(nameChild.text);
          }
        }
      } else if (child.type === 'type_expression') {
        typeNode = child;
      }
    }

    const typeName = typeNode
      ? (extractSimpleTypeName(typeNode) ?? typeNode.text?.trim() ?? null)
      : null;
    const rawType = typeNode?.text?.trim() ?? null;

    for (const name of names) {
      params.push({
        name,
        type: typeName,
        rawType,
        isOptional: false,
        isVariadic: false,
      });
    }
    if (names.length === 0) {
      params.push({
        name: `_${i}`,
        type: typeName,
        rawType,
        isOptional: false,
        isVariadic: false,
      });
    }
  }
  return params;
}

function extractNimVisibility(node: SyntaxNode): MethodVisibility {
  const nameNode = node.childForFieldName('name');
  return nameNode?.type === 'exported_symbol' ? 'public' : 'private';
}

export const nimMethodConfig: MethodExtractionConfig = {
  language: SupportedLanguages.Nim,
  typeDeclarationNodes: [...NIM_ROUTINE_TYPES],
  methodNodeTypes: [...NIM_ROUTINE_TYPES],
  bodyNodeTypes: [],

  extractName: extractNimRoutineName,
  extractReturnType: extractNimReturnType,
  extractParameters: extractNimParameters,
  extractVisibility: extractNimVisibility,

  isStatic(_node) {
    return _node.type !== 'method_declaration';
  },

  isAbstract(_node, _ownerNode) {
    return !_node.childForFieldName('body');
  },

  isFinal(_node) {
    return false;
  },
};
