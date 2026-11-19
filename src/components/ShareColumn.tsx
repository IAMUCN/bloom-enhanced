import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ArrowLeft, Check, LogOut, Plus, Radio, Settings2, TriangleAlert, UserPlus, Users, X } from "lucide-react";

type Peer = { id: string; name: string; trusted: boolean; online: boolean };
type Request = { id: string; name: string; code: number };
type Member = { id: string; name: string };
type Group = { gid: string; name: string; members: Member[] };
type Invite = { gid: string; name: string; from?: string };
/** A send to one person: progress, or how it ended. */
type Status = { done: number; total: number; error?: string; sent?: boolean };
/** What a person was sent, so a failed send can be retried. */
type Payload = { clips?: string[]; paths?: string[]; text?: string };
/** The sheet over the history: what it shows. */
type Sheet = null | "name" | "pair" | "live" | "groups" | "new-group" | { group: string };

/** The last people and groups seen, kept while the Shelf is closed so that
 *  reopening it shows them at once instead of an empty row that fills in. */
const seen: { peers: Peer[] | null; groups: Group[] } = { peers: null, groups: [] };

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

/** A progress ring in place of the person's dot while sending; full (and
 *  green) once sent. */
const Ring = ({ value, done }: { value: number; done?: boolean }) => (
	<svg className={`clip-share-ring${done ? " done" : ""}`} viewBox="0 0 16 16" aria-hidden>
		<circle cx="8" cy="8" r="6" pathLength={100} />
		<circle cx="8" cy="8" r="6" pathLength={100} strokeDasharray="100" strokeDashoffset={100 - (done ? 100 : value)} />
	</svg>
);

/** Shelf sharing (.grill/shelf-share.md, prototype R26): Pair, Groups and
 *  Live are icons at the end of the filter row (`tools`); each opens a sheet
 *  over the history. The bottom row lists paired people by name with a green
 *  (online) or gray dot, then groups, in one row that scrolls sideways (and
 *  by itself while a drag nears either end). Pair requests and group invites
 *  show in that row with Accept / Join. Opening it asks who's online (the
 *  only time the network is asked; no polling). */
export function ShareColumn({
	layout,
	selected = [],
	dragging = null,
	onSent,
	tools,
	dragOverEvent
}: {
	layout: "notch" | "edge";
	selected?: string[];
	/** What is being dragged out of the Shelf ("2 files", a file name…). */
	dragging?: string | null;
	onSent?: () => void;
	/** Where the Pair / Groups / Live icons go (the filter row). */
	tools?: HTMLElement | null;
	/** The drag-over event of this window's drop target (physical px). */
	dragOverEvent?: string;
}) {
	const rowRef = useRef<HTMLDivElement>(null);
	const [peers, setPeersState] = useState<Peer[] | null>(seen.peers);
	const setPeers = (list: Peer[]) => setPeersState((seen.peers = list));
	const [requests, setRequests] = useState<Request[]>([]);
	const [running, setRunning] = useState(true);
	const [myName, setMyName] = useState(() => localStorage.getItem("bloom-share-name") ?? "");
	const [sheet, setSheet] = useState<Sheet>(null);
	const [live, setLive] = useState<string[]>([]);
	const [warned, setWarned] = useState(() => localStorage.getItem("bloom-share-live-warned") === "yes");
	const [pairing, setPairing] = useState<{ id: string; name: string; code?: number; error?: string } | null>(null);
	const [note, setNote] = useState("");
	const [status, setStatus] = useState<Record<string, Status>>({});
	const [payloads, setPayloads] = useState<Record<string, Payload>>({});
	const [incoming, setIncoming] = useState<{ from: string; done: number; total: number } | null>(null);
	const [groups, setGroupsState] = useState<Group[]>(seen.groups);
	const setGroups = (list: Group[]) => setGroupsState((seen.groups = list));
	const [invites, setInvites] = useState<Invite[]>([]);
	const [me, setMe] = useState("");
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
		// Paired people at once from what's saved, then who's online.
		if (!seen.peers) list();
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

	// A drag near either end of the people row scrolls it.
	useEffect(() => {
		if (!dragOverEvent) return;
		const off = listen<{ position: { x: number; y: number } }>(dragOverEvent, (e) => {
			const row = rowRef.current;
			if (!row || row.scrollWidth <= row.clientWidth) return;
			const x = e.payload.position.x / devicePixelRatio;
			const y = e.payload.position.y / devicePixelRatio;
			const r = row.getBoundingClientRect();
			if (y < r.top - 8 || y > r.bottom + 8) return;
			const edge = Math.min(48, r.width / 4);
			if (x < r.left + edge) row.scrollLeft -= 18;
			else if (x > r.right - edge) row.scrollLeft += 18;
		});
		return () => void off.then((f) => f());
	}, [dragOverEvent]);

	const saveName = (raw: string) => {
		const name = raw.trim().slice(0, 48);
		if (!name) return;
		localStorage.setItem("bloom-share-name", name);
		setMyName(name);
		invoke("save_setting", { key: "bloom-share-name", value: name }).catch(() => {});
		invoke("share_set_name", { name }).catch(() => {});
		openPair();
	};
	const openPair = () => {
		setNote("");
		setSheet(localStorage.getItem("bloom-share-name")?.trim() ? "pair" : "name");
		invoke<Peer[]>("share_peers").then(setPeers).catch(() => {});
	};

	const pair = (p: Peer) => {
		setNote("");
		setPairing({ id: p.id, name: p.name });
		invoke("share_pair", { id: p.id })
			.then(() => {
				setPairing(null);
				setSheet(null);
				setNote(`Paired with ${p.name}`);
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

	const known = peers ?? [];
	const trusted = known.filter((p) => p.trusted);
	const others = known.filter((p) => !p.trusted);
	const onlineIds = new Set(known.filter((p) => p.online).map((p) => p.id));
	const act = (call: Promise<unknown>) => call.then(loadGroups).catch((e) => setNote(String(e)));
	const managed = sheet && typeof sheet === "object" ? groups.find((g) => g.gid === sheet.group) : undefined;
	const hasPeople = trusted.length + groups.length > 0;
	const liveCount = live.filter((id) => trusted.some((p) => p.id === id)).length;
	const back = (label: string, to: Sheet = null) => (
		<button type="button" className="clip-share-back" onClick={() => (setSheet(to), setPairing(null))}>
			<ArrowLeft size={12} /> {label}
		</button>
	);
	const check = (on: boolean) => <span className={`clip-share-check${on ? " on" : ""}`}>{on && <Check size={10} strokeWidth={3} />}</span>;

	// What the sheet shows: anything waiting for an answer comes first.
	let body: React.ReactNode = null;
	if (!running) {
		if (sheet) body = <div className="clip-share-card">Sharing is off: turn the Shelf on and restart LotusNotch.</div>;
	} else if (sheet === "name") {
		body = (
			<div className="clip-share-card">
				<b>What should people see?</b>
				<span className="clip-share-hint">Your name is only shown to people you pair with. Change it later in Settings › Shelf.</span>
				<input
					className="clip-share-input"
					autoFocus
					maxLength={48}
					defaultValue={myName}
					placeholder="Your name"
					aria-label="Your name"
					onKeyDown={(e) => e.key === "Enter" && saveName(e.currentTarget.value)}
				/>
				<div className="clip-share-row">
					<button
						type="button"
						className="clip-share-btn primary"
						onClick={(e) => saveName((e.currentTarget.closest(".clip-share-card")?.querySelector("input") as HTMLInputElement).value)}
					>
						Continue
					</button>
					<button type="button" className="clip-share-btn" onClick={() => setSheet(null)}>
						Cancel
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
					{unreachable ? "Both PCs need the same Wi-Fi, set to Private, and LotusNotch allowed in Windows Firewall." : pairing.error}
				</span>
				<button type="button" className="clip-share-btn" onClick={() => setPairing(null)}>
					OK
				</button>
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
					{pairing.code === undefined ? "The code shows once you're connected." : `Check ${pairing.name} shows this code, then they accept (up to 1 min).`}
				</span>
			</div>
		);
	} else if (sheet === "pair") {
		body = (
			<div className="clip-share-list">
				{back("Pair with someone nearby")}
				{others.length ? (
					others.map((p) => (
						<button key={p.id} type="button" className="clip-share-person" title={`Pair with ${p.name}`} onClick={() => pair(p)}>
							<span className="clip-share-dot on" />
							<span className="clip-share-name">{p.name}</span>
							<UserPlus size={13} />
						</button>
					))
				) : (
					<div className="clip-share-empty">
						No other LotusNotch on this network. They need it open, on the same Wi-Fi (set to Private).
					</div>
				)}
			</div>
		);
	} else if (sheet === "live" && !warned) {
		body = (
			<div className="clip-share-card">
				<TriangleAlert size={18} color="#FFD60A" />
				<b>Live clipboard</b>
				<span className="clip-share-hint">Everything you copy goes to the people you pick, passwords too. Use it with care. Copies over 25 MB are skipped.</span>
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
					<button type="button" className="clip-share-btn" onClick={() => setSheet(null)}>
						Cancel
					</button>
				</div>
			</div>
		);
	} else if (sheet === "groups") {
		body = (
			<div className="clip-share-list">
				{back("Groups · send to several people at once")}
				{groups.map((g) => (
					<button key={g.gid} type="button" className="clip-share-person" onClick={() => setSheet({ group: g.gid })}>
						<Users size={12} />
						<span className="clip-share-name">{g.name}</span>
						<small>{g.members.length}</small>
					</button>
				))}
				{!groups.length && <div className="clip-share-empty">A group shows up next to people at the bottom: drop something on it to send it to everyone in it.</div>}
				<button
					type="button"
					className="clip-share-btn primary"
					disabled={!trusted.length}
					title={trusted.length ? undefined : "Pair with someone first"}
					onClick={() => setSheet("new-group")}
				>
					<Plus size={13} /> New group
				</button>
			</div>
		);
	} else if (sheet === "live") {
		const targets = trusted.map((p) => [p.id, p.name]);
		body = (
			<div className="clip-share-list">
				{back("Live: send everything I copy to")}
				{targets.length ? (
					targets.map(([id, name]) => (
						<button key={id} type="button" role="checkbox" aria-checked={live.includes(id)} className="clip-share-person" onClick={() => toggleLive(id)}>
							{check(live.includes(id))}
							<span className="clip-share-name">{name}</span>
						</button>
					))
				) : (
					<div className="clip-share-empty">Pair with someone first.</div>
				)}
			</div>
		);
	} else if (sheet === "new-group") {
		body = (
			<div className="clip-share-list">
				{back("New group", "groups")}
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
							{check(newPick.includes(p.id))}
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
							setSheet(null);
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
			<div className="clip-share-list">
				{back(`${managed.name} · ${managed.members.length}/15`, "groups")}
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
							<span className="clip-share-name">Add {p.name}</span>
						</button>
					))}
				<button type="button" className="clip-share-btn" onClick={() => act(invoke("share_group_leave", { gid: managed.gid })).then(() => setSheet(null))}>
					<LogOut size={13} /> Leave group
				</button>
			</div>
		);
	}

	/** A person or group in the bottom row: its name and a dot (a ring while
	 *  sending). Drop on it, or click it to send the ticked clips. */
	const target = (id: string, name: string, online: boolean, side: React.ReactNode, group?: boolean) => {
		const st = status[id];
		const busy = !!st && !st.error && !st.sent;
		return (
			<div
				key={id}
				data-share-peer={id}
				className={`clip-share-chip${selected.length ? " can-send" : ""}${st?.error ? " failed" : ""}`}
				title={st?.error ?? (selected.length ? `Send ${selected.length} to ${name}` : `${name} · ${online ? "online" : "offline"} · drop here to send`)}
				onClick={() => {
					if (!selected.length || busy) return;
					send(id, { clips: selected });
					onSent?.();
				}}
			>
				{st && !st.error ? <Ring value={pct(st)} done={st.sent} /> : group ? <Users size={11} className={`clip-share-group${online ? " on" : ""}`} /> : <span className={`clip-share-dot${online ? " on" : ""}`} />}
				<span className="clip-share-name">{name}</span>
				{st?.error && payloads[id] ? (
					<button type="button" className="clip-share-retry" onClick={(e) => (e.stopPropagation(), send(id, payloads[id]))}>
						Retry
					</button>
				) : (
					!selected.length && !busy && side
				)}
			</div>
		);
	};

	const icon = (label: string, Icon: typeof Users, onClick: () => void, extra = "", badge?: number) => (
		<button type="button" className={extra} title={label} aria-label={label} onClick={(e) => (e.stopPropagation(), onClick())}>
			<Icon size={14} />
			{!!badge && <span className="clip-share-badge">{badge}</span>}
		</button>
	);
	const toolIcons = running && tools
		? createPortal(
				<>
					{icon("Pair with someone", UserPlus, openPair, "clip-share-tool pair")}
					{icon("Groups", Users, () => (setNote(""), setSheet("groups")), "clip-share-tool")}
					{icon(liveCount ? `Live clipboard · on for ${liveCount}` : "Live clipboard", Radio, () => (setNote(""), setSheet("live")), `clip-share-tool${liveCount ? " lit" : ""}`, liveCount)}
				</>,
				tools
			)
		: null;
	const waiting = requests.length + invites.length > 0;

	return (
		<>
			{toolIcons}
			{body && (
				<div className="clip-share-sheet" onClick={(e) => e.stopPropagation()}>
					{body}
				</div>
			)}
			{running && (
				<aside className={`clip-share ${layout}`} aria-label="People" onClick={(e) => e.stopPropagation()}>
					{(dragging || selected.length > 0) && hasPeople && (
						<div className="clip-share-banner">{dragging ? `Drop ${dragging} on a person` : `${selected.length} selected · click a person`}</div>
					)}
					{(incoming || note) && (
						<div className="clip-share-note">
							{incoming ? `From ${incoming.from} · ${Math.floor((incoming.done / Math.max(1, incoming.total)) * 100)}%` : note}
						</div>
					)}
					{hasPeople || waiting ? (
						<div
							className="clip-share-people"
							ref={rowRef}
							onWheel={(e) => {
								if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
							}}
						>
							{requests.map((r) => (
								<div key={`req${r.id}`} className="clip-share-chip ask" title={`Accept only if ${r.name} shows the same code`}>
									<span className="clip-share-name">
										{r.name} wants to pair · <b>{code4(r.code)}</b>
									</span>
									<button type="button" className="clip-share-accept" onClick={() => answer(r, true)}>
										Accept
									</button>
									<button type="button" className="clip-share-forget show" aria-label="Decline" title="Decline" onClick={() => answer(r, false)}>
										<X size={10} />
									</button>
								</div>
							))}
							{invites.map((inv) => {
								const reply = (join: boolean) => {
									setInvites((all) => all.filter((x) => x.gid !== inv.gid));
									act(invoke("share_invite_answer", { gid: inv.gid, join }));
								};
								return (
									<div key={`inv${inv.gid}`} className="clip-share-chip ask">
										<span className="clip-share-name">
											{inv.from ? `${inv.from} added you to ` : "Added to "}
											<b>{inv.name}</b>
										</span>
										<button type="button" className="clip-share-accept" onClick={() => reply(true)}>
											Join
										</button>
										<button type="button" className="clip-share-forget show" aria-label="Ignore" title="Ignore" onClick={() => reply(false)}>
											<X size={10} />
										</button>
									</div>
								);
							})}
							{trusted.map((p) =>
								target(
									p.id,
									p.name,
									p.online,
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
							{groups.map((g) =>
								target(
									`group:${g.gid}`,
									g.name,
									g.members.some((m) => m.id !== me && onlineIds.has(m.id)),
									<button type="button" className="clip-share-forget" aria-label={`Manage ${g.name}`} title="People in this group" onClick={(e) => (e.stopPropagation(), setSheet({ group: g.gid }))}>
										<Settings2 size={10} />
									</button>,
									true
								)
							)}
						</div>
					) : (
						// Not shown until the first list arrives, so it never flashes.
						peers && <div className="clip-share-hint">Pair with someone (icon at the top right) to send them clips.</div>
					)}
				</aside>
			)}
		</>
	);
}
