import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Camera, CameraOff, Mic, MicOff, Speaker, Volume2 } from "lucide-react";

type Device = { id: string; name: string; default: boolean };

/** Mirror (Meeting + output switch + camera check, user 2026-11-15): before
 *  a call, see your camera as it really captures (its own aspect ratio,
 *  16:9 for most webcams), pick the camera, the mic and the speakers (the
 *  mic and speakers become the Windows defaults), watch the mic level, mute
 *  it for every app and test the speakers. The camera is off until you turn
 *  it on; camera and mic only run while this tab shows. Nothing is recorded. */
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
		navigator.mediaDevices
			.getUserMedia({ audio: true })
			.then((s) => {
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

	const list = (items: Device[], icon: typeof Mic, label: string) => (
		<div className="mirror-list" role="radiogroup" aria-label={label}>
			{items.map((d) => {
				const Icon = icon;
				return (
					<button key={d.id} type="button" role="radio" aria-checked={d.default} className={`mirror-output${d.default ? " on" : ""}`} onClick={() => makeDefault(d.id)}>
						<Icon size={12} />
						<span>{d.name}</span>
					</button>
				);
			})}
		</div>
	);

	return (
		<div className="mirror" style={{ ["--tool-color" as string]: "#FF7A70" }}>
			<div className="mirror-left">
				<div className="mirror-camera" style={{ aspectRatio: String(ratio) }}>
					{cameraOn && <video ref={video} autoPlay muted playsInline className="mirror-video" />}
					{!cameraOn && (
						<button type="button" className="mirror-camera-off" onClick={() => setCameraOn(true)}>
							<Camera size={22} />
							<span>{cameraError || "Turn on camera"}</span>
						</button>
					)}
					{cameraOn && (
						<button type="button" className="mirror-camera-stop" aria-label="Turn camera off" onClick={() => setCameraOn(false)}>
							<CameraOff size={13} />
						</button>
					)}
				</div>
				{cameraOn && cameras.length > 0 && (
					<div className="mirror-cameras" role="radiogroup" aria-label="Cameras">
						{cameras.map((c, i) => (
							<button key={c.deviceId} type="button" role="radio" aria-checked={c.deviceId === cameraId} className={`mirror-output${c.deviceId === cameraId ? " on" : ""}`} onClick={() => pickCamera(c.deviceId)}>
								<Camera size={12} />
								<span>{c.label || `Camera ${i + 1}`}</span>
							</button>
						))}
					</div>
				)}
			</div>
			<div className="mirror-side">
				<div className="nt-row">
					<button
						type="button"
						className="nt-btn nt-icon-btn"
						style={{ width: 32, height: 32, background: muted ? "#FF453A" : undefined, color: muted ? "#fff" : undefined }}
						aria-pressed={!!muted}
						aria-label={muted ? "Unmute microphone" : "Mute microphone"}
						disabled={muted === null}
						onClick={toggleMute}
					>
						{muted ? <MicOff size={15} /> : <Mic size={15} />}
					</button>
					<div className="nt-grow">
						<div className="mirror-title">{muted === null ? "No microphone" : muted ? "Mic muted for every app" : "Mic on"}</div>
						<div className="mirror-meter" aria-label="Microphone level">
							<div className="mirror-meter-fill" style={{ transform: `scaleX(${muted ? 0 : level})` }} />
						</div>
					</div>
				</div>
				{mics.length > 1 && list(mics, Mic, "Microphones")}
				<div className="mirror-heading">
					<span>Speakers</span>
					<button type="button" className="mirror-test" onClick={testSpeaker}>
						<Volume2 size={12} /> Test
					</button>
				</div>
				{list(speakers, Speaker, "Speakers")}
			</div>
		</div>
	);
}
