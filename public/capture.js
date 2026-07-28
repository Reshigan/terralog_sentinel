// Terminus Field Data Collection - Capture Module
// Handles camera capture, GPS retrieval, numeric input validation, and API submission

(function() {
  'use strict';

  // Configuration
  const API_BASE = '/api';
  const DB_NAME = 'terminus_readings';
  const DB_VERSION = 1;
  const SYNC_STATUS = {
    PENDING: 'pending',
    SYNCED: 'synced',
    FAILED: 'failed'
  };

  // State
  let mediaStream = null;
  let db = null;
  let currentPosition = null;

  // DOM Elements
  const elements = {
    video: null,
    canvas: null,
    captureBtn: null,
    numericInput: null,
    statusDot: null,
    statusText: null,
    errorMessage: null,
    latitude: null,
    longitude: null,
    valueDisplay: null
  };

  // Initialize
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheElements();
    await openDatabase();
    await startCamera();
    await getLocation();
    bindEvents();
    updateUI('idle');
  }

  function cacheElements() {
    elements.video = document.getElementById('camera-preview');
    elements.canvas = document.getElementById('capture-canvas');
    elements.captureBtn = document.getElementById('save-btn');
    elements.numericInput = document.getElementById('numeric-value');
    elements.statusDot = document.getElementById('status-dot');
    elements.statusText = document.getElementById('status-text');
    elements.errorMessage = document.getElementById('error-message');
    elements.latitude = document.getElementById('latitude-display');
    elements.longitude = document.getElementById('longitude-display');
    elements.valueDisplay = document.getElementById('value-display');
  }

  // IndexedDB Operations
  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const database = event.target.result;

        if (!database.objectStoreNames.contains('readings')) {
          const readingStore = database.createObjectStore('readings', { keyPath: 'id' });
          readingStore.createIndex('sync_status', 'sync_status', { unique: false });
          readingStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!database.objectStoreNames.contains('sync_queue')) {
          database.createObjectStore('sync_queue', { keyPath: 'id' });
        }
      };
    });
  }

  function saveToIndexedDB(reading) {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = db.transaction(['readings', 'sync_queue'], 'readwrite');
      const readingsStore = transaction.objectStore('readings');
      const queueStore = transaction.objectStore('sync_queue');

      const readingRequest = readingsStore.put(reading);
      const queueRequest = queueStore.put({
        id: reading.id,
        reading_id: reading.id,
        attempts: 0,
        last_attempt: null
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function getPendingReadings() {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = db.transaction(['readings'], 'readonly');
      const store = transaction.objectStore('readings');
      const index = store.index('sync_status');
      const request = index.getAll(IDBKeyRange.only(SYNC_STATUS.PENDING));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function updateReadingStatus(id, status) {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = db.transaction(['readings'], 'readwrite');
      const store = transaction.objectStore('readings');

      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const reading = getRequest.result;
        if (reading) {
          reading.sync_status = status;
          if (status === SYNC_STATUS.FAILED) {
            reading.sync_attempts = (reading.sync_attempts || 0) + 1;
          }
          store.put(reading);
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // Camera Operations
  async function startCamera() {
    try {
      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      };

      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      if (elements.video) {
        elements.video.srcObject = mediaStream;
        await elements.video.play();
      }

      return mediaStream;
    } catch (error) {
      handleError('Camera access denied or unavailable', error);
      throw error;
    }
  }

  function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
  }

  async function capturePhoto() {
    if (!elements.video || !elements.canvas) {
      throw new Error('Video or canvas element not available');
    }

    const video = elements.video;
    const canvas = elements.canvas;
    const context = canvas.getContext('2d');

    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/jpeg', 0.85);
    });
  }

  // GPS Operations
  async function getLocation() {
    if (!navigator.geolocation) {
      handleError('Geolocation not supported');
      return null;
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          currentPosition = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
          };
          updateLocationDisplay();
          resolve(currentPosition);
        },
        (error) => {
          let message = 'Location unavailable';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              message = 'Location permission denied';
              break;
            case error.POSITION_UNAVAILABLE:
              message = 'Location position unavailable';
              break;
            case error.TIMEOUT:
              message = 'Location request timed out';
              break;
          }
          handleError(message, error);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    });
  }

  function updateLocationDisplay() {
    if (elements.latitude && elements.longitude && currentPosition) {
      elements.latitude.textContent = formatCoordinate(currentPosition.latitude, 'N', 'S');
      elements.longitude.textContent = formatCoordinate(currentPosition.longitude, 'E', 'W');
    }
  }

  function formatCoordinate(value, positive, negative) {
    const formatted = Math.abs(value).toFixed(6);
    const direction = value >= 0 ? positive : negative;
    return `${formatted}°${direction}`;
  }

  // Input Validation
  function validateNumericInput(value) {
    const num = parseFloat(value);
    return !isNaN(num) && isFinite(num);
  }

  function validateRange(value, min, max) {
    const num = parseFloat(value);
    return num >= min && num <= max;
  }

  // API Operations
  async function submitReading(reading) {
    const response = await fetch(`${API_BASE}/readings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reading)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async function syncPendingReadings() {
    const pending = await getPendingReadings();
    if (!pending || pending.length === 0) {
      return { synced: 0, failed: 0 };
    }

    let synced = 0;
    let failed = 0;

    for (const reading of pending) {
      try {
        await submitReading(reading);
        await updateReadingStatus(reading.id, SYNC_STATUS.SYNCED);
        synced++;
      } catch (error) {
        await updateReadingStatus(reading.id, SYNC_STATUS.FAILED);
        failed++;
      }
    }

    return { synced, failed };
  }

  // Generate UUID v5 (SHA-256 based)
  async function generateUUIDv5(namespace, name) {
    const namespaceBytes = stringToBytes(namespace);
    const nameBytes = stringToBytes(name);
    const combined = new Uint8Array(namespaceBytes.length + nameBytes.length);
    combined.set(namespaceBytes);
    combined.set(nameBytes, namespaceBytes.length);

    const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
    const hashBytes = new Uint8Array(hashBuffer);

    // Set version (5) and variant (8, 9, A, B)
    hashBytes[6] = (hashBytes[6] & 0x0f) | 0x50;
    hashBytes[8] = (hashBytes[8] & 0x3f) | 0x80;

    const hex = bytesToHex(hashBytes);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  function stringToBytes(str) {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      bytes[i] = str.charCodeAt(i);
    }
    return bytes;
  }

  function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Event Handlers
  async function handleCapture() {
    const numericValue = elements.numericInput?.value;

    // Validate input
    if (!validateNumericInput(numericValue)) {
      handleError('Please enter a valid numeric value');
      return;
    }

    updateUI('saving');

    try {
      // Capture photo
      const photoBlob = await capturePhoto();
      const photoBase64 = await blobToBase64(photoBlob);

      // Prepare reading data
      const timestamp = new Date().toISOString();
      const dedupeKey = `${timestamp}${currentPosition?.latitude || 0}${currentPosition?.longitude || 0}`;
      const id = await generateUUIDv5('terminus-field', dedupeKey);

      const reading = {
        id,
        tenant: 'default',
        photo: photoBase64,
        latitude: currentPosition?.latitude || null,
        longitude: currentPosition?.longitude || null,
        numeric_value: parseFloat(numericValue),
        timestamp,
        sync_status: SYNC_STATUS.PENDING,
        sync_attempts: 0,
        created_at: timestamp
      };

      // Try to submit to API
      try {
        const result = await submitReading(reading);
        updateUI('saved');
        resetForm();
      } catch (apiError) {
        // Store locally if API fails (offline mode)
        await saveToIndexedDB(reading);
        updateUI('saved');
        resetForm();
      }

    } catch (error) {
      handleError('Failed to capture reading', error);
      updateUI('error');
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function resetForm() {
    if (elements.numericInput) {
      elements.numericInput.value = '';
    }
    if (elements.valueDisplay) {
      elements.valueDisplay.textContent = '—';
    }
  }

  // UI Updates
  function updateUI(state) {
    if (!elements.statusDot || !elements.statusText) return;

    const states = {
      idle: { color: 'var(--color-surface-muted, #1a1e24)', text: 'Ready' },
      saving: { color: '#f5a623', text: 'Saving...' },
      saved: { color: '#22c55e', text: 'Saved' },
      error: { color: '#ef4444', text: 'Error' }
    };

    const current = states[state] || states.idle;
    elements.statusDot.style.backgroundColor = current.color;
    elements.statusText.textContent = current.text;

    // Pulse animation for saving state
    if (state === 'saving') {
      elements.statusDot.classList.add('pulse');
    } else {
      elements.statusDot.classList.remove('pulse');
    }
  }

  function handleError(message, error) {
    console.error('[Capture Error]', message, error);

    if (elements.errorMessage) {
      elements.errorMessage.textContent = message;
      elements.errorMessage.classList.add('visible');

      setTimeout(() => {
        elements.errorMessage.classList.remove('visible');
      }, 5000);
    }

    updateUI('error');
  }

  function bindEvents() {
    if (elements.captureBtn) {
      elements.captureBtn.addEventListener('click', handleCapture);
    }

    if (elements.numericInput) {
      elements.numericInput.addEventListener('input', (e) => {
        const value = e.target.value;
        if (elements.valueDisplay) {
          elements.valueDisplay.textContent = validateNumericInput(value) ? value : '—';
        }
      });

      elements.numericInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          handleCapture();
        }
      });
    }

    // Handle visibility change for sync
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        await syncPendingReadings();
      }
    });

    // Handle online status
    window.addEventListener('online', async () => {
      await syncPendingReadings();
    });
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    stopCamera();
  });

  // Expose sync function for service worker
  window.terminusSync = syncPendingReadings;
  window.terminusGetPending = getPendingReadings;

})();
