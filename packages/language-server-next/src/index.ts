import { createLanguageModule } from 'svelte-language-tool-core';
import createTsPlugin from '@volar-plugins/typescript';
import createCssPlugin from '@volar-plugins/css';
import createHtmlPlugin from '@volar-plugins/typescript';
import { createLanguageServer, LanguageServerPlugin } from '@volar/language-server/node';

const plugin: LanguageServerPlugin = () => ({
	extraFileExtensions: [{ extension: 'svelte', isMixedContent: true, scriptKind: 7 }],
	semanticService: {
		getLanguageModules(host) {
			return [createLanguageModule(host.getTypeScriptModule())];
		},
		getServicePlugins() {
			return [
				createTsPlugin(),
				createCssPlugin(),
				createHtmlPlugin(),
			];
		},
		onInitialize(connection, getLanguageService) {

			connection.onRequest('$/getFileReferences', async (uri: string) => {
				const service = await getLanguageService(uri);
				return service.findFileReferences(uri);
			});
		},
	},
	syntacticService: {
		getLanguageModules(ts) {
			return [createLanguageModule(ts)];
		},
		getServicePlugins() {
			return [
				createTsPlugin(),
				createCssPlugin(),
				createHtmlPlugin(),
			];
		},
	},
});

createLanguageServer([plugin]);
