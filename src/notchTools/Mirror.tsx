import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Camera, CameraOff, Mic, MicOff, Speaker, Volume2 } from "lucide-react";

type Device = { id: string; name: string; default: boolean };

/** Mirror (user's layout, 2026-11-20): the camera large in the middle,
 *  and under it one line each to pick the camera, the mic (with its level
 *  and a mute for every app) and the speakers (with a test). The mic and
 *  speakers picked become the Windows defaults. The camera is off until you
 *  turn it on; camera and mic run only while this tab shows (the notch is
 *  open on it). Nothing is recorded. */
export default function Mirror() {
	const video = useRef<HTMLVideoElement>(null);
	const [cameraOn, setCameraOn] = useState(false);
	const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
	const [cameraId, setCameraId] = useState<string | null>(() => localStorage.getItem("bloom-mirror-camera"));
	const [ratio, setRatio] = useState(16 / 9);
	const [cameraError, setCameraError] = useState("");
	const [level, setLevel] = useState(0);
	const [muted, setMuted] = useState<boolean | null>(null);
	const [mics, setMics] = useState<Device[]>([]);
	const [speakers, setSpeakers] = useState<Device[]>([]);

	// Camera preview: only while turned on.
	useEffect(() => {
		if (!cameraOn) return;
		let stream: MediaStream | null = null;
		let stopped = false;
		navigator.mediaDevices
			.getUserMedia({ video: cameraId ? { deviceId: { exact: cameraId } } : true, audio: false })
			.then(async (s) => {
				if (stopped) return s.getTracks().forEach((t) => t.stop());
				stream = s;
				const settings = s.getVideoTracks()[0]?.getSettings();
				if (settings?.width && settings.height) setRatio(settings.width / settings.height);
				if (video.current) video.current.srcObject = s;
				setCameraError("");
				// Camera names are only readable once one is open.
				const all = await navigator.mediaDevices.enumerateDevices();
				setCameras(all.filter((d) => d.kind === "videoinput"));
				if (!cameraId && settings?.deviceId) setCameraId(settings.deviceId);
			})
			.catch((e: DOMException) => {
				setCameraError(e.name === "NotAllowedError" ? "Camera access is off for this app" : "No camera found");
				setCameraOn(false);
			});
		return () => {
			stopped = true;
			stream?.getTracks().forEach((t) => t.stop());
		};
	}, [cameraOn, cameraId]);

	// The Windows mics and speakers, and the mute state, every 3 s.
	const readDevices = () => {
		invoke<boolean | null>("mic_muted").then(setMuted).catch(() => {});
		invoke<Device[]>("audio_devices", { input: true }).then(setMics).catch(() => {});
		invoke<Device[]>("audio_devices", { input: false }).then(setSpeakers).catch(() => {});
	};
	useEffect(() => {
		readDevices();
		const t = window.setInterval(readDevices, 3000);
		return () => window.clearInterval(t);
	}, []);

	// Level of the default mic; restarts when the default changes.
	const defaultMic = mics.find((m) => m.default)?.id ?? "";
	useEffect(() => {
		let stream: MediaStream | null = null;
		let ctx: AudioContext | null = null;
		let frame = 0;
		// The mic opens a moment after asking. If this effect was cleaned up
		// meanwhile (the tab closed, or the mic list loaded and re-ran it),
		// close it at once: it used to keep running until LotusNotch quit,
		// so Windows showed the mic in use all the time.
		let stopped = false;
		navigator.mediaDevices
			.getUserMedia({ audio: true })
			.then((s) => {
				if (stopped) return s.getTracks().forEach((t) => t.stop());
				stream = s;
				ctx = new AudioContext();
				const analyser = ctx.createAnalyser();
				analyser.fftSize = 256;
				ctx.createMediaStreamSource(s).connect(analyser);
				const data = new Uint8Array(analyser.fftSize);
				const tick = () => {
					analyser.getByteTimeDomainData(data);
					let peak = 0;
					for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
					setLevel(Math.min(1, peak / 64));
					frame = requestAnimationFrame(tick);
				};
				tick();
			})
			.catch(() => {});
		return () => {
			stopped = true;
			cancelAnimationFrame(frame);
			stream?.getTracks().forEach((t) => t.stop());
			ctx?.close();
		};
	}, [defaultMic]);

	const toggleMute = () => muted !== null && invoke("set_mic_muted", { muted: !muted }).then(() => setMuted(!muted)).catch(() => {});
	const makeDefault = (id: string) => invoke("set_default_audio", { id }).then(readDevices).catch(() => {});
	// A short two-note chime on the default speakers.
	const testSpeaker = () => {
		const ctx = new AudioContext();
		[660, 880].forEach((f, i) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			const t = ctx.currentTime + i * 0.18;
			osc.frequency.value = f;
			gain.gain.setValueAtTime(0.0001, t);
			gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
			osc.connect(gain).connect(ctx.destination);
			osc.start(t);
			osc.stop(t + 0.32);
		});
		window.setTimeout(() => ctx.close(), 900);
	};
	const pickCamera = (id: string) => {
		localStorage.setItem("bloom-mirror-camera", id);
		setCameraId(id);
	};

	/** One line of choices (scrolls sideways when there are many). */
	const chips = (items: { id: string; name: string; on: boolean }[], pick: (id: string) => void, label: string) => (
		<div className="mirror-chips" role="radiogroup" aria-label={label}>
			{items.map((d) => (
				<button key={d.id} type="button" role="radio" aria-checked={d.on} className={`mirror-chip${d.on ? " on" : ""}`} title={d.name} onClick={() => pick(d.id)}>
					{d.name}
				</button>
			))}
		</div>
	);
	const asChips = (items: Device[]) => items.map((d) => ({ id: d.id, name: d.name, on: d.default }));

	return (
		<div className="mirror" style={{ ["--tool-color" as string]: "#FF7A70" }}>
			<div className="mirror-stage">
				<div className="mirror-camera" style={{ aspectRatio: String(ratio) }}>
					{cameraOn && <video ref={video} autoPlay muted playsInline className="mirror-video" />}
					{!cameraOn && (
						<button type="button" className="mirror-camera-off" onClick={() => setCameraOn(true)}>
							<Camera size={28} />
							<span>{cameraError || "Turn on camera"}</span>
						</button>
					)}
					{cameraOn && (
						<button type="button" className="mirror-camera-stop" aria-label="Turn camera off" onClick={() => setCameraOn(false)}>
							<CameraOff size={13} />
						</button>
					)}
				</div>
			</div>
			<div className="mirror-rows">
				<div className="mirror-row">
					<span className="mirror-row-icon" aria-hidden>
						<Camera size={15} />
					</span>
					{cameraOn && cameras.length > 0 ? (
						chips(
							cameras.map((c, i) => ({ id: c.deviceId, name: c.label || `Camera ${i + 1}`, on: c.deviceId === cameraId })),
							pickCamera,
							"Cameras"
						)
					) : (
						<span className="mirror-row-note">{cameraOn ? "Finding cameras…" : "Turn the camera on to pick one"}</span>
					)}
				</div>
				<div className="mirror-row">
					<button
						type="button"
						className={`mirror-row-icon button${muted ? " muted" : ""}`}
						aria-pressed={!!muted}
						aria-label={muted ? "Unmute microphone" : "Mute microphone"}
						title={muted ? "Muted for every app · click to unmute" : "Mute for every app"}
						disabled={muted === null}
						onClick={toggleMute}
					>
						{muted ? <MicOff size={15} /> : <Mic size={15} />}
					</button>
					<div className="mirror-meter" aria-label="Microphone level">
						<div className="mirror-meter-fill" style={{ transform: `scaleX(${muted ? 0 : level})` }} />
					</div>
					{mics.length > 0 ? chips(asChips(mics), makeDefault, "Microphones") : <span className="mirror-row-note">No microphone</span>}
				</div>
				<div className="mirror-row">
					<span className="mirror-row-icon" aria-hidden>
						<Speaker size={15} />
					</span>
					{chips(asChips(speakers), makeDefault, "Speakers")}
					<button type="button" className="mirror-test" onClick={testSpeaker}>
						<Volume2 size={13} /> Test
					</button>
				</div>
			</div>
		</div>
	);
}
