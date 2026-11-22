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
            inbox: dir.join("inbox"),
            live_inbox: dir.join("live"),
            dir,
            name: "Test peer".into(),
            listen_port: share::DEV_PORT,
            announce_ports: vec![share::PORT],
            auto_accept: true,
        },
        |e| match e {
            share::Event::PairRequest { name, code, .. } => {
                println!("Pair request from {name}: code {code:04} (accepted)")
            }
            share::Event::Received {
                from,
                texts,
                paths,
                live,
            } => println!("From {from} (live: {live}): {texts:?} {paths:?}"),
            share::Event::IncomingFailed { from, why } => println!("From {from} failed: {why}"),
            _ => {}
        },
    )
    .expect("couldn't start");
    println!("Test peer {} running. Ctrl+C to stop.", s.id());
    println!("Commands: peers | pair <name> | send <name> <text> | file <name> <path> | live <name> <text>");
    // Commands on stdin, so it can also start things (pairing, sends).
    for line in std::io::stdin().lines().map_while(Result::ok) {
        let mut parts = line.trim().splitn(3, ' ');
        let (cmd, who, rest) = (
            parts.next().unwrap_or(""),
            parts.next().unwrap_or(""),
            parts.next().unwrap_or(""),
        );
        if cmd == "peers" {
            s.query();
            std::thread::sleep(std::time::Duration::from_millis(700));
        }
        let peers = s.peers();
        let Some(peer) = peers
            .iter()
            .find(|p| p.name.to_lowercase().starts_with(&who.to_lowercase()))
        else {
            println!(
                "Peers: {:?}",
                peers
                    .iter()
                    .map(|p| (&p.name, p.trusted, p.online))
                    .collect::<Vec<_>>()
            );
            continue;
        };
        let result = match cmd {
            "pair" => s.pair(&peer.id, |code| println!("Code {code:04}")),
            "send" => s.send(&peer.id, &[share::Item::Text(rest.into())], |_, _| {}),
            "file" => s.send(
                &peer.id,
                &[share::Item::Path(rest.into())],
                |done, total| println!("{done}/{total}"),
            ),
            "live" => s.send_live(&peer.id, &[share::Item::Text(rest.into())]),
            _ => {
                println!(
                    "Peers: {:?}",
                    peers
                        .iter()
                        .map(|p| (&p.name, p.trusted, p.online))
                        .collect::<Vec<_>>()
                );
                Ok(())
            }
        };
        println!("{cmd} {}: {result:?}", peer.name);
    }
}
