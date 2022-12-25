import { LanguageModule } from '@volar/language-core';
import type { SvelteConfig } from 'svelte-language-server/dist/src/lib/documents/configLoader';
import type { SvelteSnapshotOptions } from 'svelte-language-server/dist/src/plugins/typescript/DocumentSnapshot';
import { SvelteFile } from './svelteFile';

export * from '@volar/language-core';

const options: SvelteSnapshotOptions = {
	transformOnTemplateError: true,
	useNewTransformation: true,
	typingsNamespace: 'svelteHTML',
};
const config: SvelteConfig = {};

export function createLanguageModule(ts: typeof import('typescript/lib/tsserverlibrary')): LanguageModule<SvelteFile> {
	return {
		createFile(fileName, snapshot) {
			if (fileName.endsWith('.svelte')) {
				return new SvelteFile(ts, fileName, snapshot, options, config);
			}
		},
		updateFile(svelteFile, snapshot) {
			svelteFile.update(snapshot);
		},
	};
}
