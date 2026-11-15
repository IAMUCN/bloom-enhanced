import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./BloomTip.css";

/** The notch's hover name ("Bloom tip", spec by Fable, 2026-11-15): one
 *  tooltip for the whole notch, shown for any element with `data-tip`
 *  (the name), optional `data-tip-state` ("On", an SSID) and
 *  `data-tip-place="below"` (tabs). It opens out of the element like a bud
 *  (a circular reveal from the edge facing it), slides between neighbours
 *  while warm, and stays inside the notch, which the window clips to. */

const SHOW_DELAY = 450;
/** After a tip hides, the next one shows at once for this long. */
const WARM_MS = 300;
const GAP = 6;

interface Tip {
	name: string;
	state?: string;
	below: boolean;
	x: number;
	y: number;
}

export function BloomTip({ root }: { root: React.RefObject<HTMLElement | null> }) {
	const [tip, setTip] = useState<Tip | null>(null);
	const timer = useRef<number>(0);
	const warmUntil = useRef(0);
	const target = useRef<HTMLElement | null>(null);
	const box = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const place = (el: HTMLElement): Tip => {
			const r = el.getBoundingClientRect();
			const below = el.dataset.tipPlace === "below";
			return {
				name: el.dataset.tip ?? "",
				state: el.dataset.tipState || undefined,
				below,
				x: r.left + r.width / 2,
				y: below ? r.bottom + GAP : r.top - GAP
			};
		};
		const hide = (warm: boolean) => {
			window.clearTimeout(timer.current);
			target.current = null;
			setTip((t) => {
				if (t && warm) warmUntil.current = Date.now() + WARM_MS;
				return null;
			});
		};
		const show = (el: HTMLElement, now: boolean) => {
			window.clearTimeout(timer.current);
			target.current = el;
			const go = () => target.current === el && setTip(place(el));
			if (now || Date.now() < warmUntil.current) go();
			else timer.current = window.setTimeout(go, SHOW_DELAY);
		};
		const tipOf = (e: Event) => {
			const el = (e.target as HTMLElement | null)?.closest?.("[data-tip]") as HTMLElement | null;
			return el && root.current?.contains(el) ? el : null;
		};
		const over = (e: PointerEvent) => {
			const el = tipOf(e);
			if (el === target.current) return;
			if (el) show(el, false);
			else if (target.current) hide(true);
		};
		const focus = (e: FocusEvent) => {
			const el = tipOf(e);
			if (el && el.matches(":focus-visible")) show(el, true);
		};
		const cancel = () => hide(false);
		document.addEventListener("pointerover", over);
		document.addEventListener("focusin", focus);
		document.addEventListener("focusout", cancel);
		document.addEventListener("pointerdown", cancel, true);
		document.addEventListener("wheel", cancel, { passive: true, capture: true });
		document.addEventListener("pointerleave", cancel);
		return () => {
			window.clearTimeout(timer.current);
			document.removeEventListener("pointerover", over);
			document.removeEventListener("focusin", focus);
			document.removeEventListener("focusout", cancel);
			document.removeEventListener("pointerdown", cancel, true);
			document.removeEventListener("wheel", cancel, true);
			document.removeEventListener("pointerleave", cancel);
		};
	}, [root]);

	// Keep the tip inside the notch: clamp it to the notch's inner edges.
	const [shift, setShift] = useState(0);
	useEffect(() => {
		const r = root.current?.getBoundingClientRect();
		const b = box.current?.getBoundingClientRect();
		if (!tip || !r || !b) return setShift(0);
		const half = b.width / 2;
		const min = r.left + 8 + half;
		const max = r.right - 8 - half;
		setShift(tip.x < min ? min - tip.x : tip.x > max ? max - tip.x : 0);
	}, [tip, root]);

	const origin = tip?.below ? "50% 0%" : "50% 100%";
	return createPortal(
		<AnimatePresence>
			{tip && (
				<motion.div
					key="bloom-tip"
					ref={box}
					className="bloom-tip"
					role="tooltip"
					style={{ transformOrigin: origin, translateX: "-50%", translateY: tip.below ? 0 : "-100%" }}
					initial={{ opacity: 0, scale: 0.6, y: tip.below ? -4 : 4, clipPath: `circle(0% at ${origin})`, left: tip.x + shift, top: tip.y }}
					animate={{
						opacity: 1,
						scale: 1,
						y: 0,
						clipPath: `circle(140% at ${origin})`,
						left: tip.x + shift,
						top: tip.y,
						transition: {
							type: "spring",
							stiffness: 520,
							damping: 30,
							mass: 0.7,
							opacity: { duration: 0.1 },
							clipPath: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
							left: { type: "spring", stiffness: 520, damping: 40 },
							top: { type: "spring", stiffness: 520, damping: 40 }
						}
					}}
					exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.09 } }}
				>
					<AnimatePresence mode="wait" initial={false}>
						<motion.span
							key={tip.name + (tip.state ?? "")}
							className="bloom-tip-text"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1, transition: { delay: 0.05, duration: 0.12 } }}
							exit={{ opacity: 0, transition: { duration: 0.08 } }}
						>
							{tip.name}
							{tip.state && (
								<span className={`bloom-tip-state${tip.state === "On" ? " on" : ""}`}> · {tip.state}</span>
							)}
						</motion.span>
					</AnimatePresence>
				</motion.div>
			)}
		</AnimatePresence>,
		document.body
	);
}
