# soundCode

**Voice-first AI pair programming for people learning to code.**

## What is soundCode?

soundCode is a VS Code extension that lets you talk to AI about code instead of typing prompts. It's designed for people who are learning to code, whether you're a designer, photographer, career-switcher, or student taking your first programming class.

## Why voice?

Speaking is a lower barrier than writing prompts:
- Ask "dumb questions" without typing anxiety
- Get real-time clarification when confused
- Interrupt AI when explanations get overwhelming
- Learn at your own pace through natural conversation

## Who is this for?

- **Career switchers** learning their first programming language
- **Designers** building their own prototypes
- **Students** who need patient explanations of concepts
- **Non-native English speakers** who want to learn in their language
- **Anyone** who finds typing technical questions intimidating

## How it works

1. Open soundCode in your VS Code sidebar
2. Press the microphone button and speak naturally
3. Ask questions about your code, request explanations, or get help debugging
4. Interrupt anytime to clarify or course-correct
5. AI responds in real-time with transcribed text (voice output coming soon)

## Example use case

You're a photographer who built a print store but don't fully understand the backend code. Instead of Googling or struggling through documentation, you can:

- "Walk me through what happens when someone buys a print"
- "Wait, what's a webhook? Explain it simply"
- "Where does the customer's shipping address go?"
- "How would I add a discount code feature?"

soundCode guides you through your own codebase at your pace.

## Powered by

- **Google Gemini Live API** for real-time voice transcription
- **ElevenLabs TTS** for natural voice responses
- **VS Code Extension API** for native IDE integration
- **Node.js audio capture** for seamless microphone access

## Setup

### Prerequisites

1. **ffplay** (from ffmpeg) for audio playback:
   ```bash
   # macOS
   brew install ffmpeg

   # Ubuntu/Debian
   sudo apt-get install ffmpeg
   ```

2. **API Keys**:
   - [Google Gemini API Key](https://aistudio.google.com/app/apikey)
   - [ElevenLabs API Key](https://elevenlabs.io/) (for TTS)

### Installation

1. Clone and install dependencies:
   ```bash
   cd soundcode
   npm install
   npm run compile
   ```

2. Configure your API keys (choose one method):

   **Option A: Environment Variables** (recommended for development)
   ```bash
   cp .env.example .env
   # Edit .env and add your keys
   ```

   **Option B: VS Code Settings**
   - Open Settings (Cmd+, or Ctrl+,)
   - Search for "soundcode"
   - Add your `geminiApiKey` and `elevenLabsApiKey`

3. Press F5 to launch in development mode

### Debugging

To test your ElevenLabs connection:
1. Open Command Palette (Cmd+Shift+P)
2. Run: `soundCode: Test ElevenLabs API Connection`
3. Check the notification and Developer Console for logs

View detailed logs in Developer Console (Cmd+Shift+J or Ctrl+Shift+J):
- `[ElevenLabs]` - TTS API requests
- `[GeminiLive]` - Transcription and AI responses
- `[AudioPlayer]` - Audio playback status

## Future vision

- Multi-language support (learn to code in Spanish, Mandarin, etc.)
- Domain-specific analogies based on your background
- Collaborative debugging with interruption handling
- File editing capabilities during conversations

---

Built at Google AIE Hackathon 2025