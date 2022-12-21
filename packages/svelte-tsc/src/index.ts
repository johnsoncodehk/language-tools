import * as base from '@volar/typescript';
import * as svelte from 'svelte-language-tool-core';
import * as ts from 'typescript/lib/tsserverlibrary';

export function createProgram(options: ts.CreateProgramOptions) {

	if (!options.options.noEmit && !options.options.emitDeclarationOnly)
		return 'js emit is not supported';

	if (!options.options.noEmit && options.options.noEmitOnError)
		return 'noEmitOnError is not supported';

	if (!options.host)
		return '!options.host';

	let program = options.oldProgram as any;

	if (!program) {

		const ctx = {
			projectVersion: 0,
			options: options,
		};
		const scripts = new Map<string, {
			projectVersion: number,
			modifiedTime: number,
			scriptSnapshot: ts.IScriptSnapshot,
			version: string,
		}>();
		const svelteLsHost = new Proxy(<svelte.LanguageServiceHost>{
			resolveModuleNames: undefined, // avoid failed with tsc built-in fileExists
			getCompilationSettings: () => ctx.options.options,
			getScriptFileNames: () => {
				return ctx.options.rootNames as string[];
			},
			getScriptVersion,
			getScriptSnapshot,
			getProjectVersion: () => {
				return ctx.projectVersion.toString();
			},
			getProjectReferences: () => ctx.options.projectReferences,

			getTypeScriptModule: () => ts,
			isTsc: true,
		}, {
			get: (target, property) => {
				if (property in target) {
					return target[property as keyof svelte.LanguageServiceHost];
				}
				return ctx.options.host![property as keyof ts.CompilerHost];
			},
		});
		const svelteTsLs = base.createLanguageService(svelteLsHost, [svelte.createLanguageModule(ts)]);

		program = svelteTsLs.getProgram();
		program.__svelte = ctx;

		function getScriptVersion(fileName: string) {
			return getScript(fileName)?.version ?? '';
		}
		function getScriptSnapshot(fileName: string) {
			return getScript(fileName)?.scriptSnapshot;
		}
		function getScript(fileName: string) {

			const script = scripts.get(fileName);
			if (script?.projectVersion === ctx.projectVersion) {
				return script;
			}

			const modifiedTime = ts.sys.getModifiedTime?.(fileName)?.valueOf() ?? 0;
			if (script?.modifiedTime === modifiedTime) {
				return script;
			}

			if (ctx.options.host!.fileExists(fileName)) {
				const fileContent = ctx.options.host!.readFile(fileName);
				if (fileContent !== undefined) {
					const script = {
						projectVersion: ctx.projectVersion,
						modifiedTime,
						scriptSnapshot: ts.ScriptSnapshot.fromString(fileContent),
						version: ctx.options.host!.createHash?.(fileContent) ?? fileContent,
					};
					scripts.set(fileName, script);
					return script;
				}
			}
		}
	}
	else {
		program.__svelte.options = options;
		program.__svelte.projectVersion++;
	}

	for (const rootName of options.rootNames) {
		// register file watchers
		options.host.getSourceFile(rootName, ts.ScriptTarget.ESNext);
	}

	return program;
}

export function loadTsLib() {
	return ts;
}
