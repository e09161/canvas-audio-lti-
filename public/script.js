class AudioRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.startTime = 0;
        this.timerInterval = null;
        this.audioContext = null;
        this.analyser = null;
        this.stream = null;
        
        this.initializeElements();
        this.setupEventListeners();
        this.requestMicrophone();
    }

    initializeElements() {
        this.recordBtn = document.getElementById('recordBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.playBtn = document.getElementById('playBtn');
        this.submitBtn = document.getElementById('submitBtn');
        this.audioPlayer = document.getElementById('audioPlayer');
        this.timer = document.getElementById('timer');
        this.status = document.getElementById('status');
        this.visualizer = document.getElementById('visualizer');
        this.submissionsList = document.getElementById('submissionsList');
        
        // Set visualizer dimensions
        this.setVisualizerSize();
        
        // Load existing submissions
        this.loadSubmissions();
        
        // Store instance for global access
        window.audioRecorder = this;
    }

    setVisualizerSize() {
        // Set proper canvas dimensions
        this.visualizer.width = this.visualizer.offsetWidth;
        this.visualizer.height = this.visualizer.offsetHeight;
    }

    async requestMicrophone() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100,
                    channelCount: 1
                } 
            });
            this.setupVisualizer();
            this.recordBtn.disabled = false;
            this.showStatus('Microphone ready! Click "Start Recording" to begin.', 'info');
        } catch (err) {
            this.showStatus('Error accessing microphone: ' + err.message, 'error');
            console.error('Microphone access error:', err);
        }
    }

    setupVisualizer() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            const source = this.audioContext.createMediaStreamSource(this.stream);
            
            source.connect(this.analyser);
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;
            
            this.drawVisualizer();
        } catch (error) {
            console.error('Visualizer setup error:', error);
        }
    }

    drawVisualizer() {
        if (!this.analyser) return;

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const canvasCtx = this.visualizer.getContext('2d');
        const width = this.visualizer.width;
        const height = this.visualizer.height;

        const draw = () => {
            requestAnimationFrame(draw);
            
            this.analyser.getByteFrequencyData(dataArray);

            // Clear canvas
            canvasCtx.fillStyle = 'rgb(0, 0, 0)';
            canvasCtx.fillRect(0, 0, width, height);

            if (!this.isRecording) {
                // Show idle state
                canvasCtx.fillStyle = 'rgb(50, 50, 50)';
                canvasCtx.fillRect(0, 0, width, height);
                canvasCtx.fillStyle = 'rgb(100, 100, 100)';
                canvasCtx.textAlign = 'center';
                canvasCtx.textBaseline = 'middle';
                canvasCtx.font = '16px Arial';
                canvasCtx.fillText('Click "Start Recording" to begin', width / 2, height / 2);
                return;
            }

            // Draw frequency bars
            const barWidth = (width / bufferLength) * 2.5;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * height;

                // Create gradient
                const gradient = canvasCtx.createLinearGradient(0, height - barHeight, 0, height);
                gradient.addColorStop(0, '#667eea');
                gradient.addColorStop(0.7, '#764ba2');
                gradient.addColorStop(1, '#e53e3e');

                canvasCtx.fillStyle = gradient;
                canvasCtx.fillRect(x, height - barHeight, barWidth, barHeight);

                x += barWidth + 1;
            }
        };

        draw();
    }

    setupEventListeners() {
        this.recordBtn.addEventListener('click', () => this.startRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecording());
        this.playBtn.addEventListener('click', () => this.playRecording());
        this.submitBtn.addEventListener('click', () => this.submitRecording());
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.setVisualizerSize();
            this.drawVisualizer();
        });

        // Handle audio player events
        this.audioPlayer.addEventListener('loadedmetadata', () => {
            if (this.audioPlayer.duration) {
                this.showStatus(`Recording duration: ${Math.round(this.audioPlayer.duration)} seconds`, 'info');
            }
        });

        this.audioPlayer.addEventListener('error', (e) => {
            this.showStatus('Error playing audio', 'error');
        });
    }

    startRecording() {
        if (!this.stream) {
            this.showStatus('Microphone not available. Please refresh the page.', 'error');
            return;
        }

        try {
            this.audioChunks = [];
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.audioUrl = URL.createObjectURL(audioBlob);
                this.audioPlayer.src = this.audioUrl;
                this.playBtn.disabled = false;
                this.submitBtn.disabled = false;
                
                this.showStatus('Recording completed! You can play it back or submit.', 'success');
            };

            this.mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder error:', event.error);
                this.showStatus('Recording error: ' + event.error, 'error');
                this.stopRecording();
            };
            
            this.mediaRecorder.start(100); // Collect data every 100ms
            this.isRecording = true;
            this.startTimer();
            
            this.recordBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.playBtn.disabled = true;
            this.submitBtn.disabled = true;
            
            this.showStatus('Recording... Click "Stop Recording" when finished.', 'info');
        } catch (error) {
            console.error('Start recording error:', error);
            this.showStatus('Error starting recording: ' + error.message, 'error');
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            try {
                this.mediaRecorder.stop();
                this.isRecording = false;
                this.stopTimer();
                
                this.recordBtn.disabled = false;
                this.stopBtn.disabled = true;
            } catch (error) {
                console.error('Stop recording error:', error);
                this.showStatus('Error stopping recording', 'error');
            }
        }
    }

    playRecording() {
        if (this.audioPlayer.src) {
            this.audioPlayer.play().catch(err => {
                this.showStatus('Playback failed: ' + err.message, 'error');
            });
        }
    }

    async submitRecording() {
        if (!this.audioChunks.length) {
            this.showStatus('No recording to submit', 'error');
            return;
        }

        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        // Check file size (50MB limit)
        if (audioBlob.size > 50 * 1024 * 1024) {
            this.showStatus('Recording too large. Please record a shorter audio.', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        try {
            this.submitBtn.disabled = true;
            this.submitBtn.innerHTML = '⏳ Submitting...';
            this.showStatus('Submitting your recording...', 'info');

            const response = await fetch('/upload-audio', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                this.showStatus('✅ Recording submitted successfully!', 'success');
                this.resetRecorder();
                this.loadSubmissions(); // Refresh submissions list
                
                // Clear object URL to free memory
                if (this.audioUrl) {
                    URL.revokeObjectURL(this.audioUrl);
                    this.audioUrl = null;
                }
            } else {
                throw new Error(result.error || 'Submission failed');
            }
        } catch (error) {
            console.error('Submission error:', error);
            this.showStatus('❌ Submission failed: ' + error.message, 'error');
            this.submitBtn.disabled = false;
            this.submitBtn.innerHTML = '📤 Submit Recording';
        }
    }

    resetRecorder() {
        this.audioChunks = [];
        this.audioPlayer.src = '';
        this.playBtn.disabled = true;
        this.submitBtn.disabled = true;
        this.submitBtn.innerHTML = '📤 Submit Recording';
        this.timer.textContent = '00:00';
        this.isRecording = false;
    }

    startTimer() {
        this.startTime = Date.now();
        this.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            this.timer.textContent = `${minutes}:${seconds}`;
            
            // Update recording indicator
            this.recordBtn.innerHTML = `<span class="recording-indicator"></span>Recording...`;
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        this.recordBtn.innerHTML = '🎤 Start Recording';
    }

    async loadSubmissions() {
        try {
            const response = await fetch('/submissions');
            if (!response.ok) {
                throw new Error('Failed to load submissions');
            }
            const submissions = await response.json();
            
            if (this.submissionsList && Array.isArray(submissions)) {
                this.renderSubmissions(submissions);
            }
        } catch (error) {
            console.error('Error loading submissions:', error);
            this.submissionsList.innerHTML = '<p>Unable to load submissions</p>';
        }
    }

    renderSubmissions(submissions) {
        if (submissions.length === 0) {
            this.submissionsList.innerHTML = '<p>No submissions yet.</p>';
            return;
        }

        this.submissionsList.innerHTML = submissions.map(submission => `
            <div class="submission-item">
                <div class="submission-info">
                    <div>
                        <div class="submission-date">
                            ${new Date(submission.created_at).toLocaleString()}
                        </div>
                        <div class="submission-size">
                            ${this.formatFileSize(submission.file_size)}
                        </div>
                    </div>
                    <div>
                        <a href="${submission.audio_url}" target="_blank" class="btn btn-secondary">
                            🔊 Listen
                        </a>
                    </div>
                </div>
            </div>
        `).join('');
    }

    formatFileSize(bytes) {
        if (!bytes) return 'Unknown size';
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    showStatus(message, type) {
        this.status.textContent = message;
        this.status.className = `status status-${type}`;
        
        // Auto-hide success messages after 5 seconds
        if (type === 'success') {
            setTimeout(() => {
                if (this.status.textContent === message) {
                    this.status.textContent = '';
                    this.status.className = 'status';
                }
            }, 5000);
        }
    }
}

// Initialize the recorder when page loads
document.addEventListener('DOMContentLoaded', () => {
    new AudioRecorder();
});

// Handle page visibility changes to stop recording if tab becomes inactive
document.addEventListener('visibilitychange', () => {
    if (document.hidden && window.audioRecorder && window.audioRecorder.isRecording) {
        window.audioRecorder.stopRecording();
        window.audioRecorder.showStatus('Recording stopped because tab became inactive', 'info');
    }
});

// Handle page unload to clean up
window.addEventListener('beforeunload', () => {
    if (window.audioRecorder && window.audioRecorder.audioUrl) {
        URL.revokeObjectURL(window.audioRecorder.audioUrl);
    }
});
