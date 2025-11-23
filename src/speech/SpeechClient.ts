import * as vscode from 'vscode';
import { SpeechClient } from '@google-cloud/speech';
import { google } from '@google-cloud/speech/build/protos/protos';

export interface SpeechCallbacks {
    onTranscription: (text: string, isFinal: boolean) => void;
    onError: (error: string) => void;
}

export class GoogleSpeechClient {
    private client: SpeechClient | null = null;
    private recognizeStream: any = null;
    private callbacks: SpeechCallbacks;
    private currentTranscription: string = '';

    constructor(callbacks: SpeechCallbacks) {
        this.callbacks = callbacks;
    }

    async start(): Promise<boolean> {
        try {
            // Initialize the client
            // Uses GOOGLE_APPLICATION_CREDENTIALS env var or default credentials
            this.client = new SpeechClient();

            const request: google.cloud.speech.v1.IStreamingRecognitionConfig = {
                config: {
                    encoding: 'LINEAR16' as const,
                    sampleRateHertz: 24000,
                    languageCode: 'en-US',
                    enableAutomaticPunctuation: true,
                    model: 'latest_long',
                },
                interimResults: true,
            };

            this.recognizeStream = this.client
                .streamingRecognize(request)
                .on('error', (error: Error) => {
                    console.error('Speech recognition error:', error);
                    this.callbacks.onError(`Speech error: ${error.message}`);
                })
                .on('data', (data: google.cloud.speech.v1.IStreamingRecognizeResponse) => {
                    this.handleResponse(data);
                });

            console.log('Google Speech-to-Text stream started');
            return true;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error('Failed to start speech recognition:', errorMsg);
            this.callbacks.onError(`Failed to start speech: ${errorMsg}`);
            return false;
        }
    }

    private handleResponse(data: google.cloud.speech.v1.IStreamingRecognizeResponse) {
        if (!data.results || data.results.length === 0) {
            return;
        }

        const result = data.results[0];
        if (!result.alternatives || result.alternatives.length === 0) {
            return;
        }

        const transcript = result.alternatives[0].transcript || '';
        const isFinal = result.isFinal || false;

        if (isFinal) {
            // Append final result to current transcription
            this.currentTranscription += transcript + ' ';
            this.callbacks.onTranscription(this.currentTranscription.trim(), false);
        } else {
            // Show interim result
            const interimText = this.currentTranscription + transcript;
            this.callbacks.onTranscription(interimText.trim(), false);
        }
    }

    sendAudio(audioData: Buffer) {
        if (this.recognizeStream && !this.recognizeStream.destroyed) {
            this.recognizeStream.write(audioData);
        }
    }

    stop() {
        if (this.recognizeStream) {
            this.recognizeStream.end();
            this.recognizeStream = null;
        }
    }

    getTranscription(): string {
        return this.currentTranscription.trim();
    }

    resetTranscription() {
        this.currentTranscription = '';
    }

    destroy() {
        this.stop();
        if (this.client) {
            this.client.close();
            this.client = null;
        }
    }
}
