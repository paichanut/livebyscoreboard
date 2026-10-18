# NHL-style goal horn: three-chime marine air horn (Kahlenberg-like chord), synthesized from scratch.
import numpy as np, wave, sys
sr = 44100
def horn(dur=4.2, chord=(116.54, 146.83, 174.61), weights=(1.0, .8, .7), seed=1):
    rng = np.random.default_rng(seed)
    n = int(sr * (dur + 1.8)); t = np.arange(n) / sr
    rel_at = dur
    # air pressure: fast build, steady, quick cut-off
    env = np.clip(t / 0.07, 0, 1) ** 1.5
    env *= np.where(t < rel_at, 1.0, np.exp(-(t - rel_at) / 0.09))
    # pitch: rises into tune as pressure builds, sags as it releases
    bend = 0.93 + 0.07 * (1 - np.exp(-t / 0.05))
    bend *= np.where(t < rel_at, 1.0, 1 - 0.05 * (1 - np.exp(-(t - rel_at) / 0.15)))
    # slow wobble of the air supply
    lfo = 1 + 0.0025 * np.sin(2 * np.pi * 5.2 * t)
    noise = np.convolve(rng.standard_normal(n), np.ones(1500) / 1500, mode='same')
    growl = 1 + 0.08 * noise / (np.abs(noise).max() + 1e-9)
    out = np.zeros(n)
    for f, w in zip(chord, weights):
        det = 1 + rng.uniform(-0.002, 0.002)
        phase = 2 * np.pi * np.cumsum(f * det * bend * lfo) / sr
        tone = np.zeros(n)
        for k in range(1, 60):
            if f * k > 9000: break
            # reed horn: strong low harmonics, slow roll-off, formant bump around 600-900 Hz
            a = k ** -0.75 * (1 + 0.8 * np.exp(-((f * k - 750) / 350) ** 2))
            tone += a * np.sin(k * phase + rng.uniform(0, 2 * np.pi))
        out += w * tone
    out *= env * growl
    out = np.tanh(1.6 * out / np.abs(out).max())          # brassy saturation
    # gentle low-pass (one pole, ~4.5 kHz)
    a = np.exp(-2 * np.pi * 4500 / sr); y = np.zeros(n); acc = 0.0
    for i in range(n): acc = (1 - a) * out[i] + a * acc; y[i] = acc
    # arena reverb: decaying noise impulse response
    L = int(sr * 1.6); ir = rng.standard_normal(L) * np.exp(-np.arange(L) / (sr * 0.38)); ir[0] = 0
    wet = np.convolve(y, ir)[:n]; wet /= np.abs(wet).max()
    mix = 0.8 * y / np.abs(y).max() + 0.28 * wet
    mix /= np.abs(mix).max() / 0.89
    end = int(sr * (dur + 1.2)); fade = np.linspace(1, 0, int(sr * 0.3))
    mix = mix[:end]; mix[-len(fade):] *= fade
    return mix
def save(name, x):
    with wave.open(name, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((x * 32767).astype('<i2').tobytes())
save('horn-nhl.wav', horn(4.2))
save('horn-nhl-short.wav', horn(1.3, seed=2))
print('ok')
