//! Dev-only pretend second PC for testing Shelf sharing on one machine
//! (.grill/shelf-share.md). Not part of the app or its installer.
//!
//!     cargo run --example share_peer
//!
//! It shows up in the share column as "Test peer", accepts every pairing
//! and prints what happens. Debug builds of LotusNotch announce to it.

#[allow(dead_code)]
#[path = "../src/share.rs"]
mod share;

fn main() {
    let dir = std::env::temp_dir().join("lotusnotch-share-peer");
    let s = share::Share::start(
        share::Config {
            dir,
            name: "Test peer".into(),
            listen_port: share::DEV_PORT,
            announce_ports: vec![share::PORT],
            auto_accept: true,
        },
        |e| {
            if let share::Event::PairRequest { name, code, .. } = e {
                println!("Pair request from {name}: code {code:04} (accepted)");
            }
        },
    )
    .expect("couldn't start");
    println!("Test peer {} running. Ctrl+C to stop.", s.id());
    loop {
        std::thread::sleep(std::time::Duration::from_secs(3600));
    }
}
