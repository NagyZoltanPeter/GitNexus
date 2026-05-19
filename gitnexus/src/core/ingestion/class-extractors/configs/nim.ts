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
      let child = node.namedChild(i);
      // `ref object` / `ptr object` wrap the object_declaration — unwrap.
      if (child?.type === 'ref_type' || child?.type === 'pointer_type') {
        child = child.namedChildren.find((c) => c.type === 'object_declaration') ?? child;
      }
      if (child?.type === 'object_declaration') return 'Class';
      if (child?.type === 'enum_declaration') return 'Enum';
      if (child?.type === 'concept_declaration') return 'Interface';
    }
    return undefined;
  },
};
