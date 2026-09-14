const $ = (id) => document.getElementById(id);
const token = document.querySelector('meta[name="studio-token"]').content;
let state, scene, take, active = null, recorder, stream, audioContext, analyser;
let busy = false, animation, started = 0, countdownTimer, previewReady = false, polling, generation = 0;
const video = $('video');
const mixed = $('mixed');
const title = (id) => id.replaceAll('-', ' ').replace(/^./, (s) => s.toUpperCase());
const status = (message, error = false) => { $('status').textContent = message; $('status').classList.toggle('error', error); };
const api = async (path, data, headers = {}) => {
  const response = await fetch(path, data === undefined ? {} : { method: 'POST', headers: { 'X-Studio-Token': token, 'Content-Type': 'application/json', ...headers }, body: data instanceof Blob ? data : JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
};
const scriptHash = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((v) => v.toString(16).padStart(2, '0')).join('');
const canWork = () => !active && !busy && !state?.render.running;

function controls() {
  const locked = !canWork();
  for (const id of ['record', 'practice', 'import', 'takes', 'window', 'reset-pace', 'render']) $(id).disabled = locked;
  document.querySelectorAll('#scenes button').forEach((button) => { button.disabled = locked; });
  for (const id of ['noise', 'speaker', 'tone', 'pitch', 'fit', 'trim-start', 'trim-end', 'lead']) $(id).disabled = locked;
  document.querySelectorAll('#speaker option:not([value="own"]), #noise option[value="lavasr"]').forEach((option) => { option.disabled = !state?.neuralAvailable; });
  $('record').hidden = !!active;
  $('practice').hidden = !!active;
  $('stop').hidden = !active;
  $('process').disabled = locked || !take;
  $('record').disabled ||= !scene?.text;
  $('practice').disabled ||= !scene?.text;
  $('apply').disabled = locked || !previewReady;
  $('watch').disabled = locked || !previewReady;
}

async function refresh(keepTake = false) {
  state = await api('/api/state');
  $('project').textContent = title(state.project);
  const voiced = state.scenes.filter((s) => s.text);
  $('completion').textContent = `${voiced.filter((s) => s.audio).length} / ${voiced.length} scenes with voice`;
  $('scenes').replaceChildren(...state.scenes.map((s, i) => {
    const button = document.createElement('button');
    const number = document.createElement('span'); number.className = 'number'; number.textContent = s.audio ? '✓' : String(i + 1).padStart(2, '0');
    const label = document.createElement('span'); label.className = 'scene-label'; label.textContent = title(s.id);
    const duration = document.createElement('span'); duration.className = 'scene-length'; duration.textContent = `${s.duration.toFixed(1)}s`;
    button.append(number, label, duration); button.dataset.scene = s.id;
    button.onclick = () => { if (canWork()) selectScene(s.id); };
    return button;
  }));
  if (!keepTake) selectScene(scene?.id ?? voiced[0]?.id ?? state.scenes[0].id);
  else {
    scene = state.scenes.find((s) => s.id === scene.id);
    updateSceneHeading();
    controls();
  }
}

function updateSceneHeading() {
  document.querySelectorAll('#scenes button').forEach((b) => b.classList.toggle('selected', b.dataset.scene === scene.id));
  $('scene-title').textContent = title(scene.id);
  $('scene-number').textContent = `SCENE ${String(state.scenes.indexOf(scene) + 1).padStart(2, '0')} / ${String(state.scenes.length).padStart(2, '0')}`;
  $('scene-time').textContent = `${scene.duration.toFixed(1)} s clip`;
}

function selectScene(id) {
  stopPlayback();
  showReference();
  scene = state.scenes.find((s) => s.id === id);
  updateSceneHeading();
  $('window').min = scene.minimumWindow;
  $('window').value = scene.window.toFixed(2);
  $('prompter').replaceChildren(...scene.text.split(/\s+/).filter(Boolean).map((word) => {
    const span = document.createElement('span'); span.textContent = `${word} `; return span;
  }));
  if (!scene.text) $('prompter').textContent = 'This scene has no spoken line. Let the opening breathe.';
  $('prompter').classList.add('idle'); $('prompter').scrollTop = 0;
  $('clock').textContent = '0.0s'; $('progress').style.width = '0%'; $('mode').textContent = 'READY WHEN YOU ARE';
  const source = `/media/video?v=${state.videoVersion}`;
  if (state.video && video.getAttribute('src') !== source) video.src = source;
  seekVideo(Math.min(1, scene.duration / 2));
  const reference = referenceScene();
  $('video-note').textContent = !state.video ? 'Render the video to add a clip reference.' : !reference ? 'This scene is not in the last rendered video.' : state.previewCurrent ? 'Play while rehearsing, or listen to your take with the clip.' : 'Last rendered clip. Render again after applying your takes to see the updated timing.';
  updatePace();
  selectTakes();
  controls();
  $('record').disabled ||= !scene.text;
  $('practice').disabled ||= !scene.text;
}

function referenceScene() { return state.previewScenes.find((s) => s.id === scene.id); }
function seekVideo(elapsed) {
  const reference = referenceScene();
  if (!reference || !state.video) return;
  const at = reference.offset + Math.min(elapsed, Math.max(0, reference.duration - 0.08));
  if (Number.isFinite(video.duration)) video.currentTime = at;
  else video.onloadedmetadata = () => { video.currentTime = at; };
}
function startVideo(elapsed = 0) {
  showReference();
  seekVideo(elapsed);
  if (referenceScene() && state.video) video.play().catch(() => {});
}
function showReference() {
  mixed.hidden = true; video.hidden = false;
  mixed.parentElement.classList.remove('mixing');
  $('clip-label').textContent = 'CLIP REFERENCE · MUTED';
}
function stopPlayback() { video.pause(); mixed.pause(); $('raw').pause(); $('processed').pause(); }

function updatePace() {
  const seconds = Number($('window').value);
  const words = scene.wordCount;
  const wpm = Math.round(words * 60 / seconds);
  $('pace').textContent = `≈ ${wpm} words/min`;
  $('pace-hint').textContent = seconds < scene.minimumWindow ? `Increase the reading window to at least ${scene.minimumWindow.toFixed(2)}s to stay below 170 words/min.` : seconds > scene.duration - 0.45 + 0.01 ? 'A comfortable reading needs more room than this clip. Choose Extend scene after recording. Target: 165 words/min or slower.' : 'Target: 165 words/min or slower. Follow the highlighted words; the guide does not listen to your speech.';
}

function selectTakes(preferred) {
  mixed.removeAttribute('src'); mixed.load(); showReference();
  const takes = state.takes.filter((t) => t.scene === scene.id);
  $('empty').hidden = takes.length > 0;
  $('take-editor').hidden = !takes.length;
  $('takes').replaceChildren(...takes.map((t, i) => {
    const option = document.createElement('option'); option.value = t.id;
    option.textContent = `Take ${takes.length - i} · ${t.seconds.toFixed(1)}s · ${new Date(t.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${scene.audio && t.processed?.file === scene.audio ? ' · in video' : ''}${t.text !== scene.text ? ' · older script' : ''}`;
    return option;
  }));
  $('takes').value = preferred ?? takes[0]?.id ?? '';
  take = takes.find((t) => t.id === $('takes').value);
  previewReady = false;
  $('processed').removeAttribute('src'); $('processed').load();
  if (!take) return;
  $('raw').src = `/media/take?id=${take.id}`;
  const settings = take.processed?.settings ?? { start: 0, end: take.seconds, lead: 0.25, noise: state.neuralAvailable ? 'lavasr' : 'isolate', speaker: 'own', tone: 'natural', pitch: 0, fit: take.seconds + 0.45 > scene.duration ? 'extend' : 'keep' };
  $('trim-start').value = settings.start;
  $('trim-end').value = settings.end.toFixed(3);
  $('lead').value = settings.lead;
  $('tone').value = settings.tone; $('pitch').value = settings.pitch; $('fit').value = settings.fit;
  $('noise').value = settings.noise ?? 'gentle';
  $('speaker').value = settings.speaker ?? 'own';
  pitchLabel();
  $('preview-note').textContent = 'Choose your sound, then create a preview.';
  if (take.processed?.revision === state.revision) showProcessed();
  controls();
}

function pitchLabel() {
  const n = Number($('pitch').value);
  $('pitch-label').textContent = n === 0 ? 'unchanged' : `${n > 0 ? '+' : ''}${n} semitones · ${n < 0 ? 'deeper' : 'higher'}`;
}
function invalidatePreview() {
  mixed.pause(); mixed.removeAttribute('src'); mixed.load(); showReference();
  previewReady = false; $('processed').pause(); $('processed').removeAttribute('src'); $('processed').load();
  $('preview-note').textContent = 'Settings changed. Create a new preview to hear them.';
  pitchLabel(); controls();
}
function showProcessed() {
  previewReady = true;
  $('processed').src = `/media/take?id=${take.id}&version=processed&v=${Date.now()}`;
  const p = take.processed;
  $('preview-note').textContent = `${p.seconds.toFixed(2)}s voice track · ${p.speed.toFixed(2)}× pace${p.duration > scene.duration ? ` · scene will extend to ${p.duration.toFixed(2)}s` : ' · fits this clip'}`;
  const estimatedWpm = Math.round(scene.wordCount * 60 / ((p.settings.end - p.settings.start) / p.speed));
  $('preview-note').textContent += ` · ≈ ${estimatedWpm} words/min${estimatedWpm > state.maxWpm ? ' — try a slower reading' : ''}`;
  controls();
}

async function start(record) {
  if (!canWork() || !scene.text) return;
  const session = ++generation;
  const windowSeconds = Number($('window').value);
  if (!Number.isFinite(windowSeconds) || windowSeconds < 0.5 || windowSeconds > 600) return status('Choose a reading window between 0.5 and 600 seconds.', true);
  if (windowSeconds < scene.minimumWindow) return status(`Use at least ${scene.minimumWindow.toFixed(2)} seconds to stay below 170 words/min.`, true);
  stopPlayback();
  active = record ? 'permission' : 'countdown'; controls();
  try {
    if (record) {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('This browser cannot record here. Open the local studio in Chrome or Safari, or import a recording.');
      status('Allow microphone access to record your take.');
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
      if (!active || session !== generation) { acquired.getTracks().forEach((t) => t.stop()); return; }
      stream = acquired;
      audioContext = new AudioContext(); await audioContext.resume();
      if (session !== generation) return;
      analyser = audioContext.createAnalyser(); analyser.fftSize = 256;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      $('meter').style.display = 'inline-block';
    }
    active = 'countdown';
    $('countdown').hidden = false;
    let remaining = 3;
    $('countdown').textContent = remaining;
    status(record ? 'Get comfortable. Recording begins after the countdown.' : 'Rehearsal begins after the countdown.');
    const begin = () => {
      $('countdown').hidden = true;
      if (!active) return;
      if (record) {
        const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((type) => MediaRecorder.isTypeSupported(type));
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
        const chunks = [];
        const recordedScene = scene;
        recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        recorder.onstop = () => { const blob = new Blob(chunks, { type: recorder.mimeType }); recorder = null; upload(blob, recordedScene).catch((e) => status(e.message, true)); };
        recorder.onerror = (event) => { status(event.error?.message ?? 'Recording failed. Try another take.', true); stop(); };
        recorder.start(); active = 'recording';
      } else active = 'rehearsal';
      started = performance.now();
      $('prompter').classList.remove('idle');
      $('mode').textContent = record ? '● RECORDING YOUR VOICE' : 'REHEARSAL';
      startVideo(0.25);
      status(record ? 'Reading now. Press Stop when you finish; running past the guide is okay.' : 'Follow the guide and find a comfortable pace.');
      controls(); tick();
    };
    countdownTimer = setInterval(() => {
      remaining--;
      if (remaining) $('countdown').textContent = remaining;
      else {
        clearInterval(countdownTimer);
        try { begin(); } catch (error) { stop(); status(error.message, true); }
      }
    }, 1000);
  } catch (error) {
    if (session !== generation) return;
    stop();
    status(error.name === 'NotAllowedError' ? 'Microphone access was denied. Allow it in your browser’s site settings, or import a recording.' : error.message, true);
  }
}

function tick() {
  if (!['recording', 'rehearsal', 'watch'].includes(active)) return;
  const elapsed = active === 'watch' ? mixed.currentTime : (performance.now() - started) / 1000;
  const windowSeconds = active === 'watch' ? (Number.isFinite(mixed.duration) ? mixed.duration : take.processed.duration) : Number($('window').value);
  $('clock').textContent = `${elapsed.toFixed(1)} / ${windowSeconds.toFixed(1)}s`;
  $('progress').style.width = `${Math.min(100, elapsed / windowSeconds * 100)}%`;
  if (active !== 'watch') {
    const spans = [...$('prompter').children];
    const times = scene.cues.map((cue) => (cue.at - 0.25) / scene.window * windowSeconds);
    spans.forEach((span, i) => {
      const end = times[i + 1] ?? windowSeconds;
      const current = elapsed >= times[i] && elapsed < end;
      if (current && !span.classList.contains('current')) $('prompter').scrollTo({ top: Math.max(0, span.offsetTop - $('prompter').offsetTop - 80), behavior: 'smooth' });
      span.classList.toggle('current', current); span.classList.toggle('read', elapsed >= end);
    });
  }
  const reference = referenceScene();
  if (active !== 'watch' && reference && elapsed + 0.25 >= reference.duration - 0.08) video.pause();
  if (active === 'recording' && analyser) {
    const samples = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(samples);
    const peak = Math.max(...samples.map((v) => Math.abs(v - 128))) / 128;
    $('meter').firstElementChild.style.width = `${Math.min(100, peak * 300)}%`;
    if (elapsed > windowSeconds) $('mode').textContent = 'GUIDE FINISHED · STILL RECORDING';
    if (elapsed >= 590) { stop(); return; }
  }
  if (active === 'rehearsal' && elapsed >= windowSeconds) { stop(); status('Rehearsal complete. Adjust the reading window if you want more room, then record.'); return; }
  animation = requestAnimationFrame(tick);
}

function stop() {
  generation++;
  clearInterval(countdownTimer); cancelAnimationFrame(animation);
  active = null; $('countdown').hidden = true;
  if (recorder?.state === 'recording') { busy = true; recorder.stop(); }
  stream?.getTracks().forEach((track) => track.stop()); stream = null;
  audioContext?.close().catch(() => {}); audioContext = null; analyser = null;
  $('meter').style.display = 'none';
  stopPlayback(); $('mode').textContent = 'READY WHEN YOU ARE'; controls();
}

async function upload(blob, recordedScene) {
  busy = true; controls(); status('Saving your original take…');
  try {
    const digest = await scriptHash(recordedScene.text);
    const result = await api(`/api/take?scene=${encodeURIComponent(recordedScene.id)}&script=${digest}`, blob, { 'Content-Type': blob.type || 'audio/wav' });
    await refresh(); selectTakes(result.id);
    status(`Take saved (${result.seconds.toFixed(1)}s). Listen, trim pauses if needed, then enhance.`);
  } catch (error) {
    status(`${error.message} Save a local copy of this take: `, true);
    const link = document.createElement('a'); link.textContent = 'Download recording';
    const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('wav') ? 'wav' : blob.type.includes('mpeg') ? 'mp3' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    link.href = URL.createObjectURL(blob); link.download = `narration-take.${ext}`; $('status').append(link);
  } finally { busy = false; controls(); }
}

$('record').onclick = () => start(true);
$('practice').onclick = () => start(false);
$('stop').onclick = stop;
$('focus').onclick = () => { document.body.classList.toggle('focused'); $('focus').textContent = document.body.classList.contains('focused') ? 'Exit focus' : 'Focus mode'; };
$('window').oninput = updatePace;
$('reset-pace').onclick = () => { $('window').value = scene.window.toFixed(2); updatePace(); };
$('takes').onchange = () => { stopPlayback(); selectTakes($('takes').value); };
for (const id of ['noise', 'speaker', 'tone', 'pitch', 'fit', 'trim-start', 'trim-end', 'lead']) $(id).oninput = invalidatePreview;
$('speaker').oninput = () => {
  if ($('speaker').value !== 'own') {
    $('noise').value = 'lavasr'; $('tone').value = 'natural'; $('pitch').value = 0;
  }
  invalidatePreview();
};
$('tone').oninput = () => {
  $('pitch').value = { deep: -7, light: 5 }[$('tone').value] ?? 0;
  invalidatePreview();
};
$('import').onchange = async () => {
  const file = $('import').files[0];
  if (file && canWork()) {
    const mime = { wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', webm: 'audio/webm' }[file.name.split('.').pop().toLowerCase()];
    await upload(new Blob([file], { type: mime || file.type }), scene);
  }
  $('import').value = '';
};
$('process').onclick = async () => {
  if (!canWork() || !take) return;
  busy = true; stopPlayback(); controls(); status($('speaker').value !== 'own' ? 'Running LavaSR and OpenVoice V2 locally. Your recorded delivery stays the source…' : $('noise').value === 'lavasr' ? 'Restoring your speech with LavaSR locally…' : 'Cleaning your take and shaping the voice…');
  try {
    take = await api('/api/process', { id: take.id, settings: { start: Number($('trim-start').value), end: Number($('trim-end').value), lead: Number($('lead').value), noise: $('noise').value, speaker: $('speaker').value, tone: $('tone').value, pitch: Number($('pitch').value), fit: $('fit').value } });
    state.takes = state.takes.map((t) => t.id === take.id ? take : t);
    mixed.removeAttribute('src'); mixed.load(); showReference();
    showProcessed(); status('Voice ready. Choose Preview full mix to hear it with the video, music and sound effects.');
  } catch (error) { status(error.message, true); }
  finally { busy = false; controls(); }
};
$('watch').onclick = async () => {
  if (!canWork() || !previewReady) return;
  stopPlayback(); busy = true; controls();
  status('Preparing this scene with your voice, music and sound effects…');
  try {
    const preview = await api('/api/preview', { id: take.id });
    mixed.src = preview.url; mixed.muted = false; mixed.volume = 1;
    mixed.hidden = false; video.hidden = true;
    mixed.parentElement.classList.add('mixing');
    $('clip-label').textContent = 'FULL MIX · VOICE, MUSIC & EFFECTS';
    $('video-note').textContent = 'Current scene and selected take, including any scene extension. Use the player controls to pause or seek.';
    busy = false; controls();
    try { await mixed.play(); status('Playing the complete scene mix.'); }
    catch { status('Full mix ready. Press Play on the video to listen.'); }
  } catch (error) { status(error.message, true); }
  finally { busy = false; controls(); }
};
mixed.onplay = () => {
  if (!canWork()) { mixed.pause(); return; }
  video.pause(); $('raw').pause(); $('processed').pause();
  active = 'watch'; $('mode').textContent = 'FULL MIX PREVIEW'; controls(); tick();
};
mixed.onended = () => { if (active === 'watch') stop(); };
mixed.onpause = () => { if (active === 'watch') stop(); };
$('processed').onplay = () => { if (active) stop(); $('raw').pause(); };
$('raw').onplay = () => { if (active) stop(); $('processed').pause(); };
$('apply').onclick = async () => {
  if (!canWork() || !previewReady) return;
  busy = true; controls();
  try {
    await api('/api/apply', { id: take.id });
    const id = take.id; await refresh(); selectTakes(id);
    status('Voice attached to this scene. Record the next line, or Render video to hear the complete mix.');
  } catch (error) { status(error.message, true); }
  finally { busy = false; controls(); }
};
$('render').onclick = async () => {
  if (!canWork()) return;
  busy = true; controls();
  try { await api('/api/render', {}); state.render.running = true; status('Rendering your video… You can leave this window open.'); pollRender(); }
  catch (error) { status(error.message, true); }
  finally { busy = false; controls(); }
};
function pollRender() {
  clearTimeout(polling);
  polling = setTimeout(async () => {
    try {
      await refresh(true); status(state.render.message, state.render.message.startsWith('Render failed'));
      if (state.render.running) pollRender();
      else {
        await refresh();
        if (state.video) { const link = document.createElement('a'); link.href = '/media/video'; link.target = '_blank'; link.textContent = ' Open video'; $('status').append(link); }
      }
    } catch (error) { status(error.message, true); }
  }, 1500);
}
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { if (active) stop(); document.body.classList.remove('focused'); $('focus').textContent = 'Focus mode'; }
  if (event.code !== 'Space' || /INPUT|SELECT|TEXTAREA|BUTTON|A|AUDIO/.test(event.target.tagName)) return;
  event.preventDefault(); if (active) stop(); else start(true);
});
window.addEventListener('beforeunload', (event) => { if (active || busy) { event.preventDefault(); event.returnValue = ''; } });
refresh().then(() => { if (state.render.running) pollRender(); }).catch((error) => status(error.message, true));
