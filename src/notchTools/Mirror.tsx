import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Camera, CameraOff, Mic, MicOff, Speaker, Volume2 } from "lucide-react";

type Output = { id: string; name: string; default: boolean };

/** Mirror (Meeting + output switch + camera check, user 2026-11-15): before
 *  a call, see that the camera works and which one it is, watch the mic
 *  level, mute it for every app, and pick and test the speakers. The camera
 *  and mic are only open while this tab shows; nothing is recorded or sent. */
export default function Mirror() {
	const video = useRef<HTMLVideoElement>(null);
	const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
	const [cameraId, setCameraId] = useState<string | null>(() => localStorage.getItem("bloom-mirror-camera"));
	const [cameraError, setCameraError] = useState("");
	const [level, setLevel] = useState(0);
	const [muted, setMuted] = useState<boolean | null>(null);
	const [outputs, setOutputs] = useState<Output[]>([]);

	// Camera preview: the chosen camera, or the first one.
	useEffect(() => {
		let stream: MediaStream | null = null;
		let stopped = false;
		navigator.mediaDevices
			.getUserMedia({ video: cameraId ? { deviceId: { exact: cameraId } } : true, audio: false })
			.then(async (s) => {
				if (stopped) return s.getTracks().forEach((t) => t.stop());
				stream = s;
				if (video.current) video.current.srcObject = s;
				setCameraError("");
				// Labels are only readable once a camera is open.
				const all = await navigator.mediaDevices.enumerateDevices();
				setCameras(all.filter((d) => d.kind === "videoinput"));
				if (!cameraId) setCameraId(s.getVideoTracks()[0]?.getSettings().deviceId ?? null);
			})
			.catch((e: DOMException) =>
				setCameraError(e.name === "NotAllowedError" ? "Camera access is off for this app" : "No camera found")
			);
		return () => {
			stopped = true;
			stream?.getTracks().forEach((t) => t.stop());
		};
	}, [cameraId]);

	// Mic level, from the default microphone.
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
	}, []);

	// Mute state (for every app) and the speaker list.
	useEffect(() => {
		const read = () => {
			invoke<boolean | null>("mic_muted").then(setMuted).catch(() => {});
			invoke<Output[]>("audio_outputs").then(setOutputs).catch(() => {});
		};
		read();
		const t = window.setInterval(read, 3000);
		return () => window.clearInterval(t);
	}, []);

	const toggleMute = () => muted !== null && invoke("set_mic_muted", { muted: !muted }).then(() => setMuted(!muted)).catch(() => {});
	const useOutput = (id: string) =>
		invoke("set_audio_output", { id })
			.then(() => setOutputs((o) => o.map((x) => ({ ...x, default: x.id === id }))))
			.catch(() => {});
	// A short two-note chime on the default output.
	const testSpeaker = () => {
		const ctx = new AudioContext();
		[660, 880].forEach((f, i) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.frequency.value = f;
			gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
			gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3);
			osc.connect(gain).connect(ctx.destination);
			osc.start(ctx.currentTime + i * 0.18);
			osc.stop(ctx.currentTime + i * 0.18 + 0.32);
		});
		window.setTimeout(() => ctx.close(), 900);
	};
	const camera = cameras.find((c) => c.deviceId === cameraId);

	return (
		<div className="mirror" style={{ ["--tool-color" as string]: "#FF7A70" }}>
			<div className="mirror-camera">
				<video ref={video} autoPlay muted playsInline className="mirror-video" />
				{cameraError && (
					<div className="mirror-camera-off">
						<CameraOff size={20} />
						<span>{cameraError}</span>
					</div>
				)}
				{cameras.length > 0 && (
					<button
						type="button"
						className="mirror-camera-name"
						title={cameras.length > 1 ? "Switch camera" : undefined}
						onClick={() => {
							if (cameras.length < 2) return;
							const i = cameras.findIndex((c) => c.deviceId === cameraId);
							const next = cameras[(i + 1) % cameras.length].deviceId;
							localStorage.setItem("bloom-mirror-camera", next);
							setCameraId(next);
						}}
					>
						<Camera size={11} />
						<span>{camera?.label || "Camera"}</span>
					</button>
				)}
			</div>
			<div className="mirror-side">
				<div className="nt-row">
					<button
						type="button"
						className="nt-btn nt-icon-btn"
						style={{ width: 36, height: 36, background: muted ? "#FF453A" : undefined, color: muted ? "#fff" : undefined }}
						aria-pressed={!!muted}
						aria-label={muted ? "Unmute microphone" : "Mute microphone"}
						disabled={muted === null}
						onClick={toggleMute}
					>
						{muted ? <MicOff size={16} /> : <Mic size={16} />}
					</button>
					<div className="nt-grow">
						<div className="mirror-title">{muted === null ? "No microphone" : muted ? "Mic muted for every app" : "Mic on"}</div>
						<div className="mirror-meter" aria-label="Microphone level">
							<div className="mirror-meter-fill" style={{ transform: `scaleX(${muted ? 0 : level})` }} />
						</div>
					</div>
				</div>
				<div className="mirror-outputs" role="radiogroup" aria-label="Speakers">
					{outputs.map((o) => (
						<button key={o.id} type="button" role="radio" aria-checked={o.default} className={`mirror-output${o.default ? " on" : ""}`} onClick={() => useOutput(o.id)}>
							<Speaker size={12} />
							<span>{o.name}</span>
						</button>
					))}
				</div>
				<button type="button" className="nt-btn" onClick={testSpeaker}>
					<Volume2 size={13} /> Test speakers
				</button>
			</div>
		</div>
	);
}
