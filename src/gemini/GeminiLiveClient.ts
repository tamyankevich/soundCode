import * as vscode from 'vscode';
import WebSocket from 'ws';

export interface GeminiLiveCallbacks {
    onTranscription: (text: string, isFinal: boolean) => void;
    onModelResponse: (text: string, isFinal: boolean) => void;
    onError: (error: string) => void;
    onConnected: () => void;
    onDisconnected: () => void;
}

// TODO: Move to environment variable or VS Code settings for production
const GEMINI_API_KEY = 'AIzaSyDyZ-bSUOG2EssF2uZimk96p8QBLo3ZBgc';

export class GeminiLiveClient {
    private ws: WebSocket | null = null;
    private callbacks: GeminiLiveCallbacks;
    private apiKey: string;
    private currentTranscription: string = '';
    private currentModelResponse: string = '';
    private workspaceContext: string = '';

    constructor(callbacks: GeminiLiveCallbacks) {
        this.callbacks = callbacks;
        // Try settings first, fall back to hardcoded key
        this.apiKey = vscode.workspace.getConfiguration('soundcode').get('geminiApiKey', '') || GEMINI_API_KEY;
    }

    setWorkspaceContext(context: string) {
        this.workspaceContext = context;
    }

    async connect(): Promise<void> {
        if (!this.apiKey) {
            this.callbacks.onError('Gemini API key not configured. Go to Settings > soundcode.geminiApiKey');
            return;
        }

        const model = 'gemini-2.0-flash-exp';
        const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.on('open', () => {
                console.log('WebSocket connected to Gemini');

                // Build system instruction with workspace context
                let systemInstruction = `You are a helpful coding assistant integrated into VS Code. You help developers write, understand, and debug code. Be concise and practical in your responses. When discussing code, reference specific files and line numbers when relevant.`;

                if (this.workspaceContext) {
                    systemInstruction += `\n\nHere is the current workspace context:\n${this.workspaceContext}`;
                }

                // Send setup message with input transcription enabled
                const setupMessage = {
                    setup: {
                        model: `models/${model}`,
                        generation_config: {
                            response_modalities: ["TEXT"]
                        },
                        system_instruction: {
                            parts: [{ text: systemInstruction }]
                        },
                        input_audio_transcription: {}
                    }
                };
                this.ws?.send(JSON.stringify(setupMessage));
            });

            this.ws.on('message', (data: WebSocket.Data) => {
                try {
                    const dataStr = data.toString();
                    console.log('[GeminiLive] Raw message length:', dataStr.length);
                    const response = JSON.parse(dataStr);
                    // Log full response to see structure
                    console.log('[GeminiLive] Response keys:', Object.keys(response));
                    if (response.serverContent) {
                        console.log('[GeminiLive] serverContent keys:', Object.keys(response.serverContent));
                    }
                    this.handleResponse(response);
                } catch (e) {
                    console.error('[GeminiLive] Failed to parse response:', e);
                    console.error('[GeminiLive] Raw data (first 500 chars):', data.toString().substring(0, 500));
                }
            });

            this.ws.on('error', (error: Error) => {
                console.error('[GeminiLive] WebSocket ERROR:', error.name, error.message);
                console.error('[GeminiLive] Error stack:', error.stack);
                this.callbacks.onError(`Connection error: ${error.message}`);
            });

            this.ws.on('close', (code: number, reason: Buffer) => {
                console.log(`[GeminiLive] WebSocket CLOSED. Code: ${code}, Reason: ${reason.toString()}`);
                console.log('[GeminiLive] Close codes: 1000=normal, 1001=going away, 1006=abnormal, 1011=server error');
                this.callbacks.onDisconnected();
                this.ws = null;
            });

        } catch (error) {
            this.callbacks.onError(`Failed to connect: ${error}`);
        }
    }

    private handleResponse(response: any) {
        // Log all responses for debugging
        console.log('[GeminiLive] Full response:', JSON.stringify(response).substring(0, 500));

        // Handle errors from Gemini
        if (response.error) {
            console.error('[GeminiLive] Error from Gemini:', response.error);
            this.callbacks.onError(`Gemini error: ${response.error.message || JSON.stringify(response.error)}`);
            return;
        }

        // Handle setup complete
        if (response.setupComplete) {
            console.log('Gemini setup complete');
            this.callbacks.onConnected();
            return;
        }

        // Handle real-time input transcription (user's speech)
        // Note: the key is "inputTranscription" not "inputTranscript"
        if (response.serverContent?.inputTranscription) {
            const transcription = response.serverContent.inputTranscription;

            // The transcription might be a string or an object with text property
            const text = typeof transcription === 'string' ? transcription : transcription.text;
            if (text) {
                // Gemini sends incremental fragments - concatenate directly without extra spaces
                // The fragments already include proper spacing
                this.currentTranscription += text;
                this.callbacks.onTranscription(this.currentTranscription, false);
            }
            return;
        }

        // Store model responses silently - ready for when user clicks send
        if (response.serverContent?.modelTurn?.parts) {
            for (const part of response.serverContent.modelTurn.parts) {
                if (part.text) {
                    this.currentModelResponse += part.text;
                    // Notify that model response is streaming (but don't display in transcription)
                    this.callbacks.onModelResponse(this.currentModelResponse, false);
                }
            }
            return;
        }

        // Check if turn is complete
        if (response.serverContent?.turnComplete) {
            // Model finished responding
            if (this.currentModelResponse) {
                this.callbacks.onModelResponse(this.currentModelResponse, true);
            } else {
                // Turn complete but no model response - still signal completion
                console.log('[GeminiLive] Turn complete but no model response accumulated');
                this.callbacks.onModelResponse('', true);
            }
            console.log('Turn complete');
        }

        // Handle interrupted state
        if (response.serverContent?.interrupted) {
            console.log('[GeminiLive] Model was interrupted');
        }
    }

    sendAudio(audioData: Buffer) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        // Convert audio buffer to base64
        const base64Audio = audioData.toString('base64');

        // Send real-time audio input
        const message = {
            realtimeInput: {
                mediaChunks: [{
                    mimeType: "audio/pcm;rate=24000",
                    data: base64Audio
                }]
            }
        };

        this.ws.send(JSON.stringify(message));
    }

    // Interrupt the current model response and start listening again
    interrupt() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.log('[GeminiLive] Cannot interrupt - not connected');
            return;
        }

        console.log('[GeminiLive] Sending interrupt signal...');

        // Clear current model response
        this.currentModelResponse = '';

        // Send new audio to interrupt - this signals to Gemini that the user is speaking again
        // The model will stop its current response when it detects new user input
        const interruptMessage = {
            realtimeInput: {
                mediaChunks: [{
                    mimeType: "audio/pcm;rate=24000",
                    // Send a small silent audio chunk to trigger interrupt
                    data: Buffer.alloc(480).toString('base64') // 10ms of silence at 24kHz
                }]
            }
        };

        this.ws.send(JSON.stringify(interruptMessage));

        // Reset transcription for new turn
        this.currentTranscription = '';

        console.log('[GeminiLive] Interrupt sent, ready for new input');
    }

    // Send end of turn to trigger model response and wait for it
    requestModelResponse(): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket not connected'));
                return;
            }

            console.log('[GeminiLive] Sending end of turn to request model response...');
            console.log('[GeminiLive] Current transcription:', this.currentTranscription);

            // Clear any previous model response
            this.currentModelResponse = '';

            // Set up a one-time listener for the complete response
            const originalCallback = this.callbacks.onModelResponse;
            let resolved = false;

            this.callbacks.onModelResponse = (text: string, isFinal: boolean) => {
                originalCallback(text, isFinal);
                if (isFinal && !resolved) {
                    resolved = true;
                    // Restore original callback
                    this.callbacks.onModelResponse = originalCallback;
                    console.log('[GeminiLive] Model response complete:', text.length, 'chars');
                    resolve(text);
                }
            };

            // Check WebSocket state
            console.log('[GeminiLive] WebSocket state before sending:', this.ws.readyState, '(1=OPEN)');

            // Send audio end signal to indicate user finished speaking
            const audioEndMessage = {
                realtimeInput: {
                    mediaChunks: []
                }
            };

            try {
                this.ws.send(JSON.stringify(audioEndMessage));
                console.log('[GeminiLive] Audio end message sent');
            } catch (e) {
                console.error('[GeminiLive] Failed to send audio end:', e);
                reject(new Error('Failed to send audio end message'));
                return;
            }

            // Also send client content with the transcription text as turn complete
            const endTurnMessage = {
                clientContent: {
                    turns: [{
                        role: "user",
                        parts: [{ text: this.currentTranscription || "Hello, please respond to me." }]
                    }],
                    turnComplete: true
                }
            };

            console.log('[GeminiLive] Sending turn complete message:', JSON.stringify(endTurnMessage));

            try {
                this.ws.send(JSON.stringify(endTurnMessage));
                console.log('[GeminiLive] Turn complete message sent, waiting for response...');
            } catch (e) {
                console.error('[GeminiLive] Failed to send turn complete:', e);
                reject(new Error('Failed to send turn complete message'));
                return;
            }

            // Timeout after 30 seconds
            setTimeout(() => {
                if (!resolved) {
                    console.log('[GeminiLive] Timeout reached. resolved:', resolved, 'currentModelResponse length:', this.currentModelResponse.length);
                    resolved = true;
                    this.callbacks.onModelResponse = originalCallback;
                    if (this.currentModelResponse) {
                        // We have partial response, resolve with what we have
                        console.log('[GeminiLive] Timeout but have partial response, resolving with it');
                        resolve(this.currentModelResponse);
                    } else {
                        reject(new Error('Model response timeout - no response received'));
                    }
                }
            }, 30000);
        });
    }

    // Send a context update to inject new file contents into the conversation
    sendContextUpdate(context: string) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.log('[GeminiLive] Cannot send context update - not connected');
            return;
        }

        if (!context.trim()) {
            console.log('[GeminiLive] Empty context, skipping update');
            return;
        }

        console.log('[GeminiLive] Sending context update:', context.length, 'chars');

        // Send the context as a client message that the model will receive
        // This adds the file contents to the conversation history
        const contextMessage = {
            clientContent: {
                turns: [{
                    role: "user",
                    parts: [{
                        text: `[CONTEXT UPDATE] The following files have been added to the conversation context. Please reference them in subsequent responses:\n\n${context}`
                    }]
                }],
                turnComplete: false // Don't expect a response, just acknowledge the context
            }
        };

        try {
            this.ws.send(JSON.stringify(contextMessage));
            console.log('[GeminiLive] Context update sent');
        } catch (e) {
            console.error('[GeminiLive] Failed to send context update:', e);
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.currentTranscription = '';
        this.currentModelResponse = '';
    }

    resetTranscription() {
        this.currentTranscription = '';
    }

    resetModelResponse() {
        this.currentModelResponse = '';
    }

    getTranscription(): string {
        return this.currentTranscription.trim();
    }

    getModelResponse(): string {
        return this.currentModelResponse;
    }

    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }
}
