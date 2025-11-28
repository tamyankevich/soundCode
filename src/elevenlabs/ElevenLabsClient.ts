import * as vscode from 'vscode';
import dotenv from 'dotenv';
dotenv.config();

// Load from environment variable - never commit API keys to source control
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

export class ElevenLabsClient {
    private apiKey: string;
    private voiceId: string;

    constructor() {
        // Try settings first, fall back to environment variable
        const settingsKey = vscode.workspace.getConfiguration('soundcode').get('elevenLabsApiKey', '');
        this.apiKey = settingsKey || ELEVENLABS_API_KEY || '';

        // Default voice - can be configured in settings
        this.voiceId = vscode.workspace.getConfiguration('soundcode').get('elevenLabsVoiceId', '') || 'L0Dsvb3SLTyegXwtm47J'; // "Archer" voice

        console.log('[ElevenLabs] Constructor initialized');
        console.log('[ElevenLabs] API key from settings:', !!settingsKey);
        console.log('[ElevenLabs] API key from env:', !!ELEVENLABS_API_KEY);
        console.log('[ElevenLabs] Final API key present:', !!this.apiKey);
        console.log('[ElevenLabs] Voice ID:', this.voiceId);
    }

    async textToSpeech(text: string): Promise<Buffer | null> {
        console.log('[ElevenLabs] ========== TTS REQUEST START ==========');
        console.log('[ElevenLabs] Text length:', text.length);
        console.log('[ElevenLabs] Text preview:', text.substring(0, 100));
        console.log('[ElevenLabs] API key present:', !!this.apiKey);
        console.log('[ElevenLabs] API key length:', this.apiKey?.length || 0);
        console.log('[ElevenLabs] Voice ID:', this.voiceId);

        if (!this.apiKey) {
            console.error('[ElevenLabs] ❌ API key not configured');
            console.error('[ElevenLabs] Please set ELEVENLABS_API_KEY in .env or VS Code settings');
            return null;
        }

        const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream`;
        const requestBody = {
            text: text,
            model_id: 'eleven_turbo_v2_5',
            voice_settings: {
                stability: 0.5,
                speed: 1.2,
                similarity_boost: 0.75,
                style: 0.0,
                use_speaker_boost: true
            }
        };

        console.log('[ElevenLabs] Request URL:', url);
        console.log('[ElevenLabs] Request body:', JSON.stringify(requestBody, null, 2));

        try {
            console.log('[ElevenLabs] Making API request...');
            const startTime = Date.now();

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'xi-api-key': this.apiKey
                },
                body: JSON.stringify(requestBody)
            });

            const requestTime = Date.now() - startTime;
            console.log('[ElevenLabs] Request completed in', requestTime, 'ms');
            console.log('[ElevenLabs] Response status:', response.status, response.statusText);
            console.log('[ElevenLabs] Response headers:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));

            if (!response.ok) {
                const error = await response.text();
                console.error('[ElevenLabs] ❌ API error:', response.status, response.statusText);
                console.error('[ElevenLabs] Error details:', error);

                // Parse error if it's JSON
                try {
                    const errorJson = JSON.parse(error);
                    console.error('[ElevenLabs] Parsed error:', JSON.stringify(errorJson, null, 2));
                } catch (e) {
                    // Not JSON, already logged as text
                }

                return null;
            }

            console.log('[ElevenLabs] ✅ Response OK, reading audio buffer...');
            const arrayBuffer = await response.arrayBuffer();
            console.log('[ElevenLabs] ✅ Received audio buffer:', arrayBuffer.byteLength, 'bytes');
            console.log('[ElevenLabs] Audio size:', (arrayBuffer.byteLength / 1024).toFixed(2), 'KB');
            console.log('[ElevenLabs] ========== TTS REQUEST END ==========');

            return Buffer.from(arrayBuffer);
        } catch (error) {
            console.error('[ElevenLabs] ❌ Request failed with exception:', error);
            if (error instanceof Error) {
                console.error('[ElevenLabs] Error name:', error.name);
                console.error('[ElevenLabs] Error message:', error.message);
                console.error('[ElevenLabs] Error stack:', error.stack);
            }
            console.log('[ElevenLabs] ========== TTS REQUEST END (ERROR) ==========');
            return null;
        }
    }

    isConfigured(): boolean {
        const configured = !!this.apiKey;
        console.log('[ElevenLabs] isConfigured check:', configured);
        return configured;
    }

    // Test the API connection with a simple request
    async testConnection(): Promise<{ success: boolean; error?: string }> {
        console.log('[ElevenLabs] ========== CONNECTION TEST START ==========');

        if (!this.apiKey) {
            const error = 'API key not configured';
            console.error('[ElevenLabs] ❌', error);
            return { success: false, error };
        }

        try {
            // Test with a very short text
            const testText = 'Test';
            console.log('[ElevenLabs] Testing with text:', testText);

            const buffer = await this.textToSpeech(testText);

            if (buffer && buffer.length > 0) {
                console.log('[ElevenLabs] ✅ Connection test successful');
                console.log('[ElevenLabs] ========== CONNECTION TEST END ==========');
                return { success: true };
            } else {
                const error = 'No audio buffer returned';
                console.error('[ElevenLabs] ❌', error);
                console.log('[ElevenLabs] ========== CONNECTION TEST END ==========');
                return { success: false, error };
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error('[ElevenLabs] ❌ Connection test failed:', errorMsg);
            console.log('[ElevenLabs] ========== CONNECTION TEST END ==========');
            return { success: false, error: errorMsg };
        }
    }
}
