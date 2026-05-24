/*
 * TTS widget — Web Speech API wrapper for MACONA blog posts.
 * Free, no API key, uses the browser's built-in speechSynthesis.
 * Auto-injects on pages with <article class="article-body">.
 * Chunks text into sentences so Chrome doesn't truncate at ~15s.
 */
(function () {
  'use strict';

  if (!('speechSynthesis' in window)) {
    return;
  }

  function ready(fn) {
    if (document.readyState !== 'loading') { fn(); }
    else { document.addEventListener('DOMContentLoaded', fn); }
  }

  ready(function () {
    var article = document.querySelector('article.article-body');
    if (!article) { return; }

    var widget = document.createElement('div');
    widget.className = 'tts-widget';
    widget.setAttribute('role', 'region');
    widget.setAttribute('aria-label', 'Listen to this article');
    widget.innerHTML =
      '<span class="tts-label"><span class="tts-icon" aria-hidden="true">&#9835;</span> Listen to this post</span>' +
      '<button type="button" class="tts-btn tts-play" aria-label="Play"><span class="tts-icon" aria-hidden="true">&#9658;</span> Play</button>' +
      '<button type="button" class="tts-btn tts-pause" aria-label="Pause" disabled><span class="tts-icon" aria-hidden="true">&#10074;&#10074;</span> Pause</button>' +
      '<button type="button" class="tts-btn tts-stop" aria-label="Stop" disabled><span class="tts-icon" aria-hidden="true">&#9632;</span> Stop</button>' +
      '<label class="tts-rate">Speed ' +
      '<select class="tts-rate-select" aria-label="Playback speed">' +
      '<option value="0.8">0.8x</option>' +
      '<option value="0.9">0.9x</option>' +
      '<option value="1" selected>1x</option>' +
      '<option value="1.15">1.15x</option>' +
      '<option value="1.3">1.3x</option>' +
      '<option value="1.5">1.5x</option>' +
      '</select></label>' +
      '<div class="tts-status" role="status" aria-live="polite"></div>';

    article.parentNode.insertBefore(widget, article);

    var playBtn = widget.querySelector('.tts-play');
    var pauseBtn = widget.querySelector('.tts-pause');
    var stopBtn = widget.querySelector('.tts-stop');
    var rateSelect = widget.querySelector('.tts-rate-select');
    var statusEl = widget.querySelector('.tts-status');

    var sentences = [];
    var index = 0;
    var rate = 1;
    var preferredVoice = null;
    var state = 'idle';

    function extractText(root) {
      var clone = root.cloneNode(true);
      var stripSelectors = [
        '.post-subscribe',
        'form',
        'script',
        'style',
        'noscript',
        '.tts-widget',
        '[hidden]',
        '[aria-hidden="true"]'
      ];
      stripSelectors.forEach(function (sel) {
        var nodes = clone.querySelectorAll(sel);
        Array.prototype.forEach.call(nodes, function (n) {
          n.parentNode && n.parentNode.removeChild(n);
        });
      });
      var raw = clone.textContent || '';
      return raw.replace(/\s+/g, ' ').trim();
    }

    function splitIntoSentences(text) {
      if (!text) { return []; }
      var parts = text.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) || [text];
      var chunks = [];
      parts.forEach(function (p) {
        var trimmed = p.trim();
        if (!trimmed) { return; }
        if (trimmed.length <= 240) {
          chunks.push(trimmed);
        } else {
          var words = trimmed.split(' ');
          var cur = '';
          words.forEach(function (w) {
            if ((cur + ' ' + w).trim().length > 240) {
              if (cur) { chunks.push(cur.trim()); }
              cur = w;
            } else {
              cur = cur ? (cur + ' ' + w) : w;
            }
          });
          if (cur) { chunks.push(cur.trim()); }
        }
      });
      return chunks;
    }

    function pickVoice() {
      var voices = window.speechSynthesis.getVoices();
      if (!voices || !voices.length) { return null; }
      var lang = (document.documentElement.lang || 'en').toLowerCase();
      var prefs = [
        function (v) { return v.lang && v.lang.toLowerCase().indexOf(lang) === 0 && /samantha|daniel|karen|moira|google us english|google uk english female|microsoft aria/i.test(v.name); },
        function (v) { return v.lang && v.lang.toLowerCase().indexOf('en') === 0 && /samantha|daniel|karen|moira/i.test(v.name); },
        function (v) { return v.lang && v.lang.toLowerCase().indexOf(lang) === 0 && v.localService; },
        function (v) { return v.lang && v.lang.toLowerCase().indexOf('en') === 0; }
      ];
      for (var i = 0; i < prefs.length; i++) {
        var found = voices.find(prefs[i]);
        if (found) { return found; }
      }
      return voices[0];
    }

    function setState(next) {
      state = next;
      if (next === 'playing') {
        playBtn.disabled = true;
        pauseBtn.disabled = false;
        pauseBtn.firstChild && (pauseBtn.firstChild.textContent = '');
        pauseBtn.innerHTML = '<span class="tts-icon" aria-hidden="true">&#10074;&#10074;</span> Pause';
        stopBtn.disabled = false;
        statusEl.classList.add('tts-status-active');
      } else if (next === 'paused') {
        playBtn.disabled = false;
        playBtn.innerHTML = '<span class="tts-icon" aria-hidden="true">&#9658;</span> Resume';
        pauseBtn.disabled = true;
        stopBtn.disabled = false;
      } else {
        playBtn.disabled = false;
        playBtn.innerHTML = '<span class="tts-icon" aria-hidden="true">&#9658;</span> Play';
        pauseBtn.disabled = true;
        stopBtn.disabled = true;
        statusEl.classList.remove('tts-status-active');
      }
    }

    function speakNext() {
      if (index >= sentences.length) {
        setState('idle');
        statusEl.textContent = 'Finished.';
        index = 0;
        return;
      }
      var u = new SpeechSynthesisUtterance(sentences[index]);
      u.rate = rate;
      u.pitch = 1;
      u.volume = 1;
      if (preferredVoice) { u.voice = preferredVoice; }
      u.onend = function () {
        if (state === 'playing') {
          index += 1;
          speakNext();
        }
      };
      u.onerror = function (e) {
        if (e.error === 'interrupted' || e.error === 'canceled') { return; }
        statusEl.textContent = 'Playback error. Try refreshing or pick a different voice in your browser settings.';
        setState('idle');
      };
      statusEl.textContent = 'Reading paragraph ' + (index + 1) + ' of ' + sentences.length + '.';
      window.speechSynthesis.speak(u);
    }

    function play() {
      if (state === 'paused') {
        window.speechSynthesis.resume();
        setState('playing');
        return;
      }
      if (!sentences.length) {
        var text = extractText(article);
        sentences = splitIntoSentences(text);
      }
      if (!sentences.length) {
        statusEl.textContent = 'No readable text found in this article.';
        return;
      }
      if (!preferredVoice) { preferredVoice = pickVoice(); }
      window.speechSynthesis.cancel();
      setState('playing');
      speakNext();
    }

    function pause() {
      if (state !== 'playing') { return; }
      window.speechSynthesis.pause();
      setState('paused');
      statusEl.textContent = 'Paused.';
    }

    function stop() {
      window.speechSynthesis.cancel();
      index = 0;
      setState('idle');
      statusEl.textContent = '';
    }

    playBtn.addEventListener('click', play);
    pauseBtn.addEventListener('click', pause);
    stopBtn.addEventListener('click', stop);
    rateSelect.addEventListener('change', function () {
      rate = parseFloat(rateSelect.value) || 1;
      if (state === 'playing') {
        var resumeAt = index;
        window.speechSynthesis.cancel();
        index = resumeAt;
        setState('playing');
        speakNext();
      }
    });

    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.addEventListener('voiceschanged', function () {
        if (!preferredVoice) { preferredVoice = pickVoice(); }
      }, { once: true });
    } else {
      preferredVoice = pickVoice();
    }

    window.addEventListener('beforeunload', function () {
      window.speechSynthesis.cancel();
    });
  });
})();
