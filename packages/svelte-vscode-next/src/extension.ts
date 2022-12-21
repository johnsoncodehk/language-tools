import { LanguageServerInitializationOptions } from '@volar/language-server';
import * as path from 'typesafe-path';
import * as vscode from 'vscode';
import * as lsp from 'vscode-languageclient/node';
import {
	registerShowVirtualFiles,
	registerAutoInsertion,
	registerTsConfig,
	registerTsVersion,
	// ...
} from '@volar/vscode-language-client';

let client: lsp.BaseLanguageClient;

export async function activate(context: vscode.ExtensionContext) {

	const documentSelector: lsp.DocumentSelector = [{ language: 'svelte' }];
	const initializationOptions: LanguageServerInitializationOptions = {
		typescript: {
			tsdk: path.join(
				vscode.env.appRoot as path.OsPath,
				'extensions/node_modules/typescript/lib' as path.PosixPath,
			),
		},
		// @ts-expect-error
		__noPluginCommands: true,
	};
	const serverModule = vscode.Uri.joinPath(context.extensionUri, 'node_modules', '.bin', 'svelte-language-server');
	const runOptions = { execArgv: <string[]>[] };
	const debugOptions = { execArgv: ['--nolazy', '--inspect=' + 6009] };
	const serverOptions: lsp.ServerOptions = {
		run: {
			module: serverModule.fsPath,
			transport: lsp.TransportKind.ipc,
			options: runOptions
		},
		debug: {
			module: serverModule.fsPath,
			transport: lsp.TransportKind.ipc,
			options: debugOptions
		},
	};
	const clientOptions: lsp.LanguageClientOptions = {
		documentSelector,
		initializationOptions,
	};
	client = new lsp.LanguageClient(
		'svelte-language-server',
		'Svelte Language Server',
		serverOptions,
		clientOptions,
	);
	await client.start();

	registerShowVirtualFiles('svelte.action.showVirtualFiles', context, client);
	registerAutoInsertion(context, [client], document => document.languageId === 'svelte');
	registerTsConfig('svelte.action.tsConfig', context, client, document => document.languageId === 'svelte');
	registerTsVersion('svelte.action.tsVersion', context, client, document => document.languageId === 'svelte', t => t + ' (svelte)');
}

export function deactivate(): Thenable<any> | undefined {
	return client?.stop();
}
