import { SupportedLanguages } from 'gitnexus-shared';
import type { FieldExtractionConfig } from '../generic.js';
import { extractSimpleTypeName } from '../../type-extractors/shared.js';

export const nimFieldConfig: FieldExtractionConfig = {
  language: SupportedLanguages.Nim,
  typeDeclarationNodes: ['type_declaration'],
  fieldNodeTypes: ['field_declaration'],
  bodyNodeTypes: ['object_declaration'],
  defaultVisibility: 'private',

  extractName(node) {
    const symList = node.namedChildren.find((c) => c.type === 'symbol_declaration_list');
    const symDecl = symList?.namedChildren.find((c) => c.type === 'symbol_declaration');
    if (!symDecl) return undefined;
    const nameNode = symDecl.childForFieldName('name');
    if (!nameNode) return undefined;
    if (nameNode.type === 'exported_symbol') {
      const ident = nameNode.namedChildren.find((c) => c.type === 'identifier');
      return ident?.text;
    }
    return nameNode.text;
  },

  extractType(node) {
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child?.type === 'type_expression') {
        return extractSimpleTypeName(child) ?? child.text?.trim();
      }
    }
    return undefined;
  },

  extractVisibility(node) {
    const symList = node.namedChildren.find((c) => c.type === 'symbol_declaration_list');
    const symDecl = symList?.namedChildren.find((c) => c.type === 'symbol_declaration');
    if (!symDecl) return 'private';
    const nameNode = symDecl.childForFieldName('name');
    return nameNode?.type === 'exported_symbol' ? 'public' : 'private';
  },

  isStatic(_node) {
    return false;
  },

  isReadonly(_node) {
    return false;
  },
};
