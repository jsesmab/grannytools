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
  fingerprint: number[];
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
  private gateTimer = 0;
  private gateOpen = true;
  private voiceFingerprint: Float32Array | null = null;
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

  setVoiceFingerprint(fp: Float32Array | null) {
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
      fingerprint: Array.from(this.voiceFingerprint),
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
    this.voiceFingerprint = Float32Array.from(profile.fingerprint);
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
   * Records ~`ms` of audio from the mic and returns a normalized average
   * magnitude spectrum that represents the speaker's voice timbre.
   * Used later to distinguish the user's own voice from other people's voices.
   */
  async captureVoiceFingerprint(ms = 2500): Promise<Float32Array> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
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
      an.fftSize = 512;
      an.smoothingTimeConstant = 0.2;
      src.connect(an);

      const bins = an.frequencyBinCount;
      const avg = new Float32Array(bins);
      const buf = new Uint8Array(bins);
      let frames = 0;
      let totalFrames = 0;

      await new Promise<void>((resolve) => {
        let stopped = false;
        const finish = () => { if (!stopped) { stopped = true; resolve(); } };
        setTimeout(finish, ms);
        const tick = () => {
          if (stopped) return;
          an.getByteFrequencyData(buf);
          let energy = 0;
          for (let i = 0; i < bins; i++) energy += buf[i];
          totalFrames++;
          // Accept frames with any reasonable signal (low bar for mobile mics)
          if (energy > bins * 3) {
            for (let i = 0; i < bins; i++) avg[i] += buf[i];
            frames++;
          }
          setTimeout(tick, 30);
        };
        tick();
      });

      if (frames < 3) {
        if (totalFrames === 0) {
          throw new Error("No se pudo capturar audio del micrófono.");
        }
        // Forgiving fallback: use the last frame so enrollment never blocks the app
        for (let i = 0; i < bins; i++) avg[i] = buf[i];
        frames = 1;
      }
      for (let i = 0; i < bins; i++) avg[i] /= frames;
      const fingerprint = makeVoiceFeatures(avg, ctx.sampleRate);
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
    this.inputAnalyser.fftSize = 512;
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
   * Lightweight smart gate. It stays open by default and only ducks the output
   * briefly when the mic signal is loud and similar to the selected voice.
   * This avoids heavy continuous processing on mobile devices.
   */
  private startGateLoop() {
    const SELF_VOICE_RMS = 0.09; // loudness threshold for "near-field" voice
    const SIM_THRESHOLD = 0.74; // cosine sim to user fingerprint
    const SELF_HOLD_MS = 260;

    const timeBuf = new Uint8Array(this.inputAnalyser.fftSize);
    const freqBuf = new Uint8Array(this.inputAnalyser.frequencyBinCount);

    let lastSelfAt = -Infinity;

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

      // Cosine similarity against the enrolled fingerprint.
      let sim = 0;
      if (this.voiceFingerprint) {
        const compareBins = Math.min(freqBuf.length, this.voiceFingerprint.length);
        let n = 0;
        for (let i = 0; i < compareBins; i++) {
          n += freqBuf[i] * freqBuf[i];
        }
        n = Math.sqrt(n);
        if (n > 0) {
          for (let i = 0; i < compareBins; i++) {
            sim += (freqBuf[i] / n) * this.voiceFingerprint[i];
          }
        }
      }

      const now = performance.now();
      // Self-voice = loud AND (matches fingerprint, or no fingerprint yet)
      const isSelf =
        rms >= SELF_VOICE_RMS &&
        (this.voiceFingerprint ? sim >= SIM_THRESHOLD : true);
      if (isSelf) lastSelfAt = now;

      // Gate is OPEN by default (so the conversation always comes through).
      // It only closes briefly when the user himself is talking.
      const shouldOpen = now - lastSelfAt >= SELF_HOLD_MS;

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
      this.gateTimer = window.setTimeout(tick, 80);
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
    candidate.fingerprint.length > 0 &&
    candidate.fingerprint.every((n) => typeof n === "number")
  );
}
