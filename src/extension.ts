'use strict';
import * as vscode from 'vscode';

import * as fs from 'fs';
import * as path from 'path';
import {CodeLensProvider, SymbolInformation, SymbolKind, TextDocument, CancellationToken, CodeLens, Range, Command, Location, commands} from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const standardSymbolKindSet = [SymbolKind.Method, SymbolKind.Function, SymbolKind.Property, SymbolKind.Class, SymbolKind.Interface, SymbolKind.Module];
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
        public noreferences: string = "no references found";
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
                vscode.window.activeTextEditor.setDecorations(this.decoration, this.unusedDecoration);
                this.decoration.dispose();
                this.decoration = null;
                this.unusedDecoration = [];
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
                    var range = symbolInformation.location.range;
                    var line = document.lineAt(range.start.line);
                    var index = line.text.lastIndexOf(symbolInformation.name);
                    if (index == -1) {
                        index = line.firstNonWhitespaceCharacterIndex;
                        range = new Range(range.start, range.start);
                    } else {
                        range = new Range(range.start.line, index, range.start.line, index + symbolInformation.name.length);
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

                    var message;
                    var amount = filteredLocations.length;
                    if (amount == 0) {
                        message = settings.noreferences;
                    } else if (amount == 1) {
                        message = settings.singular;
                    } else {
                        message = settings.plural;
                    }
                    message = message.replace('{0}', amount + "");

                    if (amount == 0 && settings.decorateunused && this.decoration) {
                        this.unusedDecoration.push(codeLens.range);
                    }
                    vscode.window.activeTextEditor.setDecorations(this.decoration, this.unusedDecoration);

                    if (amount > 0) {
                        return new CodeLens(codeLens.range, {
                            command: 'editor.action.showReferences',
                            title: message,
                            arguments: [codeLens.uri, codeLens.range.start, filteredLocations],
                        });
                    } else {
                        return new CodeLens(codeLens.range, {
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