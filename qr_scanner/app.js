(function () {
  var config = window.QR_SCANNER_CONFIG || {};
  var html5QrCode = null;
  var scannerActive = false;
  var lookupInFlight = false;
  var lastHandledId = '';

  var elements = {
    modePill: document.getElementById('mode-pill'),
    statusBanner: document.getElementById('status-banner'),
    startButton: document.getElementById('start-scan'),
    stopButton: document.getElementById('stop-scan'),
    scanAgainButton: document.getElementById('scan-again'),
    lookupForm: document.getElementById('lookup-form'),
    manualId: document.getElementById('manual-id'),
    resultPanel: document.getElementById('result-panel'),
    resultEmpty: document.getElementById('result-empty'),
    resultContent: document.getElementById('result-content'),
    resultName: document.getElementById('result-name'),
    resultId: document.getElementById('result-id'),
    resultFields: document.getElementById('result-fields')
  };

  function setStatus(message, tone) {
    elements.statusBanner.textContent = message;
    elements.statusBanner.classList.remove('is-error', 'is-success');
    if (tone === 'error') elements.statusBanner.classList.add('is-error');
    if (tone === 'success') elements.statusBanner.classList.add('is-success');
  }

  function setModeLabel() {
    if (config.apiBaseUrl) {
      elements.modePill.textContent = 'Live backend';
      return;
    }
    if (config.useMockData) {
      elements.modePill.textContent = 'Mock data';
      return;
    }
    elements.modePill.textContent = 'Needs setup';
  }

  function setButtonState() {
    elements.startButton.disabled = scannerActive || typeof Html5Qrcode === 'undefined';
    elements.stopButton.disabled = !scannerActive;
  }

  function clearResult() {
    elements.resultFields.innerHTML = '';
    elements.resultName.textContent = '-';
    elements.resultId.textContent = '-';
    elements.resultContent.hidden = true;
    elements.resultPanel.classList.add('is-empty');
    elements.resultEmpty.hidden = false;
  }

  function addResultRow(label, value) {
    if (!value) return;
    var row = document.createElement('div');
    row.className = 'result-row';

    var dt = document.createElement('dt');
    dt.textContent = label;

    var dd = document.createElement('dd');
    dd.textContent = value;

    row.appendChild(dt);
    row.appendChild(dd);
    elements.resultFields.appendChild(row);
  }

  function renderResult(data) {
    if (!data || !data.found) {
      clearResult();
      return;
    }

    elements.resultName.textContent = data.displayName || 'Participant found';
    elements.resultId.textContent = data.participantId || '';
    elements.resultFields.innerHTML = '';
    addResultRow('Food choice', data.foodChoice);
    addResultRow('Dietary description', data.dietaryDescription);
    addResultRow('Allergens', data.allergens);
    addResultRow('Notes', data.notes);

    elements.resultPanel.classList.remove('is-empty');
    elements.resultEmpty.hidden = true;
    elements.resultContent.hidden = false;
  }

  function normalizeParticipantId(rawValue) {
    var value = (rawValue || '').trim();
    if (!value) return '';

    if (/^https?:\/\//i.test(value)) {
      try {
        var parsed = new URL(value);
        return (
          parsed.searchParams.get(config.idParamName || 'participantId') ||
          parsed.searchParams.get('participantId') ||
          parsed.searchParams.get('id') ||
          parsed.searchParams.get('code') ||
          parsed.pathname.split('/').filter(Boolean).pop() ||
          ''
        ).trim();
      } catch (error) {
        return value;
      }
    }

    return value;
  }

  function buildLookupUrl(participantId) {
    var url = new URL(config.apiBaseUrl);
    url.searchParams.set(config.idParamName || 'participantId', participantId);
    if (config.apiToken) {
      url.searchParams.set(config.tokenParamName || 'token', config.apiToken);
    }
    return url.toString();
  }

  function fetchParticipant(participantId) {
    if (config.apiBaseUrl) {
      return fetch(buildLookupUrl(participantId), {
        method: 'GET',
        cache: 'no-store'
      }).then(function (response) {
        if (!response.ok) {
          throw new Error('Backend request failed with status ' + response.status + '.');
        }
        return response.json();
      });
    }

    if (config.useMockData) {
      var mock = config.mockData && config.mockData[participantId];
      return Promise.resolve(mock || { found: false, participantId: participantId });
    }

    return Promise.reject(
      new Error('No backend configured. Update qr_scanner/config.js with your Apps Script URL.')
    );
  }

  function handleLookup(participantId, source) {
    var normalizedId = normalizeParticipantId(participantId);

    if (!normalizedId) {
      setStatus('The scanned code did not contain a participant ID.', 'error');
      return;
    }

    if (lookupInFlight) return;
    lookupInFlight = true;
    lastHandledId = normalizedId;
    setStatus('Looking up ' + normalizedId + '...', null);

    fetchParticipant(normalizedId)
      .then(function (data) {
        if (!data || !data.found) {
          clearResult();
          setStatus('No participant found for ID ' + normalizedId + '.', 'error');
          return;
        }

        renderResult(data);
        setStatus(
          'Loaded ' + (data.displayName || normalizedId) + ' from ' + (source || 'lookup') + '.',
          'success'
        );
      })
      .catch(function (error) {
        clearResult();
        setStatus(error.message || 'Lookup failed.', 'error');
      })
      .finally(function () {
        lookupInFlight = false;
      });
  }

  function onScanSuccess(decodedText) {
    var normalizedId = normalizeParticipantId(decodedText);
    if (!normalizedId || normalizedId === lastHandledId) return;

    stopScanner()
      .catch(function () {})
      .finally(function () {
        elements.scanAgainButton.hidden = false;
        handleLookup(normalizedId, 'scanner');
      });
  }

  function onScanFailure() {}

  function pickCamera(cameras) {
    if (!Array.isArray(cameras) || cameras.length === 0) return null;

    var preferred = cameras.find(function (camera) {
      return /back|rear|environment/i.test(camera.label || '');
    });

    return preferred || cameras[0];
  }

  function startScanner() {
    if (scannerActive) return Promise.resolve();
    if (typeof Html5Qrcode === 'undefined') {
      setStatus('The QR scanner library did not load. Check your internet connection.', 'error');
      return Promise.resolve();
    }

    html5QrCode = html5QrCode || new Html5Qrcode('reader');

    setStatus('Requesting camera access...', null);
    return Html5Qrcode.getCameras()
      .then(function (cameras) {
        var camera = pickCamera(cameras);
        if (!camera) {
          throw new Error('No camera was found on this device.');
        }

        return html5QrCode.start(
          camera.id,
          {
            fps: 10,
            qrbox: { width: 240, height: 240 },
            aspectRatio: 1
          },
          onScanSuccess,
          onScanFailure
        );
      })
      .then(function () {
        scannerActive = true;
        elements.scanAgainButton.hidden = true;
        setButtonState();
        setStatus('Camera active. Point it at a participant QR code.', null);
      })
      .catch(function (error) {
        scannerActive = false;
        setButtonState();
        setStatus(
          (error && error.message) || 'Camera access failed. Try manual lookup instead.',
          'error'
        );
      });
  }

  function stopScanner() {
    if (!html5QrCode || !scannerActive) {
      scannerActive = false;
      setButtonState();
      return Promise.resolve();
    }

    return html5QrCode
      .stop()
      .then(function () {
        scannerActive = false;
        setButtonState();
        setStatus('Camera stopped.', null);
      })
      .catch(function () {
        scannerActive = false;
        setButtonState();
      });
  }

  function bindEvents() {
    elements.startButton.addEventListener('click', function () {
      startScanner();
    });

    elements.stopButton.addEventListener('click', function () {
      stopScanner();
    });

    elements.scanAgainButton.addEventListener('click', function () {
      lastHandledId = '';
      clearResult();
      startScanner();
    });

    elements.lookupForm.addEventListener('submit', function (event) {
      event.preventDefault();
      lastHandledId = '';
      handleLookup(elements.manualId.value, 'manual search');
    });
  }

  function init() {
    setModeLabel();
    setButtonState();
    clearResult();
    bindEvents();

    if (!config.apiBaseUrl && !config.useMockData) {
      setStatus('Add your Apps Script URL in qr_scanner/config.js before using this app.', 'error');
      return;
    }

    if (config.useMockData && !config.apiBaseUrl) {
      setStatus('Running in mock mode. Update config.js when your Google Sheets backend is ready.', null);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
