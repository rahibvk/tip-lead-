/* ============================================
   GOV-KER TIP PORTAL — Application Logic
   State Machine + All Step Controllers
   ============================================ */

(function () {
  'use strict';

  // ==========================================
  // STATE MACHINE
  // ==========================================

  const STATES = {
    LOCATION: 'LOCATION',
    NARRATIVE: 'NARRATIVE',
    ANALYZING: 'ANALYZING',
    FOLLOW_UP: 'FOLLOW_UP',
    SUBMITTING: 'SUBMITTING',
    COMPLETE: 'COMPLETE',
  };

  // Volatile state — lives only in RAM
  let tipState = createFreshState();
  let currentStep = STATES.LOCATION;
  let inactivityTimer = null;
  const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  function createFreshState() {
    return {
      coordinates: null,
      rawNarrative: '',
      analysisResult: null,
      interviewTranscript: [],
      timestamp: null,
    };
  }

  function wipeState() {
    tipState = createFreshState();
    currentStep = STATES.LOCATION;
    // Clear all form inputs
    const textarea = document.getElementById('narrativeInput');
    if (textarea) textarea.value = '';
    const dynamicForm = document.getElementById('dynamicForm');
    if (dynamicForm) dynamicForm.innerHTML = '';
    goToStep(STATES.LOCATION);
    console.log('[Security] State wiped from memory.');
  }

  // --- Inactivity & Visibility Handlers ---
  function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      if (currentStep !== STATES.COMPLETE) {
        wipeState();
        showErrorToast('Session expired due to inactivity. Your data has been wiped for security.');
      }
    }, INACTIVITY_TIMEOUT);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Start a shorter timer when tab is hidden
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        if (currentStep !== STATES.COMPLETE) {
          wipeState();
        }
      }, INACTIVITY_TIMEOUT);
    } else {
      resetInactivityTimer();
    }
  });

  window.addEventListener('beforeunload', () => {
    // Wipe state on close
    tipState = createFreshState();
  });

  // Reset timer on any user interaction
  ['click', 'keydown', 'touchstart', 'mousemove'].forEach(evt => {
    document.addEventListener(evt, resetInactivityTimer, { passive: true });
  });

  // ==========================================
  // NAVIGATION
  // ==========================================

  const stepMap = {
    [STATES.LOCATION]: { section: 'step1', progStep: 1 },
    [STATES.NARRATIVE]: { section: 'step2', progStep: 2 },
    [STATES.ANALYZING]: { section: 'step3', progStep: 2 },
    [STATES.FOLLOW_UP]: { section: 'step4', progStep: 3 },
    [STATES.SUBMITTING]: { section: 'step4', progStep: 4 },
    [STATES.COMPLETE]: { section: 'step5', progStep: 4 },
  };

  function goToStep(state) {
    currentStep = state;
    const config = stepMap[state];

    // Hide all sections
    document.querySelectorAll('.step-section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(config.section);
    if (target) {
      target.classList.add('active');
      // Re-trigger animation
      target.style.animation = 'none';
      target.offsetHeight; // force reflow
      target.style.animation = '';
    }

    // Update progress bar
    updateProgress(config.progStep);
    resetInactivityTimer();
  }

  function updateProgress(activeStep) {
    // Fill bar
    const fill = document.getElementById('progressFill');
    const percentage = ((activeStep - 1) / 3) * 100;
    fill.style.width = percentage + '%';

    // Step indicators
    for (let i = 1; i <= 4; i++) {
      const el = document.getElementById('progStep' + i);
      el.classList.remove('active', 'completed');
      if (i < activeStep) {
        el.classList.add('completed');
      } else if (i === activeStep) {
        el.classList.add('active');
      }
    }
  }

  // ==========================================
  // BACKGROUND PARTICLES
  // ==========================================

  function initParticles() {
    const container = document.getElementById('bgParticles');
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDuration = (8 + Math.random() * 20) + 's';
      p.style.animationDelay = (Math.random() * 15) + 's';
      p.style.width = (1 + Math.random() * 2) + 'px';
      p.style.height = p.style.width;
      p.style.opacity = 0;
      container.appendChild(p);
    }
  }

  // ==========================================
  // STEP 1: MAP
  // ==========================================

  let map = null;

  function initMap() {
    map = new maplibregl.Map({
      container: 'map',
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [76.2711, 10.8505], // Kerala center
      zoom: 7,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    // Update coordinate readout on move
    map.on('move', () => {
      const center = map.getCenter();
      document.getElementById('coordLat').textContent = center.lat.toFixed(4) + '° N';
      document.getElementById('coordLng').textContent = center.lng.toFixed(4) + '° E';
    });
  }

  document.getElementById('btnConfirmLocation').addEventListener('click', () => {
    const center = map.getCenter();
    tipState.coordinates = {
      lat: parseFloat(center.lat.toFixed(6)),
      lng: parseFloat(center.lng.toFixed(6)),
    };
    goToStep(STATES.NARRATIVE);
    // Focus the textarea
    setTimeout(() => {
      document.getElementById('narrativeInput').focus();
    }, 400);
  });

  // ==========================================
  // STEP 2: NARRATIVE INPUT
  // ==========================================

  const narrativeInput = document.getElementById('narrativeInput');
  const charCount = document.getElementById('charCount');
  const btnNext = document.getElementById('btnNextNarrative');

  narrativeInput.addEventListener('input', () => {
    const len = narrativeInput.value.length;
    charCount.textContent = len.toLocaleString() + ' / 5,000';
    btnNext.disabled = len < 10;
  });

  // Back button
  document.getElementById('btnBack1').addEventListener('click', () => {
    goToStep(STATES.LOCATION);
  });

  // Next button
  btnNext.addEventListener('click', async () => {
    const text = narrativeInput.value.trim();
    if (text.length < 10) return;

    tipState.rawNarrative = text;
    tipState.timestamp = new Date().toISOString();

    goToStep(STATES.FOLLOW_UP);
    startInterview(text);
  });

  // ==========================================
  // SPEECH-TO-TEXT
  // ==========================================

  const btnMic = document.getElementById('btnMic');
  const micStatus = document.getElementById('micStatus');
  let recognition = null;
  let isRecording = false;

  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      btnMic.style.display = 'none';
      document.getElementById('speechPrivacy').style.display = 'none';
      return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';

    let finalTranscript = '';

    recognition.onresult = (event) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }
      // Append to existing text
      const existingText = narrativeInput.value.substring(0, narrativeInput.value.length - (interimTranscript ? 0 : 0));
      const baseText = narrativeInput.dataset.baseText || narrativeInput.value;
      narrativeInput.value = baseText + finalTranscript + interimTranscript;
      narrativeInput.dispatchEvent(new Event('input'));
    };

    recognition.onstart = () => {
      isRecording = true;
      btnMic.classList.add('recording');
      micStatus.textContent = 'Listening... Speak now';
      micStatus.classList.add('active');
      narrativeInput.dataset.baseText = narrativeInput.value;
      finalTranscript = '';
    };

    recognition.onend = () => {
      isRecording = false;
      btnMic.classList.remove('recording');
      micStatus.textContent = '';
      micStatus.classList.remove('active');
      // Commit final text
      delete narrativeInput.dataset.baseText;
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      isRecording = false;
      btnMic.classList.remove('recording');
      micStatus.classList.remove('active');
      if (event.error === 'not-allowed') {
        micStatus.textContent = 'Microphone access denied.';
      } else {
        micStatus.textContent = 'Speech error: ' + event.error;
      }
      setTimeout(() => { micStatus.textContent = ''; }, 4000);
    };
  }

  btnMic.addEventListener('click', () => {
    if (!recognition) {
      showErrorToast('Speech recognition is not supported in your browser.');
      return;
    }

    if (isRecording) {
      recognition.stop();
    } else {
      recognition.start();
    }
  });

  // ==========================================
  // STEP 4: INTERACTIVE INTERVIEW
  // ==========================================

  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const btnSendChat = document.getElementById('btnSendChat');
  const btnSubmitTip = document.getElementById('btnSubmitTip');
  let conversationHistory = [];
  let isInterviewing = false;
  let turnCount = 0;
  const MAX_TURNS = 10;

  async function startInterview(text) {
    conversationHistory = [
      { role: 'user', content: text }
    ];
    
    // Clear chat
    chatMessages.innerHTML = '';
    btnSubmitTip.style.display = 'none';
    chatInput.disabled = false;
    btnSendChat.disabled = false;
    chatInput.value = '';
    chatInput.placeholder = "Type your answer here...";
    isInterviewing = true;
    turnCount = 0;

    await fetchNextQuestion();
  }

  async function fetchNextQuestion() {
    showTypingIndicator();
    
    try {
      const response = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversationHistory }),
      });

      if (!response.ok) throw new Error('Interview failed');

      const result = await response.json();
      removeTypingIndicator();

      if (result.status === 'complete' || turnCount >= MAX_TURNS) {
        endInterview(result);
      } else if (result.status === 'continue' && result.question) {
        appendMessage('ai', result.question);
        conversationHistory.push({ role: 'assistant', content: result.question });
        turnCount++;
        setTimeout(() => chatInput.focus(), 100);
      }
    } catch (err) {
      console.error(err);
      removeTypingIndicator();
      showErrorToast('Failed to get next question. Please try again or submit now.');
      endInterview({ status: 'complete', summary: 'Interview interrupted due to error.', categories: ['general'] });
    }
  }

  function appendMessage(sender, text) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${sender}`;
    bubble.textContent = text;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function showTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'typing-indicator';
    div.id = 'typingIndicator';
    div.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    chatInput.disabled = true;
    btnSendChat.disabled = true;
  }

  function removeTypingIndicator() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
    
    if (isInterviewing) {
      chatInput.disabled = false;
      btnSendChat.disabled = false;
    }
  }

  function endInterview(result) {
    isInterviewing = false;
    chatInput.disabled = true;
    btnSendChat.disabled = true;
    chatInput.placeholder = "Interview complete.";
    btnSubmitTip.style.display = 'inline-flex';
    
    tipState.analysisResult = result;
    
    appendMessage('ai', "Thank you. I have all the information I need. You can now submit the tip.");
    
    // Save transcript (skip the first message which is the raw narrative)
    tipState.interviewTranscript = conversationHistory.slice(1);
  }

  btnSendChat.addEventListener('click', () => {
    if (!isInterviewing) return;
    const answer = chatInput.value.trim();
    if (!answer) return;

    appendMessage('user', answer);
    conversationHistory.push({ role: 'user', content: answer });
    chatInput.value = '';
    
    fetchNextQuestion();
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      btnSendChat.click();
    }
  });

  // Connect chat mic
  const btnChatMic = document.getElementById('btnChatMic');
  if (btnChatMic && window.SpeechRecognition || window.webkitSpeechRecognition) {
    btnChatMic.addEventListener('click', () => {
        // We can reuse the recognition instance or just simplify for now
        showErrorToast('Chat dictation coming soon. Please type your answer.');
    });
  }

  // Back button on Step 4
  document.getElementById('btnBack3').addEventListener('click', () => {
    goToStep(STATES.NARRATIVE);
  });

  // ==========================================
  // SUBMIT TIP
  // ==========================================

  document.getElementById('btnSubmitTip').addEventListener('click', async () => {
    const payload = {
      coordinates: tipState.coordinates,
      rawNarrative: tipState.rawNarrative,
      categories: tipState.analysisResult?.categories || [],
      interviewTranscript: tipState.interviewTranscript,
      timestamp: tipState.timestamp,
    };

    // Show submitting overlay
    const overlay = document.createElement('div');
    overlay.className = 'submitting-overlay';
    overlay.innerHTML = `
      <div class="submitting-spinner"></div>
      <p class="submitting-text">Securely transmitting your tip...</p>
    `;
    document.body.appendChild(overlay);

    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Submission failed: ' + response.statusText);
      }

      const result = await response.json();
      console.log('[Submit] Server response:', result);

      // Remove overlay
      overlay.remove();

      // Wipe sensitive data immediately
      tipState = createFreshState();
      narrativeInput.value = '';

      // Go to success
      goToStep(STATES.COMPLETE);
    } catch (err) {
      console.error('Submit error:', err);
      overlay.remove();
      showErrorToast('Failed to submit tip. Please try again.');
    }
  });

  // ==========================================
  // NEW TIP (after success)
  // ==========================================

  document.getElementById('btnNewTip').addEventListener('click', () => {
    wipeState();
  });

  // ==========================================
  // ERROR TOAST
  // ==========================================

  function showErrorToast(message) {
    // Remove any existing toast
    const existing = document.querySelector('.error-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'error-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================

  function init() {
    initParticles();
    initMap();
    initSpeechRecognition();
    resetInactivityTimer();
    updateProgress(1);
    console.log('[Gov-Ker] Tip portal initialized. All state is volatile.');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
