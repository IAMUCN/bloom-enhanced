import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ArrowLeft, Check, Radio, Send, TriangleAlert, UserPlus, Users, X } from "lucide-react";

type Peer = { id: string; name: string; trusted: boolean; online: boolean };
type Request = { id: string; name: string; code: number };
/** A send to one person: progress, or how it ended. */
type Status = { done: number; total: number; error?: string; sent?: boolean };
/** What a person was sent, so a failed send can be retried. */
type Payload = { clips?: string[]; paths?: string[]; text?: string };

const code4 = (n: number) => String(n).padStart(4, "0");
const pct = (s: Status) => (s.total ? Math.floor((s.done / s.total) * 100) : 0);

/** The person (`data-share-peer`) under a drop position in physical
 *  pixels, as the drag-drop events report it. */
export function sharePeerAt(pos?: { x: number; y: number }) {
	if (!pos) return null;
	const el = document.elementFromPoint(pos.x / devicePixelRatio, pos.y / devicePixelRatio);
	return el?.closest<HTMLElement>("[data-share-peer]")?.dataset.sharePeer ?? null;
}

/** Asks the share column to send (from a drop): `share-send` window event. */
export const requestSend = (peer: string, payload: Payload) =>
	window.dispatchEvent(new CustomEvent("share-send", { detail: { peer, ...payload } }));

/** The Shelf's share column: trusted people (online dot), Pair, and Live
 *  clipboard. On the right in the notch, along the bottom on a screen edge
 *  (.grill/shelf-share.md). Opening it asks who's online (the only time the
 *  network is asked; no polling). Pairing: both sides show one 4-digit code.
 *  Sending: drag a clip onto a person, tick clips and click a person, or drop
 *  files from Explorer onto a person; progress shows as %. Live clipboard:
 *  a warning once, then pick who gets your copies (one way). Groups: step 5. */
export function ShareColumn({ layout, selected = [], onSent }: { layout: "notch" | "edge"; selected?: string[]; onSent?: () => void }) {
	const [peers, setPeers] = useState<Peer[]>([]);
	const [requests, setRequests] = useState<Request[]>([]);
	const [running, setRunning] = useState(true);
	const [nearby, setNearby] = useState(false);
	// Live clipboard: who gets my copies, and its view (warning first, once).
	const [live, setLive] = useState<string[]>([]);
	const [liveView, setLiveView] = useState(false);
	const [warned, setWarned] = useState(() => localStorage.getItem("bloom-share-live-warned") === "yes");
	const [pairing, setPairing] = useState<{ id: string; name: string; code?: number } | null>(null);
	const [note, setNote] = useState("");
	const [status, setStatus] = useState<Record<string, Status>>({});
	const [payloads, setPayloads] = useState<Record<string, Payload>>({});
	const [incoming, setIncoming] = useState<{ from: string; done: number; total: number } | null>(null);

	const send = (peer: string, payload: Payload) => {
		setPayloads((p) => ({ ...p, [peer]: payload }));
		setStatus((s) => ({ ...s, [peer]: { done: 0, total: 0 } }));
		const call = payload.clips
			? invoke("share_send", { id: peer, clips: payload.clips })
			: invoke("share_send_drop", { id: peer, paths: payload.paths ?? [], text: payload.text });
		call
			.then(() => {
				setStatus((s) => ({ ...s, [peer]: { ...s[peer], sent: true } }));
				window.setTimeout(() => setStatus(({ [peer]: done, ...rest }) => (done?.sent ? rest : { ...rest, [peer]: done })), 2500);
			})
			.catch((e) => setStatus((s) => ({ ...s, [peer]: { done: 0, total: 0, error: String(e) } })));
	};

	useEffect(() => {
		const list = () => invoke<Peer[]>("share_list").then(setPeers).catch(() => {});
		invoke<Peer[]>("share_peers")
			.then(setPeers)
			.catch(() => setRunning(false));
		invoke<Request[]>("share_requests").then(setRequests).catch(() => {});
		invoke<string[]>("share_live_get").then(setLive).catch(() => {});
		const onSend = (e: Event) => {
			const { peer, ...payload } = (e as CustomEvent<{ peer: string } & Payload>).detail;
			send(peer, payload);
		};
		window.addEventListener("share-send", onSend);
		const offs = [
			listen("share-peers-changed", list),
			listen<Request>("share-pair-request", (e) => setRequests((r) => [...r.filter((x) => x.id !== e.payload.id), e.payload])),
			listen<{ id: string; code: number }>("share-pair-code", (e) => setPairing((p) => (p && p.id === e.payload.id ? { ...p, code: e.payload.code } : p))),
			listen<{ id: string; done: number; total: number }>("share-progress", (e) =>
				setStatus((s) => (s[e.payload.id]?.error ? s : { ...s, [e.payload.id]: { done: e.payload.done, total: e.payload.total } }))
			),
			listen<{ from: string; done: number; total: number }>("share-incoming", (e) => setIncoming(e.payload)),
			listen<{ from: string; count: number }>("share-received", (e) => {
				setIncoming(null);
				setNote(`${e.payload.from} sent ${e.payload.count === 1 ? "something" : `${e.payload.count} things`}`);
			}),
			listen<{ from: string; why: string }>("share-incoming-failed", (e) => {
				setIncoming(null);
				setNote(`From ${e.payload.from}: stopped (${e.payload.why})`);
			})
		];
		return () => {
			window.removeEventListener("share-send", onSend);
			offs.forEach((o) => o.then((f) => f()));
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
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

	const toggleLive = (id: string) => {
		const next = live.includes(id) ? live.filter((x) => x !== id) : [...live, id];
		setLive(next);
		invoke("share_live_set", { ids: next }).catch(() => {});
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
	} else if (liveView && !warned) {
		body = (
			<div className="clip-share-card">
				<TriangleAlert size={18} color="#FFD60A" />
				<b>Live clipboard</b>
				<span className="clip-share-hint">
					Everything you copy goes to the people you pick, passwords too. Use it with care. Copies over 25 MB are skipped.
				</span>
				<div className="clip-share-row">
					<button
						type="button"
						className="clip-share-btn primary"
						onClick={() => {
							localStorage.setItem("bloom-share-live-warned", "yes");
							setWarned(true);
						}}
					>
						I understand
					</button>
					<button type="button" className="clip-share-btn" onClick={() => setLiveView(false)}>
						Cancel
					</button>
				</div>
			</div>
		);
	} else if (liveView) {
		body = (
			<div className="clip-share-people">
				<button type="button" className="clip-share-back" onClick={() => setLiveView(false)}>
					<ArrowLeft size={12} /> Send my copies to
				</button>
				{trusted.length ? (
					trusted.map((p) => (
						<button key={p.id} type="button" role="checkbox" aria-checked={live.includes(p.id)} className="clip-share-person" onClick={() => toggleLive(p.id)}>
							<span className={`clip-share-check${live.includes(p.id) ? " on" : ""}`}>{live.includes(p.id) && <Check size={10} strokeWidth={3} />}</span>
							<span className="clip-share-name">{p.name}</span>
						</button>
					))
				) : (
					<div className="clip-share-empty">Pair with someone first.</div>
				)}
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
					trusted.map((p) => {
						const st = status[p.id];
						const busy = !!st && !st.error && !st.sent;
						return (
							<div
								key={p.id}
								data-share-peer={p.id}
								className={`clip-share-person${selected.length ? " can-send" : ""}`}
								title={selected.length ? `Send ${selected.length} to ${p.name}` : p.online ? `${p.name} · online · drop here to send` : `${p.name} · offline`}
								onClick={() => {
									if (!selected.length || busy) return;
									send(p.id, { clips: selected });
									onSent?.();
								}}
							>
								<span className={`clip-share-dot${p.online ? " on" : ""}`} />
								<span className="clip-share-name">
									{p.name}
									{st && (
										<small className={`clip-share-status${st.error ? " bad" : ""}`}>
											{st.error ? st.error : st.sent ? "Sent" : `${pct(st)}%`}
										</small>
									)}
									{busy && (
										<span className="clip-share-bar">
											<span style={{ transform: `scaleX(${pct(st) / 100})` }} />
										</span>
									)}
								</span>
								{st?.error && payloads[p.id] ? (
									<button type="button" className="clip-share-retry" onClick={(e) => (e.stopPropagation(), send(p.id, payloads[p.id]))}>
										Retry
									</button>
								) : selected.length ? (
									<Send size={12} />
								) : (
									<button
										type="button"
										className="clip-share-forget"
										aria-label={`Forget ${p.name}`}
										title="Forget (unpair)"
										onClick={(e) => (e.stopPropagation(), invoke("share_unpair", { id: p.id }).catch(() => {}))}
									>
										<X size={10} />
									</button>
								)}
							</div>
						);
					})
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
			{incoming && (
				<div className="clip-share-note">
					Receiving from {incoming.from} · {Math.floor((incoming.done / Math.max(1, incoming.total)) * 100)}%
				</div>
			)}
			{note && !pairing && !incoming && <div className="clip-share-note">{note}</div>}
			{!pairing && !requests.length && running && (
				<div className="clip-share-actions">
					{!nearby && !liveView && (
						<button type="button" className="clip-share-btn" onClick={() => (setNote(""), setNearby(true))}>
							<UserPlus size={13} /> Pair
						</button>
					)}
					{!liveView && (
						<button
							type="button"
							className={`clip-share-btn${live.length ? " live-on" : ""}`}
							title="Send everything you copy to the people you pick"
							onClick={() => (setNearby(false), setLiveView(true))}
						>
							<Radio size={13} /> {live.length ? `Live · ${live.length}` : "Live clipboard"}
						</button>
					)}
				</div>
			)}
		</aside>
	);
}
