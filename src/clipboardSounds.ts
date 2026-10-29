// Tiny synthesized clipboard sounds (`bloom-clipboard-sounds`), after
// Edge-Drop's Web Audio effects: no audio files, a few milliseconds each.

let ctx: AudioContext | null = null;

function tone(from: number, to: number, ms: number, gain: number, type: OscillatorType = "sine") {
	try {
		ctx ??= new AudioContext();
		if (ctx.state === "suspended") ctx.resume().catch(() => {});
		const now = ctx.currentTime;
		const osc = ctx.createOscillator();
		const amp = ctx.createGain();
		osc.type = type;
		osc.frequency.setValueAtTime(from, now);
		osc.frequency.exponentialRampToValueAtTime(to, now + ms / 1000);
		amp.gain.setValueAtTime(gain, now);
		amp.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);
		osc.connect(amp).connect(ctx.destination);
		osc.start(now);
		osc.stop(now + ms / 1000 + 0.02);
	} catch {
		/* no audio device: stay silent */
	}
}

export const clipSounds = {
	/** Copied an item back: a short high tick. */
	copy: () => tone(1800, 900, 40, 0.05),
	/** Deleted: a downward sweep and a soft thud. */
	delete: () => {
		tone(1400, 250, 30, 0.05);
		tone(150, 40, 90, 0.08);
	},
	/** Grouped or pinned: a resonant pop. */
	pop: () => tone(520, 880, 70, 0.06, "triangle")
};
