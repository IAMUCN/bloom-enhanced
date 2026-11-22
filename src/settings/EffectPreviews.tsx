import { useEffect, useState } from "react";
import { LotusSignature } from "../components/ProgressEffect";

/** Notch › Open Effect: an open notch that replays the lotus every few seconds
 *  (it reads the setting each lap, so a change shows on the next one). The
 *  shape follows the Style setting: attached (flat top) or floating pill. */
export function OpenEffectPreview() {
	const [lap, setLap] = useState(0);
	useEffect(() => {
		const timer = window.setInterval(() => setLap((n) => n + 1), 3200);
		return () => window.clearInterval(timer);
	}, []);
	const floating = localStorage.getItem("bloom-notch-style") === "pill";
	return (
		<div className="rp-stage">
			<div className={`ep-notch${floating ? " floating" : ""}`}>
				<LotusSignature key={lap} full={floating} />
				<span>Open</span>
			</div>
			<p className="rp-cap">The lotus lights the edge it crosses each time the notch opens.</p>
		</div>
	);
}
