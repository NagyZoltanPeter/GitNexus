import { SupportedLanguages } from 'gitnexus-shared';
import type { VariableExtractionConfig, VariableVisibility } from '../../variable-types.js';
import { extractSimpleTypeName } from '../../type-extractors/shared.js';
import type { SyntaxNode } from '../../utils/ast-helpers.js';

function extractNimVarName(node: SyntaxNode): string | undefined {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child?.type === 'variable_declaration') {
      const symList = child.namedChildren.find(
        (c: SyntaxNode) => c.type === 'symbol_declaration_list',
      );
      const symDecl = symList?.namedChildren.find(
        (c: SyntaxNode) => c.type === 'symbol_declaration',
      );
      if (!symDecl) continue;
      const nameNode = symDecl.childForFieldName('name');
      if (!nameNode) continue;
      if (nameNode.type === 'exported_symbol') {
        const ident = nameNode.namedChildren.find((c: SyntaxNode) => c.type === 'identifier');
        return ident?.text;
      }
      return nameNode.text;
    }
  }
  return undefined;
}

function extractNimVarType(node: SyntaxNode): string | undefined {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child?.type === 'variable_declaration') {
      for (let j = 0; j < child.namedChildCount; j++) {
        const gc = child.namedChild(j);
        if (gc?.type === 'type_expression') {
          return extractSimpleTypeName(gc) ?? gc.text?.trim();
        }
      }
    }
  }
  return undefined;
}

export const nimVariableConfig: VariableExtractionConfig = {
  language: SupportedLanguages.Nim,
  constNodeTypes: ['const_section'],
  staticNodeTypes: [],
  variableNodeTypes: ['var_section', 'let_section'],

  extractName: extractNimVarName,
  extractType: extractNimVarType,

  extractVisibility(node): VariableVisibility {
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child?.type === 'variable_declaration') {
        const symDecl = child.namedChildren.find(
          (c: SyntaxNode) => c.type === 'symbol_declaration',
        );
        if (!symDecl) continue;
        const nameNode = symDecl.childForFieldName('name');
        if (nameNode?.type === 'exported_symbol') return 'public';
      }
    }
    return 'private';
  },

  isConst(node) {
    return node.type === 'const_section';
  },

  isStatic(_node) {
    return false;
  },

  isMutable(node) {
    return node.type === 'var_section';
  },
};
