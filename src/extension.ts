"use strict";
import * as vscode from "vscode";
import { commands } from "vscode";
import { TSCodeLensProvider } from "./tSCodeLensProvider";

async function triggerCodeLensComputation() {
  if (!vscode.window.activeTextEditor) return;
  var end = vscode.window.activeTextEditor.selection.end;
  await vscode.window.activeTextEditor.edit((editbuilder) => {
    editbuilder.insert(end, " ");
  });
  await commands.executeCommand("undo");
}

function log() {
  if (!vscode.window.activeTextEditor) return;
  const output = vscode.window.createOutputChannel("typelens");
  output.appendLine("Hello");
  output.show();
}

function setUpCommands(
  disposables: vscode.Disposable[],
  provider: TSCodeLensProvider
) {
  disposables.push(
    commands.registerCommand("typelens.toggle", async () => {
      provider.config.typeLensEnabled = !provider.config.typeLensEnabled;
      await triggerCodeLensComputation();
    })
  );
  disposables.push(
    commands.registerCommand("typelens.log", () => {
      log();
    })
  );
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new TSCodeLensProvider();
  const disposables: vscode.Disposable[] = context.subscriptions;
  setUpCommands(disposables, provider);
  disposables.push(vscode.languages.registerCodeLensProvider(["*"], provider));
  disposables.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        provider.updateDecorations(editor.document.uri);
      }
    })
  );
}
