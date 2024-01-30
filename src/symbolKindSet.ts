import { SymbolKind } from "vscode";

export const standardSymbolKindSet = [
  SymbolKind.Method,
  SymbolKind.Function,
  SymbolKind.Property,
  SymbolKind.Class,
  SymbolKind.Interface,
  SymbolKind.Enum,
  SymbolKind.Constant,
  SymbolKind.Variable,
];
export const cssSymbolKindSet = [
  SymbolKind.Method,
  SymbolKind.Function,
  SymbolKind.Property,
  SymbolKind.Variable,
];
export const SymbolKindInterst = {
  scss: cssSymbolKindSet,
  less: cssSymbolKindSet,
  typescript: standardSymbolKindSet,
  javascript: standardSymbolKindSet,
};
