///<reference path="../typings/vscode-typings.d.ts" />
'use strict';
import * as vscode from 'vscode';
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import {CodeLensProvider, TextDocument, CancellationToken, CodeLens, Range, Command, Location, commands} from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    class TypeLensConfiguration {
        public exludeself: boolean = true;
        public singular: string = "{0} reference";
        public plural: string = "{0} references";
        public noreferences: string = "no references found";
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
        constructor() {
            this.config = new AppConfiguration();
        }

        private getSourceFile(document: vscode.TextDocument) {
            return ts.createSourceFile(document.fileName, document.getText(), ts.ScriptTarget.Latest, true);
        }

        provideCodeLenses(document: TextDocument, token: CancellationToken): CodeLens[] | Thenable<CodeLens[]> {
            var sourceFile = this.getSourceFile(document);
            const names: ts.Node[] = [];
            const walk = (node: ts.Node) => {
                switch (node.kind) {
                    case ts.SyntaxKind.ClassDeclaration:
                    case ts.SyntaxKind.ModuleDeclaration:
                    case ts.SyntaxKind.EnumDeclaration:
                    case ts.SyntaxKind.FunctionDeclaration:
                    case ts.SyntaxKind.MethodDeclaration:
                        if ((<ts.ClassLikeDeclaration>node).name) {
                            names.push((<ts.ClassLikeDeclaration>node).name);
                        }
                        break;
                }
                node.getChildren().forEach(walk);
            }

            walk(sourceFile);

            return names.map(name => {
                var start = document.positionAt(name.getStart());
                var end = document.positionAt(name.getEnd());
                return new MethodReferenceLens(new vscode.Range(start, end), document.uri);
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
    context.subscriptions.push(vscode.languages.registerCodeLensProvider(['typescript'], new TSCodeLensProvider()));
}


