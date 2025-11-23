import * as vscode from 'vscode';

// TODO: Move to VS Code settings for production
const ELEVENLABS_API_KEY = 'sk_24954233b43186870e97c66ceb4ff124c46e104051248ecb';

export class ElevenLabsClient {
    private apiKey: string;
    private voiceId: string;

    constructor() {
        // Try settings first, fall back to hardcoded key
        this.apiKey = vscode.workspace.getConfiguration('soundcode').get('elevenLabsApiKey', '') || ELEVENLABS_API_KEY;
        // Default voice - can be configured in settings
        this.voiceId = vscode.workspace.getConfiguration('soundcode').get('elevenLabsVoiceId', '') || 'L0Dsvb3SLTyegXwtm47J'; // "Archer" voice
    }

    async textToSpeech(text: string): Promise<Buffer | null> {
        console.log('[ElevenLabs] textToSpeech called with text length:', text.length);
        console.log('[ElevenLabs] API key present:', !!this.apiKey, 'Voice ID:', this.voiceId);

        if (!this.apiKey) {
            console.error('[ElevenLabs] API key not configured');
            return null;
        }

        try {
            console.log('[ElevenLabs] Making API request...');
            const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'xi-api-key': this.apiKey
                },
                body: JSON.stringify({
                    text: text,
                    model_id: 'eleven_turbo_v2_5',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                        style: 0.0,
                        use_speaker_boost: true
                    }
                })
            });

            console.log('[ElevenLabs] Response status:', response.status);
            if (!response.ok) {
                const error = await response.text();
                console.error('[ElevenLabs] API error:', response.status, error);
                return null;
            }

            const arrayBuffer = await response.arrayBuffer();
            console.log('[ElevenLabs] Received audio buffer:', arrayBuffer.byteLength, 'bytes');
            return Buffer.from(arrayBuffer);
        } catch (error) {
            console.error('[ElevenLabs] Request failed:', error);
            return null;
        }
    }

    isConfigured(): boolean {
        return !!this.apiKey;
    }
}
