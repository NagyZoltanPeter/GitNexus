import { SupportedLanguages } from 'gitnexus-shared';
import type { ClassExtractionConfig } from '../../class-types.js';

export const nimClassConfig: ClassExtractionConfig = {
  language: SupportedLanguages.Nim,
  typeDeclarationNodes: ['type_declaration'],
  fileScopeNodeTypes: [],

  extractName(node) {
    const symDecl = node.namedChildren.find((c) => c.type === 'type_symbol_declaration');
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
      if (child?.type === 'object_declaration') return 'Class';
      if (child?.type === 'enum_declaration') return 'Enum';
      if (child?.type === 'concept_declaration') return 'Interface';
    }
    return undefined;
  },
};
