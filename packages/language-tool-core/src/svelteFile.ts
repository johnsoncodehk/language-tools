import { decode, SourceMapMappings } from '@jridgewell/sourcemap-codec';
import { DocumentCapabilities, EmbeddedFileKind, PositionCapabilities, SourceFile } from '@volar/language-core';
import { SvelteConfig } from 'svelte-language-server/dist/src/lib/documents/configLoader';
import { extractScriptTags, extractStyleTag, extractTemplateTag, getLangAttribute } from 'svelte-language-server/dist/src/lib/documents/utils';
import type { SvelteSnapshotOptions } from 'svelte-language-server/dist/src/plugins/typescript/DocumentSnapshot';
import { getScriptKindFromAttributes, getTsCheckComment } from 'svelte-language-server/dist/src/plugins/typescript/utils';
import { svelte2tsx, SvelteCompiledToTsx } from 'svelte2tsx';
import * as html from 'vscode-html-languageservice';
import { Position, Range, TextDocument } from 'vscode-html-languageservice';

const htmlLs = html.getLanguageService();
const semanticsOnlyDocCap: DocumentCapabilities = {
	diagnostic: true,
	codeAction: true,
	inlayHint: true,
};
const syntaxOnlyDocCap: DocumentCapabilities = {
	foldingRange: true,
	documentFormatting: true,
	documentSymbol: true,
};
const fullDocCap: DocumentCapabilities = {
	...semanticsOnlyDocCap,
	...syntaxOnlyDocCap,
};
const fullPosCap: PositionCapabilities = {
	hover: true,
	references: true,
	definition: true,
	rename: true,
	completion: true,
	diagnostic: true,
	semanticTokens: true,
};

/**
 * An error which occurred while trying to parse/preprocess the svelte file contents.
 */
export interface ParserError {
    message: string;
    range: Range;
    code: number;
}

export class SvelteFile implements SourceFile {

	kind = EmbeddedFileKind.TextFile;
	capabilities = fullDocCap;

	mappings!: SourceFile['mappings'];
	embeddeds!: SourceFile['embeddeds'];
	document!: html.TextDocument;
	htmlDocument!: html.HTMLDocument;
    parserError: ParserError | null = null;
	tsx: SvelteCompiledToTsx | null = null;

	constructor(
		public ts: typeof import('typescript'),
		public fileName: string,
		public text: string,
		public options: SvelteSnapshotOptions,
    	public config?: SvelteConfig,
	) {
		this.onTextUpdated();
	}

	public update(newText: string) {
		this.text = newText;
		this.onTextUpdated();
	}

	onTextUpdated() {
		this.mappings = [{
			sourceRange: [0, this.text.length],
			generatedRange: [0, this.text.length],
			data: fullPosCap,
		}]
		this.document = html.TextDocument.create(this.fileName, 'svelte', 0, this.text);
		this.htmlDocument = htmlLs.parseHTMLDocument(this.document);
		this.embeddeds = [];
		this.addStyleTag();
		this.addTemplateTag();
		this.addScriptTags();
		for (const e of this.embeddeds) {
			console.log(e.fileName, e.text.length);
		}
	}

	addStyleTag() {
		const styleTag = extractStyleTag(this.text, this.htmlDocument);
		if (styleTag) {
			this.embeddeds.push({
				fileName: this.fileName + '.style.' + (getLangAttribute(styleTag) ?? 'css'),
				kind: EmbeddedFileKind.TextFile,
				text: styleTag.content,
				mappings: [{
					sourceRange: [styleTag.start, styleTag.end],
					generatedRange: [0, styleTag.content.length],
					data: fullPosCap,
				}],
				capabilities: fullDocCap,
				embeddeds: [],
			});
			console.log(styleTag.content);
		}
	}

	addTemplateTag() {
		const templateTag = extractTemplateTag(this.text, this.htmlDocument);
		if (templateTag) {
			this.embeddeds.push({
				fileName: this.fileName + '.template.' + (getLangAttribute(templateTag) ?? 'html'),
				kind: EmbeddedFileKind.TextFile,
				text: templateTag.content,
				mappings: [{
					sourceRange: [templateTag.start, templateTag.end],
					generatedRange: [0, templateTag.content.length],
					data: fullPosCap,
				}],
				capabilities: fullDocCap,
				embeddeds: [],
			});
		}
	}

	addScriptTags() {
		const scriptTags = extractScriptTags(this.text, this.htmlDocument);
		for (const scriptTag of [scriptTags?.moduleScript, scriptTags?.script]) {
			if (scriptTag) {
				this.embeddeds.push({
					fileName: this.fileName + '.script.' + (getLangAttribute(scriptTag) ?? 'js'),
					kind: EmbeddedFileKind.TextFile,
					text: scriptTag.content,
					mappings: [{
						sourceRange: [scriptTag.start, scriptTag.end],
						generatedRange: [0, scriptTag.content.length],
						data: {},
					}],
					capabilities: syntaxOnlyDocCap,
					embeddeds: [],
				});
			}
		}

		const scriptKind = [
			getScriptKindFromAttributes(scriptTags?.script?.attributes ?? {}),
			getScriptKindFromAttributes(scriptTags?.moduleScript?.attributes ?? {})
		].includes(this.ts.ScriptKind.TSX)
			? this.options.useNewTransformation
				? this.ts.ScriptKind.TS
				: this.ts.ScriptKind.TSX
			: this.options.useNewTransformation
				? this.ts.ScriptKind.JS
				: this.ts.ScriptKind.JSX;

		try {
			this.tsx = svelte2tsx(this.text, {
				filename: this.fileName,
				isTsFile: this.options.useNewTransformation
					? scriptKind === this.ts.ScriptKind.TS
					: scriptKind === this.ts.ScriptKind.TSX,
            	mode: this.options.useNewTransformation ? 'ts' : 'tsx',
				typingsNamespace: this.options.useNewTransformation ? this.options.typingsNamespace : undefined,
				emitOnTemplateError: this.options.transformOnTemplateError,
				namespace: this.config?.compilerOptions?.namespace,
				accessors:
					this.config?.compilerOptions?.accessors ??
					this.config?.compilerOptions?.customElement
			});

			let text = this.tsx.code;
			let baseOffset = 0;

			if (this.tsx.map) {
				const scriptInfo = scriptTags?.script || scriptTags?.moduleScript;
				const tsCheck = getTsCheckComment(scriptInfo?.content);
				if (tsCheck) {
					text = tsCheck + text;
					baseOffset = tsCheck.length;
				}
			}

			this.embeddeds.push({
				fileName: this.fileName + (this.options.useNewTransformation ? '.ts' : '.tsx'),
				text: this.tsx.code,
				kind: EmbeddedFileKind.TypeScriptHostFile,
				capabilities: semanticsOnlyDocCap,
				mappings: fromV3Mappings(this.text, this.tsx.code, decode(this.tsx.map.mappings), baseOffset),
				embeddeds: [],
			});
		} catch (e: any) {
			// Error start/end logic is different and has different offsets for line, so we need to convert that
			const start: Position = {
				line: (e.start?.line ?? 1) - 1,
				character: e.start?.column ?? 0
			};
			const end: Position = e.end ? { line: e.end.line - 1, character: e.end.column } : start;
	
			this.parserError = {
				range: { start, end },
				message: e.message,
				code: -1
			};
	
			// fall back to extracted script, if any
			const scriptInfo = scriptTags?.script || scriptTags?.moduleScript;
			const text = scriptInfo ? scriptInfo.content : '';

			this.embeddeds.push({
				fileName: this.fileName + (this.options.useNewTransformation ? '.ts' : '.tsx'),
				text,
				kind: EmbeddedFileKind.TypeScriptHostFile,
				capabilities: semanticsOnlyDocCap,
				mappings: [{
					sourceRange: [scriptInfo?.start ?? 0, scriptInfo?.end ?? 0],
					generatedRange: [0, text.length],
					data: fullPosCap,
				}],
				embeddeds: [],
			});
		}
	}
}

function fromV3Mappings(text: string, generatedText: string, v3Mappings: SourceMapMappings, baseOffset: number) {

	const sourcedDoc = TextDocument.create('', '', 0, text);
	const genDoc = TextDocument.create('', '', 0, generatedText);
	const mappings: SourceFile['mappings'] = [];

	let current: {
		genOffset: number,
		sourceOffset: number,
	} | undefined;

	for (let genLine = 0; genLine < v3Mappings.length; genLine++) {
		for (const segment of v3Mappings[genLine]) {
			const genCharacter = segment[0];
			const genOffset = genDoc.offsetAt({ line: genLine, character: genCharacter });
			if (current) {
				let length = genOffset - current.genOffset;
				const sourceText = text.substring(current.sourceOffset, current.sourceOffset + length);
				const genText = generatedText.substring(current.genOffset, current.genOffset + length);
				if (sourceText !== genText) {
					length = 0;
					for (let i = 0; i < genOffset - current.genOffset; i++) {
						if (sourceText[i] === genText[i]) {
							length = i + 1;
						}
						else {
							break;
						}
					}
				}
				if (length > 0) {
					const lastMapping = mappings.length ? mappings[mappings.length - 1] : undefined;
					if (lastMapping && lastMapping.generatedRange[1] === current.genOffset && lastMapping.sourceRange[1] === current.sourceOffset) {
						lastMapping.generatedRange[1] = current.genOffset + length;
						lastMapping.sourceRange[1] = current.sourceOffset + length;
					}
					else {
						mappings.push({
							sourceRange: [current.sourceOffset, current.sourceOffset + length],
							generatedRange: [baseOffset + current.genOffset, baseOffset + current.genOffset + length],
							data: fullPosCap,
						});
					}
				}
				current = undefined;
			}
			if (segment[2] !== undefined && segment[3] !== undefined) {
				const sourceOffset = sourcedDoc.offsetAt({ line: segment[2], character: segment[3] });
				current = {
					genOffset,
					sourceOffset,
				};
			}
		}
	}

	return mappings;
}
