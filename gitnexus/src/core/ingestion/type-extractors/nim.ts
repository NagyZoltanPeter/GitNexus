import type { SyntaxNode } from '../utils/ast-helpers.js';
import type {
  LanguageTypeConfig,
  LiteralTypeInferrer,
  ParameterExtractor,
  TypeBindingExtractor,
} from './types.js';
import { extractSimpleTypeName, extractVarName } from './shared.js';

/**
 * Infer the Nim type of a literal argument node. Used to build OverloadHints
 * so the call resolver can disambiguate overloaded routines by argument type.
 * Returns Nim type names so they line up with the parameter type texts the
 * method extractor records on each overload's node.
 */
const inferNimLiteralType: LiteralTypeInferrer = (node) => {
  switch (node.type) {
    case 'integer_literal':
      return 'int';
    case 'float_literal':
      return 'float';
    case 'char_literal':
      return 'char';
    case 'interpreted_string_literal':
    case 'long_string_literal':
    case 'generalized_string':
      return 'string';
    default:
      return undefined;
  }
};

const DECLARATION_NODE_TYPES: ReadonlySet<string> = new Set(['variable_declaration']);

const extractDeclaration: TypeBindingExtractor = (
  node: SyntaxNode,
  env: Map<string, string>,
): void => {
  if (node.type !== 'variable_declaration') return;

  const symList = node.namedChildren.find((c) => c.type === 'symbol_declaration_list');
  const symDecl = symList?.namedChildren.find((c) => c.type === 'symbol_declaration');
  if (!symDecl) return;
  const nameNode = symDecl.childForFieldName('name');
  if (!nameNode) return;
  const varName =
    nameNode.type === 'exported_symbol'
      ? nameNode.namedChildren.find((c) => c.type === 'identifier')?.text
      : extractVarName(nameNode);
  if (!varName) return;

  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child?.type === 'type_expression') {
      const typeName = extractSimpleTypeName(child);
      if (typeName) env.set(varName, typeName);
      return;
    }
  }
};

const extractParameter: ParameterExtractor = (node: SyntaxNode, env: Map<string, string>): void => {
  if (node.type !== 'parameter_declaration') return;

  const names: string[] = [];
  let typeNode: SyntaxNode | null = null;
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;
    if (child.type === 'symbol_declaration_list') {
      for (let j = 0; j < child.namedChildCount; j++) {
        const sd = child.namedChild(j);
        if (sd?.type === 'symbol_declaration') {
          const nameChild = sd.childForFieldName('name');
          if (nameChild) names.push(nameChild.text);
        }
      }
    } else if (child.type === 'type_expression') {
      typeNode = child;
    }
  }
  if (!typeNode) return;
  const typeName = extractSimpleTypeName(typeNode);
  if (!typeName) return;
  for (const name of names) {
    env.set(name, typeName);
  }
};

const FOR_LOOP_NODE_TYPES: ReadonlySet<string> = new Set(['for']);

export const typeConfig: LanguageTypeConfig = {
  declarationNodeTypes: DECLARATION_NODE_TYPES,
  forLoopNodeTypes: FOR_LOOP_NODE_TYPES,
  extractDeclaration,
  extractParameter,
  inferLiteralType: inferNimLiteralType,
};
