// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SoundCodeViewProvider } from './webview/SoundCodeViewProvider';
import { ElevenLabsClient } from './elevenlabs/ElevenLabsClient';


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	const provider = new SoundCodeViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'soundcode.voiceView',
            provider
        )
    );

	// Add command to test ElevenLabs connection
	const testElevenLabs = vscode.commands.registerCommand('soundcode.testElevenLabs', async () => {
		vscode.window.showInformationMessage('Testing ElevenLabs API connection...');
		console.log('[soundCode] Testing ElevenLabs API connection...');

		const client = new ElevenLabsClient();
		const result = await client.testConnection();

		if (result.success) {
			vscode.window.showInformationMessage('✅ ElevenLabs API connected successfully!');
			console.log('[soundCode] ✅ ElevenLabs test passed');
		} else {
			vscode.window.showErrorMessage(`❌ ElevenLabs API connection failed: ${result.error}`);
			console.error('[soundCode] ❌ ElevenLabs test failed:', result.error);
		}
	});

	context.subscriptions.push(testElevenLabs);
}

// This method is called when your extension is deactivated
export function deactivate() {}
