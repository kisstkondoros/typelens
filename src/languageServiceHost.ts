import * as vs from "vscode";
import * as path from "path";
import * as ts from "typescript";
import * as fs from "fs";

const tsConfigFileName = "tsconfig.json";

export class LanguageServiceHost implements ts.LanguageServiceHost {

    private _files: ts.Map<{ snapshot?: ts.IScriptSnapshot; version: number; }>;
    private _compilerOptions: ts.CompilerOptions;

    constructor(rootFileNames: string[], compilerOptions: ts.CompilerOptions) {
        this._files = {};
        this._compilerOptions = compilerOptions;
        rootFileNames.forEach(fileName => {
            this._files[fileName] = { version: 0 };
        });
    }

    getScriptFileNames() {
        var files = [];
        for (var fileName in this._files) {
            if (this._files.hasOwnProperty) {
                files.push(fileName);
            }
        }
        return files;
    }

    getScriptVersion(fileName: string) {
        return this._files[fileName] && this._files[fileName].version.toString();
    }

    updateSnapshot(fileName: string, text: string) {
        var snapshot = ts.ScriptSnapshot.fromString(text);
        var scriptSnapshot = this._files[fileName];
        var version = 0;
        if (scriptSnapshot) {
            version = scriptSnapshot.version + 1;
        }

        this._files[fileName] = { snapshot, version };
    }

    getScriptSnapshot(fileName: string) {
        var scriptSnapshot = this._files[fileName];
        if (scriptSnapshot && scriptSnapshot.snapshot) {
            return scriptSnapshot.snapshot;
        }
        try {
            var snapshot = ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, 'utf8'));
            this._files[fileName] = { snapshot, version: 0 };
            return snapshot;
        } catch (err) {
            return void 0;
        }
    }

    getCurrentDirectory() {
        return vs.workspace.rootPath ?
            path.resolve(vs.workspace.rootPath) : process.cwd();
    }

    getDefaultLibFileName(options: ts.CompilerOptions) {
        return ts.getDefaultLibFilePath(options);
    }

    getCompilationSettings(): ts.CompilerOptions {
        return this._compilerOptions;
    }
}