"""Install optional, pinned local voice models. Only this setup uses the network."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / '.local-voice'
MANIFEST = json.loads((ROOT / 'studio/neural-models.json').read_text())


def download_models():
    for entry in MANIFEST['files']:
        path = LOCAL / 'models' / entry['model'] / entry['path']
        if path.exists() and (not entry.get('sha256') or hashlib.sha256(path.read_bytes()).hexdigest() == entry['sha256']):
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + '.download')
        print('Downloading', entry['model'] + '/' + entry['path'], flush=True)
        with urllib.request.urlopen(entry['url'], timeout=120) as response, temporary.open('wb') as output:
            while block := response.read(1024 * 1024):
                output.write(block)
        if entry.get('sha256') and hashlib.sha256(temporary.read_bytes()).hexdigest() != entry['sha256']:
            temporary.unlink()
            raise RuntimeError('Model checksum mismatch: ' + entry['path'])
        temporary.replace(path)


if __name__ == '__main__':
    os.chdir(ROOT)
    # Also usable alone while the isolated Python environment is being installed.
    if '--models-only' in sys.argv:
        download_models()
        sys.exit(0)
    LOCAL.mkdir(exist_ok=True)
    uv = LOCAL / 'bootstrap/bin/uv'
    if not uv.exists():
        subprocess.run([sys.executable, '-m', 'pip', 'install', '--target', str(LOCAL / 'bootstrap'), '--cache-dir', str(LOCAL / 'cache'), 'uv==0.12.13'], check=True)
    env = {**os.environ, 'UV_CACHE_DIR': str(LOCAL / 'cache'), 'UV_PYTHON_INSTALL_DIR': str(LOCAL / 'python')}
    python = LOCAL / 'venv/bin/python'
    if not python.exists():
        subprocess.run([str(uv), 'venv', '--managed-python', '--python', '3.11', str(LOCAL / 'venv')], env=env, check=True)
    for name, source in MANIFEST['sources'].items():
        path = LOCAL / 'repos' / name
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(['git', 'clone', '--quiet', source['repository'], str(path)], check=True)
            subprocess.run(['git', '-C', str(path), 'checkout', '--quiet', source['commit']], check=True)
        actual = subprocess.check_output(['git', '-C', str(path), 'rev-parse', 'HEAD'], text=True).strip()
        if actual != source['commit']:
            raise RuntimeError(f'{name} source revision differs from the pinned version')
    subprocess.run([str(uv), 'pip', 'install', '--python', str(python), '-r', 'scripts/neural-requirements.txt'], env=env, check=True)
    # Import OpenVoice's conversion model directly: no TTS, Whisper or web demo.
    subprocess.run([str(uv), 'pip', 'install', '--python', str(python), '--no-deps', str(LOCAL / 'repos/vocos')], env=env, check=True)
    download_models()
    subprocess.run([str(python), 'scripts/neural-voice.py', '--check'], env=env, check=True)
    print('Local OpenVoice V2 + LavaSR ready. Inference is offline.')
