const vscode = acquireVsCodeApi();

let isRecording = false;
let isDictationActive = false;
let animationId;
let audioLevel = 0;
let currentTranscription = '';

// Debounce tracking for send button
let lastTranscriptionUpdate = 0;
let sendDebounceMs = 300; // Minimum ms since last transcription update before send is allowed
let isSending = false; // Prevent double-sends

// DOM Elements - Voice tab
const startBtn = document.getElementById('startBtn');
const sendBtn = document.getElementById('sendBtn');
const interruptBtn = document.getElementById('interruptBtn');
const stopBtn = document.getElementById('stopBtn');
const canvas = document.getElementById('waveform');
const canvasCtx = canvas.getContext('2d');
const voiceMessageBox = document.getElementById('voiceMessageBox');
const voiceText = document.getElementById('voiceText');
const messageStatus = document.getElementById('messageStatus');
const statusPill = document.getElementById('statusPill');
const contextFiles = document.getElementById('contextFiles');
const contextInput = document.getElementById('contextInput');

// DOM Elements - Chats tab
const chatMessages = document.getElementById('chatMessages');

// Track if model is currently responding
let isModelResponding = false;

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        tab.classList.add('active');
        document.getElementById(`${tabName}-content`).classList.remove('hidden');
    });
});

// Start/Resume dictation button
startBtn.addEventListener('click', () => {
    if (!isRecording) {
        vscode.postMessage({ type: 'startDictation' });
    } else {
        vscode.postMessage({ type: 'stopDictation' });
    }
});

// Send button - send transcription to model
sendBtn.addEventListener('click', () => {
    // Prevent double-sends
    if (isSending) {
        console.log('[webview] Send blocked - already sending');
        return;
    }

    // Check if we have transcription content
    if (!currentTranscription.trim()) {
        console.log('[webview] Send blocked - no transcription');
        return;
    }

    // Debounce check - ensure transcription has stabilized
    const timeSinceLastUpdate = Date.now() - lastTranscriptionUpdate;
    if (timeSinceLastUpdate < sendDebounceMs) {
        console.log('[webview] Send debounced - waiting for transcription to stabilize');
        // Show brief feedback that we're waiting
        messageStatus.textContent = 'Finishing...';

        // Retry after debounce period
        setTimeout(() => {
            if (!isSending && currentTranscription.trim()) {
                sendBtn.click();
            }
        }, sendDebounceMs - timeSinceLastUpdate + 50);
        return;
    }

    // Mark as sending to prevent double-clicks
    isSending = true;

    // Stop dictation immediately
    if (isRecording) {
        vscode.postMessage({ type: 'stopDictation' });
        isRecording = false;
    }

    // Save transcription for chat history before clearing
    const userMessage = currentTranscription.trim();

    vscode.postMessage({
        type: 'sendToModel',
        text: userMessage
    });

    // Add user message to chat history
    addChatMessage(userMessage, 'user');

    // Clear the voice box immediately (voice-first, no chat in this tab)
    currentTranscription = '';
    voiceText.textContent = '';

    // Update status to thinking and show interrupt button
    messageStatus.textContent = 'Thinking...';
    statusPill.classList.remove('paused', 'ready', 'listening', 'speaking');
    statusPill.classList.add('thinking');
    isModelResponding = true;

    // Reset buttons for next dictation
    isDictationActive = false;
    startBtn.classList.remove('paused', 'recording');
    startBtn.classList.add('hidden');
    sendBtn.classList.add('hidden');
    interruptBtn.classList.remove('hidden');

    stopWaveformAnimation();
});

// Interrupt button - stop model response and start new dictation
interruptBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'interrupt' });
});

// Stop button - hard stop entire conversation
stopBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'hardStop' });
});

// Handle messages from extension
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
        case 'recordingStarted':
            isRecording = true;
            isDictationActive = true;
            startBtn.classList.add('recording');
            startBtn.classList.remove('paused');
            startBtn.querySelector('span:last-child').textContent = 'pause';

            // Swap to mic icon
            const micIcon = startBtn.querySelector('.mic-icon');
            micIcon.src = micIcon.dataset.mic;

            // Update status - listening is yellow
            statusPill.classList.remove('paused', 'ready', 'thinking', 'speaking');
            statusPill.classList.add('listening');
            messageStatus.textContent = 'Listening...';

            // Show send button and stop button when dictation starts
            sendBtn.classList.remove('hidden');
            stopBtn.classList.remove('hidden');

            startWaveformAnimation();
            break;

        case 'recordingStopped':
            isRecording = false;
            startBtn.classList.remove('recording');
            startBtn.classList.add('paused');
            startBtn.querySelector('span:last-child').textContent = 'resume';

            // Swap to paused icon
            const pausedIcon = startBtn.querySelector('.mic-icon');
            pausedIcon.src = pausedIcon.dataset.paused;

            // Show paused state
            statusPill.classList.add('paused');
            statusPill.classList.remove('ready', 'thinking');
            messageStatus.textContent = 'Paused';

            // Keep send button visible
            if (isDictationActive) {
                sendBtn.classList.remove('hidden');
            }

            stopWaveformAnimation();
            break;

        case 'transcriptionUpdate':
            // Streaming transcription update - display in voice box
            console.log('Received transcription:', message.text);
            currentTranscription = message.text;
            voiceText.textContent = currentTranscription;
            lastTranscriptionUpdate = Date.now(); // Track for debounce

            // Auto-scroll if content overflows
            voiceMessageBox.scrollTop = voiceMessageBox.scrollHeight;
            break;

        case 'thinking':
            messageStatus.textContent = 'Thinking...';
            statusPill.classList.remove('paused', 'ready', 'listening', 'speaking');
            statusPill.classList.add('thinking');
            break;

        case 'modelResponse':
            // Model has responded - show in voice box and add to chat history
            console.log('[webview] modelResponse received:', message.text?.substring(0, 100));
            isModelResponding = false;
            if (message.text) {
                // Display model response in voice box
                voiceText.textContent = message.text;
                voiceMessageBox.scrollTop = voiceMessageBox.scrollHeight;

                // Add to chat history
                addChatMessage(message.text, 'assistant');

                // Update status to speaking (TTS playing)
                messageStatus.textContent = 'Speaking...';
                statusPill.classList.remove('paused', 'thinking', 'ready', 'listening');
                statusPill.classList.add('speaking');

                // Keep interrupt button visible during TTS playback
                // Buttons will be reset when 'audioComplete' is received
            } else {
                console.error('[webview] modelResponse text is empty or undefined');
            }
            break;

        case 'audioComplete':
            // TTS audio finished playing - now ready for next input
            console.log('[webview] Audio playback complete');
            messageStatus.textContent = 'Ready';
            statusPill.classList.remove('paused', 'thinking', 'speaking', 'listening');
            statusPill.classList.add('ready');
            isSending = false; // Reset send lock

            // Show start button, hide interrupt and stop
            startBtn.classList.remove('hidden');
            startBtn.querySelector('span:last-child').textContent = 'start dictation';
            interruptBtn.classList.add('hidden');
            stopBtn.classList.add('hidden');

            // Reset icon
            const audioCompleteIcon = startBtn.querySelector('.mic-icon');
            audioCompleteIcon.src = audioCompleteIcon.dataset.paused;
            break;

        case 'audioData':
            updateAudioLevel(message.audio);
            break;

        case 'error':
            messageStatus.textContent = 'Error';
            statusPill.classList.remove('thinking');
            isModelResponding = false;
            isSending = false; // Reset send lock on error
            startBtn.classList.remove('hidden');
            interruptBtn.classList.add('hidden');
            console.error('Error:', message.text);
            break;

        case 'fileSearchResults':
            showSearchResults(message.files || []);
            break;

        case 'interrupted':
            // User interrupted the model - show interrupted state briefly then transition to recording
            console.log('[webview] Interrupted, starting new dictation');
            isModelResponding = false;
            isSending = false; // Reset send lock on interrupt
            isRecording = true;
            isDictationActive = true;
            currentTranscription = '';
            voiceText.textContent = '';

            // Show interrupted state (red) briefly
            messageStatus.textContent = 'Interrupted';
            statusPill.classList.remove('paused', 'ready', 'thinking', 'speaking', 'listening');
            statusPill.classList.add('interrupted');

            // After a brief moment, transition to listening state
            setTimeout(() => {
                messageStatus.textContent = 'Listening...';
                statusPill.classList.remove('interrupted');
                statusPill.classList.add('listening');
            }, 500);

            // Show recording state
            startBtn.classList.remove('hidden');
            startBtn.classList.add('recording');
            startBtn.querySelector('span:last-child').textContent = 'pause';
            const intIcon = startBtn.querySelector('.mic-icon');
            intIcon.src = intIcon.dataset.mic;

            sendBtn.classList.remove('hidden');
            stopBtn.classList.remove('hidden');
            interruptBtn.classList.add('hidden');

            startWaveformAnimation();
            break;

        case 'hardStopped':
            // Full stop - reset everything to initial state
            console.log('[webview] Hard stop - resetting to initial state');
            isRecording = false;
            isDictationActive = false;
            isModelResponding = false;
            isSending = false;
            currentTranscription = '';
            voiceText.textContent = '';

            // Reset status to ready
            messageStatus.textContent = 'Ready';
            statusPill.classList.remove('paused', 'thinking', 'speaking', 'listening');
            statusPill.classList.add('ready');

            // Reset all buttons to initial state
            startBtn.classList.remove('hidden', 'recording', 'paused');
            startBtn.querySelector('span:last-child').textContent = 'start dictation';
            const stopIcon = startBtn.querySelector('.mic-icon');
            stopIcon.src = stopIcon.dataset.paused;

            sendBtn.classList.add('hidden');
            interruptBtn.classList.add('hidden');
            stopBtn.classList.add('hidden');

            stopWaveformAnimation();
            break;
    }
});

// Add message to chat history tab
function addChatMessage(text, role) {
    // Remove empty state message if present
    const emptyMsg = chatMessages.querySelector('.chat-empty');
    if (emptyMsg) {
        emptyMsg.remove();
    }

    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${role}`;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    messageEl.innerHTML = `
        <div class="chat-message-text">${escapeHtml(text)}</div>
        <div class="chat-message-time">${timeStr}</div>
    `;

    chatMessages.appendChild(messageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Context files management
let searchTimeout = null;
let searchResults = [];

function addContextFile(fileName) {
    if (!fileName.trim()) return;

    const existing = contextFiles.querySelector(`[data-file="${fileName}"]`);
    if (existing) return;

    const fileTag = document.createElement('div');
    fileTag.className = 'file-tag';
    fileTag.dataset.file = fileName;
    fileTag.innerHTML = `
        <span class="file-at">@</span>
        <span class="file-remove">×</span>
        <span class="file-name">${fileName}</span>
    `;

    contextFiles.insertBefore(fileTag, contextFiles.firstChild);

    // Notify extension about the new context file
    vscode.postMessage({
        type: 'addContextFile',
        file: fileName
    });

    // Hide search results
    hideSearchResults();
}

function removeContextFile(fileName) {
    // Notify extension about removal
    vscode.postMessage({
        type: 'removeContextFile',
        file: fileName
    });
}

// Handle clicks on file remove buttons
contextFiles.addEventListener('click', (e) => {
    if (e.target.classList.contains('file-remove')) {
        const fileTag = e.target.closest('.file-tag');
        if (fileTag) {
            const fileName = fileTag.dataset.file;
            fileTag.remove();
            removeContextFile(fileName);
        }
    }
});

// Search results dropdown
function showSearchResults(results) {
    hideSearchResults();
    if (results.length === 0) {
        return;
    }

    searchResults = results;
    const dropdown = document.createElement('div');
    dropdown.className = 'search-results-dropdown';
    dropdown.id = 'searchResultsDropdown';

    results.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.textContent = file;
        item.dataset.index = index;
        item.addEventListener('click', () => {
            addContextFile(file);
            contextInput.value = '';
        });
        dropdown.appendChild(item);
    });

    contextInput.parentElement.appendChild(dropdown);
}

function hideSearchResults() {
    const existing = document.getElementById('searchResultsDropdown');
    if (existing) {
        existing.remove();
    }
    searchResults = [];
}

// Handle context input - search as you type
contextInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();

    // Clear previous timeout
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    if (query.length < 2) {
        hideSearchResults();
        return;
    }

    // Debounce search
    searchTimeout = setTimeout(() => {
        vscode.postMessage({
            type: 'searchFiles',
            query: query
        });
    }, 200);
});

// Handle context input - add file on Enter
contextInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (searchResults.length > 0) {
            addContextFile(searchResults[0]);
        } else if (contextInput.value.trim()) {
            addContextFile(contextInput.value);
        }
        contextInput.value = '';
    } else if (e.key === 'Escape') {
        hideSearchResults();
        contextInput.value = '';
    }
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.context-input-wrapper')) {
        hideSearchResults();
    }
});

function updateAudioLevel(base64Audio) {
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    const samples = new Int16Array(bytes.buffer);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
        const abs = Math.abs(samples[i]);
        sum += samples[i] * samples[i];
        if (abs > peak) peak = abs;
    }
    const rms = Math.sqrt(sum / samples.length);

    const rmsNorm = Math.min(1, rms / 3000);
    const peakNorm = Math.min(1, peak / 10000);
    const targetLevel = rmsNorm * 0.6 + peakNorm * 0.4;

    if (targetLevel > audioLevel) {
        audioLevel = targetLevel;
    } else {
        audioLevel = audioLevel * 0.85 + targetLevel * 0.15;
    }
}

// Bar-style waveform visualization
const BAR_COUNT = 50;
const BAR_WIDTH = 3;
const BAR_GAP = 3;
let barHeights = new Array(BAR_COUNT).fill(0);
let lastUpdateTime = 0;
const UPDATE_INTERVAL = 80;

function startWaveformAnimation() {
    lastUpdateTime = performance.now();

    function draw(currentTime) {
        if (!isRecording) return;
        animationId = requestAnimationFrame(draw);

        if (currentTime - lastUpdateTime >= UPDATE_INTERVAL) {
            lastUpdateTime = currentTime;

            barHeights.shift();
            const baseHeight = audioLevel * canvas.height * 0.9;
            const variation = audioLevel * 25 * (Math.random() - 0.5);
            const minHeight = 5;
            const newHeight = Math.max(minHeight, baseHeight + variation);
            barHeights.push(newHeight);
        }

        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

        const totalWidth = BAR_COUNT * (BAR_WIDTH + BAR_GAP);
        const startX = (canvas.width - totalWidth) / 2;
        const centerY = canvas.height / 2;

        canvasCtx.fillStyle = '#ffffff';

        for (let i = 0; i < BAR_COUNT; i++) {
            const x = startX + i * (BAR_WIDTH + BAR_GAP);
            const height = Math.max(2, barHeights[i]);
            canvasCtx.fillRect(x, centerY - height / 2, BAR_WIDTH, height);
        }
    }
    requestAnimationFrame(draw);
}

function stopWaveformAnimation() {
    cancelAnimationFrame(animationId);
    barHeights = new Array(BAR_COUNT).fill(0);
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    const totalWidth = BAR_COUNT * (BAR_WIDTH + BAR_GAP);
    const startX = (canvas.width - totalWidth) / 2;
    const centerY = canvas.height / 2;

    canvasCtx.fillStyle = '#555';
    for (let i = 0; i < BAR_COUNT; i++) {
        const x = startX + i * (BAR_WIDTH + BAR_GAP);
        canvasCtx.fillRect(x, centerY - 1, BAR_WIDTH, 2);
    }
}

// Resize canvas
function resizeCanvas() {
    canvas.width = canvas.offsetWidth;
    canvas.height = 80;
    if (!isRecording) {
        stopWaveformAnimation();
    }
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
