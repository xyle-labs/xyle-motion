"""Offline recorded-speech restoration and conversion; no text generation.

OpenVoice's model calls follow the MIT-licensed upstream ToneColorConverter.
We load only the converter, avoiding the TTS/demo/transcription dependencies.
"""
import argparse
import json
import os
from pathlib import Path
import socket
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / '.local-voice'
os.environ.update(HF_HUB_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1', TRANSFORMERS_OFFLINE='1', NUMBA_CACHE_DIR=str(LOCAL / 'numba-cache'))


def no_network(*args, **kwargs):
    raise RuntimeError('Network access is disabled during voice processing. Run setup first.')


# Fail closed if an upstream library tries to fetch a missing model at runtime.
socket.socket.connect = no_network
socket.socket.connect_ex = no_network
socket.create_connection = no_network
socket.getaddrinfo = no_network
sys.path[:0] = [str(LOCAL / 'repos/OpenVoice'), str(LOCAL / 'repos/LavaSR')]

import numpy as np
import soundfile as sf
import torch
import torchaudio
from LavaSR.model import LavaEnhance2
from openvoice import utils
from openvoice.models import SynthesizerTrn
from openvoice.mel_processing import spectrogram_torch

torch.set_num_threads(4)
torch.manual_seed(0)


def load_converter():
    directory = LOCAL / 'models/openvoice/converter'
    hps = utils.get_hparams_from_file(str(directory / 'config.json'))
    model = SynthesizerTrn(len(getattr(hps, 'symbols', [])), hps.data.filter_length // 2 + 1,
                          n_speakers=hps.data.n_speakers, **hps.model).eval()
    checkpoint = torch.load(directory / 'checkpoint.pth', map_location='cpu', weights_only=True)
    model.load_state_dict(checkpoint['model'], strict=True)
    return model, hps


def convert(wave, sr, speaker, reference=None, reference_mix=1.0):
    model, hps = load_converter()
    audio = torchaudio.functional.resample(wave, sr, hps.data.sampling_rate).reshape(1, -1)
    spec = spectrogram_torch(audio, hps.data.filter_length, hps.data.sampling_rate,
                             hps.data.hop_length, hps.data.win_length, center=False)
    source = model.ref_enc(spec.transpose(1, 2)).unsqueeze(-1)
    target = torch.load(LOCAL / f'models/openvoice/base_speakers/ses/{speaker}.pth', map_location='cpu', weights_only=True)
    if reference is not None:
        ref, ref_sr = sf.read(reference, dtype='float32', always_2d=True)
        if not 3 <= len(ref) / ref_sr <= 60 or not np.isfinite(ref).all() or np.max(np.abs(ref)) < 1e-5:
            raise ValueError('Voice reference must contain 3–60 seconds of audible, finite speech.')
        ref = torchaudio.functional.resample(torch.from_numpy(ref.mean(axis=1)).reshape(1, -1), ref_sr, hps.data.sampling_rate)
        ref_spec = spectrogram_torch(ref, hps.data.filter_length, hps.data.sampling_rate,
                                    hps.data.hop_length, hps.data.win_length, center=False)
        reference_target = model.ref_enc(ref_spec.transpose(1, 2)).unsqueeze(-1)
        # Interpolation is an audition control, not a calibrated age slider.
        target = target * (1 - reference_mix) + reference_target * reference_mix
    converted = model.voice_conversion(spec, torch.LongTensor([spec.shape[-1]]), sid_src=source,
                                       sid_tgt=target, tau=0.3)[0][0, 0]
    return converted, hps.data.sampling_rate


def process(input_path, output_path, cleanup, speaker, reference=None, reference_mix=1.0):
    if not 0 <= reference_mix <= 1:
        raise ValueError('Reference mix must be between 0 and 1.')
    if reference is not None and speaker == 'own':
        raise ValueError('Choose a conversion speaker when using a voice reference.')
    if input_path.resolve() == output_path.resolve():
        raise ValueError('Output must be a separate file from the original recording.')
    if reference is not None and reference.resolve() == output_path.resolve():
        raise ValueError('Output must be a separate file from the voice reference.')
    original, sr = sf.read(input_path, dtype='float32', always_2d=True)
    duration = len(original) / sr
    if not 0.3 <= duration <= 60:
        raise ValueError('Neural processing accepts scene takes from 0.3 to 60 seconds.')
    wave = torch.from_numpy(original.mean(axis=1)).reshape(1, -1)
    lava = None
    if cleanup == 'lavasr':
        lava = LavaEnhance2(str(LOCAL / 'models/lavasr'), device='cpu')
        wave = torchaudio.functional.resample(wave, sr, 16000)
        # Denoise before conversion. Restore bandwidth after the converter.
        wave = lava.enhance(wave, enhance=speaker == 'own', denoise=True, batch=False).reshape(1, -1)
        sr = 48000
    if speaker != 'own':
        wave, sr = convert(wave, sr, speaker, reference, reference_mix)
        wave = wave.reshape(1, -1)
        if lava is not None:
            wave = torchaudio.functional.resample(wave, sr, 48000)
            wave = lava.bwe_model.infer(wave).reshape(1, -1)
            sr = 48000
    wave = torchaudio.functional.resample(wave, sr, 48000).squeeze().cpu().numpy()
    target_length = round(duration * 48000)
    if abs(len(wave) - target_length) > 4800:
        raise RuntimeError('Model changed the take duration by over 0.1s; preview rejected.')
    # Model frames may leave a partial hop at the end. Preserve the scene clock.
    wave = np.pad(wave, (0, max(0, target_length - len(wave))))[:target_length]
    if not np.isfinite(wave).all() or np.max(np.abs(wave)) < 1e-7:
        raise RuntimeError('Model produced invalid or silent audio; original preserved.')
    peak = np.max(np.abs(wave))
    if peak > 0.98:
        wave *= 0.98 / peak
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_suffix('.tmp.wav')
    sf.write(temporary, wave, 48000, subtype='PCM_16')
    temporary.replace(output_path)
    return duration


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--input', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--cleanup', choices=['none', 'lavasr'], default='lavasr')
    parser.add_argument('--speaker', choices=['own', 'en-default', 'en-us', 'en-br', 'en-au', 'en-india', 'en-newest'], default='own')
    parser.add_argument('--reference', type=Path, help='Local speech reference for the target timbre; never used as narration.')
    parser.add_argument('--reference-mix', type=float, default=1.0, help='0 = bundled target, 1 = reference timbre (default).')
    args = parser.parse_args()
    started = time.monotonic()
    with torch.inference_mode():
        if args.check:
            LavaEnhance2(str(LOCAL / 'models/lavasr'), device='cpu')
            load_converter()
            print(json.dumps({'ready': True, 'device': 'cpu', 'network': 'disabled'}))
        else:
            if not args.input or not args.output:
                parser.error('--input and --output are required')
            duration = process(args.input, args.output, args.cleanup, args.speaker, args.reference, args.reference_mix)
            print(json.dumps({'duration': duration, 'elapsed': round(time.monotonic() - started, 2), 'speaker': args.speaker, 'cleanup': args.cleanup, 'network': 'disabled'}))
