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
        public skiplanguages: string[] = ["csharp"];
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

    class UnusedDecoration {
        ranges: vscode.Range[] = [];
        decoration: vscode.TextEditorDecorationType;
    }

    class TSCodeLensProvider implements CodeLensProvider {
        private config: AppConfiguration;

        private unusedDecorations: Map<string, UnusedDecoration> = new Map<string, UnusedDecoration>();

        constructor() {
            this.config = new AppConfiguration();
        }

        reinitDecorations() {
            var settings = this.config.settings;
            var editor = vscode.window.activeTextEditor;
            if (editor != null) {
                if (this.unusedDecorations.has(editor.document.uri.fsPath)) {
                    var unusedDecoration: UnusedDecoration = this.unusedDecorations.get(editor.document.uri.fsPath);
                    var decoration = unusedDecoration.decoration;
                    if (unusedDecoration.ranges.length > 0 && decoration) {
                        editor.setDecorations(decoration, unusedDecoration.ranges);
                    }
                    decoration.dispose();
                    decoration = null;
                }

                if (settings.decorateunused) {
                    var unusedDecoration = new UnusedDecoration();
                    this.unusedDecorations.set(editor.document.uri.fsPath, unusedDecoration);
                    unusedDecoration.decoration = vscode.window.createTextEditorDecorationType({
                        color: settings.unusedcolor
                    });
                }
            }
        }
        provideCodeLenses(document: TextDocument, token: CancellationToken): CodeLens[] | Thenable<CodeLens[]> {
            var settings = this.config.settings;
            if (settings.skiplanguages.indexOf(document.languageId) > -1) {
                return;
            }
            this.reinitDecorations();

            return commands.executeCommand<SymbolInformation[]>('vscode.executeDocumentSymbolProvider', document.uri).then(symbolInformations => {
                var usedPositions = [];
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
                    } while (lineIndex <= symbolInformation.location.range.end.line)

                    if (symbolInformation.name == '<function>') {
                        range = null;
                    } else if (index == -1) {
                        var line = document.lineAt(symbolInformation.location.range.start.line);
                        index = line.firstNonWhitespaceCharacterIndex;
                        lineIndex = range.start.line;
                        range = new Range(lineIndex, index, lineIndex, 90000);
                    } else {
                        range = new Range(lineIndex, index, lineIndex, index + symbolInformation.name.length);
                    }
                    if (range) {
                        var position = document.offsetAt(range.start);
                        if (!usedPositions[position]) {
                            usedPositions[position] = 1;
                            return new MethodReferenceLens(new vscode.Range(range.start, range.end), document.uri);
                        }
                    }
                }).filter(item => item != null);
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

                    if (amount == 0 && isSameDocument && settings.decorateunused) {
                        if (this.unusedDecorations.has(codeLens.uri.fsPath)) {
                            var decorationsForFile = this.unusedDecorations.get(codeLens.uri.fsPath);
                            decorationsForFile.ranges.push(codeLens.range);
                            this.updateDecorations(codeLens.uri);
                        }
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
        updateDecorations(uri: vscode.Uri) {
            var isSameDocument = (uri == vscode.window.activeTextEditor.document.uri);
            if (isSameDocument) {
                if (this.unusedDecorations.has(uri.fsPath)) {
                    var unusedDecoration = this.unusedDecorations.get(uri.fsPath);
                    var decoration = unusedDecoration.decoration;
                    var unusedDecorations = unusedDecoration.ranges;
                    vscode.window.activeTextEditor.setDecorations(decoration, unusedDecorations);
                }
            }
        }
    }
    const provider = new TSCodeLensProvider();
    context.subscriptions.push(vscode.languages.registerCodeLensProvider(['*'], provider));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        provider.updateDecorations(editor.document.uri);
    }))
}