import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ArrowLeft, Radio, UserPlus, Users, X } from "lucide-react";

type Peer = { id: string; name: string; trusted: boolean; online: boolean };
type Request = { id: string; name: string; code: number };

const code4 = (n: number) => String(n).padStart(4, "0");

/** The Shelf's share column: trusted people (online dot), Pair, and Live
 *  clipboard. On the right in the notch, along the bottom on a screen edge
 *  (.grill/shelf-share.md). Opening it asks who's online (the only time the
 *  network is asked; no polling). Pairing: both sides show one 4-digit code;
 *  the other side accepts. Sending (step 3), live clipboard (4) and groups
 *  (5) come next. */
export function ShareColumn({ layout }: { layout: "notch" | "edge" }) {
	const [peers, setPeers] = useState<Peer[]>([]);
	const [requests, setRequests] = useState<Request[]>([]);
	const [running, setRunning] = useState(true);
	const [nearby, setNearby] = useState(false);
	const [pairing, setPairing] = useState<{ id: string; name: string; code?: number } | null>(null);
	const [note, setNote] = useState("");

	useEffect(() => {
		const list = () => invoke<Peer[]>("share_list").then(setPeers).catch(() => {});
		invoke<Peer[]>("share_peers")
			.then(setPeers)
			.catch(() => setRunning(false));
		invoke<Request[]>("share_requests").then(setRequests).catch(() => {});
		const offs = [
			listen("share-peers-changed", list),
			listen<Request>("share-pair-request", (e) => setRequests((r) => [...r.filter((x) => x.id !== e.payload.id), e.payload])),
			listen<{ id: string; code: number }>("share-pair-code", (e) => setPairing((p) => (p && p.id === e.payload.id ? { ...p, code: e.payload.code } : p)))
		];
		return () => offs.forEach((o) => o.then((f) => f()));
	}, []);

	const pair = (p: Peer) => {
		setNote("");
		setPairing({ id: p.id, name: p.name });
		invoke("share_pair", { id: p.id })
			.then(() => {
				setNote(`Paired with ${p.name}`);
				setNearby(false);
			})
			.catch((e) => setNote(String(e)))
			.finally(() => setPairing(null));
	};
	const answer = (r: Request, accept: boolean) => {
		invoke("share_answer", { id: r.id, accept }).catch(() => {});
		setRequests((all) => all.filter((x) => x.id !== r.id));
	};

	const trusted = peers.filter((p) => p.trusted);
	const others = peers.filter((p) => !p.trusted);

	let body: React.ReactNode;
	if (!running) {
		body = <div className="clip-share-empty">Sharing is off: turn the Shelf on and restart LotusNotch.</div>;
	} else if (requests[0]) {
		const r = requests[0];
		body = (
			<div className="clip-share-card">
				<span>
					<b>{r.name}</b> wants to pair
				</span>
				<span className="clip-share-code">{code4(r.code)}</span>
				<span className="clip-share-hint">Accept only if {r.name} shows the same code.</span>
				<div className="clip-share-row">
					<button type="button" className="clip-share-btn primary" onClick={() => answer(r, true)}>
						Accept
					</button>
					<button type="button" className="clip-share-btn" onClick={() => answer(r, false)}>
						Decline
					</button>
				</div>
			</div>
		);
	} else if (pairing) {
		body = (
			<div className="clip-share-card">
				<span>
					Pairing with <b>{pairing.name}</b>
				</span>
				<span className="clip-share-code">{pairing.code !== undefined ? code4(pairing.code) : "····"}</span>
				<span className="clip-share-hint">Check {pairing.name} shows this code and accepts (up to 1 min).</span>
			</div>
		);
	} else if (nearby) {
		body = (
			<div className="clip-share-people">
				<button type="button" className="clip-share-back" onClick={() => setNearby(false)}>
					<ArrowLeft size={12} /> Nearby
				</button>
				{others.length ? (
					others.map((p) => (
						<button key={p.id} type="button" className="clip-share-person" title={`Pair with ${p.name}`} onClick={() => pair(p)}>
							<span className="clip-share-dot on" />
							<span className="clip-share-name">{p.name}</span>
							<UserPlus size={12} />
						</button>
					))
				) : (
					<div className="clip-share-empty">No other LotusNotch on this network.</div>
				)}
			</div>
		);
	} else {
		body = (
			<div className="clip-share-people">
				{trusted.length ? (
					trusted.map((p) => (
						<div key={p.id} className="clip-share-person" title={p.online ? `${p.name} · online` : `${p.name} · offline`}>
							<span className={`clip-share-dot${p.online ? " on" : ""}`} />
							<span className="clip-share-name">{p.name}</span>
							<button type="button" className="clip-share-forget" aria-label={`Forget ${p.name}`} title="Forget (unpair)" onClick={() => invoke("share_unpair", { id: p.id }).catch(() => {})}>
								<X size={10} />
							</button>
						</div>
					))
				) : (
					<div className="clip-share-empty">
						<Users size={16} strokeWidth={1.6} />
						<span>No one paired yet</span>
					</div>
				)}
			</div>
		);
	}

	return (
		<aside className={`clip-share ${layout}`} aria-label="Share" onClick={(e) => e.stopPropagation()}>
			<div className="clip-share-head">Share</div>
			{body}
			{note && !pairing && <div className="clip-share-note">{note}</div>}
			{!pairing && !requests.length && running && (
				<div className="clip-share-actions">
					{!nearby && (
						<button type="button" className="clip-share-btn" onClick={() => (setNote(""), setNearby(true))}>
							<UserPlus size={13} /> Pair
						</button>
					)}
					<button type="button" className="clip-share-btn" disabled title="Send everything you copy to chosen people (coming soon)">
						<Radio size={13} /> Live clipboard
					</button>
				</div>
			)}
		</aside>
	);
}
