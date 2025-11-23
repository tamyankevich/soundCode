import * as vscode from 'vscode';
// @ts-ignore
import * as record from 'node-record-lpcm16';
import { spawn } from 'child_process';


export class AudioCapture {
    private process: any;

    startRecording(onData: (chunk: Buffer) => void) {
        // Direct SoX command
        // -q suppresses progress output
        // Using 24000 sample rate (native for macOS CoreAudio)
        this.process = spawn('rec', [
            '-q',           // quiet - no progress output
            '-t', 'raw',
            '-b', '16',
            '-c', '1',
            '-e', 'signed-integer',
            '-r', '24000',
            '-'
        ]);

        this.process.stdout.on('data', (data: Buffer) => {
            onData(data);
        });

        this.process.stderr.on('data', (data: Buffer) => {
            // Only log actual errors, not empty strings
            const msg = data.toString().trim();
            if (msg && !msg.includes('WARN')) {
                console.error('SoX error:', msg);
            }
        });
    }

    stopRecording() {
        if (this.process) {
            this.process.kill();
        }
    }
}