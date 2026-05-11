(function () {
  var config = window.QR_SCANNER_CONFIG || {};
  var html5QrCode = null;
  var scannerActive = false;
  var lookupInFlight = false;
  var scanLock = false;
  var lastHandledId = '';
  var scannedIds = {};
  var resultCache = {};
  var selectedImageFile = null;
  var SESSION_STORAGE_KEY = 'ga26_qr_session_v1';
  var THEME_STORAGE_KEY = 'ga26_qr_theme';
  var prefersDarkMq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var sessionOk = !config.apiBaseUrl;
  var sessionLockApplicable = false;
  var scannerPausedForResultModal = false;

  var elements = {
    modePill: document.getElementById('mode-pill'),
    statusBanner: document.getElementById('status-banner'),
    startButton: document.getElementById('start-scan'),
    stopButton: document.getElementById('stop-scan'),
    scanAgainButton: document.getElementById('scan-again'),
    scanGalleryButton: document.getElementById('scan-gallery'),
    qrImageInput: document.getElementById('qr-image-input'),
    lookupForm: document.getElementById('lookup-form'),
    manualId: document.getElementById('manual-id'),
    resultPanel: document.getElementById('result-panel'),
    resultEmpty: document.getElementById('result-empty'),
    resultContent: document.getElementById('result-content'),
    resultName: document.getElementById('result-name'),
    resultId: document.getElementById('result-id'),
    resultFields: document.getElementById('result-fields'),
    sessionGate: document.getElementById('session-gate'),
    sessionForm: document.getElementById('session-form'),
    sessionPassword: document.getElementById('session-password'),
    sessionFormError: document.getElementById('session-form-error'),
    sessionLockWrap: document.getElementById('session-lock-wrap'),
    sessionLockButton: document.getElementById('session-lock'),
    infoSigninTrigger: document.getElementById('info-signin-trigger'),
    infoLockTrigger: document.getElementById('info-lock-trigger'),
    infoResultTrigger: document.getElementById('info-result-trigger'),
    infoSigninDialog: document.getElementById('info-signin-dialog'),
    infoLockDialog: document.getElementById('info-lock-dialog'),
    infoResultDialog: document.getElementById('info-result-dialog'),
    loginSuccessDialog: document.getElementById('login-success-dialog'),
    duplicateScanDialog: document.getElementById('duplicate-scan-dialog'),
    resultModal: document.getElementById('result-modal'),
    resultModalClose: document.getElementById('result-modal-close'),
    modalResultName: document.getElementById('modal-result-name'),
    modalResultId: document.getElementById('modal-result-id'),
    modalResultFields: document.getElementById('modal-result-fields'),
    openResultModal: document.getElementById('open-result-modal'),
    statusBannerText: document.getElementById('status-banner-text'),
    sessionUnlockButton: document.getElementById('session-unlock'),
    appLoading: document.getElementById('app-loading'),
    appLoadingText: document.getElementById('app-loading-text'),
    scannerWorkspace: document.getElementById('scanner-workspace'),
    themeDarkSwitch: document.getElementById('theme-dark-switch'),
    themeFollowDevice: document.getElementById('theme-follow-device')
  };

  function getStoredColorScheme() {
    try {
      var v = localStorage.getItem(THEME_STORAGE_KEY);
      if (v === 'light' || v === 'dark') return v;
    } catch (e) {}
    return null;
  }

  function setStoredColorScheme(value) {
    try {
      if (value === null || value === undefined) {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, value);
      }
    } catch (e) {}
  }

  function effectiveColorScheme() {
    var s = getStoredColorScheme();
    if (s === 'light' || s === 'dark') return s;
    if (prefersDarkMq && typeof prefersDarkMq.matches === 'boolean') {
      return prefersDarkMq.matches ? 'dark' : 'light';
    }
    return 'dark';
  }

  function applyColorScheme() {
    var s = getStoredColorScheme();
    var root = document.documentElement;
    if (s === 'light') root.setAttribute('data-theme', 'light');
    else if (s === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
  }

  function syncThemeControls() {
    var input = elements.themeDarkSwitch;
    var btn = elements.themeFollowDevice;
    if (!input) return;
    input.checked = effectiveColorScheme() === 'dark';
    if (btn) {
      btn.hidden = getStoredColorScheme() === null;
    }
  }

  function wireTheme() {
    var input = elements.themeDarkSwitch;
    var btn = elements.themeFollowDevice;
    if (!input) return;
    input.addEventListener('change', function () {
      setStoredColorScheme(input.checked ? 'dark' : 'light');
      applyColorScheme();
      syncThemeControls();
    });
    if (btn) {
      btn.addEventListener('click', function () {
        setStoredColorScheme(null);
        applyColorScheme();
        syncThemeControls();
      });
    }
    if (prefersDarkMq && prefersDarkMq.addEventListener) {
      prefersDarkMq.addEventListener('change', function () {
        if (getStoredColorScheme() === null) syncThemeControls();
      });
    } else if (prefersDarkMq && prefersDarkMq.addListener) {
      prefersDarkMq.addListener(function () {
        if (getStoredColorScheme() === null) syncThemeControls();
      });
    }
  }

  var SESSION_UNLOCK_LABEL = 'Unlock';
  var SESSION_UNLOCK_LOADING = 'Signing in…';

  function setFullScreenLoading(active, message) {
    if (!elements.appLoading) return;
    var on = !!active;
    if (on) {
      if (elements.appLoadingText) {
        elements.appLoadingText.textContent = message || '';
      }
      elements.appLoading.hidden = false;
      elements.appLoading.setAttribute('aria-hidden', 'false');
      document.body.classList.add('app-loading-on');
    } else {
      elements.appLoading.hidden = true;
      elements.appLoading.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('app-loading-on');
    }
  }

  function setStatus(message, tone, loading) {
    loading = !!loading;
    elements.statusBanner.classList.remove('is-error', 'is-success');
    if (!loading) {
      if (tone === 'error') elements.statusBanner.classList.add('is-error');
      if (tone === 'success') elements.statusBanner.classList.add('is-success');
    }
    elements.statusBanner.setAttribute('aria-busy', loading ? 'true' : 'false');
    if (loading) {
      elements.statusBanner.setAttribute('aria-hidden', 'true');
    } else {
      elements.statusBanner.removeAttribute('aria-hidden');
    }
    if (elements.statusBannerText) {
      elements.statusBannerText.textContent = message;
    } else {
      elements.statusBanner.textContent = message;
    }
    setFullScreenLoading(loading, message);
  }

  function setSessionLoginLoading(active) {
    if (elements.sessionUnlockButton) {
      elements.sessionUnlockButton.disabled = !!active;
      elements.sessionUnlockButton.textContent = active ? SESSION_UNLOCK_LOADING : SESSION_UNLOCK_LABEL;
    }
    if (elements.sessionPassword) {
      elements.sessionPassword.disabled = !!active;
    }
  }

  function setModeLabel() {
    if (config.apiBaseUrl) {
      elements.modePill.textContent =
        sessionLockApplicable && sessionOk ? 'Live · signed in' : 'Live backend';
      return;
    }
    if (config.useMockData) {
      elements.modePill.textContent = 'Mock data';
      return;
    }
    elements.modePill.textContent = 'Needs setup';
  }

  function setButtonState() {
    var sessionLocked = config.apiBaseUrl && !sessionOk;
    elements.startButton.disabled =
      sessionLocked ||
      scannerActive ||
      lookupInFlight ||
      typeof Html5Qrcode === 'undefined';
    elements.stopButton.disabled = !scannerActive;
    if (elements.manualId) {
      elements.manualId.disabled = sessionLocked || lookupInFlight;
    }
    var lookupSubmit =
      elements.lookupForm && elements.lookupForm.querySelector('button[type="submit"]');
    if (lookupSubmit) {
      lookupSubmit.disabled = sessionLocked || lookupInFlight;
    }
    if (elements.scanGalleryButton) {
      elements.scanGalleryButton.disabled =
        sessionLocked ||
        !selectedImageFile ||
        lookupInFlight ||
        scanLock ||
        typeof Html5Qrcode === 'undefined';
    }
  }

  function clearResult() {
    elements.resultFields.innerHTML = '';
    elements.resultName.textContent = '-';
    elements.resultId.textContent = '-';
    elements.resultContent.hidden = true;
    elements.resultPanel.classList.add('is-empty');
    elements.resultEmpty.hidden = false;
    if (elements.modalResultFields) elements.modalResultFields.innerHTML = '';
    if (elements.modalResultName) elements.modalResultName.textContent = '-';
    if (elements.modalResultId) elements.modalResultId.textContent = '-';
    if (elements.openResultModal) elements.openResultModal.hidden = true;
    if (elements.resultModal && elements.resultModal.open) {
      elements.resultModal.close();
    }
  }

  function addResultRow(label, value, dayClass, container) {
    if (!value) return;
    var target = container || elements.resultFields;
    if (!target) return;
    var row = document.createElement('div');
    row.className = 'result-row' + (dayClass ? ' ' + dayClass : '');

    var dt = document.createElement('dt');
    dt.textContent = label;

    var dd = document.createElement('dd');
    dd.textContent = value;

    row.appendChild(dt);
    row.appendChild(dd);
    target.appendChild(row);
  }

  function fillResultBlocks(data) {
    var display =
      data.displayName || data.participantId || 'Participant found';
    var pid = data.participantId || '';

    elements.resultName.textContent = display;
    elements.resultId.textContent = pid;
    elements.resultFields.innerHTML = '';

    if (elements.modalResultName) elements.modalResultName.textContent = display;
    if (elements.modalResultId) elements.modalResultId.textContent = pid;
    if (elements.modalResultFields) elements.modalResultFields.innerHTML = '';

    var modalFields = elements.modalResultFields;

    function row(label, val, cls) {
      addResultRow(label, val, cls, elements.resultFields);
      addResultRow(label, val, cls, modalFields);
    }

    row('Friday lunch', data.fridayLunch, 'result-row--friday');
    row('Friday dinner', data.fridayDinner, 'result-row--friday');
    row('Saturday lunch', data.saturdayLunch, 'result-row--saturday');
    row('Saturday dinner', data.saturdayDinner, 'result-row--saturday');
    row('Sunday lunch', data.sundayLunch, 'result-row--sunday');
    row('Sunday dinner', data.sundayDinner, 'result-row--sunday');
    row('Food choice', data.foodChoice);
    row('Dietary description', data.dietaryDescription);
    row('Allergens', data.allergens);
    row('Notes', data.notes);
  }

  function pauseScannerForResultModal() {
    if (!html5QrCode || !scannerActive || scannerPausedForResultModal) return;
    try {
      if (typeof html5QrCode.pause === 'function') {
        html5QrCode.pause(true);
        scannerPausedForResultModal = true;
        return;
      }
    } catch (e) {}
    scannerPausedForResultModal = false;
    stopScanner().catch(function () {});
  }

  function resumeScannerAfterResultModalIfNeeded() {
    if (!scannerPausedForResultModal) return;
    scannerPausedForResultModal = false;
    var sessionLocked = config.apiBaseUrl && !sessionOk;
    if (sessionLocked) return;
    if (!html5QrCode || typeof html5QrCode.resume !== 'function') return;
    if (!scannerActive) return;
    html5QrCode
      .resume()
      .then(function () {
        scanLock = false;
        setButtonState();
        setStatus('Camera active. Hold the QR inside the frame.', null, false);
      })
      .catch(function () {
        scannerActive = false;
        scanLock = false;
        setButtonState();
      });
  }

  function openResultModalDialog() {
    if (!elements.resultModal) return;
    var hasMeta =
      elements.modalResultName &&
      elements.modalResultName.textContent &&
      elements.modalResultName.textContent !== '-';
    var hasRows =
      elements.modalResultFields && elements.modalResultFields.children.length > 0;
    if (!hasMeta && !hasRows) return;

    pauseScannerForResultModal();
    scanLock = false;

    try {
      if (!elements.resultModal.open) {
        elements.resultModal.showModal();
      }
    } catch (e) {}
  }

  function renderResult(data) {
    if (!data || !data.found) {
      clearResult();
      return;
    }

    fillResultBlocks(data);

    elements.resultPanel.classList.remove('is-empty');
    elements.resultEmpty.hidden = true;
    elements.resultContent.hidden = false;
    if (elements.openResultModal) elements.openResultModal.hidden = false;

    openResultModalDialog();
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

  function getStoredSessionToken() {
    try {
      return (sessionStorage.getItem(SESSION_STORAGE_KEY) || '').trim();
    } catch (e) {
      return '';
    }
  }

  function setStoredSessionToken(token) {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, token);
    } catch (e) {}
  }

  function clearStoredSessionToken() {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {}
  }

  function sessionParamName() {
    return config.sessionParamName || 'sessionToken';
  }

  function buildStatusUrl() {
    var url = new URL(config.apiBaseUrl);
    url.searchParams.set('action', 'status');
    return url.toString();
  }

  function buildValidateUrl(token) {
    var url = new URL(config.apiBaseUrl);
    url.searchParams.set('action', 'validate');
    url.searchParams.set(sessionParamName(), token);
    return url.toString();
  }

  function buildLookupUrl(participantId) {
    var url = new URL(config.apiBaseUrl);
    url.searchParams.set(config.idParamName || 'participantId', participantId);
    if (config.apiToken) {
      url.searchParams.set(config.tokenParamName || 'token', config.apiToken);
    }
    var st = getStoredSessionToken();
    if (st) {
      url.searchParams.set(sessionParamName(), st);
    }
    return url.toString();
  }

  function setSessionFormError(message) {
    if (!elements.sessionFormError) return;
    if (message) {
      elements.sessionFormError.textContent = message;
      elements.sessionFormError.hidden = false;
    } else {
      elements.sessionFormError.textContent = '';
      elements.sessionFormError.hidden = true;
    }
  }

  function syncWorkspaceGate() {
    if (!elements.scannerWorkspace) return;
    var api = !!config.apiBaseUrl;
    var showWorkspace = !api || sessionOk;
    elements.scannerWorkspace.hidden = !showWorkspace;
    elements.scannerWorkspace.setAttribute('aria-hidden', showWorkspace ? 'false' : 'true');
  }

  function showSessionGate(message) {
    sessionOk = false;
    if (elements.sessionGate) elements.sessionGate.hidden = false;
    if (elements.sessionLockWrap) elements.sessionLockWrap.hidden = true;
    setSessionFormError(message || '');
    setSessionLoginLoading(false);
    setStatus(message || 'Enter the staff password to enable lookups.', 'error', false);
    setModeLabel();
    setButtonState();
    syncWorkspaceGate();
    if (elements.sessionPassword) {
      try {
        elements.sessionPassword.focus();
      } catch (e) {}
    }
  }

  function openLoginSuccessDialog() {
    if (!elements.loginSuccessDialog) return;
    try {
      elements.loginSuccessDialog.showModal();
    } catch (e) {}
  }

  function openDuplicateScanDialog(participantId) {
    setStatus('QR code ' + participantId + ' was already scanned.', 'error', false);
    if (!elements.duplicateScanDialog) return;
    try {
      if (!elements.duplicateScanDialog.open) {
        elements.duplicateScanDialog.showModal();
      }
    } catch (e) {}
  }

  function hideSessionGateAfterLogin() {
    sessionOk = true;
    if (elements.sessionGate) elements.sessionGate.hidden = true;
    if (elements.sessionPassword) elements.sessionPassword.value = '';
    setSessionFormError('');
    if (elements.sessionLockWrap) {
      elements.sessionLockWrap.hidden = !sessionLockApplicable;
    }
    setModeLabel();
    setStatus('Ready to scan.', null, false);
    setButtonState();
    syncWorkspaceGate();
  }

  function beginSessionBootstrap() {
    fetch(buildStatusUrl(), { method: 'GET', cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Backend status failed with status ' + response.status + '.');
        }
        return response.json();
      })
      .then(function (data) {
        if (!data || !data.ok) {
          throw new Error('Invalid status response from backend.');
        }
        if (!data.sessionAuthRequired) {
          sessionLockApplicable = false;
          sessionOk = true;
          if (elements.sessionGate) elements.sessionGate.hidden = true;
          if (elements.sessionLockWrap) elements.sessionLockWrap.hidden = true;
          setStatus('Ready to scan.', null, false);
          setModeLabel();
          setButtonState();
          syncWorkspaceGate();
          return;
        }

        sessionLockApplicable = true;
        var token = getStoredSessionToken();
        if (!token) {
          showSessionGate('');
          return Promise.resolve();
        }

        return fetch(buildValidateUrl(token), { method: 'GET', cache: 'no-store' })
          .then(function (r) {
            return r.json();
          })
          .then(function (v) {
            if (v && v.sessionValid) {
              hideSessionGateAfterLogin();
            } else {
              clearStoredSessionToken();
              showSessionGate('Session expired. Sign in again.');
            }
            setModeLabel();
            setButtonState();
          });
      })
      .catch(function (error) {
        sessionOk = false;
        setButtonState();
        showSessionGate(error.message || 'Could not verify session with backend.');
      });
  }

  function postSessionLogin(password) {
    var body = new URLSearchParams();
    body.set('action', 'login');
    body.set('password', password);
    return fetch(config.apiBaseUrl, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    }).then(function (response) {
      if (!response.ok) {
        throw new Error('Login request failed with status ' + response.status + '.');
      }
      return response.json();
    });
  }

  function getReaderSize() {
    var reader = document.getElementById('reader');
    var width = reader ? reader.clientWidth : 320;
    var height = reader ? reader.clientHeight : 320;
    return {
      width: width || 320,
      height: height || 320
    };
  }

  function getQrBoxSize() {
    var size = getReaderSize();
    var edge = Math.floor(Math.min(size.width, size.height) * 0.68);
    return {
      width: Math.max(180, Math.min(edge, 280)),
      height: Math.max(180, Math.min(edge, 280))
    };
  }

  function getVideoConstraints() {
    return {
      facingMode: 'environment',
      width: { ideal: 1280 },
      height: { ideal: 720 }
    };
  }

  function fetchParticipant(participantId) {
    if (resultCache[participantId]) {
      return Promise.resolve(resultCache[participantId]);
    }

    if (config.apiBaseUrl) {
      return fetch(buildLookupUrl(participantId), {
        method: 'GET',
        cache: 'no-store'
      }).then(function (response) {
        if (!response.ok) {
          throw new Error('Backend request failed with status ' + response.status + '.');
        }
        return response.json();
      }).then(function (data) {
        if (data && data.code === 'SESSION_REQUIRED') {
          clearStoredSessionToken();
          sessionOk = false;
          showSessionGate(data.error || 'Session required or expired.');
          return data;
        }
        if (data && data.found) resultCache[participantId] = data;
        return data;
      });
    }

    if (config.useMockData) {
      var mock = config.mockData && config.mockData[participantId];
      if (mock && mock.found) resultCache[participantId] = mock;
      return Promise.resolve(mock || { found: false, participantId: participantId });
    }

    return Promise.reject(
      new Error('No backend configured. Update qr_scanner/config.js with your Apps Script URL.')
    );
  }

  function handleLookup(participantId, source) {
    var normalizedId = normalizeParticipantId(participantId);

    if (!normalizedId) {
      setStatus('The scanned code did not contain a participant ID.', 'error', false);
      return;
    }

    if (lookupInFlight) return;
    lookupInFlight = true;
    lastHandledId = normalizedId;
    setStatus('Looking up ' + normalizedId + '…', null, true);

    fetchParticipant(normalizedId)
      .then(function (data) {
        if (!data || !data.found) {
          clearResult();
          if (data && data.code === 'SESSION_REQUIRED') {
            return;
          }
          setStatus('No participant found for ID ' + normalizedId + '.', 'error', false);
          return;
        }

        if (source === 'scanner' || source === 'gallery image') {
          scannedIds[normalizedId] = true;
        }
        renderResult(data);
        setStatus(
          'Loaded ' +
            (data.displayName || data.participantId || normalizedId) +
            ' from ' +
            (source || 'lookup') +
            '.',
          'success',
          false
        );
      })
      .catch(function (error) {
        clearResult();
        setStatus(error.message || 'Lookup failed.', 'error', false);
      })
      .finally(function () {
        lookupInFlight = false;
        setButtonState();
      });
  }

  function scanSelectedImage(file) {
    if (!file) return;
    if (typeof Html5Qrcode === 'undefined') {
      setStatus('The QR scanner library did not load. Check your internet connection.', 'error', false);
      return;
    }

    html5QrCode = html5QrCode || new Html5Qrcode('reader');
    setStatus('Reading QR from selected image…', null, true);
    scanLock = true;

    stopScanner()
      .catch(function () {})
      .finally(function () {
        html5QrCode.scanFile(file, true)
          .then(function (decodedText) {
            var normalizedId = normalizeParticipantId(decodedText);
            if (!normalizedId) {
              throw new Error('The selected image did not contain a participant QR code.');
            }

            lastHandledId = normalizedId;
            elements.scanAgainButton.hidden = false;
            if (scannedIds[normalizedId]) {
              scanLock = false;
              openDuplicateScanDialog(normalizedId);
              return;
            }
            setStatus('QR detected in image. Looking up ' + normalizedId + '…', null, true);
            handleLookup(normalizedId, 'gallery image');
          })
          .catch(function (error) {
            scanLock = false;
            setStatus(
              (error && error.message) || 'Could not read a QR code from the selected image.',
              'error',
              false
            );
          })
          .finally(function () {
            selectedImageFile = null;
            if (elements.qrImageInput) elements.qrImageInput.value = '';
            setButtonState();
          });
      });
  }

  function onScanSuccess(decodedText) {
    var normalizedId = normalizeParticipantId(decodedText);
    if (!normalizedId || normalizedId === lastHandledId || scanLock) return;

    if (scannedIds[normalizedId]) {
      scanLock = true;
      lastHandledId = normalizedId;
      elements.scanAgainButton.hidden = false;
      openDuplicateScanDialog(normalizedId);
      return;
    }

    scanLock = true;
    lastHandledId = normalizedId;
    elements.scanAgainButton.hidden = false;
    setStatus('QR detected. Looking up ' + normalizedId + '…', null, true);
    handleLookup(normalizedId, 'scanner');
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
      setStatus('The QR scanner library did not load. Check your internet connection.', 'error', false);
      return Promise.resolve();
    }

    html5QrCode = html5QrCode || new Html5Qrcode('reader');

    setStatus('Requesting camera access…', null, true);
    return Html5Qrcode.getCameras()
      .then(function (cameras) {
        var camera = pickCamera(cameras);
        if (!camera) {
          throw new Error('No camera was found on this device.');
        }

        setStatus('Starting camera…', null, true);

        return html5QrCode.start(
          camera.id,
          {
            fps: 20,
            qrbox: getQrBoxSize(),
            aspectRatio: 1,
            disableFlip: true,
            videoConstraints: getVideoConstraints()
          },
          onScanSuccess,
          onScanFailure
        );
      })
      .then(function () {
        scannerActive = true;
        scanLock = false;
        elements.scanAgainButton.hidden = true;
        setButtonState();
        setStatus('Camera active. Hold the QR inside the frame.', null, false);
      })
      .catch(function (error) {
        scannerActive = false;
        scanLock = false;
        setButtonState();
        setStatus(
          (error && error.message) || 'Camera access failed. Try manual lookup instead.',
          'error',
          false
        );
      });
  }

  function stopScanner() {
    scannerPausedForResultModal = false;
    if (!html5QrCode || !scannerActive) {
      scannerActive = false;
      scanLock = false;
      setButtonState();
      return Promise.resolve();
    }

    return html5QrCode
      .stop()
      .then(function () {
        scannerActive = false;
        scanLock = false;
        setButtonState();
        setStatus('Camera stopped.', null, false);
      })
      .catch(function () {
        scannerActive = false;
        scanLock = false;
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
      scanLock = false;
      lastHandledId = '';
      clearResult();
      startScanner();
    });

    elements.lookupForm.addEventListener('submit', function (event) {
      event.preventDefault();
      lastHandledId = '';
      handleLookup(elements.manualId.value, 'manual search');
    });

    elements.qrImageInput.addEventListener('change', function (event) {
      selectedImageFile = event.target.files && event.target.files[0] ? event.target.files[0] : null;
      setButtonState();
      if (selectedImageFile) {
        setStatus('Image selected. Tap "Scan selected image" to start.', null, false);
      }
    });

    elements.scanGalleryButton.addEventListener('click', function () {
      scanSelectedImage(selectedImageFile);
    });

    if (elements.sessionForm) {
      elements.sessionForm.addEventListener('submit', function (event) {
        event.preventDefault();
        setSessionFormError('');
        var pw = (elements.sessionPassword && elements.sessionPassword.value) || '';
        setSessionLoginLoading(true);
        setStatus('Signing in…', null, true);
        postSessionLogin(pw)
          .then(function (data) {
            if (!data || !data.ok) {
              setSessionFormError((data && data.error) || 'Login failed.');
              setStatus('Sign-in failed. Check the password or try again.', 'error', false);
              return;
            }
            if (data.sessionToken) {
              setStoredSessionToken(data.sessionToken);
            }
            if (data.sessionToken || data.sessionAuthRequired === false) {
              hideSessionGateAfterLogin();
              openLoginSuccessDialog();
            }
          })
          .catch(function (error) {
            setSessionFormError(error.message || 'Network error.');
            setStatus(error.message || 'Network error.', 'error', false);
          })
          .finally(function () {
            setSessionLoginLoading(false);
          });
      });
    }

    if (elements.sessionLockButton) {
      elements.sessionLockButton.addEventListener('click', function () {
        clearStoredSessionToken();
        sessionOk = false;
        clearResult();
        stopScanner().catch(function () {});
        showSessionGate('');
        setModeLabel();
        setButtonState();
      });
    }

    function wireInfoTrigger(trigger, dialog) {
      if (!trigger || !dialog) return;
      trigger.addEventListener('click', function () {
        try {
          dialog.showModal();
        } catch (e) {}
        trigger.setAttribute('aria-expanded', 'true');
      });
      dialog.addEventListener('close', function () {
        trigger.setAttribute('aria-expanded', 'false');
      });
    }

    function attachDialogBackdropAndOk(dialog) {
      if (!dialog) return;
      dialog.addEventListener('click', function (e) {
        if (e.target === dialog) dialog.close();
      });
      var okButtons = dialog.querySelectorAll('[data-close-dialog]');
      Array.prototype.forEach.call(okButtons, function (btn) {
        btn.addEventListener('click', function () {
          dialog.close();
        });
      });
    }

    wireInfoTrigger(elements.infoSigninTrigger, elements.infoSigninDialog);
    wireInfoTrigger(elements.infoLockTrigger, elements.infoLockDialog);
    wireInfoTrigger(elements.infoResultTrigger, elements.infoResultDialog);
    attachDialogBackdropAndOk(elements.infoSigninDialog);
    attachDialogBackdropAndOk(elements.infoLockDialog);
    attachDialogBackdropAndOk(elements.infoResultDialog);
    attachDialogBackdropAndOk(elements.loginSuccessDialog);
    attachDialogBackdropAndOk(elements.duplicateScanDialog);

    if (elements.resultModal) {
      elements.resultModal.addEventListener('close', function () {
        resumeScannerAfterResultModalIfNeeded();
      });
      elements.resultModal.addEventListener('click', function (e) {
        if (e.target === elements.resultModal) elements.resultModal.close();
      });
    }
    if (elements.resultModalClose) {
      elements.resultModalClose.addEventListener('click', function () {
        if (elements.resultModal) elements.resultModal.close();
      });
    }
    if (elements.openResultModal) {
      elements.openResultModal.addEventListener('click', function () {
        openResultModalDialog();
      });
    }

    wireTheme();
  }

  function init() {
    applyColorScheme();
    syncThemeControls();
    setModeLabel();
    setButtonState();
    clearResult();
    bindEvents();

    if (!config.apiBaseUrl && !config.useMockData) {
      syncWorkspaceGate();
      setStatus('Add your Apps Script URL in qr_scanner/config.js before using this app.', 'error', false);
      return;
    }

    if (config.useMockData && !config.apiBaseUrl) {
      syncWorkspaceGate();
      setStatus('Running in mock mode. Update config.js when your Google Sheets backend is ready.', null, false);
      return;
    }

    if (config.apiBaseUrl) {
      sessionOk = false;
      syncWorkspaceGate();
      setStatus('Checking session…', null, true);
      setButtonState();
      beginSessionBootstrap();
      return;
    }

    syncWorkspaceGate();
    setStatus('Ready to scan.', null, false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
