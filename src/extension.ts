"use strict";
import * as vscode from "vscode";

import {
	CodeLensProvider,
	SymbolInformation,
	SymbolKind,
	DocumentSymbol,
	TextDocument,
	CancellationToken,
	CodeLens,
	Range,
	Command,
	Location,
	commands
} from "vscode";
import { Minimatch } from "minimatch";

export function activate(context: vscode.ExtensionContext) {
	const standardSymbolKindSet = [
		SymbolKind.Method,
		SymbolKind.Function,
		SymbolKind.Property,
		SymbolKind.Class,
		SymbolKind.Interface
	];
	const cssSymbolKindSet = [SymbolKind.Method, SymbolKind.Function, SymbolKind.Property, SymbolKind.Variable];

	const SymbolKindInterst = {
		scss: cssSymbolKindSet,
		less: cssSymbolKindSet,
		typescript: standardSymbolKindSet,
		javascript: standardSymbolKindSet
	};
	class TypeLensConfiguration {
		public blackbox: string[] = [];
		public blackboxTitle: string = "<< called from blackbox >>";
		public excludeself: boolean = true;
		public singular: string = "{0} reference";
		public plural: string = "{0} references";
		public noreferences: string = "no references found for {0}";
		public unusedcolor: string = "#999";
		public decorateunused: boolean = true;
		public skiplanguages: string[] = ["csharp"];
		public ignorelist: string[] = ["ngOnChanges", "ngOnInit", "ngDoCheck", "ngAfterContentInit", "ngAfterContentChecked", "ngAfterViewInit", "ngAfterViewChecked", "ngOnDestroy"];

		public showReferencesForMethods = true;
		public showReferencesForFunctions = true;
		public showReferencesForProperties = true;
		public showReferencesForClasses = true;
		public showReferencesForInterfaces = true;
	}

	class AppConfiguration {
		private cachedSettings: TypeLensConfiguration;
		constructor() {
			vscode.workspace.onDidChangeConfiguration(e => {
				this.cachedSettings = null;
			});
		}

		get extensionName() {
			return "typelens";
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
		constructor(range: Range, public uri: vscode.Uri, public name: string, command?: Command) {
			super(range, command);
		}
	}

	class UnusedDecoration {
		ranges: vscode.Range[] = [];
		decoration: vscode.TextEditorDecorationType;
	}

	class TSCodeLensProvider implements CodeLensProvider {
		config: AppConfiguration;

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
		isDocumentSymbol(symbol: SymbolInformation | DocumentSymbol): symbol is DocumentSymbol {
			return (symbol as DocumentSymbol).children != null;
		}
		provideCodeLenses(document: TextDocument, token: CancellationToken): CodeLens[] | Thenable<CodeLens[]> {
			var settings = this.config.settings;
			this.reinitDecorations();
			if (!this.config.typeLensEnabled || settings.skiplanguages.indexOf(document.languageId) > -1) {
				return;
			}

			return commands
				.executeCommand<SymbolInformation[] | DocumentSymbol[]>("vscode.executeDocumentSymbolProvider", document.uri)
				.then(symbols => {
					var usedPositions = [];
					symbols = symbols || [];

					const flattenedSymbols: {
						kind: SymbolKind;
						name: string;
						range: Range;
					}[] = [];
					const walk = (p: DocumentSymbol) => {
						(p.children || []).forEach(p => walk(p as any));
						flattenedSymbols.push(p);
					};

					for (let i = 0; i < symbols.length; i++) {
						const symbol = symbols[i];
						if (this.isDocumentSymbol(symbol)) {
							walk(symbol);
						} else {
							if (symbol.location) {
								flattenedSymbols.push({
									kind: symbol.kind,
									name: symbol.name,
									range: symbol.location.range
								});
							}
						}
					}

					return flattenedSymbols
						.filter(symbolInformation => {
							var knownInterest: SymbolKind[] = <SymbolKind[]>SymbolKindInterst[document.languageId];
							if (!knownInterest) {
								knownInterest = standardSymbolKindSet;
							}

							const isKnownInterest = knownInterest.indexOf(symbolInformation.kind) > -1;
							if (!isKnownInterest) return;

							const isSymbolKindAllowed =
								symbolInformation.kind === SymbolKind.Method && this.config.settings.showReferencesForMethods ||
								symbolInformation.kind === SymbolKind.Function && this.config.settings.showReferencesForFunctions ||
								symbolInformation.kind === SymbolKind.Property && this.config.settings.showReferencesForProperties ||
								symbolInformation.kind === SymbolKind.Class && this.config.settings.showReferencesForClasses ||
								symbolInformation.kind === SymbolKind.Interface && this.config.settings.showReferencesForInterfaces;
							return isSymbolKindAllowed;
						})
						.map(symbolInformation => {
							if (symbolInformation.name == undefined) return;
							const range = symbolInformation.range;
							const isUnsupportedSymbol =
								symbolInformation.name == "<function>" || symbolInformation.name.endsWith(" callback") ||
								this.config.settings.ignorelist.indexOf(symbolInformation.name) > -1;

							if (!isUnsupportedSymbol && range) {
								const symbolText = document.getText(range);
								const documentOffset = document.offsetAt(range.start);

								let leftMatch: Range;
								let rightMatch: Range;

								if (symbolText.indexOf(symbolInformation.name) > -1) {
									const maxOffset = documentOffset + symbolText.length;
									let lookupOffset = documentOffset;
									while (lookupOffset < maxOffset) {
										const start = document.positionAt(lookupOffset);
										const wordRange = document.getWordRangeAtPosition(start);
										if (wordRange && document.getText(wordRange) == symbolInformation.name) {
											rightMatch = wordRange;
											break;
										} else {
											lookupOffset += symbolInformation.name.length;
										}
									}
								} else {
									const minOffset = Math.max(documentOffset - symbolText.length, 0);
									let lookupOffset = documentOffset;
									while (lookupOffset > minOffset) {
										const start = document.positionAt(lookupOffset);
										const wordRange = document.getWordRangeAtPosition(start);
										if (wordRange && document.getText(wordRange) == symbolInformation.name) {
											leftMatch = wordRange;
											break;
										} else {
											lookupOffset -= symbolInformation.name.length;
										}
									}
								}
								let resultingRange;
								if (leftMatch == null && rightMatch == null) {
									resultingRange = range;
								} else
									if (leftMatch != null && rightMatch == null) {
										resultingRange = leftMatch;
									} else if (leftMatch == null && rightMatch != null) {
										resultingRange = rightMatch;
									} else {
										resultingRange =
											documentOffset - document.offsetAt(leftMatch.start) < document.offsetAt(rightMatch.start) - documentOffset
												? leftMatch
												: rightMatch;
									}

								var position = document.offsetAt(resultingRange.start);
								if (!usedPositions[position]) {
									usedPositions[position] = 1;
									return new MethodReferenceLens(resultingRange, document.uri, symbolInformation.name);
								}
							}
						})
						.filter(item => item != null);
				});
		}
		resolveCodeLens(codeLens: CodeLens, token: CancellationToken): CodeLens | Thenable<CodeLens> {
			if (codeLens instanceof MethodReferenceLens) {
				return commands
					.executeCommand<Location[]>("vscode.executeReferenceProvider", codeLens.uri, codeLens.range.start)
					.then(locations => {
						var settings = this.config.settings;
						var filteredLocations = locations;
						if (settings.excludeself) {
							filteredLocations = locations.filter(location => !location.range.isEqual(codeLens.range));
						}

						const blackboxList = this.config.settings.blackbox || [];
						const nonBlackBoxedLocations = filteredLocations.filter(location => {
							const fileName = location.uri.path;
							return !blackboxList.some(pattern => {
								return new Minimatch(pattern).match(fileName);
							});
						});

						var isSameDocument = codeLens.uri == vscode.window.activeTextEditor.document.uri;
						var message;
						var amount = nonBlackBoxedLocations.length;
						if (amount == 0) {
							message = settings.noreferences;
							message = message.replace("{0}", codeLens.name + "");
						} else if (amount == 1) {
							message = settings.singular;
							message = message.replace("{0}", amount + "");
						} else {
							message = settings.plural;
							message = message.replace("{0}", amount + "");
						}

						if (amount == 0 && filteredLocations.length == 0 && isSameDocument && settings.decorateunused) {
							if (this.unusedDecorations.has(codeLens.uri.fsPath)) {
								var decorationsForFile = this.unusedDecorations.get(codeLens.uri.fsPath);
								decorationsForFile.ranges.push(codeLens.range);
								this.updateDecorations(codeLens.uri);
							}
						}
						if (amount == 0 && filteredLocations.length != 0) {
							return new CodeLens(
								new vscode.Range(codeLens.range.start.line, codeLens.range.start.character, codeLens.range.start.line, 90000),
								{
									command: "",
									title: settings.blackboxTitle
								}
							);
						} else if (amount > 0) {
							return new CodeLens(
								new vscode.Range(codeLens.range.start.line, codeLens.range.start.character, codeLens.range.start.line, 90000),
								{
									command: "editor.action.showReferences",
									title: message,
									arguments: [codeLens.uri, codeLens.range.start, nonBlackBoxedLocations]
								}
							);
						} else {
							return new CodeLens(
								new vscode.Range(codeLens.range.start.line, codeLens.range.start.character, codeLens.range.start.line, 90000),
								{
									command: "editor.action.findReferences",
									title: message,
									arguments: [codeLens.uri, codeLens.range.start]
								}
							);
						}
					});
			}
		}
		updateDecorations(uri: vscode.Uri) {
			var isSameDocument = uri == vscode.window.activeTextEditor.document.uri;
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
	const triggerCodeLensComputation = () => {
		if (!vscode.window.activeTextEditor) return;
		var end = vscode.window.activeTextEditor.selection.end;
		vscode.window.activeTextEditor
			.edit(editbuilder => {
				editbuilder.insert(end, " ");
			})
			.then(() => {
				commands.executeCommand("undo");
			});
	};
	const disposables: vscode.Disposable[] = context.subscriptions;
	disposables.push(
		commands.registerCommand("typelens.toggle", () => {
			provider.config.typeLensEnabled = !provider.config.typeLensEnabled;
			triggerCodeLensComputation();
		})
	);
	disposables.push(vscode.languages.registerCodeLensProvider(["*"], provider));
	disposables.push(
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor) {
				provider.updateDecorations(editor.document.uri);
			}
		})
	);
}
