///<reference path="../typings/vscode-typings.d.ts" />
'use strict';
import * as vscode from 'vscode';
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import {LanguageServiceHost} from './languageServiceHost';

import {CodeLensProvider, TextDocument, CancellationToken, CodeLens, Range, Command} from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    class MethodReferenceLens extends CodeLens {
        node: ts.Node;
        fileName: string;
        uri: vscode.Uri;

        constructor(range: Range, node: ts.Node, fileName: string, uri: vscode.Uri, command?: Command) {
            super(range, command);
            this.node = node;
            this.fileName = fileName;
            this.uri = uri;
        }
    }

    class TSCodeLensProvider implements CodeLensProvider {
        private languageService: ts.LanguageService;
        private languageServiceHost: LanguageServiceHost;

        constructor() {
            var configFile = ts.findConfigFile(vscode.workspace.rootPath, (fileName) => {
                let fullPath = path.join(vscode.workspace.rootPath, fileName);
                return fs.existsSync(fullPath);
            });
            if (!configFile) {
                let jsConfigFullPath = path.join(vscode.workspace.rootPath, 'jsconfig.json');
                if (fs.existsSync(jsConfigFullPath)) {
                    configFile = jsConfigFullPath;
                }
            } else {
                configFile = path.join(vscode.workspace.rootPath, configFile);
            }
            var compilerOpts: ts.CompilerOptions = {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES5
            };

            var fileNames = [];
            var exclusions: string[] = [];
            if (configFile) {
                configFile = configFile.replace(/\\/g, '/');
                try {
                    var configJson = fs.readFileSync(configFile, 'UTF-8');
                    if (configJson) {
                        var parsedConfigJson = ts.parseConfigFileTextToJson(configFile, configJson);
                        if (Array.isArray(parsedConfigJson.config.exclude)) {
                            exclusions = exclusions.concat(parsedConfigJson.config.exclude);
                        }
                        var config = ts.parseJsonConfigFileContent(configJson, ts.sys, this.getDirectoryPath(configFile));

                        if (config.errors && config.errors.length > 0) {
                            vscode.window.showWarningMessage("Invalid typescript configuration file: " + configFile);
                        } else {
                            fileNames = config.fileNames;
                            compilerOpts = config.options;
                        }
                    }
                } catch (error) {
                    vscode.window.showWarningMessage("Configuration file can not be read: " + configFile);
                }
            } else {
                vscode.window.showWarningMessage("Configuration file not found, some features will not work properly!");
            }

            this.languageServiceHost = new LanguageServiceHost(fileNames, compilerOpts);
            this.languageService = ts.createLanguageService(this.languageServiceHost);
        }


        private getDirectoryPath(path) {
            return path.substr(0, Math.max(this.getRootLength(path), path.lastIndexOf('/')));
        }
        private getRootLength(path) {
            if (path.charCodeAt(0) === 47 /* slash */) {
                if (path.charCodeAt(1) !== 47 /* slash */)
                    return 1;
                var p1 = path.indexOf("/", 2);
                if (p1 < 0)
                    return 2;
                var p2 = path.indexOf("/", p1 + 1);
                if (p2 < 0)
                    return p1 + 1;
                return p2 + 1;
            }
            if (path.charCodeAt(1) === 58 /* colon */) {
                if (path.charCodeAt(2) === 47 /* slash */)
                    return 3;
                return 2;
            }
            // Per RFC 1738 'file' URI schema has the shape file://<host>/<path>
            // if <host> is omitted then it is assumed that host value is 'localhost',
            // however slash after the omitted <host> is not removed.
            // file:///folder1/file1 - this is a correct URI
            // file://folder2/file2 - this is an incorrect URI
            if (path.lastIndexOf("file:///", 0) === 0) {
                return "file:///".length;
            }
            var idx = path.indexOf("://");
            if (idx !== -1) {
                return idx + "://".length;
            }
            return 0;
        }
        private getSourceFile(document: vscode.TextDocument) {
            const fileName = document.fileName;
            const fileText = document.getText();
            this.languageServiceHost.updateSnapshot(fileName, fileText);
            return this.languageService.getSourceFile(fileName);
        }

        provideCodeLenses(document: TextDocument, token: CancellationToken): CodeLens[] | Thenable<CodeLens[]> {
            var sourceFile = this.getSourceFile(document);
            const methods: ts.Node[] = [];
            const walk = (node: ts.Node) => {
                switch (node.kind) {
                    case ts.SyntaxKind.ClassDeclaration:
                    case ts.SyntaxKind.ModuleDeclaration:
                    case ts.SyntaxKind.EnumDeclaration:
                    case ts.SyntaxKind.FunctionDeclaration:
                    case ts.SyntaxKind.MethodDeclaration:
                        methods.push(node);
                        break;
                }
                node.getChildren().forEach(walk);
            }

            walk(sourceFile);

            return methods.map(method => {
                var start = document.positionAt(method.getStart());
                var end = document.positionAt(method.getEnd());
                return new MethodReferenceLens(new vscode.Range(start, start), method, document.fileName, document.uri);
            });
        }
        resolveCodeLens(codeLens: CodeLens, token: CancellationToken): CodeLens | Thenable<CodeLens> {
            try {
                if (codeLens instanceof MethodReferenceLens) {
                    var method = codeLens.node;

                    var languageService = this.languageService;

                    if (token.isCancellationRequested)
                        return;

                    var methodStart = (((<any>method).name && (<any>method).name.getStart()) || method.getStart());

                    var referencedSymbols = languageService.getReferencesAtPosition(codeLens.fileName, methodStart);
                    if (referencedSymbols) {
                        var locations = [];
                        referencedSymbols.forEach(entry => {
                            if (token.isCancellationRequested)
                                return;
                            var entrySourceFile = this.languageService.getSourceFile(entry.fileName);
                            var LCStart = entrySourceFile.getLineAndCharacterOfPosition(entry.textSpan.start);
                            var LCEnd = entrySourceFile.getLineAndCharacterOfPosition(entry.textSpan.start + entry.textSpan.length);

                            locations.push({
                                uri: vscode.Uri.file(entry.fileName),
                                range: {
                                    startLineNumber: LCStart.line + 1,
                                    startColumn: LCStart.character + 1,
                                    endLineNumber: LCEnd.line + 1,
                                    endColumn: LCEnd.character + 1
                                }
                            });
                        });
                        var start = codeLens.range.start;
                        return new CodeLens(codeLens.range, {
                            arguments: [codeLens.uri, { lineNumber: start.line + 1, column: start.character + 1 }, locations],
                            title: locations.length + ' references',
                            command: 'editor.action.showReferences'
                        });
                    }
                }
            } catch (error) {
                vscode.window.showErrorMessage("An error occured while finding references.");
            }
            return null;
        }
    }

    context.subscriptions.push(vscode.languages.registerCodeLensProvider(['typescript'], new TSCodeLensProvider()));
}


