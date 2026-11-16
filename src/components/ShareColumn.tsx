import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ArrowLeft, Check, LogOut, Plus, Radio, Send, Settings2, TriangleAlert, UserPlus, Users, X } from "lucide-react";

type Peer = { id: string; name: string; trusted: boolean; online: boolean };
type Request = { id: string; name: string; code: number };
type Member = { id: string; name: string };
type Group = { gid: string; name: string; members: Member[] };
type Invite = { gid: string; name: string; from?: string };
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
 *  a warning once, then pick who gets your copies (one way). Groups: shared
 *  (up to 15), any member adds or removes, sends go to everyone online. */
export function ShareColumn({
	layout,
	selected = [],
	dragging = null,
	onSent
}: {
	layout: "notch" | "edge";
	selected?: string[];
	/** What is being dragged out of the Shelf ("2 files", a file name…). */
	dragging?: string | null;
	onSent?: () => void;
}) {
	const [peers, setPeers] = useState<Peer[]>([]);
	const [requests, setRequests] = useState<Request[]>([]);
	const [running, setRunning] = useState(true);
	const [nearby, setNearby] = useState(false);
	// Live clipboard: who gets my copies, and its view (warning first, once).
	const [live, setLive] = useState<string[]>([]);
	const [liveView, setLiveView] = useState(false);
	const [warned, setWarned] = useState(() => localStorage.getItem("bloom-share-live-warned") === "yes");
	const [pairing, setPairing] = useState<{ id: string; name: string; code?: number; error?: string } | null>(null);
	const [note, setNote] = useState("");
	const [status, setStatus] = useState<Record<string, Status>>({});
	const [payloads, setPayloads] = useState<Record<string, Payload>>({});
	const [incoming, setIncoming] = useState<{ from: string; done: number; total: number } | null>(null);
	const [groups, setGroups] = useState<Group[]>([]);
	const [invites, setInvites] = useState<Invite[]>([]);
	const [me, setMe] = useState("");
	// null = people; "new" = make a group; a gid = manage that group.
	const [groupView, setGroupView] = useState<string | null>(null);
	const [newName, setNewName] = useState("");
	const [newPick, setNewPick] = useState<string[]>([]);
	const loadGroups = () =>
		invoke<{ groups: Group[]; invites: Invite[]; me: string }>("share_groups")
			.then((r) => {
				setGroups(r.groups);
				setInvites((old) => r.invites.map((i) => ({ ...i, from: old.find((o) => o.gid === i.gid)?.from })));
				setMe(r.me);
			})
			.catch(() => {});

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
		loadGroups();
		const onSend = (e: Event) => {
			const { peer, ...payload } = (e as CustomEvent<{ peer: string } & Payload>).detail;
			send(peer, payload);
		};
		window.addEventListener("share-send", onSend);
		const offs = [
			listen("share-peers-changed", () => (list(), loadGroups())),
			listen<Invite>("share-group-invite", (e) => setInvites((all) => [...all.filter((x) => x.gid !== e.payload.gid), e.payload])),
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
				setPairing(null);
				setNote(`Paired with ${p.name}`);
				setNearby(false);
			})
			// The card stays with the reason until it's dismissed.
			.catch((e) => setPairing({ id: p.id, name: p.name, error: String(e) }));
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
	const onlineIds = new Set(peers.filter((p) => p.online).map((p) => p.id));
	const act = (call: Promise<unknown>) => call.then(loadGroups).catch((e) => setNote(String(e)));
	const managed = groups.find((g) => g.gid === groupView);

	/** A person or group you can drop on, or click to send the ticked clips. */
	const target = (id: string, name: string, online: boolean, title: string, side: React.ReactNode, icon?: React.ReactNode) => {
		const st = status[id];
		const busy = !!st && !st.error && !st.sent;
		return (
			<div
				key={id}
				data-share-peer={id}
				className={`clip-share-person${selected.length ? " can-send" : ""}`}
				title={selected.length ? `Send ${selected.length} to ${name}` : title}
				onClick={() => {
					if (!selected.length || busy) return;
					send(id, { clips: selected });
					onSent?.();
				}}
			>
				{icon ?? <span className={`clip-share-dot${online ? " on" : ""}`} />}
				<span className="clip-share-name">
					{name}
					{st && <small className={`clip-share-status${st.error ? " bad" : ""}`}>{st.error ? st.error : st.sent ? "Sent" : `${pct(st)}%`}</small>}
					{busy && (
						<span className="clip-share-bar">
							<span style={{ transform: `scaleX(${pct(st) / 100})` }} />
						</span>
					)}
				</span>
				{st?.error && payloads[id] ? (
					<button type="button" className="clip-share-retry" onClick={(e) => (e.stopPropagation(), send(id, payloads[id]))}>
						Retry
					</button>
				) : selected.length ? (
					<Send size={12} />
				) : (
					side
				)}
			</div>
		);
	};

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
	} else if (pairing?.error) {
		const unreachable = /reach|answer|dropped/i.test(pairing.error);
		body = (
			<div className="clip-share-card">
				<TriangleAlert size={18} color="#FF9F0A" />
				<span>
					Couldn't pair with <b>{pairing.name}</b>
				</span>
				<span className="clip-share-hint">
					{unreachable
						? "Both PCs need the same Wi-Fi, set to Private, and LotusNotch allowed in Windows Firewall."
						: pairing.error}
				</span>
				<div className="clip-share-row">
					<button type="button" className="clip-share-btn" onClick={() => setPairing(null)}>
						OK
					</button>
				</div>
			</div>
		);
	} else if (pairing) {
		body = (
			<div className="clip-share-card">
				<span>
					{pairing.code === undefined ? "Connecting to " : "Pairing with "}
					<b>{pairing.name}</b>
				</span>
				<span className="clip-share-code">{pairing.code !== undefined ? code4(pairing.code) : "····"}</span>
				<span className="clip-share-hint">
					{pairing.code === undefined
						? "The code shows once you're connected."
						: `Check ${pairing.name} shows this code, then they accept (up to 1 min).`}
				</span>
			</div>
		);
	} else if (invites[0]) {
		const inv = invites[0];
		const answerInvite = (join: boolean) => {
			setInvites((all) => all.filter((x) => x.gid !== inv.gid));
			act(invoke("share_invite_answer", { gid: inv.gid, join }));
		};
		body = (
			<div className="clip-share-card">
				<Users size={18} />
				<span>
					{inv.from ? `${inv.from} added you to ` : "You were added to "}
					<b>{inv.name}</b>
				</span>
				<div className="clip-share-row">
					<button type="button" className="clip-share-btn primary" onClick={() => answerInvite(true)}>
						Join
					</button>
					<button type="button" className="clip-share-btn" onClick={() => answerInvite(false)}>
						Ignore
					</button>
				</div>
			</div>
		);
	} else if (groupView === "new") {
		body = (
			<div className="clip-share-people">
				<button type="button" className="clip-share-back" onClick={() => setGroupView(null)}>
					<ArrowLeft size={12} /> New group
				</button>
				<input className="clip-share-input" value={newName} maxLength={32} placeholder="Group name" aria-label="Group name" onChange={(e) => setNewName(e.target.value)} />
				{trusted.length ? (
					trusted.map((p) => (
						<button
							key={p.id}
							type="button"
							role="checkbox"
							aria-checked={newPick.includes(p.id)}
							className="clip-share-person"
							onClick={() => setNewPick((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : x.length < 14 ? [...x, p.id] : x))}
						>
							<span className={`clip-share-check${newPick.includes(p.id) ? " on" : ""}`}>{newPick.includes(p.id) && <Check size={10} strokeWidth={3} />}</span>
							<span className="clip-share-name">{p.name}</span>
						</button>
					))
				) : (
					<div className="clip-share-empty">Pair with people first, then group them.</div>
				)}
				<button
					type="button"
					className="clip-share-btn primary"
					disabled={!newName.trim() || !newPick.length}
					onClick={() =>
						act(invoke("share_group_create", { name: newName, ids: newPick })).then(() => {
							setGroupView(null);
							setNewName("");
							setNewPick([]);
						})
					}
				>
					Create · {newPick.length + 1} people
				</button>
			</div>
		);
	} else if (managed) {
		const addable = trusted.filter((p) => !managed.members.some((m) => m.id === p.id));
		body = (
			<div className="clip-share-people">
				<button type="button" className="clip-share-back" onClick={() => setGroupView(null)}>
					<ArrowLeft size={12} /> {managed.name} · {managed.members.length}/15
				</button>
				{managed.members.map((m) => (
					<div key={m.id} className="clip-share-person">
						<span className={`clip-share-dot${m.id === me || onlineIds.has(m.id) ? " on" : ""}`} />
						<span className="clip-share-name">{m.id === me ? `${m.name} (you)` : m.name}</span>
						{m.id !== me && (
							<button type="button" className="clip-share-forget" aria-label={`Remove ${m.name}`} title="Remove from the group" onClick={() => act(invoke("share_group_remove", { gid: managed.gid, id: m.id }))}>
								<X size={10} />
							</button>
						)}
					</div>
				))}
				{managed.members.length < 15 &&
					addable.map((p) => (
						<button key={p.id} type="button" className="clip-share-person faint" title={`Add ${p.name}`} onClick={() => act(invoke("share_group_add", { gid: managed.gid, id: p.id }))}>
							<Plus size={12} />
							<span className="clip-share-name">{p.name}</span>
						</button>
					))}
				<button
					type="button"
					className="clip-share-btn"
					onClick={() => act(invoke("share_group_leave", { gid: managed.gid })).then(() => setGroupView(null))}
				>
					<LogOut size={13} /> Leave group
				</button>
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
					[...trusted.map((p) => [p.id, p.name]), ...groups.map((g) => [`group:${g.gid}`, `${g.name} (group)`])].map(([id, name]) => (
						<button key={id} type="button" role="checkbox" aria-checked={live.includes(id)} className="clip-share-person" onClick={() => toggleLive(id)}>
							<span className={`clip-share-check${live.includes(id) ? " on" : ""}`}>{live.includes(id) && <Check size={10} strokeWidth={3} />}</span>
							<span className="clip-share-name">{name}</span>
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
				{trusted.map((p) =>
					target(
						p.id,
						p.name,
						p.online,
						p.online ? `${p.name} · online · drop here to send` : `${p.name} · offline`,
						<button
							type="button"
							className="clip-share-forget"
							aria-label={`Forget ${p.name}`}
							title="Forget (unpair)"
							onClick={(e) => (e.stopPropagation(), invoke("share_unpair", { id: p.id }).catch(() => {}))}
						>
							<X size={10} />
						</button>
					)
				)}
				{groups.map((g) => {
					const on = g.members.filter((m) => m.id !== me && onlineIds.has(m.id)).length;
					return target(
						`group:${g.gid}`,
						g.name,
						on > 0,
						`${g.name} · ${g.members.length} people, ${on} online · drop here to send`,
						<button type="button" className="clip-share-forget" aria-label={`Manage ${g.name}`} title="People in this group" onClick={(e) => (e.stopPropagation(), setGroupView(g.gid))}>
							<Settings2 size={10} />
						</button>,
						<Users size={12} className={on ? "clip-share-group on" : "clip-share-group"} />
					);
				})}
				{!trusted.length && !groups.length && (
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
			{running && (dragging || selected.length > 0) && trusted.length + groups.length > 0 && (
				<div className="clip-share-banner">
					{dragging
						? `Drop ${dragging} on a person to send it`
						: `${selected.length} selected · click a person to send`}
				</div>
			)}
			{body}
			{incoming && (
				<div className="clip-share-note">
					Receiving from {incoming.from} · {Math.floor((incoming.done / Math.max(1, incoming.total)) * 100)}%
				</div>
			)}
			{note && !pairing && !incoming && <div className="clip-share-note">{note}</div>}
			{!pairing && !requests.length && !invites.length && !groupView && running && (
				<div className="clip-share-actions">
					{!nearby && !liveView && trusted.length > 0 && (
						<button type="button" className="clip-share-btn" onClick={() => (setNote(""), setGroupView("new"))}>
							<Users size={13} /> New group
						</button>
					)}
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
