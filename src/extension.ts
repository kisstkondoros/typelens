'use strict';
import * as vscode from 'vscode';

import * as fs from 'fs';
import * as path from 'path';
import {CodeLensProvider, SymbolInformation, SymbolKind, TextDocument, CancellationToken, CodeLens, Range, Command, Location, commands} from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const standardSymbolKindSet = [SymbolKind.Method, SymbolKind.Function, SymbolKind.Property, SymbolKind.Class, SymbolKind.Interface];
    const cssSymbolKindSet = [SymbolKind.Method, SymbolKind.Function, SymbolKind.Property, SymbolKind.Variable];

    const SymbolKindInterst = {
        'scss': cssSymbolKindSet,
        'less': cssSymbolKindSet,
        'ts': standardSymbolKindSet,
        'js': standardSymbolKindSet,
    }
    class TypeLensConfiguration {
        public exludeself: boolean = true;
        public singular: string = "{0} reference";
        public plural: string = "{0} references";
        public noreferences: string = "no references found for {0}";
        public unusedcolor: string = "#999";
        public decorateunused: boolean = true;
    }

    class AppConfiguration {
        private cachedSettings: TypeLensConfiguration;
        constructor() {
            vscode.workspace.onDidChangeConfiguration(e => {
                this.cachedSettings = null;
            });
        }

        get extensionName() {
            return 'typelens';
        }

        public typeLensEnabled: boolean = true;

        get settings(): TypeLensConfiguration {
            if (!this.cachedSettings) {
                var settings = vscode.workspace.getConfiguration(this.extensionName);
                this.cachedSettings = new TypeLensConfiguration();
                for (var propertyName in this.cachedSettings) {
                    if (settings.has(propertyName)) {
                        this.cachedSettings[propertyName] = settings.get(propertyName);
                    }
                }
            }
            return this.cachedSettings;
        }
    }

    class MethodReferenceLens extends CodeLens {
        uri: vscode.Uri;

        constructor(range: Range, uri: vscode.Uri, command?: Command) {
            super(range, command);
            this.uri = uri;
        }
    }

    class TSCodeLensProvider implements CodeLensProvider {
        private config: AppConfiguration;

        private decoration: vscode.TextEditorDecorationType;

        private unusedDecoration: vscode.Range[] = [];

        constructor() {
            this.config = new AppConfiguration();
        }

        provideCodeLenses(document: TextDocument, token: CancellationToken): CodeLens[] | Thenable<CodeLens[]> {
            var settings = this.config.settings;
            if (this.unusedDecoration.length > 0 && this.decoration) {
                this.unusedDecoration = [];
                vscode.window.activeTextEditor.setDecorations(this.decoration, this.unusedDecoration);
                this.decoration.dispose();
                this.decoration = null;
            }
            if (settings.decorateunused) {
                this.decoration = vscode.window.createTextEditorDecorationType({
                    color: settings.unusedcolor
                });
            }

            return commands.executeCommand<SymbolInformation[]>('vscode.executeDocumentSymbolProvider', document.uri).then(symbolInformations => {
                return symbolInformations.filter(symbolInformation => {
                    var knownInterest: SymbolKind[] = <SymbolKind[]>SymbolKindInterst[document.languageId];
                    if (!knownInterest) {
                        knownInterest = standardSymbolKindSet;
                    }
                    return knownInterest.indexOf(symbolInformation.kind) > -1;
                }).map(symbolInformation => {
                    var index;
                    var lineIndex = symbolInformation.location.range.start.line;
                    do {
                        var range = symbolInformation.location.range;
                        var line = document.lineAt(lineIndex);
                        index = line.text.lastIndexOf(symbolInformation.name);
                        if (index > -1) {
                            break;
                        }
                        lineIndex++;
                    } while (lineIndex < symbolInformation.location.range.end.line)

                    if (index == -1) {
                        index = line.firstNonWhitespaceCharacterIndex;
                        lineIndex = range.start.line;
                        range = new Range(lineIndex, index, lineIndex, 90000);
                    }
                    else {
                        range = new Range(lineIndex, index, lineIndex, index + symbolInformation.name.length);
                    }

                    return new MethodReferenceLens(new vscode.Range(range.start, range.end), document.uri);
                });
            });
        }
        resolveCodeLens(codeLens: CodeLens, token: CancellationToken): CodeLens | Thenable<CodeLens> {
            if (codeLens instanceof MethodReferenceLens) {
                return commands.executeCommand<Location[]>('vscode.executeReferenceProvider', codeLens.uri, codeLens.range.start).then(locations => {
                    var settings = this.config.settings;
                    var filteredLocations = locations;
                    if (settings.exludeself) {
                        filteredLocations = locations.filter(location => !location.range.isEqual(codeLens.range));
                    }
                    var isSameDocument = (codeLens.uri == vscode.window.activeTextEditor.document.uri);
                    var message;
                    var amount = filteredLocations.length;
                    if (amount == 0) {
                        message = settings.noreferences;
                        var name = isSameDocument ? vscode.window.activeTextEditor.document.getText(codeLens.range) : "";
                        message = message.replace('{0}', name + "");
                    } else if (amount == 1) {
                        message = settings.singular;
                        message = message.replace('{0}', amount + "");
                    } else {
                        message = settings.plural;
                        message = message.replace('{0}', amount + "");
                    }

                    if (amount == 0 && settings.decorateunused && this.decoration) {
                        this.unusedDecoration.push(codeLens.range);
                    }

                    if (isSameDocument) {
                        vscode.window.activeTextEditor.setDecorations(this.decoration, this.unusedDecoration);
                    }

                    if (amount > 0) {
                        return new CodeLens(new vscode.Range(codeLens.range.start.line, codeLens.range.start.character, codeLens.range.start.line, 90000), {
                            command: 'editor.action.showReferences',
                            title: message,
                            arguments: [codeLens.uri, codeLens.range.start, filteredLocations],
                        });
                    } else {
                        return new CodeLens(new vscode.Range(codeLens.range.start.line, codeLens.range.start.character, codeLens.range.start.line, 90000), {
                            command: "editor.action.findReferences",
                            title: message,
                            arguments: [codeLens.uri, codeLens.range.start]
                        });
                    }
                });
            }
        }
    }
    context.subscriptions.push(vscode.languages.registerCodeLensProvider(['*'], new TSCodeLensProvider()));
}