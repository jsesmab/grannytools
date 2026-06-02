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
    ratio: 6,
    makeupDb: 7,
    highpassHz: 300,
  },
];

const BAND_FREQS = [250, 500, 1000, 2000, 4000];

export interface EngineOptions {
  preset: EnvironmentPreset;
  masterDb: number; // user volume in dB, e.g. -10..+20
  balance: number; // -1 (left) .. +1 (right)
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private highpass!: BiquadFilterNode;
  private bands: BiquadFilterNode[] = [];
  private compressor!: DynamicsCompressorNode;
  private makeup!: GainNode;
  private master!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private splitter!: ChannelSplitterNode;
  private merger!: ChannelMergerNode;
  private leftGain!: GainNode;
  private rightGain!: GainNode;
  private analyser!: AnalyserNode;
  private running = false;

  isRunning() {
    return this.running;
  }

  async start(opts: EngineOptions) {
    if (this.running) return;

    // Request mic with all browser DSP off — echo cancellation in particular
    // mutes the amplified signal because it detects it coming back through the
    // headphones/speaker and treats it as feedback.
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
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: "interactive" });
    if (this.ctx.state === "suspended") {
      try { await this.ctx.resume(); } catch { /* ignore */ }
    }

    this.source = this.ctx.createMediaStreamSource(this.stream);

    // High-pass to kill rumble & reduce feedback
    this.highpass = this.ctx.createBiquadFilter();
    this.highpass.type = "highpass";
    this.highpass.frequency.value = opts.preset.highpassHz;
    this.highpass.Q.value = 0.707;

    // 5-band peaking EQ
    this.bands = BAND_FREQS.map((freq, i) => {
      const b = this.ctx!.createBiquadFilter();
      b.type = "peaking";
      b.frequency.value = freq;
      b.Q.value = 1.2;
      b.gain.value = opts.preset.bandsDb[i];
      return b;
    });

    // Multiband-ish compression (single compressor, good first pass)
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

    // L/R balance
    this.splitter = this.ctx.createChannelSplitter(2);
    this.merger = this.ctx.createChannelMerger(2);
    this.leftGain = this.ctx.createGain();
    this.rightGain = this.ctx.createGain();
    this.applyBalance(opts.balance);

    // Brick-wall-ish limiter for hearing safety
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.05;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;

    // Wire up
    let node: AudioNode = this.source;
    node.connect(this.highpass);
    node = this.highpass;
    for (const b of this.bands) {
      node.connect(b);
      node = b;
    }
    node.connect(this.compressor);
    this.compressor.connect(this.makeup);
    this.makeup.connect(this.master);
    this.master.connect(this.splitter);
    this.splitter.connect(this.leftGain, 0);
    // mono source -> route same channel to both
    this.splitter.connect(this.rightGain, 0);
    this.leftGain.connect(this.merger, 0, 0);
    this.rightGain.connect(this.merger, 0, 1);
    this.merger.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this.running = true;
  }

  applyPreset(preset: EnvironmentPreset) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.highpass.frequency.setTargetAtTime(preset.highpassHz, t, 0.05);
    preset.bandsDb.forEach((db, i) => {
      this.bands[i].gain.setTargetAtTime(db, t, 0.05);
    });
    this.compressor.threshold.setTargetAtTime(preset.threshold, t, 0.05);
    this.compressor.ratio.setTargetAtTime(preset.ratio, t, 0.05);
    this.makeup.gain.setTargetAtTime(dbToGain(preset.makeupDb), t, 0.05);
  }

  setMasterDb(db: number) {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.03);
  }

  setBalance(balance: number) {
    this.applyBalance(balance);
  }

  private applyBalance(balance: number) {
    // balance: -1 full left, 0 center, +1 full right
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
    return Math.sqrt(sum / data.length); // 0..1
  }

  getReduction(): number {
    return this.compressor?.reduction ?? 0; // negative dB
  }

  async stop() {
    this.running = false;
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
