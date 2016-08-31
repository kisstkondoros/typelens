///<reference path="../typings/vscode-typings.d.ts" />
'use strict';
import * as vscode from 'vscode';
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import {CodeLensProvider, TextDocument, CancellationToken, CodeLens, Range, Command, Location, commands} from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    class MethodReferenceLens extends CodeLens {
        uri: vscode.Uri;

        constructor(range: Range, uri: vscode.Uri, command?: Command) {
            super(range, command);
            this.uri = uri;
        }
    }

    class TSCodeLensProvider implements CodeLensProvider {

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

                    return new CodeLens(codeLens.range, {
                        command: 'editor.action.showReferences',
                        title: locations.length + ' references',
                        arguments: [codeLens.uri, codeLens.range.start, locations],
                    });
                });
            }
        }
    }
    context.subscriptions.push(vscode.languages.registerCodeLensProvider(['typescript'], new TSCodeLensProvider()));
}


