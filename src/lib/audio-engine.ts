// Web Audio hearing-amplifier engine.
// Signal chain: mic -> highpass -> 5-band EQ -> compressor -> makeup gain -> limiter -> destination

export type EnvironmentId = "conversacion" | "tv" | "restaurante" | "calle";

export interface EnvironmentPreset {
  id: EnvironmentId;
  label: string;
  description: string;
  // Gain in dB per band: 250, 500, 1k, 2k, 4k Hz
  bandsDb: [number, number, number, number, number];
  // Compressor settings
  threshold: number; // dB
  ratio: number;
  // Master makeup gain in dB
  makeupDb: number;
  // High-pass cutoff Hz (removes rumble)
  highpassHz: number;
}

export const ENVIRONMENTS: EnvironmentPreset[] = [
  {
    id: "conversacion",
    label: "Conversación",
    description: "Realza voces cercanas con poco ruido de fondo.",
    bandsDb: [-2, 2, 6, 8, 5],
    threshold: -28,
    ratio: 3,
    makeupDb: 10,
    highpassHz: 150,
  },
  {
    id: "tv",
    label: "TV",
    description: "Claridad en diálogos de televisión.",
    bandsDb: [-3, 1, 5, 7, 6],
    threshold: -26,
    ratio: 2.5,
    makeupDb: 8,
    highpassHz: 120,
  },
  {
    id: "restaurante",
    label: "Restaurante",
    description: "Reduce ruido grave de fondo y enfoca la voz.",
    bandsDb: [-8, -4, 4, 9, 7],
    threshold: -22,
    ratio: 5,
    makeupDb: 9,
    highpassHz: 250,
  },
  {
    id: "calle",
    label: "Calle",
    description: "Atenúa tráfico y viento, prioriza voz y alertas.",
    bandsDb: [-10, -6, 3, 8, 8],
    threshold: -20,
    ratio: 7,
    makeupDb: 7,
    highpassHz: 300,
  },
];

const BAND_FREQS = [250, 500, 1000, 2000, 4000];
const FP_STORAGE_KEY = "oyebien.voiceFingerprint.v1";

export interface EngineOptions {
  preset: EnvironmentPreset;
  masterDb: number; // user volume in dB
  balance: number; // -1..+1
}

export interface EqOffsets {
  bass: number;
  mid: number;
  treble: number;
}

export class AudioEngine {
  private currentPreset: EnvironmentPreset | null = null;
  private eqOffsets: EqOffsets = { bass: 0, mid: 0, treble: 0 };

  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private highpass!: BiquadFilterNode;
  private lowpass!: BiquadFilterNode;
  private bands: BiquadFilterNode[] = [];
  private compressor!: DynamicsCompressorNode;
  private makeup!: GainNode;
  private master!: GainNode;
  private gate!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private splitter!: ChannelSplitterNode;
  private merger!: ChannelMergerNode;
  private leftGain!: GainNode;
  private rightGain!: GainNode;
  private analyser!: AnalyserNode;
  private inputAnalyser!: AnalyserNode;
  private running = false;
  private gateRaf = 0;
  private gateOpen = true;
  private voiceFingerprint: Float32Array | null = null;

  constructor() {
    this.voiceFingerprint = loadFingerprint();
  }

  isRunning() {
    return this.running;
  }

  hasVoiceFingerprint() {
    return !!this.voiceFingerprint;
  }

  setVoiceFingerprint(fp: Float32Array | null) {
    this.voiceFingerprint = fp;
    saveFingerprint(fp);
  }

  /**
   * Records ~`ms` of audio from the mic and returns a normalized average
   * magnitude spectrum that represents the speaker's voice timbre.
   * Used later to distinguish the user's own voice from other people's voices.
   */
  async captureVoiceFingerprint(ms = 3500): Promise<Float32Array> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
      video: false,
    });
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    try {
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.2;
      src.connect(an);

      const bins = an.frequencyBinCount;
      const avg = new Float32Array(bins);
      const buf = new Uint8Array(bins);
      const t0 = performance.now();
      let frames = 0;

      await new Promise<void>((resolve) => {
        const tick = () => {
          an.getByteFrequencyData(buf);
          let energy = 0;
          for (let i = 0; i < bins; i++) energy += buf[i];
          // only accumulate frames with actual voice-level energy
          if (energy > bins * 10) {
            for (let i = 0; i < bins; i++) avg[i] += buf[i];
            frames++;
          }
          if (performance.now() - t0 >= ms) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      if (frames < 8) {
        throw new Error("No se detectó suficiente voz. Habla más cerca del micro.");
      }
      for (let i = 0; i < bins; i++) avg[i] /= frames;
      // L2-normalize so we can use cosine similarity
      let n = 0;
      for (let i = 0; i < bins; i++) n += avg[i] * avg[i];
      n = Math.sqrt(n) || 1;
      for (let i = 0; i < bins; i++) avg[i] /= n;
      this.setVoiceFingerprint(avg);
      return avg;
    } finally {
      stream.getTracks().forEach((t) => t.stop());
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
    }
  }

  async start(opts: EngineOptions) {
    if (this.running) return;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
      video: false,
    });

    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: "interactive" });
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }

    this.source = this.ctx.createMediaStreamSource(this.stream);

    this.highpass = this.ctx.createBiquadFilter();
    this.highpass.type = "highpass";
    this.highpass.frequency.value = opts.preset.highpassHz;
    this.highpass.Q.value = 0.707;

    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 7000;
    this.lowpass.Q.value = 0.707;

    // Analyser placed before the EQ so detection sees the raw mic signal
    this.inputAnalyser = this.ctx.createAnalyser();
    this.inputAnalyser.fftSize = 1024;
    this.inputAnalyser.smoothingTimeConstant = 0.2;

    this.currentPreset = opts.preset;
    this.bands = BAND_FREQS.map((freq, i) => {
      const b = this.ctx!.createBiquadFilter();
      b.type = "peaking";
      b.frequency.value = freq;
      b.Q.value = 1.2;
      b.gain.value = opts.preset.bandsDb[i] + this.eqOffsetForBand(i);
      return b;
    });

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = opts.preset.threshold;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = opts.preset.ratio;
    this.compressor.attack.value = 0.005;
    this.compressor.release.value = 0.12;

    this.makeup = this.ctx.createGain();
    this.makeup.gain.value = dbToGain(opts.preset.makeupDb);

    this.master = this.ctx.createGain();
    this.master.gain.value = dbToGain(opts.masterDb);

    // Smart gate: muted when the user himself talks or when input isn't voice.
    this.gate = this.ctx.createGain();
    this.gate.gain.value = 1;

    this.splitter = this.ctx.createChannelSplitter(2);
    this.merger = this.ctx.createChannelMerger(2);
    this.leftGain = this.ctx.createGain();
    this.rightGain = this.ctx.createGain();
    this.applyBalance(opts.balance);

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.05;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;

    this.source.connect(this.inputAnalyser);
    let node: AudioNode = this.source;
    node.connect(this.highpass);
    node = this.highpass;
    node.connect(this.lowpass);
    node = this.lowpass;
    for (const b of this.bands) {
      node.connect(b);
      node = b;
    }
    node.connect(this.compressor);
    this.compressor.connect(this.makeup);
    this.makeup.connect(this.master);
    this.master.connect(this.gate);
    this.gate.connect(this.splitter);
    this.splitter.connect(this.leftGain, 0);
    this.splitter.connect(this.rightGain, 0);
    this.leftGain.connect(this.merger, 0, 0);
    this.rightGain.connect(this.merger, 0, 1);
    this.merger.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this.running = true;
    this.startGateLoop();
  }

  /**
   * Smart gate loop. Two reasons to mute the amplified output:
   *  - The user is talking (matches the enrolled voice fingerprint at loud level).
   *  - There is no human voice in the air (only ambient noise) — the AI-style
   *    voice detector keeps the gate closed so traffic, fans, claps, etc. don't
   *    get amplified.
   * Otherwise the gate is open so the conversation around the user comes through.
   */
  private startGateLoop() {
    const SELF_VOICE_RMS = 0.1; // loudness threshold for "near-field" voice
    const SIM_THRESHOLD = 0.86; // cosine sim to user fingerprint
    const VOICE_LIKE_THRESHOLD = 0.55; // fraction of energy in human-voice band
    const SELF_HOLD_MS = 200;
    const VOICE_HOLD_MS = 450;

    const timeBuf = new Uint8Array(this.inputAnalyser.fftSize);
    const freqBuf = new Uint8Array(this.inputAnalyser.frequencyBinCount);
    const norm = new Float32Array(freqBuf.length);
    const sr = this.ctx!.sampleRate;
    const binHz = sr / this.inputAnalyser.fftSize;
    const voiceLo = Math.max(1, Math.floor(200 / binHz));
    const voiceHi = Math.min(freqBuf.length - 1, Math.ceil(3400 / binHz));

    let lastSelfAt = -Infinity;
    let lastVoiceAt = performance.now();

    const tick = () => {
      if (!this.running || !this.ctx) return;
      this.inputAnalyser.getByteTimeDomainData(timeBuf);
      this.inputAnalyser.getByteFrequencyData(freqBuf);

      let sum = 0;
      for (let i = 0; i < timeBuf.length; i++) {
        const v = (timeBuf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / timeBuf.length);

      // Voice-likeness: how much of the energy lives in the human-voice band.
      let total = 0;
      let voice = 0;
      for (let i = 0; i < freqBuf.length; i++) {
        total += freqBuf[i];
        if (i >= voiceLo && i <= voiceHi) voice += freqBuf[i];
      }
      const voiceLike = total > 0 ? voice / total : 0;

      // Cosine similarity against the enrolled fingerprint.
      let sim = 0;
      if (this.voiceFingerprint) {
        let n = 0;
        for (let i = 0; i < freqBuf.length; i++) {
          norm[i] = freqBuf[i];
          n += freqBuf[i] * freqBuf[i];
        }
        n = Math.sqrt(n);
        if (n > 0) {
          for (let i = 0; i < freqBuf.length; i++) {
            norm[i] /= n;
            sim += norm[i] * this.voiceFingerprint[i];
          }
        }
      }

      const now = performance.now();
      // Self-voice = loud AND (matches fingerprint, or fingerprint missing)
      const isSelf =
        rms >= SELF_VOICE_RMS &&
        (this.voiceFingerprint ? sim >= SIM_THRESHOLD : true);
      if (isSelf) lastSelfAt = now;

      // Any human voice in the air keeps the gate alive.
      if (voiceLike >= VOICE_LIKE_THRESHOLD && rms > 0.012) lastVoiceAt = now;

      const selfDucking = now - lastSelfAt < SELF_HOLD_MS;
      const voicePresent = now - lastVoiceAt < VOICE_HOLD_MS;
      const shouldOpen = voicePresent && !selfDucking;

      if (shouldOpen !== this.gateOpen) {
        this.gateOpen = shouldOpen;
        // Fast close to kill self-voice / sudden noise, slightly slower open
        // so the conversation fades back in naturally.
        const tc = shouldOpen ? 0.04 : 0.008;
        this.gate.gain.setTargetAtTime(
          shouldOpen ? 1 : 0,
          this.ctx.currentTime,
          tc,
        );
      }
      this.gateRaf = requestAnimationFrame(tick);
    };
    this.gateRaf = requestAnimationFrame(tick);
  }

  applyPreset(preset: EnvironmentPreset) {
    this.currentPreset = preset;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.highpass.frequency.setTargetAtTime(preset.highpassHz, t, 0.05);
    preset.bandsDb.forEach((db, i) => {
      this.bands[i].gain.setTargetAtTime(db + this.eqOffsetForBand(i), t, 0.05);
    });
    this.compressor.threshold.setTargetAtTime(preset.threshold, t, 0.05);
    this.compressor.ratio.setTargetAtTime(preset.ratio, t, 0.05);
    this.makeup.gain.setTargetAtTime(dbToGain(preset.makeupDb), t, 0.05);
  }

  private eqOffsetForBand(i: number): number {
    const { bass, mid, treble } = this.eqOffsets;
    if (i === 0) return bass;
    if (i === 1) return bass * 0.5 + mid * 0.5;
    if (i === 2) return mid;
    if (i === 3) return mid * 0.5 + treble * 0.5;
    return treble;
  }

  setEqOffsets(offsets: EqOffsets) {
    this.eqOffsets = offsets;
    if (!this.ctx || !this.currentPreset) return;
    const t = this.ctx.currentTime;
    this.currentPreset.bandsDb.forEach((db, i) => {
      this.bands[i].gain.setTargetAtTime(db + this.eqOffsetForBand(i), t, 0.05);
    });
  }

  getEqOffsets(): EqOffsets {
    return { ...this.eqOffsets };
  }

  setMasterDb(db: number) {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.03);
  }

  setBalance(balance: number) {
    this.applyBalance(balance);
  }

  private applyBalance(balance: number) {
    const b = Math.max(-1, Math.min(1, balance));
    const left = b <= 0 ? 1 : 1 - b;
    const right = b >= 0 ? 1 : 1 + b;
    if (this.leftGain && this.rightGain && this.ctx) {
      const t = this.ctx.currentTime;
      this.leftGain.gain.setTargetAtTime(left, t, 0.03);
      this.rightGain.gain.setTargetAtTime(right, t, 0.03);
    }
  }

  getLevel(): number {
    if (!this.analyser) return 0;
    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / data.length);
  }

  getReduction(): number {
    return this.compressor?.reduction ?? 0;
  }

  async stop() {
    this.running = false;
    if (this.gateRaf) {
      cancelAnimationFrame(this.gateRaf);
      this.gateRaf = 0;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.ctx) {
      await this.ctx.close();
      this.ctx = null;
    }
  }
}

function dbToGain(db: number) {
  return Math.pow(10, db / 20);
}

function saveFingerprint(fp: Float32Array | null) {
  try {
    if (!fp) {
      localStorage.removeItem(FP_STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      FP_STORAGE_KEY,
      JSON.stringify(Array.from(fp)),
    );
  } catch {
    /* ignore */
  }
}

function loadFingerprint(): Float32Array | null {
  try {
    const raw = localStorage.getItem(FP_STORAGE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return Float32Array.from(arr);
  } catch {
    return null;
  }
}
