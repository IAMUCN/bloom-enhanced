// The radial menu's motion (OrbitDrop's wheel), shared by the menu and the
// Settings preview. `f` is the Animation Speed factor.

/** Slices start one after another, but the whole wave lasts 90 ms however many there are. */
export const lag = (i: number, n: number, f = 1) => (n > 1 ? (i / (n - 1)) * 0.09 * f : 0);

/** Settings › Radial Menu › Animation Speed: slow, normal or fast (a factor on every time). */
export const SPEEDS = { slow: 1.6, normal: 1, fast: 0.65 } as const;
export type Speed = keyof typeof SPEEDS;

/** Opening: the whole wheel grows from 0.4 with a small overshoot; a pick pops
 *  and fades; each slice swings in on its own spring (damping scales with the
 *  speed so the bounce keeps its shape). */
export const timing = (f: number) => ({
	bloom: { scale: { duration: 0.32 * f, ease: [0.3, 1.45, 0.5, 1] as const }, opacity: { duration: 0.2 * f } },
	pop: 140 * f,
	slice: { type: "spring", stiffness: 420 / (f * f), damping: 22 / f } as const
});
