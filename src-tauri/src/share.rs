//! LAN sharing core (no Tauri, so tests and the dev peer can run it alone).
//! Design: .grill/shelf-share.md.
//!
//! - **Identity:** each install has its own Ed25519 key (never leaves the
//!   PC); its ID is a fingerprint of the public key (KDE Connect model).
//! - **Discovery:** small UDP multicast datagrams: `hello` (on start, and as
//!   the answer to a `query`) and `query` (only when the share column opens),
//!   so nothing runs in the background but a listening socket.
//! - **Channel:** TCP; commit-then-reveal X25519 exchange (as in Bluetooth
//!   numeric comparison, so a man in the middle can't grind keys until the
//!   4-digit codes match), HKDF, ChaCha20-Poly1305 frames, and each side
//!   signs the handshake with its identity key.
//! - **Pairing:** a `pair` message; the other side sees the same 4-digit
//!   code and accepts or declines; both then pin each other's key.

use ring::{
    aead, agreement, digest, hkdf,
    rand::SystemRandom,
    signature::{self, Ed25519KeyPair, KeyPair},
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

/// Discovery group and port (the dev peer listens on DEV_PORT so it can run
/// next to the app on one PC).
pub const GROUP: Ipv4Addr = Ipv4Addr::new(239, 255, 71, 17);
pub const PORT: u16 = 53317;
pub const DEV_PORT: u16 = 53318;
const MAGIC: &[u8; 4] = b"LNS1";
/// Largest plaintext in one frame.
pub const MAX_FRAME: usize = 1 << 20;
/// How long the other side has to accept a pairing.
const PAIR_WAIT: Duration = Duration::from_secs(60);

fn sha256(data: &[u8]) -> Vec<u8> {
    digest::digest(&digest::SHA256, data).as_ref().to_vec()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn unhex(s: &str) -> Option<Vec<u8>> {
    if !s.len().is_multiple_of(2) || s.len() > 256 {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(s.get(i..i + 2)?, 16).ok())
        .collect()
}

/// An install's ID: the first 8 bytes of SHA-256 of its public key, as hex.
pub fn fingerprint(public: &[u8]) -> String {
    hex(&sha256(public)[..8])
}

fn short(name: &str) -> String {
    name.chars().filter(|c| !c.is_control()).take(48).collect()
}

/// This install's signing key, made on first use.
/// ponytail: stored as a plain file in the app's config folder (anything
/// running as the user can read it, as with any app's keys); DPAPI-wrap it
/// if that ever matters.
pub struct Identity {
    pair: Ed25519KeyPair,
    pub id: String,
}

impl Identity {
    pub fn load_or_create(dir: &Path) -> Result<Self, String> {
        let file = dir.join("identity.key");
        if let Ok(bytes) = std::fs::read(&file) {
            if let Ok(pair) = Ed25519KeyPair::from_pkcs8(&bytes) {
                let id = fingerprint(pair.public_key().as_ref());
                return Ok(Self { pair, id });
            }
        }
        // None yet, or damaged: a new identity (paired people pair again).
        let doc = Ed25519KeyPair::generate_pkcs8(&SystemRandom::new())
            .map_err(|_| "Couldn't make a key".to_string())?;
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        std::fs::write(&file, doc.as_ref()).map_err(|e| e.to_string())?;
        let pair = Ed25519KeyPair::from_pkcs8(doc.as_ref()).map_err(|_| "Bad key".to_string())?;
        let id = fingerprint(pair.public_key().as_ref());
        Ok(Self { pair, id })
    }
}

/// An encrypted, authenticated connection to one peer.
pub struct Channel {
    stream: TcpStream,
    tx: aead::LessSafeKey,
    rx: aead::LessSafeKey,
    tx_n: u64,
    rx_n: u64,
    pub peer_key: Vec<u8>,
    pub peer_id: String,
    pub peer_name: String,
    /// The 4-digit pairing code; the same on both sides only without a man
    /// in the middle.
    pub code: u16,
}

fn nonce(n: u64) -> aead::Nonce {
    let mut b = [0u8; 12];
    b[4..].copy_from_slice(&n.to_be_bytes());
    aead::Nonce::assume_unique_for_key(b)
}

impl Channel {
    pub fn send(&mut self, data: &[u8]) -> Result<(), String> {
        if data.len() > MAX_FRAME {
            return Err("Frame too large".into());
        }
        let mut buf = data.to_vec();
        self.tx
            .seal_in_place_append_tag(nonce(self.tx_n), aead::Aad::empty(), &mut buf)
            .map_err(|_| "Couldn't encrypt".to_string())?;
        self.tx_n += 1;
        self.stream
            .write_all(&(buf.len() as u32).to_be_bytes())
            .and_then(|_| self.stream.write_all(&buf))
            .map_err(|_| "The connection dropped".to_string())
    }

    pub fn recv(&mut self) -> Result<Vec<u8>, String> {
        let mut len = [0u8; 4];
        self.stream.read_exact(&mut len).map_err(io_err)?;
        let n = u32::from_be_bytes(len) as usize;
        if !(16..=MAX_FRAME + 16).contains(&n) {
            return Err("Bad frame".into());
        }
        let mut buf = vec![0u8; n];
        self.stream.read_exact(&mut buf).map_err(io_err)?;
        let plain = self
            .rx
            .open_in_place(nonce(self.rx_n), aead::Aad::empty(), &mut buf)
            .map_err(|_| "The connection was tampered with".to_string())?
            .len();
        self.rx_n += 1;
        buf.truncate(plain);
        Ok(buf)
    }

    pub fn send_json(&mut self, v: &serde_json::Value) -> Result<(), String> {
        self.send(v.to_string().as_bytes())
    }

    pub fn recv_json(&mut self) -> Result<serde_json::Value, String> {
        serde_json::from_slice(&self.recv()?).map_err(|_| "Bad message".to_string())
    }

    pub fn set_timeout(&self, d: Duration) {
        let _ = self.stream.set_read_timeout(Some(d));
    }
}

fn io_err(e: std::io::Error) -> String {
    match e.kind() {
        std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut => "No answer".into(),
        _ => "The connection dropped".into(),
    }
}

/// Runs the handshake on a fresh TCP connection (`initiator` = the side
/// that connected) and returns the encrypted channel.
pub fn handshake(
    mut stream: TcpStream,
    me: &Identity,
    my_name: &str,
    initiator: bool,
) -> Result<Channel, String> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let _ = stream.set_nodelay(true);
    let rng = SystemRandom::new();
    let eph = agreement::EphemeralPrivateKey::generate(&agreement::X25519, &rng)
        .map_err(|_| "Key error".to_string())?;
    let e_pub = eph
        .compute_public_key()
        .map_err(|_| "Key error".to_string())?
        .as_ref()
        .to_vec();
    let mut other = [0u8; 32];
    // Commit, answer, reveal: the initiator fixes its key (by hash) before
    // it sees the responder's, the responder answers before it sees the
    // initiator's.
    let (e_i, e_r) = if initiator {
        stream
            .write_all(&[MAGIC.as_slice(), &sha256(&e_pub)].concat())
            .map_err(io_err)?;
        stream.read_exact(&mut other).map_err(io_err)?;
        stream.write_all(&e_pub).map_err(io_err)?;
        (e_pub.clone(), other.to_vec())
    } else {
        let mut head = [0u8; 36];
        stream.read_exact(&mut head).map_err(io_err)?;
        if &head[..4] != MAGIC {
            return Err("Not LotusNotch".into());
        }
        stream.write_all(&e_pub).map_err(io_err)?;
        stream.read_exact(&mut other).map_err(io_err)?;
        if sha256(&other) != head[4..] {
            return Err("Handshake check failed".into());
        }
        (other.to_vec(), e_pub.clone())
    };
    let peer_e = if initiator { &e_r } else { &e_i };
    let shared = agreement::agree_ephemeral(
        eph,
        &agreement::UnparsedPublicKey::new(&agreement::X25519, peer_e),
        |k| k.to_vec(),
    )
    .map_err(|_| "Key error".to_string())?;
    let h = sha256(&[b"lotusnotch-share-v1".as_slice(), &e_i, &e_r].concat());
    let prk = hkdf::Salt::new(hkdf::HKDF_SHA256, &h).extract(&shared);
    let key = |info: &[u8]| -> Result<aead::LessSafeKey, String> {
        let info = [info];
        let okm = prk
            .expand(&info, &aead::CHACHA20_POLY1305)
            .map_err(|_| "Key error".to_string())?;
        Ok(aead::LessSafeKey::new(aead::UnboundKey::from(okm)))
    };
    let (i2r, r2i) = (key(b"i2r")?, key(b"r2i")?);
    let (tx, rx) = if initiator { (i2r, r2i) } else { (r2i, i2r) };
    let c = sha256(&[b"code".as_slice(), &h].concat());
    let code = (u32::from_be_bytes([c[0], c[1], c[2], c[3]]) % 10_000) as u16;
    let mut ch = Channel {
        stream,
        tx,
        rx,
        tx_n: 0,
        rx_n: 0,
        peer_key: Vec::new(),
        peer_id: String::new(),
        peer_name: String::new(),
        code,
    };
    // Prove who we are: sign the handshake hash with our role.
    let signed = |role: u8| [h.as_slice(), &[role]].concat();
    let (mine, theirs) = if initiator {
        (b'i', b'r')
    } else {
        (b'r', b'i')
    };
    let sig = me.pair.sign(&signed(mine));
    ch.send_json(&serde_json::json!({
        "key": hex(me.pair.public_key().as_ref()),
        "sig": hex(sig.as_ref()),
        "name": my_name,
    }))?;
    let peer = ch.recv_json()?;
    let pk = peer["key"].as_str().and_then(unhex).ok_or("Bad identity")?;
    let ps = peer["sig"].as_str().and_then(unhex).ok_or("Bad identity")?;
    signature::UnparsedPublicKey::new(&signature::ED25519, &pk)
        .verify(&signed(theirs), &ps)
        .map_err(|_| "Identity check failed".to_string())?;
    ch.peer_id = fingerprint(&pk);
    ch.peer_name = short(peer["name"].as_str().unwrap_or("Unknown"));
    ch.peer_key = pk;
    Ok(ch)
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Peer {
    pub id: String,
    pub name: String,
    /// The pinned public key, hex.
    pub key: String,
}

/// A person as the share column shows them.
#[derive(Clone, Serialize, Debug)]
pub struct PeerView {
    pub id: String,
    pub name: String,
    pub trusted: bool,
    pub online: bool,
}

pub enum Event {
    PeersChanged,
    PairRequest {
        id: String,
        name: String,
        code: u16,
    },
    /// Bytes received so far of an incoming send.
    Incoming {
        from: String,
        done: u64,
        total: u64,
    },
    /// A send arrived in full: its texts and the top-level files/folders;
    /// `live` = a live clipboard copy.
    Received {
        from: String,
        texts: Vec<String>,
        paths: Vec<PathBuf>,
        live: bool,
    },
    /// An incoming send stopped; anything partial was deleted.
    IncomingFailed {
        from: String,
        why: String,
    },
}

/// Limits per send (.grill/shelf-share.md).
pub const MAX_SEND: u64 = 250 * 1024 * 1024;
pub const MAX_FILES: usize = 1000;
/// Live clipboard: one copy at most this big; bigger ones are skipped.
pub const MAX_LIVE: u64 = 25 * 1024 * 1024;
/// The error a too-big live copy gives (the caller marks it "not synced").
pub const TOO_BIG_FOR_LIVE: &str = "Too big for live clipboard";
const CHUNK: usize = 512 * 1024;

/// What a send carries: text, or a file or folder on disk.
pub enum Item {
    Text(String),
    Path(PathBuf),
}

/// One file of a send: its path inside the send ("Folder/sub/a.txt").
struct Entry {
    rel: String,
    size: u64,
    src: PathBuf,
}

fn too_big(total: u64) -> String {
    format!(
        "This is {} MB; the limit is 250 MB. Use another app for big files.",
        total.div_ceil(1024 * 1024)
    )
}

/// Lists the files of a send (folders walked, links skipped) and checks the
/// limits before anything is sent.
fn plan(items: &[Item]) -> Result<(Vec<String>, Vec<Entry>, u64), String> {
    fn walk(dir: &Path, rel: &str, out: &mut Vec<Entry>) -> Result<(), String> {
        let list = std::fs::read_dir(dir).map_err(|_| format!("Can't read {rel}"))?;
        for e in list.flatten() {
            let Ok(meta) = std::fs::symlink_metadata(e.path()) else {
                continue;
            };
            let name = e.file_name().to_string_lossy().to_string();
            let rel = format!("{rel}/{name}");
            if meta.is_dir() {
                walk(&e.path(), &rel, out)?;
            } else if meta.is_file() {
                out.push(Entry {
                    rel,
                    size: meta.len(),
                    src: e.path(),
                });
            }
            if out.len() > MAX_FILES {
                return Err("Too many files: the limit is 1,000 per send.".into());
            }
        }
        Ok(())
    }
    let (mut texts, mut files) = (Vec::new(), Vec::new());
    for item in items {
        match item {
            Item::Text(t) => texts.push(t.clone()),
            Item::Path(p) => {
                let meta = std::fs::metadata(p).map_err(|_| "A file is gone".to_string())?;
                let name = p
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .ok_or("Bad file")?;
                if meta.is_dir() {
                    walk(p, &name, &mut files)?;
                } else {
                    files.push(Entry {
                        rel: name,
                        size: meta.len(),
                        src: p.clone(),
                    });
                }
            }
        }
    }
    if files.len() > MAX_FILES {
        return Err("Too many files: the limit is 1,000 per send.".into());
    }
    let total = files.iter().map(|f| f.size).sum::<u64>()
        + texts.iter().map(|t| t.len() as u64).sum::<u64>();
    if total > MAX_SEND {
        return Err(too_big(total));
    }
    Ok((texts, files, total))
}

/// A received file's path inside the send, made safe: plain names only (no
/// "..", drives, streams, reserved Windows names, trailing dots).
pub fn safe_rel(rel: &str) -> Option<PathBuf> {
    const RESERVED: [&str; 22] = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    let mut out = PathBuf::new();
    let parts: Vec<&str> = rel.split('/').collect();
    if parts.len() > 32 || rel.len() > 400 {
        return None;
    }
    for part in parts {
        let stem = part.split('.').next().unwrap_or("").to_ascii_uppercase();
        if part.is_empty()
            || part == "."
            || part == ".."
            || part.ends_with('.')
            || part.ends_with(' ')
            || part
                .chars()
                .any(|c| c.is_control() || "\\:*?\"<>|".contains(c))
            || RESERVED.contains(&stem.as_str())
        {
            return None;
        }
        out.push(part);
    }
    Some(out)
}

/// `dir/name`, or `dir/name (2)` … when that is taken.
fn unique(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s, format!(".{e}")),
        _ => (name, String::new()),
    };
    (2..)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|p| !p.exists())
        .unwrap()
}

pub struct Config {
    /// Where the identity and the trusted list live.
    pub dir: PathBuf,
    pub name: String,
    /// The discovery port this side listens on (0 = any, for tests).
    pub listen_port: u16,
    /// The discovery ports hellos and queries go to.
    pub announce_ports: Vec<u16>,
    /// The dev peer accepts every pairing by itself.
    pub auto_accept: bool,
    /// Where received files go (Downloads\\LotusNotch).
    pub inbox: PathBuf,
    /// Where live clipboard files go (app data, so Downloads doesn't fill up
    /// with every copied screenshot).
    /// ponytail: kept until removed by hand; tie to the Shelf's cleanup if
    /// it grows.
    pub live_inbox: PathBuf,
}

/// A pairing request waiting for an answer: (answer, name, code).
type Pending = (mpsc::Sender<bool>, String, u16);

struct Seen {
    name: String,
    addr: SocketAddr,
    at: Instant,
}

pub struct Share {
    me: Identity,
    cfg: Config,
    tcp_port: u16,
    udp: UdpSocket,
    trusted: Mutex<Vec<Peer>>,
    /// Who gets this side's copies (live clipboard), by id.
    live: Mutex<Vec<String>>,
    seen: Mutex<HashMap<String, Seen>>,
    last_query: Mutex<Instant>,
    /// Pairing requests waiting for an answer: id → (answer, name, code).
    pending: Mutex<HashMap<String, Pending>>,
    events: Box<dyn Fn(Event) + Send + Sync>,
}

impl Share {
    pub fn start(
        cfg: Config,
        events: impl Fn(Event) + Send + Sync + 'static,
    ) -> Result<Arc<Self>, String> {
        let me = Identity::load_or_create(&cfg.dir)?;
        let listener = TcpListener::bind(("0.0.0.0", 0)).map_err(|e| e.to_string())?;
        let tcp_port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let udp = UdpSocket::bind(("0.0.0.0", cfg.listen_port)).map_err(|e| e.to_string())?;
        // ponytail: joins the group on the default interface only; PCs with
        // VPN/virtual adapters may need a join per interface.
        let _ = udp.join_multicast_v4(&GROUP, &Ipv4Addr::UNSPECIFIED);
        let _ = udp.set_multicast_loop_v4(true);
        let trusted = std::fs::read(cfg.dir.join("trusted.json"))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        let live = std::fs::read(cfg.dir.join("live.json"))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        let share = Arc::new(Self {
            me,
            cfg,
            tcp_port,
            udp,
            trusted: Mutex::new(trusted),
            live: Mutex::new(live),
            seen: Mutex::new(HashMap::new()),
            last_query: Mutex::new(Instant::now()),
            pending: Mutex::new(HashMap::new()),
            events: Box::new(events),
        });
        let s = share.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let s = s.clone();
                std::thread::spawn(move || {
                    let _ = s.serve(stream);
                });
            }
        });
        let s = share.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 1024];
            while let Ok((n, from)) = s.udp.recv_from(&mut buf) {
                s.on_datagram(&buf[..n], from);
            }
        });
        share.announce("hello");
        Ok(share)
    }

    pub fn id(&self) -> &str {
        &self.me.id
    }

    pub fn name(&self) -> &str {
        &self.cfg.name
    }

    fn datagram(&self, t: &str) -> Vec<u8> {
        serde_json::json!({ "t": t, "id": self.me.id, "name": self.cfg.name, "port": self.tcp_port })
            .to_string()
            .into_bytes()
    }

    fn announce(&self, t: &str) {
        for port in &self.cfg.announce_ports {
            let _ = self.udp.send_to(&self.datagram(t), (GROUP, *port));
        }
    }

    /// Asks who is online; the answers arrive as hellos.
    pub fn query(&self) {
        *self.last_query.lock().unwrap() = Instant::now();
        self.announce("query");
    }

    pub fn on_datagram(&self, buf: &[u8], from: SocketAddr) {
        let Ok(v) = serde_json::from_slice::<serde_json::Value>(buf) else {
            return;
        };
        let (Some(t), Some(id), Some(port)) = (
            v["t"].as_str(),
            v["id"].as_str(),
            v["port"].as_u64().and_then(|p| u16::try_from(p).ok()),
        ) else {
            return;
        };
        if id == self.me.id || id.len() != 16 || !matches!(t, "hello" | "query") {
            return;
        }
        {
            let mut seen = self.seen.lock().unwrap();
            // ponytail: a LAN-sized list; forget everyone if it ever floods.
            if seen.len() > 256 {
                seen.clear();
            }
            seen.insert(
                id.to_string(),
                Seen {
                    name: short(v["name"].as_str().unwrap_or("Unknown")),
                    addr: SocketAddr::new(from.ip(), port),
                    at: Instant::now(),
                },
            );
        }
        if t == "query" {
            let _ = self.udp.send_to(&self.datagram("hello"), from);
        }
        (self.events)(Event::PeersChanged);
    }

    /// Trusted people first (online or not), then other LotusNotch devices
    /// that answered since the last query.
    pub fn peers(&self) -> Vec<PeerView> {
        let since = *self.last_query.lock().unwrap();
        let seen = self.seen.lock().unwrap();
        let online = |id: &str| seen.get(id).is_some_and(|s| s.at >= since);
        let trusted = self.trusted.lock().unwrap();
        let mut out: Vec<PeerView> = trusted
            .iter()
            .map(|p| PeerView {
                id: p.id.clone(),
                name: p.name.clone(),
                trusted: true,
                online: online(&p.id),
            })
            .collect();
        let mut others: Vec<PeerView> = seen
            .iter()
            .filter(|(id, s)| s.at >= since && !trusted.iter().any(|p| &p.id == *id))
            .map(|(id, s)| PeerView {
                id: id.clone(),
                name: s.name.clone(),
                trusted: false,
                online: true,
            })
            .collect();
        others.sort_by(|a, b| a.name.cmp(&b.name));
        out.extend(others);
        out
    }

    fn connect(&self, id: &str) -> Result<Channel, String> {
        let addr = self
            .seen
            .lock()
            .unwrap()
            .get(id)
            .map(|s| s.addr)
            .ok_or("Not on this network now")?;
        let stream = TcpStream::connect_timeout(&addr, Duration::from_secs(5))
            .map_err(|_| "Couldn't reach them".to_string())?;
        let ch = handshake(stream, &self.me, &self.cfg.name, true)?;
        if ch.peer_id != id {
            return Err("Someone else answered".into());
        }
        Ok(ch)
    }

    /// Asks `id` to pair; `on_code` gets the 4-digit code to show while the
    /// other side decides. Ok once they accept.
    pub fn pair(&self, id: &str, on_code: impl FnOnce(u16)) -> Result<(), String> {
        let mut ch = self.connect(id)?;
        ch.send_json(&serde_json::json!({ "t": "pair" }))?;
        on_code(ch.code);
        ch.set_timeout(PAIR_WAIT + Duration::from_secs(5));
        let reply = ch.recv_json()?;
        if reply["t"] != "pair-ok" {
            return Err("They declined".into());
        }
        self.trust(&ch);
        Ok(())
    }

    /// The answer to a pairing request shown on this side.
    pub fn answer(&self, id: &str, accept: bool) {
        if let Some((tx, ..)) = self.pending.lock().unwrap().remove(id) {
            let _ = tx.send(accept);
        }
    }

    /// Pairing requests still waiting: (id, name, code).
    pub fn requests(&self) -> Vec<(String, String, u16)> {
        self.pending
            .lock()
            .unwrap()
            .iter()
            .map(|(id, (_, name, code))| (id.clone(), name.clone(), *code))
            .collect()
    }

    /// Who gets this side's copies.
    pub fn live(&self) -> Vec<String> {
        self.live.lock().unwrap().clone()
    }

    /// Sets who gets this side's copies (trusted people only).
    pub fn set_live(&self, ids: &[String]) {
        let trusted = self.trusted.lock().unwrap();
        let ids: Vec<String> = ids
            .iter()
            .filter(|id| trusted.iter().any(|p| &p.id == *id))
            .cloned()
            .collect();
        drop(trusted);
        let _ = std::fs::create_dir_all(&self.cfg.dir);
        let _ = std::fs::write(
            self.cfg.dir.join("live.json"),
            serde_json::to_vec(&ids).unwrap_or_default(),
        );
        *self.live.lock().unwrap() = ids;
    }

    pub fn unpair(&self, id: &str) {
        self.trusted.lock().unwrap().retain(|p| p.id != id);
        self.save_trusted();
        let live: Vec<String> = self.live().into_iter().filter(|x| x != id).collect();
        self.set_live(&live);
        (self.events)(Event::PeersChanged);
    }

    pub fn is_trusted(&self, key: &[u8]) -> bool {
        let key = hex(key);
        self.trusted.lock().unwrap().iter().any(|p| p.key == key)
    }

    fn trust(&self, ch: &Channel) {
        {
            let mut trusted = self.trusted.lock().unwrap();
            trusted.retain(|p| p.id != ch.peer_id);
            trusted.push(Peer {
                id: ch.peer_id.clone(),
                name: ch.peer_name.clone(),
                key: hex(&ch.peer_key),
            });
        }
        self.save_trusted();
        (self.events)(Event::PeersChanged);
    }

    fn save_trusted(&self) {
        let json = serde_json::to_vec_pretty(&*self.trusted.lock().unwrap()).unwrap_or_default();
        let file = self.cfg.dir.join("trusted.json");
        let tmp = file.with_extension("tmp");
        if std::fs::write(&tmp, json).is_ok() {
            let _ = std::fs::rename(&tmp, &file);
        }
    }

    /// One incoming connection.
    fn serve(&self, stream: TcpStream) -> Result<(), String> {
        let mut ch = handshake(stream, &self.me, &self.cfg.name, false)?;
        let msg = ch.recv_json()?;
        match msg["t"].as_str() {
            Some("pair") => {
                let (tx, rx) = mpsc::channel();
                self.pending
                    .lock()
                    .unwrap()
                    .insert(ch.peer_id.clone(), (tx, ch.peer_name.clone(), ch.code));
                (self.events)(Event::PairRequest {
                    id: ch.peer_id.clone(),
                    name: ch.peer_name.clone(),
                    code: ch.code,
                });
                let ok = self.cfg.auto_accept || rx.recv_timeout(PAIR_WAIT).unwrap_or(false);
                self.pending.lock().unwrap().remove(&ch.peer_id);
                if ok {
                    self.trust(&ch);
                }
                ch.send_json(&serde_json::json!({ "t": if ok { "pair-ok" } else { "pair-no" } }))
            }
            // Everything else is for trusted people only.
            _ if !self.is_trusted(&ch.peer_key) => Err("Not paired".into()),
            Some("send") => {
                let from = ch.peer_name.clone();
                let mut made = Vec::new();
                let result = self.receive(&mut ch, &msg, &mut made);
                if let Err(why) = &result {
                    // Nothing half-done stays behind.
                    for p in made.iter().rev() {
                        let _ = std::fs::remove_file(p).or_else(|_| std::fs::remove_dir_all(p));
                    }
                    let _ = ch.send_json(&serde_json::json!({ "t": "no", "why": why }));
                    (self.events)(Event::IncomingFailed {
                        from,
                        why: why.clone(),
                    });
                }
                result
            }
            _ => Ok(()),
        }
    }

    /// Sends texts and files to a trusted person; `progress` gets (sent,
    /// total) bytes. Fails without sending when over the limits.
    pub fn send(
        &self,
        id: &str,
        items: &[Item],
        progress: impl FnMut(u64, u64),
    ) -> Result<(), String> {
        self.transfer(id, items, false, progress)
    }

    /// One live clipboard copy; Err(TOO_BIG_FOR_LIVE) over 25 MB.
    pub fn send_live(&self, id: &str, items: &[Item]) -> Result<(), String> {
        self.transfer(id, items, true, |_, _| {})
    }

    fn transfer(
        &self,
        id: &str,
        items: &[Item],
        live: bool,
        mut progress: impl FnMut(u64, u64),
    ) -> Result<(), String> {
        let (texts, files, total) = plan(items)?;
        if live && total > MAX_LIVE {
            return Err(TOO_BIG_FOR_LIVE.into());
        }
        let mut ch = self.connect(id)?;
        let list: Vec<_> = files
            .iter()
            .map(|f| serde_json::json!({ "rel": f.rel, "size": f.size }))
            .collect();
        ch.send_json(
            &serde_json::json!({ "t": "send", "texts": texts, "files": list, "total": total, "live": live }),
        )?;
        ch.set_timeout(Duration::from_secs(30));
        let reply = ch.recv_json()?;
        if reply["t"] != "ok" {
            return Err(reply["why"]
                .as_str()
                .unwrap_or("They couldn't take it")
                .to_string());
        }
        let mut done = texts.iter().map(|t| t.len() as u64).sum::<u64>();
        progress(done, total);
        let mut buf = vec![0u8; CHUNK];
        for f in &files {
            let mut file =
                std::fs::File::open(&f.src).map_err(|_| format!("Can't open {}", f.rel))?;
            let mut left = f.size;
            while left > 0 {
                let n = (left as usize).min(CHUNK);
                file.read_exact(&mut buf[..n])
                    .map_err(|_| format!("{} changed while sending", f.rel))?;
                ch.send(&buf[..n])?;
                left -= n as u64;
                done += n as u64;
                progress(done, total);
            }
        }
        let end = ch.recv_json()?;
        if end["t"] != "got" {
            return Err(end["why"]
                .as_str()
                .unwrap_or("It didn't arrive")
                .to_string());
        }
        Ok(())
    }

    /// Takes in one send; `made` collects what was created, for cleanup.
    fn receive(
        &self,
        ch: &mut Channel,
        msg: &serde_json::Value,
        made: &mut Vec<PathBuf>,
    ) -> Result<(), String> {
        let texts: Vec<String> = msg["texts"]
            .as_array()
            .ok_or("Bad send")?
            .iter()
            .filter_map(|t| t.as_str().map(str::to_string))
            .collect();
        let mut files = Vec::new();
        for f in msg["files"].as_array().ok_or("Bad send")? {
            let rel = f["rel"]
                .as_str()
                .and_then(safe_rel)
                .ok_or("Bad file name")?;
            files.push((rel, f["size"].as_u64().ok_or("Bad send")?));
        }
        let total = files.iter().map(|f| f.1).sum::<u64>()
            + texts.iter().map(|t| t.len() as u64).sum::<u64>();
        let live = msg["live"].as_bool().unwrap_or(false);
        if files.len() > MAX_FILES || total > MAX_SEND || (live && total > MAX_LIVE) {
            return Err(too_big(total));
        }
        let inbox = if live {
            &self.cfg.live_inbox
        } else {
            &self.cfg.inbox
        };
        ch.send_json(&serde_json::json!({ "t": "ok" }))?;
        ch.set_timeout(Duration::from_secs(30));
        let from = ch.peer_name.clone();
        let mut done = texts.iter().map(|t| t.len() as u64).sum::<u64>();
        // Each top-level name gets a free spot in the inbox once.
        let mut tops: HashMap<String, PathBuf> = HashMap::new();
        if !files.is_empty() {
            std::fs::create_dir_all(inbox).map_err(|_| "Can't write to Downloads".to_string())?;
        }
        let mut last = Instant::now();
        for (rel, size) in &files {
            let mut parts = rel.iter();
            let top = parts
                .next()
                .ok_or("Bad file name")?
                .to_string_lossy()
                .to_string();
            let top_path = match tops.get(&top) {
                Some(p) => p.clone(),
                None => {
                    let p = unique(inbox, &top);
                    made.push(p.clone());
                    tops.insert(top.clone(), p.clone());
                    p
                }
            };
            let dest: PathBuf = parts.fold(top_path, |p, c| p.join(c));
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|_| "Can't write to Downloads".to_string())?;
            }
            let part = dest.with_file_name(format!(
                "{}.part",
                dest.file_name().unwrap_or_default().to_string_lossy()
            ));
            made.push(part.clone());
            let mut out =
                std::fs::File::create(&part).map_err(|_| "Can't write to Downloads".to_string())?;
            let mut left = *size;
            while left > 0 {
                let chunk = ch.recv()?;
                if chunk.len() as u64 > left {
                    return Err("Bad data".into());
                }
                out.write_all(&chunk)
                    .map_err(|_| "The disk is full or can't be written".to_string())?;
                left -= chunk.len() as u64;
                done += chunk.len() as u64;
                if last.elapsed() > Duration::from_millis(100) {
                    last = Instant::now();
                    (self.events)(Event::Incoming {
                        from: from.clone(),
                        done,
                        total,
                    });
                }
            }
            drop(out);
            std::fs::rename(&part, &dest).map_err(|_| "Can't write to Downloads".to_string())?;
        }
        ch.send_json(&serde_json::json!({ "t": "got" }))?;
        let mut paths: Vec<PathBuf> = tops.into_values().collect();
        paths.sort();
        (self.events)(Event::Received {
            from,
            texts,
            paths,
            live,
        });
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("lotus-share-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn start(name: &str, events: impl Fn(Event) + Send + Sync + 'static) -> Arc<Share> {
        Share::start(
            Config {
                dir: temp(name),
                name: name.into(),
                listen_port: 0,
                announce_ports: vec![],
                auto_accept: false,
                inbox: temp(name).join("inbox"),
                live_inbox: temp(name).join("live"),
            },
            events,
        )
        .unwrap()
    }

    /// Makes `a` know where `b` is, as a hello datagram would.
    fn introduce(a: &Share, b: &Share) {
        let hello = b.datagram("hello");
        a.on_datagram(&hello, SocketAddr::from(([127, 0, 0, 1], 9)));
    }

    #[test]
    fn identity_is_stable_and_hex() {
        let dir = temp("ident");
        let a = Identity::load_or_create(&dir).unwrap();
        let b = Identity::load_or_create(&dir).unwrap();
        assert_eq!(a.id, b.id);
        assert_eq!(a.id.len(), 16);
        assert_eq!(unhex(&hex(&[0, 255, 16])).unwrap(), vec![0, 255, 16]);
        assert!(unhex("zz").is_none());
    }

    #[test]
    fn pairing_shows_one_code_and_trusts_both_ways() {
        let (tx, rx) = mpsc::channel::<(String, u16)>();
        let tx = Mutex::new(tx);
        let b = start("bob", move |e| {
            if let Event::PairRequest { id, code, .. } = e {
                let _ = tx.lock().unwrap().send((id, code));
            }
        });
        let a = start("alice", |_| {});
        introduce(&a, &b);
        // The datagram came "from" 127.0.0.1:9; point it at b's real port.
        a.seen.lock().unwrap().get_mut(b.id()).unwrap().addr =
            SocketAddr::from(([127, 0, 0, 1], b.tcp_port));
        let b2 = b.clone();
        let answer = std::thread::spawn(move || {
            let (id, code) = rx.recv_timeout(Duration::from_secs(10)).unwrap();
            b2.answer(&id, true);
            code
        });
        let mut shown = 0;
        a.pair(b.id(), |c| shown = c).unwrap();
        assert_eq!(
            answer.join().unwrap(),
            shown,
            "both sides show the same code"
        );
        assert!(shown < 10_000);
        assert!(a.peers().iter().any(|p| p.id == b.id() && p.trusted));
        assert!(b.trusted.lock().unwrap().iter().any(|p| p.id == a.id()));
        // A declined request trusts nobody.
        let c = start("carol", |_| {});
        introduce(&c, &b);
        c.seen.lock().unwrap().get_mut(b.id()).unwrap().addr =
            SocketAddr::from(([127, 0, 0, 1], b.tcp_port));
        let b3 = b.clone();
        let cid = c.id().to_string();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(300));
            b3.answer(&cid, false);
        });
        assert!(c.pair(b.id(), |_| {}).is_err());
        assert!(!b.trusted.lock().unwrap().iter().any(|p| p.id == c.id()));
    }

    /// Real network: run `cargo run --example share_peer` first, then
    /// `cargo test --offline live_dev_peer -- --ignored`.
    #[test]
    #[ignore]
    fn live_dev_peer() {
        let a = Share::start(
            Config {
                dir: temp("live"),
                name: "Live test".into(),
                listen_port: 0,
                announce_ports: vec![DEV_PORT],
                auto_accept: false,
                inbox: temp("live").join("inbox"),
                live_inbox: temp("live").join("live"),
            },
            |_| {},
        )
        .unwrap();
        a.query();
        std::thread::sleep(Duration::from_millis(1000));
        let peer = a
            .peers()
            .into_iter()
            .find(|p| p.name == "Test peer")
            .expect("dev peer found by multicast");
        assert!(peer.online);
        a.pair(&peer.id, |_| {}).unwrap();
        assert!(a.peers().iter().any(|p| p.id == peer.id && p.trusted));
        let file = temp("live-src").with_extension("txt");
        std::fs::write(&file, b"live send").unwrap();
        let mut pct = 0;
        a.send(
            &peer.id,
            &[Item::Text("hi from the live test".into()), Item::Path(file)],
            |d, t| pct = d * 100 / t,
        )
        .unwrap();
        assert_eq!(pct, 100);
    }

    /// Two people paired with each other (auto-accept on b), b's events out.
    fn paired(tag: &str) -> (Arc<Share>, Arc<Share>, mpsc::Receiver<Event>) {
        let (tx, rx) = mpsc::channel();
        let tx = Mutex::new(tx);
        let b = Share::start(
            Config {
                dir: temp(&format!("{tag}-b")),
                name: format!("{tag}-b"),
                listen_port: 0,
                announce_ports: vec![],
                auto_accept: true,
                inbox: temp(&format!("{tag}-inbox")),
                live_inbox: temp(&format!("{tag}-live")),
            },
            move |e| {
                let _ = tx.lock().unwrap().send(e);
            },
        )
        .unwrap();
        let a = start(&format!("{tag}-a"), |_| {});
        introduce(&a, &b);
        a.seen.lock().unwrap().get_mut(b.id()).unwrap().addr =
            SocketAddr::from(([127, 0, 0, 1], b.tcp_port));
        a.pair(b.id(), |_| {}).unwrap();
        (a, b, rx)
    }

    fn received(rx: &mpsc::Receiver<Event>) -> Option<(Vec<String>, Vec<PathBuf>)> {
        while let Ok(e) = rx.recv_timeout(Duration::from_secs(10)) {
            match e {
                Event::Received { texts, paths, .. } => return Some((texts, paths)),
                Event::IncomingFailed { .. } => return None,
                _ => {}
            }
        }
        None
    }

    #[test]
    fn file_names_are_made_safe() {
        assert_eq!(
            safe_rel("a/b.txt").unwrap(),
            PathBuf::from("a").join("b.txt")
        );
        for bad in [
            "../x", "a/../b", "C:/x", r"a\b", "con.txt", "x.", "a//b", "", "f:stream",
        ] {
            assert!(safe_rel(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn sends_text_files_and_folders() {
        let (a, b, rx) = paired("send");
        let src = temp("send-src");
        std::fs::create_dir_all(src.join("Notes/deep")).unwrap();
        std::fs::write(src.join("Notes/deep/n.txt"), b"nested").unwrap();
        let big: Vec<u8> = (0..1_300_000u32).map(|i| (i % 251) as u8).collect();
        std::fs::write(src.join("pic.bin"), &big).unwrap();
        let mut last = (0, 0);
        a.send(
            b.id(),
            &[
                Item::Text("hello".into()),
                Item::Path(src.join("pic.bin")),
                Item::Path(src.join("Notes")),
            ],
            |d, t| last = (d, t),
        )
        .unwrap();
        assert_eq!(last.0, last.1, "progress ends at 100 %");
        let (texts, paths) = received(&rx).expect("arrived");
        assert_eq!(texts, vec!["hello".to_string()]);
        let inbox = &b.cfg.inbox;
        assert_eq!(std::fs::read(inbox.join("pic.bin")).unwrap(), big);
        assert_eq!(
            std::fs::read(inbox.join("Notes/deep/n.txt")).unwrap(),
            b"nested"
        );
        assert_eq!(paths.len(), 2);
        // The same again doesn't overwrite: "pic (2).bin", "Notes (2)".
        a.send(
            b.id(),
            &[
                Item::Path(src.join("pic.bin")),
                Item::Path(src.join("Notes")),
            ],
            |_, _| {},
        )
        .unwrap();
        received(&rx).unwrap();
        assert!(inbox.join("pic (2).bin").exists() && inbox.join("Notes (2)/deep/n.txt").exists());
        assert!(!std::fs::read_dir(inbox)
            .unwrap()
            .flatten()
            .any(|e| e.path().to_string_lossy().ends_with(".part")));
    }

    #[test]
    fn over_the_limit_sends_nothing() {
        let (a, b, _rx) = paired("limit");
        let src = temp("limit-src");
        std::fs::create_dir_all(&src).unwrap();
        let f = std::fs::File::create(src.join("huge.bin")).unwrap();
        f.set_len(MAX_SEND + 1).unwrap(); // sparse: no real disk use
        let err = a
            .send(b.id(), &[Item::Path(src.join("huge.bin"))], |_, _| {})
            .unwrap_err();
        assert!(err.contains("limit is 250 MB"), "{err}");
    }

    #[test]
    fn a_dropped_send_leaves_nothing() {
        let (a, b, rx) = paired("drop");
        let mut ch = a.connect(b.id()).unwrap();
        ch.send_json(&serde_json::json!({ "t": "send", "texts": [], "files": [{ "rel": "half.bin", "size": 1000 }], "total": 1000 }))
            .unwrap();
        assert_eq!(ch.recv_json().unwrap()["t"], "ok");
        ch.send(&[7u8; 10]).unwrap();
        drop(ch); // the sender quits mid-way
        assert!(received(&rx).is_none(), "reported as failed");
        let left: Vec<_> = std::fs::read_dir(&b.cfg.inbox)
            .map(|d| d.flatten().count())
            .into_iter()
            .collect();
        assert!(left.iter().all(|n| *n == 0), "partial file deleted");
    }

    #[test]
    fn live_copies_are_small_and_tagged_live() {
        let (a, b, rx) = paired("livecopy");
        a.set_live(&[b.id().to_string(), "not-trusted".into()]);
        assert_eq!(a.live(), vec![b.id().to_string()], "only trusted people");
        a.send_live(b.id(), &[Item::Text("copied".into())]).unwrap();
        let live = loop {
            match rx.recv_timeout(Duration::from_secs(10)).unwrap() {
                Event::Received { live, texts, .. } => break (live, texts),
                _ => continue,
            }
        };
        assert_eq!(live, (true, vec!["copied".to_string()]));
        let src = temp("livecopy-src");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::File::create(src.join("big.bin"))
            .unwrap()
            .set_len(MAX_LIVE + 1)
            .unwrap();
        assert_eq!(
            a.send_live(b.id(), &[Item::Path(src.join("big.bin"))])
                .unwrap_err(),
            TOO_BIG_FOR_LIVE
        );
        a.unpair(b.id());
        assert!(a.live().is_empty(), "unpairing stops live sending");
    }

    #[test]
    fn untrusted_peers_cannot_send() {
        let b = start("dave", |_| {});
        let a = start("erin", |_| {});
        introduce(&a, &b);
        a.seen.lock().unwrap().get_mut(b.id()).unwrap().addr =
            SocketAddr::from(([127, 0, 0, 1], b.tcp_port));
        let mut ch = a.connect(b.id()).unwrap();
        ch.send_json(&serde_json::json!({ "t": "send" })).unwrap();
        ch.set_timeout(Duration::from_secs(3));
        // b drops the connection without answering.
        assert!(ch.recv().is_err());
    }
}
