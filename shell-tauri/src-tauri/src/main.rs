// P22c prototype: a Tauri 2 window on the Node sidecar's 127.0.0.1 server (the same HTTP transport a browser uses).
// The shell only starts the sidecar, waits for its port, opens one window on it, keeps the window's size/position and
// has a small menu. It talks to nothing but 127.0.0.1:<port> (G-01/G-02); the page gets no Tauri command at all
// (capabilities/default.json is empty, withGlobalTauri is off).
//
// Layouts: development/measurement — `BISMUTH_ROOT` (repository with `out/renderer` built and the sidecar bundled by
// `node shell-tauri/sidecar/build.mjs`) + `BISMUTH_DATA` (folder with bismuth.db); packaged — resources next to the
// executable (`node` as externalBin, `server.mjs`, `renderer/`, `drizzle/`) and the data in the app data folder
// (shortcut: the packaged layout is written but was not run; no Windows/macOS build in the Codespace).
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::{
    env,
    net::{SocketAddr, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    webview::PageLoadEvent,
    AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder,
};

const DEFAULT_PORT: u16 = 47931;
const START_TIMEOUT: Duration = Duration::from_secs(60);

struct Sidecar(Mutex<Option<Child>>);

struct Layout {
    node: PathBuf,
    server: PathBuf,
    renderer: PathBuf,
    migrations: PathBuf,
    data: PathBuf,
    port: u16,
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// The measurement script reads these lines from stderr (epoch milliseconds).
fn perf_mark(name: &str) {
    if env::var_os("BISMUTH_PERF").is_some() {
        eprintln!("PERF {name} {}", now_ms());
    }
}

fn layout(app: &AppHandle) -> Result<Layout, String> {
    let port = env::var("BISMUTH_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(DEFAULT_PORT);
    if let Some(root) = env::var_os("BISMUTH_ROOT") {
        let root = PathBuf::from(root);
        return Ok(Layout {
            node: env::var_os("BISMUTH_NODE").map_or_else(|| PathBuf::from("node"), PathBuf::from),
            server: root.join("shell-tauri/sidecar/dist/server.mjs"),
            renderer: root.join("out/renderer"),
            migrations: root.join("drizzle"),
            data: env::var_os("BISMUTH_DATA")
                .map(PathBuf::from)
                .ok_or("BISMUTH_DATA is not set")?,
            port,
        });
    }
    let res = app.path().resource_dir().map_err(|e| e.to_string())?;
    let exe_dir = env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .map(PathBuf::from)
        .ok_or("no executable folder")?;
    Ok(Layout {
        node: exe_dir.join(if cfg!(windows) { "node.exe" } else { "node" }),
        server: res.join("server.mjs"),
        renderer: res.join("renderer"),
        migrations: res.join("drizzle"),
        data: app.path().app_data_dir().map_err(|e| e.to_string())?,
        port,
    })
}

fn sidecar_args(l: &Layout) -> Vec<String> {
    let s = |p: &PathBuf| p.to_string_lossy().into_owned();
    vec![
        s(&l.server),
        "--data".into(),
        s(&l.data),
        "--renderer".into(),
        s(&l.renderer),
        "--migrations".into(),
        s(&l.migrations),
        "--port".into(),
        l.port.to_string(),
    ]
}

fn spawn_sidecar(l: &Layout) -> Result<Child, String> {
    let mut cmd = Command::new(&l.node);
    // stdin stays open: when this process dies the pipe closes and the sidecar stops (no orphan holding the database).
    cmd.args(sidecar_args(l))
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::inherit());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd.spawn()
        .map_err(|e| format!("cannot start {}: {e}", l.node.display()))
}

/// Polls the loopback port until the sidecar listens; false when it exited or took too long.
fn wait_listening(port: u16, alive: impl Fn() -> bool) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let start = Instant::now();
    while start.elapsed() < START_TIMEOUT && alive() {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok() {
            return true;
        }
        thread::sleep(Duration::from_millis(25));
    }
    false
}

fn open_window(app: &AppHandle, port: u16) -> tauri::Result<()> {
    let url = format!("http://127.0.0.1:{port}/");
    let mut window = WebviewWindowBuilder::new(
        app,
        "main",
        WebviewUrl::External(url.parse().expect("loopback url")),
    )
    .title("Bismuth")
    .inner_size(1280.0, 800.0)
    .min_inner_size(1024.0, 640.0)
    .on_page_load(|_, payload| {
        if payload.event() == PageLoadEvent::Finished {
            perf_mark("page_finished");
        }
    });
    if env::var_os("BISMUTH_PERF").is_some() {
        window = window.initialization_script(include_str!("../perf-driver.js"));
    }
    window.build()?;
    perf_mark("window_created");
    Ok(())
}

fn main() {
    perf_mark("process_start");
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let l = layout(app.handle())?;
            let child = spawn_sidecar(&l)?;
            app.manage(Sidecar(Mutex::new(Some(child))));

            let reload = MenuItemBuilder::with_id("reload", "Yenile")
                .accelerator("CmdOrCtrl+R")
                .build(app)?;
            let fullscreen = MenuItemBuilder::with_id("fullscreen", "Tam ekran")
                .accelerator("F11")
                .build(app)?;
            let file = SubmenuBuilder::new(app, "Dosya").quit().build()?;
            let edit = SubmenuBuilder::new(app, "Düzen")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            let view = SubmenuBuilder::new(app, "Görünüm")
                .item(&reload)
                .item(&fullscreen)
                .build()?;
            app.set_menu(
                MenuBuilder::new(app)
                    .items(&[&file, &edit, &view])
                    .build()?,
            )?;
            app.on_menu_event(|app, event| {
                let Some(win) = app.get_webview_window("main") else {
                    return;
                };
                match event.id().as_ref() {
                    "reload" => {
                        let _ = win.eval("location.reload()");
                    }
                    "fullscreen" => {
                        let _ = win.set_fullscreen(!win.is_fullscreen().unwrap_or(false));
                    }
                    _ => {}
                }
            });

            let handle = app.handle().clone();
            thread::spawn(move || {
                let state = handle.state::<Sidecar>();
                let alive = || {
                    state
                        .0
                        .lock()
                        .ok()
                        .and_then(|mut g| g.as_mut().map(|c| matches!(c.try_wait(), Ok(None))))
                        .unwrap_or(false)
                };
                if !wait_listening(l.port, alive) {
                    eprintln!("the sidecar did not come up; closing");
                    handle.exit(1);
                    return;
                }
                perf_mark("sidecar_listening");
                let port = l.port;
                let h = handle.clone();
                let _ = handle.run_on_main_thread(move || {
                    if let Err(e) = open_window(&h, port) {
                        eprintln!("cannot open the window: {e}");
                        h.exit(1);
                    }
                });
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the Tauri application");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            if let Some(state) = app.try_state::<Sidecar>() {
                if let Some(mut child) = state.0.lock().ok().and_then(|mut g| g.take()) {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn waits_until_the_port_listens() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        assert!(wait_listening(port, || true));
    }

    #[test]
    fn gives_up_when_the_sidecar_is_gone() {
        // Port 1 is never listening; `alive` false ends the wait at once.
        assert!(!wait_listening(1, || false));
    }

    #[test]
    fn sidecar_gets_loopback_port_and_folders() {
        let l = Layout {
            node: "node".into(),
            server: "s.mjs".into(),
            renderer: "r".into(),
            migrations: "m".into(),
            data: "d".into(),
            port: 4000,
        };
        let args = sidecar_args(&l);
        assert_eq!(args[0], "s.mjs");
        assert!(args.windows(2).any(|w| w[0] == "--port" && w[1] == "4000"));
    }
}
