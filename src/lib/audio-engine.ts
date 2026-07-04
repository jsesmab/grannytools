import { NoiseSuppressorWorklet_Name } from "@timephy/rnnoise-wasm";

// Web Audio hearing-amplifier engine.
// Signal chain: mic -> RNNoise -> voice gate -> highpass -> 5-band EQ -> compressor -> makeup gain -> limiter -> destination

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
    bandsDb: [-5, -1, 7, 9, 4],
    threshold: -28,
    ratio: 3,
    makeupDb: 8,
    highpassHz: 220,
  },
  {
    id: "tv",
    label: "TV",
    description: "Claridad en diálogos de televisión.",
    bandsDb: [-5, -1, 6, 8, 5],
    threshold: -26,
    ratio: 2.5,
    makeupDb: 7,
    highpassHz: 180,
  },
  {
    id: "restaurante",
    label: "Restaurante",
    description: "Reduce ruido grave de fondo y enfoca la voz.",
    bandsDb: [-10, -6, 5, 10, 6],
    threshold: -22,
    ratio: 5,
    makeupDb: 7,
    highpassHz: 320,
  },
  {
    id: "calle",
    label: "Calle",
    description: "Atenúa tráfico y viento, prioriza voz y alertas.",
    bandsDb: [-12, -8, 4, 9, 7],
    threshold: -20,
    ratio: 7,
    makeupDb: 6,
    highpassHz: 380,
  },
];

const BAND_FREQS = [250, 500, 1000, 2000, 4000];
const FP_STORAGE_KEY = "oyebien.voiceFingerprint.v1";
const FP_PROFILES_KEY = "oyebien.voiceProfiles.v1";
const ACTIVE_FP_PROFILE_KEY = "oyebien.activeVoiceProfile.v1";
const FP_VERSION = 3;

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

export interface VoiceProfile {
  id: string;
  name: string;
  createdAt: number;
}

interface StoredVoiceProfile extends VoiceProfile {
  fingerprint: SpeakerFingerprint;
}

interface SpeakerFingerprint {
  version: typeof FP_VERSION;
  features: Float32Array;
  rms: number;
  voiceRatio: number;
  createdAt: number;
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
  private noiseSuppressor: AudioNode | null = null;
  private running = false;
  private gateTimer = 0;
  private gateOpen = true;
  private noiseFloor = 0.006;
  private voiceFingerprint: SpeakerFingerprint | null = null;
  private levelBuffer: Uint8Array<ArrayBuffer> | null = null;

  constructor() {
    this.voiceFingerprint = loadActiveFingerprint() ?? loadFingerprint();
  }

  isRunning() {
    return this.running;
  }

  hasVoiceFingerprint() {
    return !!this.voiceFingerprint;
  }

  setVoiceFingerprint(fp: SpeakerFingerprint | null) {
    this.voiceFingerprint = fp;
    saveFingerprint(fp);
    if (!fp) saveActiveProfileId(null);
  }

  getVoiceProfiles(): VoiceProfile[] {
    return loadVoiceProfiles().map((stored) => ({
      id: stored.id,
      name: stored.name,
      createdAt: stored.createdAt,
    }));
  }

  getActiveVoiceProfileId(): string | null {
    return loadActiveProfileId();
  }

  saveCurrentVoiceProfile(name: string, id?: string): VoiceProfile | null {
    if (!this.voiceFingerprint) return null;
    const cleanName = name.trim() || "Voz principal";
    const profiles = loadVoiceProfiles();
    const profile: StoredVoiceProfile = {
      id: id ?? makeVoiceProfileId(),
      name: cleanName,
      createdAt: Date.now(),
      fingerprint: cloneFingerprint(this.voiceFingerprint),
    };
    const nextProfiles = profiles.filter((p) => p.id !== profile.id).concat(profile);
    saveVoiceProfiles(nextProfiles);
    saveActiveProfileId(profile.id);
    saveFingerprint(this.voiceFingerprint);
    return { id: profile.id, name: profile.name, createdAt: profile.createdAt };
  }

  selectVoiceProfile(id: string): boolean {
    const profile = loadVoiceProfiles().find((p) => p.id === id);
    if (!profile) return false;
    this.voiceFingerprint = cloneFingerprint(profile.fingerprint);
    saveFingerprint(this.voiceFingerprint);
    saveActiveProfileId(profile.id);
    return true;
  }

  deleteVoiceProfile(id: string) {
    const profiles = loadVoiceProfiles().filter((p) => p.id !== id);
    saveVoiceProfiles(profiles);
    if (loadActiveProfileId() === id) {
      saveActiveProfileId(null);
      this.setVoiceFingerprint(null);
    }
  }

  /**
   * Records ~`ms` of audio from the mic and returns a calibrated speaker
   * fingerprint. Only speech-like frames are accepted, so background noise is
   * much less likely to become part of the enrolled voice.
   */
  async captureVoiceFingerprint(ms = 4000): Promise<SpeakerFingerprint> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        channelCount: 1,
      },
      video: false,
    });
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch { /* ignore */ }
    }
    try {
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.12;
      src.connect(an);

      const bins = an.frequencyBinCount;
      const freqBuf = new Uint8Array(bins);
      const timeBuf = new Uint8Array(an.fftSize);
      const acceptedFeatures: Float32Array[] = [];
      const acceptedRms: number[] = [];
      const acceptedVoiceRatios: number[] = [];
      let totalFrames = 0;

      await new Promise<void>((resolve) => {
        let stopped = false;
        const finish = () => { if (!stopped) { stopped = true; resolve(); } };
        setTimeout(finish, ms);
        const tick = () => {
          if (stopped) return;
          an.getByteTimeDomainData(timeBuf);
          an.getByteFrequencyData(freqBuf);
          totalFrames++;
          const rms = getRms(timeBuf);
          const stats = getVoiceStats(freqBuf, ctx.sampleRate);
          const voiceScore = getVoiceScore(stats, rms);

          if (voiceScore >= 0.58 && rms >= 0.008) {
            acceptedFeatures.push(makeSpeakerFeatures(freqBuf, ctx.sampleRate));
            acceptedRms.push(rms);
            acceptedVoiceRatios.push(stats.voiceRatio);
          }
          setTimeout(tick, 40);
        };
        tick();
      });

      if (acceptedFeatures.length < 8) {
        throw new Error(
          totalFrames === 0
            ? "No se pudo capturar audio del micrófono."
            : "No he detectado suficiente voz clara. Acerca el móvil y habla durante unos segundos.",
        );
      }

      const fingerprint = makeSpeakerFingerprint(
        acceptedFeatures,
        acceptedRms,
        acceptedVoiceRatios,
      );
      this.setVoiceFingerprint(fingerprint);
      return fingerprint;
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
        echoCancellation: true,
        noiseSuppression: true,
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
    this.lowpass.frequency.value = 5200;
    this.lowpass.Q.value = 0.707;

    // Analyser placed before the EQ so detection sees the raw mic signal
    this.inputAnalyser = this.ctx.createAnalyser();
    this.inputAnalyser.fftSize = 512;
    this.inputAnalyser.smoothingTimeConstant = 0.2;

    this.noiseSuppressor = await this.createNoiseSuppressorNode();

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
    if (this.noiseSuppressor) {
      node.connect(this.noiseSuppressor);
      node = this.noiseSuppressor;
    }
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

  private async createNoiseSuppressorNode(): Promise<AudioNode | null> {
    if (!this.ctx || !("audioWorklet" in this.ctx)) return null;
    try {
      const workletModule = await import(
        "@timephy/rnnoise-wasm/NoiseSuppressorWorklet?worker&url"
      );
      await this.ctx.audioWorklet.addModule(workletModule.default);
      return new AudioWorkletNode(this.ctx, NoiseSuppressorWorklet_Name, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
    } catch (error) {
      console.warn("RNNoise unavailable; using browser noise suppression only", error);
      return null;
    }
  }

  /**
   * Lightweight smart gate. It stays open by default and only ducks the output
   * briefly when the mic signal is loud and similar to the selected voice.
   * This avoids heavy continuous processing on mobile devices.
   */
  private startGateLoop() {
    const MIN_VOICE_RMS = 0.006;
    const SELF_HOLD_MS = 780;
    const VOICE_HOLD_MS = 520;

    const timeBuf = new Uint8Array(this.inputAnalyser.fftSize);
    const freqBuf = new Uint8Array(this.inputAnalyser.frequencyBinCount);

    let lastSelfAt = -Infinity;
    let lastVoiceAt = -Infinity;

    const tick = () => {
      if (!this.running || !this.ctx) return;
      this.inputAnalyser.getByteTimeDomainData(timeBuf);
      this.inputAnalyser.getByteFrequencyData(freqBuf);

      const rms = getRms(timeBuf);

      const features = makeSpeakerFeatures(freqBuf, this.ctx.sampleRate);
      const voiceStats = getVoiceStats(freqBuf, this.ctx.sampleRate);
      const voiceScore = getVoiceScore(voiceStats, rms);

      // Cosine similarity against the enrolled voice profile.
      let sim = 0;
      if (this.voiceFingerprint) {
        const compareBins = Math.min(features.length, this.voiceFingerprint.features.length);
        for (let i = 0; i < compareBins; i++) sim += features[i] * this.voiceFingerprint.features[i];
      }

      const now = performance.now();
      if (voiceScore < 0.38) {
        this.noiseFloor = this.noiseFloor * 0.96 + rms * 0.04;
      }

      const fingerprint = this.voiceFingerprint;
      const dynamicThreshold = Math.max(MIN_VOICE_RMS, this.noiseFloor * 1.65);
      const enrolledRms = fingerprint?.rms ?? 0.035;
      const selfRmsFloor = Math.max(dynamicThreshold, enrolledRms * 0.3);
      const strongSelfMatch = sim >= 0.55 && rms >= selfRmsFloor;
      const nearFieldSelfMatch = sim >= 0.46 && rms >= Math.max(0.014, enrolledRms * 0.55);
      const isLikelyVoice = rms >= dynamicThreshold && voiceScore >= 0.5;
      const isSelf =
        isLikelyVoice &&
        !!fingerprint &&
        (strongSelfMatch || nearFieldSelfMatch);
      if (isLikelyVoice) lastVoiceAt = now;
      if (isSelf) lastSelfAt = now;

      // Open only for speech-like sound, and close for the selected user's voice.
      const shouldOpen = now - lastVoiceAt < VOICE_HOLD_MS && now - lastSelfAt >= SELF_HOLD_MS;

      if (shouldOpen !== this.gateOpen) {
        this.gateOpen = shouldOpen;
        // Fast close to kill self-voice / sudden noise, slightly slower open
        // so the conversation fades back in naturally.
        const tc = shouldOpen ? 0.035 : 0.012;
        this.gate.gain.setTargetAtTime(
          shouldOpen ? 1 : 0.015,
          this.ctx.currentTime,
          tc,
        );
      }
      this.gateTimer = window.setTimeout(tick, 35);
    };
    tick();
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
    const data = this.levelBuffer ?? new Uint8Array(this.analyser.fftSize);
    this.levelBuffer = data;
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
    if (this.gateTimer) {
      clearTimeout(this.gateTimer);
      this.gateTimer = 0;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.ctx) {
      await this.ctx.close();
      this.ctx = null;
    }
    this.noiseSuppressor = null;
  }
}

function dbToGain(db: number) {
  return Math.pow(10, db / 20);
}

function makeVoiceFeatures(spectrum: ArrayLike<number>, sampleRate: number) {
  const bands: Array<[number, number]> = [
    [180, 320],
    [320, 520],
    [520, 850],
    [850, 1300],
    [1300, 1900],
    [1900, 2700],
    [2700, 3800],
    [3800, 5000],
  ];
  const features = new Float32Array(bands.length);
  const binHz = sampleRate / 2 / spectrum.length;

  bands.forEach(([fromHz, toHz], bandIndex) => {
    const from = Math.max(1, Math.floor(fromHz / binHz));
    const to = Math.min(spectrum.length - 1, Math.ceil(toHz / binHz));
    let sum = 0;
    let count = 0;
    for (let i = from; i <= to; i++) {
      sum += Math.log1p(spectrum[i]);
      count++;
    }
    features[bandIndex] = count ? sum / count : 0;
  });

  let mean = 0;
  for (let i = 0; i < features.length; i++) mean += features[i];
  mean /= features.length;
  let norm = 0;
  for (let i = 0; i < features.length; i++) {
    features[i] -= mean;
    norm += features[i] * features[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < features.length; i++) features[i] /= norm;
  return features;
}

function getVoiceStats(spectrum: ArrayLike<number>, sampleRate: number) {
  const binHz = sampleRate / 2 / spectrum.length;
  let low = 0;
  let voice = 0;
  let high = 0;
  let total = 0;

  for (let i = 1; i < spectrum.length; i++) {
    const hz = i * binHz;
    const value = spectrum[i] * spectrum[i];
    if (hz < 220) low += value;
    if (hz >= 220 && hz <= 4200) voice += value;
    if (hz > 4200) high += value;
    total += value;
  }

  total ||= 1;
  return {
    lowRatio: low / total,
    voiceRatio: voice / total,
    highRatio: high / total,
  };
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
    if (!Array.isArray(arr) || arr.length !== 8) return null;
    return Float32Array.from(arr);
  } catch {
    return null;
  }
}

function loadVoiceProfiles(): StoredVoiceProfile[] {
  try {
    const raw = localStorage.getItem(FP_PROFILES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(isStoredVoiceProfile);
  } catch {
    return [];
  }
}

function saveVoiceProfiles(profiles: StoredVoiceProfile[]) {
  try {
    localStorage.setItem(FP_PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    /* ignore */
  }
}

function loadActiveProfileId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_FP_PROFILE_KEY);
  } catch {
    return null;
  }
}

function saveActiveProfileId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_FP_PROFILE_KEY, id);
    else localStorage.removeItem(ACTIVE_FP_PROFILE_KEY);
  } catch {
    /* ignore */
  }
}

function loadActiveFingerprint(): Float32Array | null {
  const activeId = loadActiveProfileId();
  if (!activeId) return null;
  const profile = loadVoiceProfiles().find((p) => p.id === activeId);
  return profile ? Float32Array.from(profile.fingerprint) : null;
}

function makeVoiceProfileId() {
  return `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isStoredVoiceProfile(value: unknown): value is StoredVoiceProfile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredVoiceProfile>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.createdAt === "number" &&
    Array.isArray(candidate.fingerprint) &&
    candidate.fingerprint.length === 8 &&
    candidate.fingerprint.every((n) => typeof n === "number")
  );
}
