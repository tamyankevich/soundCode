import * as vscode from 'vscode';
import { AudioCapture } from '../audio/AudioCapture';
import { GeminiLiveClient } from '../gemini/GeminiLiveClient';
import { ElevenLabsClient } from '../elevenlabs/ElevenLabsClient';
import { AudioPlayer } from '../audio/AudioPlayer';
import { WorkspaceService } from '../workspace/WorkspaceService';

export class SoundCodeViewProvider implements vscode.WebviewViewProvider {
    private audioCapture: AudioCapture;
    private geminiClient: GeminiLiveClient | null = null;
    private elevenLabsClient: ElevenLabsClient;
    private audioPlayer: AudioPlayer;
    private workspaceService: WorkspaceService;
    private webviewView?: vscode.WebviewView;
    private contextFiles: string[] = [];

    constructor(private readonly _extensionUri: vscode.Uri) {
        this.audioCapture = new AudioCapture();
        this.elevenLabsClient = new ElevenLabsClient();
        this.audioPlayer = new AudioPlayer();
        this.workspaceService = new WorkspaceService();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this.webviewView = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'startDictation':
                    console.log('Start dictation');
                    await this.startRecording();
                    break;
                case 'stopDictation':
                    console.log('Stop dictation');
                    this.stopRecording();
                    break;
                case 'sendToModel':
                    console.log('Send to model:', data.text);
                    await this.handleSendToModel();
                    break;
                case 'addContextFile':
                    console.log('Add context file:', data.file);
                    if (data.file && !this.contextFiles.includes(data.file)) {
                        this.contextFiles.push(data.file);
                        await this.updateWorkspaceContext();
                    }
                    break;
                case 'removeContextFile':
                    console.log('Remove context file:', data.file);
                    this.contextFiles = this.contextFiles.filter(f => f !== data.file);
                    await this.updateWorkspaceContext();
                    break;
                case 'searchFiles':
                    console.log('Search files:', data.query);
                    await this.handleFileSearch(data.query);
                    break;
                case 'interrupt':
                    console.log('Interrupt requested');
                    await this.handleInterrupt();
                    break;
                case 'hardStop':
                    console.log('Hard stop requested');
                    await this.handleHardStop();
                    break;
            }
        });
    }

    private async handleInterrupt() {
        // Stop any audio playback
        this.audioPlayer.stop();

        // Send interrupt to Gemini
        if (this.geminiClient && this.geminiClient.isConnected()) {
            // Reset transcription before interrupting (interrupt() also resets, but be explicit)
            this.geminiClient.resetTranscription();
            this.geminiClient.interrupt();

            // Notify webview that we're interrupting
            this.webviewView?.webview.postMessage({ type: 'interrupted' });

            // Start recording immediately
            this.startAudioCapture();
        }
    }

    private async handleHardStop() {
        // Stop audio capture
        this.audioCapture.stopRecording();

        // Stop any audio playback
        this.audioPlayer.stop();

        // Disconnect from Gemini completely
        if (this.geminiClient) {
            this.geminiClient.disconnect();
            this.geminiClient = null;
        }

        // Notify webview that we've fully stopped
        this.webviewView?.webview.postMessage({ type: 'hardStopped' });
    }

    private async updateWorkspaceContext() {
        // Only update if we have an active Gemini connection
        if (!this.geminiClient || !this.geminiClient.isConnected()) {
            console.log('[SoundCode] No active Gemini connection, context will be applied on next connection');
            return;
        }

        // Build updated workspace context
        const workspaceContext = await this.workspaceService.buildContextForPrompt(this.contextFiles);
        console.log('[SoundCode] Updated workspace context:', workspaceContext.length, 'chars');

        // Send the context as a user message so Gemini knows about the new files
        // This injects the context into the conversation
        this.geminiClient.sendContextUpdate(workspaceContext);
    }

    private async handleFileSearch(query: string) {
        if (!query.trim()) {
            return;
        }

        // Search for files matching the query
        const files = await this.workspaceService.findFiles(`**/*${query}*`, 20);

        this.webviewView?.webview.postMessage({
            type: 'fileSearchResults',
            files: files.map(f => f.relativePath)
        });
    }

    private async startRecording() {
        // Initialize Gemini client if not already connected
        if (!this.geminiClient || !this.geminiClient.isConnected()) {
            this.geminiClient = new GeminiLiveClient({
                onTranscription: (text: string, isFinal: boolean) => {
                    console.log('Sending transcription to webview:', text);
                    this.webviewView?.webview.postMessage({
                        type: 'transcriptionUpdate',
                        text: text,
                        isFinal: isFinal
                    });
                },
                onModelResponse: (text: string, isFinal: boolean) => {
                    // Log model response (actual handling done in requestModelResponse)
                    console.log('Model response received:', isFinal ? 'FINAL' : 'streaming', text.length, 'chars');
                },
                onError: (error: string) => {
                    console.error('Gemini error:', error);
                    this.webviewView?.webview.postMessage({
                        type: 'error',
                        text: error
                    });
                    vscode.window.showErrorMessage(`soundCode: ${error}`);
                },
                onConnected: () => {
                    console.log('Gemini connected, starting audio capture');
                    this.startAudioCapture();
                },
                onDisconnected: () => {
                    console.log('Gemini disconnected');
                }
            });

            // Build workspace context before connecting
            const workspaceContext = await this.workspaceService.buildContextForPrompt(this.contextFiles);
            console.log('[SoundCode] Workspace context built:', workspaceContext.length, 'chars');
            this.geminiClient.setWorkspaceContext(workspaceContext);

            await this.geminiClient.connect();
        } else {
            // Already connected, just start audio capture
            this.startAudioCapture();
        }
    }

    private startAudioCapture() {
        this.audioCapture.startRecording((chunk: Buffer) => {
            // Send audio chunk to webview for visualization
            const base64 = chunk.toString('base64');
            this.webviewView?.webview.postMessage({
                type: 'audioData',
                audio: base64
            });

            // Send audio to Gemini for transcription
            this.geminiClient?.sendAudio(chunk);
        });

        this.webviewView?.webview.postMessage({ type: 'recordingStarted' });
    }

    private stopRecording() {
        this.audioCapture.stopRecording();
        this.webviewView?.webview.postMessage({ type: 'recordingStopped' });
    }

    private async handleSendToModel() {
        console.log('[handleSendToModel] Starting...');

        if (!this.geminiClient || !this.geminiClient.isConnected()) {
            console.log('[handleSendToModel] Gemini not connected - exiting');
            this.webviewView?.webview.postMessage({ type: 'audioComplete' });
            return;
        }

        // Stop audio capture first to prevent race conditions
        this.audioCapture.stopRecording();

        // Small delay to let any pending audio/transcription settle
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get the current transcription before resetting
        const currentTranscription = this.geminiClient.getTranscription();
        console.log('[handleSendToModel] Current transcription:', currentTranscription);

        // Notify webview that we're processing
        console.log('[handleSendToModel] Sending thinking message to webview');
        this.webviewView?.webview.postMessage({ type: 'thinking' });

        try {
            // Request model response (this sends end-of-turn and waits for response)
            console.log('[handleSendToModel] Requesting model response...');
            const responseText = await this.geminiClient.requestModelResponse();
            console.log('[handleSendToModel] Got model response:', responseText.length, 'chars');

            if (!responseText) {
                console.log('[handleSendToModel] Empty model response - exiting');
                return;
            }

            // Send response text to webview for display
            console.log('[handleSendToModel] Sending modelResponse to webview');
            this.webviewView?.webview.postMessage({
                type: 'modelResponse',
                text: responseText
            });

            // Convert to speech with ElevenLabs
            console.log('[handleSendToModel] ElevenLabs configured:', this.elevenLabsClient.isConfigured());
            if (this.elevenLabsClient.isConfigured()) {
                console.log('[handleSendToModel] Calling ElevenLabs TTS...');
                const audioBuffer = await this.elevenLabsClient.textToSpeech(responseText);
                console.log('[handleSendToModel] TTS response received, buffer:', audioBuffer ? `${audioBuffer.length} bytes` : 'null');
                if (audioBuffer) {
                    console.log('[handleSendToModel] Playing audio...');
                    await this.audioPlayer.play(audioBuffer);
                    console.log('[handleSendToModel] Audio playback complete');
                }
            } else {
                console.log('[handleSendToModel] ElevenLabs not configured, skipping TTS');
            }

            // Reset transcription for next turn BEFORE notifying completion
            this.geminiClient?.resetTranscription();
            console.log('[handleSendToModel] Transcription reset for next turn');

            // Notify webview that audio is complete (or skipped)
            this.webviewView?.webview.postMessage({ type: 'audioComplete' });
        } catch (error) {
            console.error('[handleSendToModel] Error:', error);
            // Still reset transcription on error
            this.geminiClient?.resetTranscription();
            this.webviewView?.webview.postMessage({
                type: 'error',
                text: `Failed to get response: ${error}`
            });
        }

        console.log('[handleSendToModel] Done');
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'webview.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'webview.css'));
        const micIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'icon.svg'));
        const pausedIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'paused.svg'));
        const arrowIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'arrow.svg'));
        const filesIconUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'files.svg'));
        const fontUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'PPEditorialNew-UltralightItalic.otf'));

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <style>
                    @font-face {
                        font-family: 'PP Editorial New';
                        src: url('${fontUri}') format('opentype');
                        font-weight: 200;
                        font-style: italic;
                    }
                </style>
                <title>soundCode</title>
            </head>
            <body>
                <div class="container">
                    <div class="tabs">
                        <button class="tab active" data-tab="voice">voice</button>
                        <button class="tab" data-tab="chats">chats</button>
                    </div>

                    <div class="tab-content" id="voice-content">
                        <div class="voice-header">
                            <div class="status-pill ready" id="statusPill">
                                <span class="status-dot"></span>
                                <span id="messageStatus">Ready</span>
                            </div>
                        </div>
                        <div class="voice-message-box" id="voiceMessageBox">
                            <div class="voice-text" id="voiceText"></div>
                        </div>
                        <div class="context-input-wrapper">
                                <img class="context-icon" src="${filesIconUri}" alt="files" />
                                <input type="text" id="contextInput" class="context-input" placeholder="add context files" />
                        </div>
                        <div class="context-files-wrapper">
                                <div class="context-files" id="contextFiles">
                                </div>
                        </div>
                        <div class="waveform-container">
                            <canvas id="waveform"></canvas>
                        </div>
                        <div class="bottom-bar">
                            <button id="stopBtn" class="btn-stop hidden" title="Stop conversation">
                                <span class="stop-icon"></span>
                            </button>
                            <div class="controls">
                                <button id="startBtn" class="btn-dictate">
                                    <img class="mic-icon" src="${micIconUri}" alt="mic" data-mic="${pausedIconUri}" data-paused="${micIconUri}" />
                                    <span>start dictation</span>
                                </button>
                                <button id="sendBtn" class="btn-send hidden">
                                    <span>send</span>
                                    <img class="arrow-icon" src="${arrowIconUri}" alt="send" />
                                </button>
                                <button id="interruptBtn" class="btn-interrupt hidden">
                                    <span>interrupt</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="tab-content hidden" id="chats-content">
                        <div class="chat-messages" id="chatMessages">
                            <div class="chat-empty">No conversations yet. Start talking in the voice tab!</div>
                        </div>
                    </div>
                </div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}
