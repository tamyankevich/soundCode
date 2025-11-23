import { spawn, ChildProcess } from 'child_process';

export class AudioPlayer {
    private process: ChildProcess | null = null;

    play(audioBuffer: Buffer): Promise<void> {
        console.log('[AudioPlayer] play() called with buffer size:', audioBuffer.length, 'bytes');
        return new Promise((resolve, reject) => {
            // Use ffplay (from ffmpeg) to play the audio
            // ElevenLabs returns mp3 by default
            console.log('[AudioPlayer] Spawning ffplay...');
            this.process = spawn('ffplay', [
                '-nodisp',      // No display window
                '-autoexit',    // Exit when done
                '-loglevel', 'quiet',
                '-i', 'pipe:0'  // Read from stdin
            ]);

            this.process.stderr?.on('data', (data) => {
                console.log('[AudioPlayer] ffplay stderr:', data.toString());
            });

            console.log('[AudioPlayer] Writing audio to stdin...');
            this.process.stdin?.write(audioBuffer);
            this.process.stdin?.end();
            console.log('[AudioPlayer] Audio written, waiting for playback...');

            this.process.on('close', (code) => {
                console.log('[AudioPlayer] ffplay closed with code:', code);
                this.process = null;
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`ffplay exited with code ${code}`));
                }
            });

            this.process.on('error', (error) => {
                console.error('[AudioPlayer] ffplay error:', error);
                this.process = null;
                reject(error);
            });
        });
    }

    stop() {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
    }

    isPlaying(): boolean {
        return this.process !== null;
    }
}
