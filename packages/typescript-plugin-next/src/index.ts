import * as svelte from 'svelte-language-tool-core';
import * as base from '@volar/typescript';
import type * as ts from 'typescript/lib/tsserverlibrary';

const init: ts.server.PluginModuleFactory = (modules) => {
	const { typescript: ts } = modules;
	const pluginModule: ts.server.PluginModule = {
		create(info) {

			const host: svelte.LanguageServiceHost = {
				getNewLine: () => info.project.getNewLine(),
				useCaseSensitiveFileNames: () => info.project.useCaseSensitiveFileNames(),
				readFile: path => info.project.readFile(path),
				writeFile: (path, content) => info.project.writeFile(path, content),
				fileExists: path => info.project.fileExists(path),
				directoryExists: path => info.project.directoryExists(path),
				getDirectories: path => info.project.getDirectories(path),
				readDirectory: (path, extensions, exclude, include, depth) => info.project.readDirectory(path, extensions, exclude, include, depth),
				realpath: info.project.realpath ? path => info.project.realpath!(path) : undefined,
				getCompilationSettings: () => info.project.getCompilationSettings(),
				getCurrentDirectory: () => info.project.getCurrentDirectory(),
				getDefaultLibFileName: () => info.project.getDefaultLibFileName(),
				getProjectVersion: () => info.project.getProjectVersion(),
				getProjectReferences: () => info.project.getProjectReferences(),
				getScriptFileNames: () => info.project.getScriptFileNames(),
				getScriptVersion: (fileName) => info.project.getScriptVersion(fileName),
				getScriptSnapshot: (fileName) => info.project.getScriptSnapshot(fileName),
				getTypeScriptModule: () => ts,
			};
			const service = base.createLanguageService(host, [svelte.createLanguageModule(ts)]);

			return new Proxy(info.languageService, {
				get: (target: any, property: keyof ts.LanguageService) => {
					if (
						property === 'getSemanticDiagnostics'
						|| property === 'getEncodedSemanticClassifications'
						|| property === 'getCompletionsAtPosition'
						|| property === 'getCompletionEntryDetails'
						|| property === 'getCompletionEntrySymbol'
						|| property === 'getQuickInfoAtPosition'
						|| property === 'getSignatureHelpItems'
						|| property === 'getRenameInfo'
						|| property === 'findRenameLocations'
						|| property === 'getDefinitionAtPosition'
						|| property === 'getDefinitionAndBoundSpan'
						|| property === 'getTypeDefinitionAtPosition'
						|| property === 'getImplementationAtPosition'
						|| property === 'getReferencesAtPosition'
						|| property === 'findReferences'
					) {
						return service[property];
					}
					return target[property];
				},
			});
		},
	};
	return pluginModule;
};

export = init;
