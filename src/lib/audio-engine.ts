// Web Audio hearing-amplifier engine.
// Signal chain: mic -> highpass -> lowpass -> 5-band EQ -> compressor -> makeup gain -> master -> balance -> limiter -> destination

export type EnvironmentId = "conversacion" | "tv" | "restaurante" | "calle";

export interface EnvironmentPreset {
  id: EnvironmentId;
  label: string;
  description: string;
  bandsDb: [number, number, number, number, number]; // 250, 500, 1k, 2k, 4k Hz
  threshold: number; // dB
  ratio: number;
  makeupDb: number;
  highpassHz: number;
}

export const ENVIRONMENTS: EnvironmentPreset[] = [
  {
    id: "conversacion",
    label: "Conversación",
    description: "Realza voces cercanas con poco ruido de fondo.",
    bandsDb: [-3, 0, 7, 9, 4],
    threshold: -28,
    ratio: 3,
    makeupDb: 4,
    highpassHz: 180,
  },
  {
    id: "tv",
    label: "TV",
    description: "Claridad en diálogos de televisión.",
    bandsDb: [-4, -1, 6, 8, 5],
    threshold: -26,
    ratio: 2.5,
    makeupDb: 4,
    highpassHz: 150,
  },
  {
    id: "restaurante",
    label: "Restaurante",
    description: "Reduce ruido grave de fondo y enfoca la voz.",
    bandsDb: [-9, -5, 5, 10, 6],
    threshold: -22,
    ratio: 5,
    makeupDb: 3,
    highpassHz: 300,
  },
  {
    id: "calle",
    label: "Calle",
    description: "Atenúa tráfico y viento, prioriza voz y alertas.",
    bandsDb: [-11, -7, 4, 9, 7],
    threshold: -20,
    ratio: 7,
    makeupDb: 3,
    highpassHz: 360,
  },
];

const BAND_FREQS = [250, 500, 1000, 2000, 4000];
const MAX_MASTER_DB = 22;

export interface EngineOptions {
  preset: EnvironmentPreset;
  masterDb: number;
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
  private limiter!: DynamicsCompressorNode;
  private splitter!: ChannelSplitterNode;
  private merger!: ChannelMergerNode;
  private leftGain!: GainNode;
  private rightGain!: GainNode;
  private analyser!: AnalyserNode;
  private inputAnalyser!: AnalyserNode;
  private gate!: GainNode;
  private gateTimer = 0;
  private gateOpen = false;
  private noiseFloor = 0.01;
  private running = false;
  private starting = false;
  private sessionId = 0;
  private levelBuffer: Uint8Array<ArrayBuffer> | null = null;


  isRunning() {
    return this.running;
  }

  async start(opts: EngineOptions) {
    if (this.running || this.starting) return;
    this.starting = true;
    const sessionId = ++this.sessionId;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: 1,
        },
        video: false,
      });
      if (sessionId !== this.sessionId) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
        return;
      }

      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: "interactive" });
      if (this.ctx.state === "suspended") {
        try { await this.ctx.resume(); } catch { /* ignore */ }
      }

      this.source = this.ctx.createMediaStreamSource(this.stream);

      this.highpass = this.ctx.createBiquadFilter();
      this.highpass.type = "highpass";
      this.highpass.frequency.value = opts.preset.highpassHz;
      this.highpass.Q.value = 0.707;

      this.lowpass = this.ctx.createBiquadFilter();
      this.lowpass.type = "lowpass";
      this.lowpass.frequency.value = 6000;
      this.lowpass.Q.value = 0.707;

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
      this.master.gain.value = dbToGain(clampMasterDb(opts.masterDb));

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
      this.limiter.release.value = 0.08;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;

      this.inputAnalyser = this.ctx.createAnalyser();
      this.inputAnalyser.fftSize = 512;
      this.inputAnalyser.smoothingTimeConstant = 0.2;

      this.gate = this.ctx.createGain();
      this.gate.gain.value = 0;

      this.source.connect(this.inputAnalyser);

      let node: AudioNode = this.source;
      node.connect(this.highpass); node = this.highpass;
      node.connect(this.lowpass); node = this.lowpass;
      for (const b of this.bands) { node.connect(b); node = b; }
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
      this.gateOpen = false;
      this.noiseFloor = 0.01;
      this.startGateLoop();

    } catch (error) {
      await this.stop();
      throw error;
    } finally {
      this.starting = false;
    }
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
    this.master.gain.setTargetAtTime(dbToGain(clampMasterDb(db)), this.ctx.currentTime, 0.03);
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

  async stop() {
    this.sessionId++;
    this.starting = false;
    this.running = false;
    if (this.ctx) {
      const t = this.ctx.currentTime;
      try {
        this.master?.gain.cancelScheduledValues(t);
        this.master?.gain.setValueAtTime(0, t);
      } catch { /* ignore */ }
      try {
        this.analyser?.disconnect();
        this.limiter?.disconnect();
        this.merger?.disconnect();
        this.leftGain?.disconnect();
        this.rightGain?.disconnect();
        this.splitter?.disconnect();
        this.master?.disconnect();
        this.makeup?.disconnect();
        this.compressor?.disconnect();
        this.bands.forEach((band) => band.disconnect());
        this.lowpass?.disconnect();
        this.highpass?.disconnect();
        this.source?.disconnect();
      } catch { /* ignore */ }
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.ctx) {
      try { await this.ctx.close(); } catch { /* ignore */ }
      this.ctx = null;
    }
    this.source = null;
    this.levelBuffer = null;
  }
}

function dbToGain(db: number) {
  return Math.pow(10, db / 20);
}

function clampMasterDb(db: number) {
  return Math.min(MAX_MASTER_DB, Math.max(-10, db));
}
