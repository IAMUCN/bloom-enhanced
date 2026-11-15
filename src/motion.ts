// LotusNotch motion: Apple-style springs (spec by Fable, 2026-11-15).
// Four tokens, used everywhere. Exits never bounce. Animations are on by
// default whatever Windows says (user, 2026-11-15); Settings › Appearance ›
// Animations can turn them off, and Battery saver may pause them.

/** Quick, nearly settled: presses, small swaps. */
export const SNAP = { type: "spring", visualDuration: 0.2, bounce: 0.2 } as const;
/** The default for things arriving: tool bodies, lists, size changes. */
export const LIVELY = { type: "spring", visualDuration: 0.35, bounce: 0.3 } as const;
/** The playful moment: releasing a tile, opening the notch. */
export const BOUNCY = { type: "spring", visualDuration: 0.45, bounce: 0.45 } as const;
/** Leaving: fast, no bounce. */
export const EXIT = { duration: 0.14, ease: [0.4, 0, 1, 1] } as const;

/** Tool bodies slide toward the tab you picked: `dir` is +1 for a tab to the
 *  right, -1 for one to the left, 0 on first open (a small rise instead). */
export const BODY_VARIANTS = {
	enter: (dir: number) => (dir ? { opacity: 0, x: 24 * dir, scale: 0.98 } : { opacity: 0, y: 8, scale: 0.98 }),
	center: { opacity: 1, x: 0, y: 0, scale: 1, transition: LIVELY },
	exit: (dir: number) => ({ opacity: 0, x: -16 * dir, transition: EXIT })
};

/** Props for a tool body: <motion.div {...bodyMotion(dir)}>. */
export const bodyMotion = (dir: number) => ({
	variants: BODY_VARIANTS,
	custom: dir,
	initial: "enter",
	animate: "center",
	exit: "exit"
});

/** The Command Center steps aside while its Wi-Fi / Bluetooth list pushes in. */
export const CC_EXIT = { opacity: 0, x: -16, scale: 0.97, transition: EXIT };
export const LIST_MOTION = {
	initial: { opacity: 0, x: 32 },
	animate: { opacity: 1, x: 0, transition: LIVELY },
	exit: { opacity: 0, x: 32, transition: EXIT }
};
