#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod store;
mod wallpaper;
mod links;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{collections::HashMap, path::PathBuf, sync::{Arc, Mutex, atomic::{AtomicU64, Ordering}}, time::{Duration, Instant}};
use store::{Result, Store};
use tauri::{Emitter, Manager};
use winreg::{enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE}, RegKey};

struct Host {
    directory: PathBuf, script: PathBuf, store: Option<Store>, storage_error: String,
    selected: Value, thumbnails: HashMap<String, Value>, fonts: Option<Value>, status: String,
    connection: Value, revision: u64, pending_start: bool, pending_epoch: u64, opening_since: Option<Instant>, control: Arc<LaunchControl>,
}
type Shared = Arc<Mutex<Host>>;
struct LaunchState { connection: Value, dispatching: bool }
struct LaunchControl { epoch: AtomicU64, revision: AtomicU64, state: Mutex<LaunchState> }
impl LaunchControl {
    fn cancel(&self) -> Result<Value> {
        let mut state = self.state.lock().map_err(|_| "Prism connection state is unavailable")?;
        self.epoch.fetch_add(1, Ordering::SeqCst);
        state.connection["autoStart"] = json!(false);
        state.connection["stateRevision"] = json!(self.next_revision());
        let mut connection = state.connection.clone();
        connection["cancelled"] = json!(!state.dispatching && connection["code"] != "starting");
        Ok(connection)
    }
    fn cancelled_connection(&self) -> Result<Value> {
        let state = self.state.lock().map_err(|_| "Prism connection state is unavailable")?;
        let mut connection = state.connection.clone();
        connection["autoStart"] = json!(false);
        connection["cancelled"] = json!(!state.dispatching && connection["code"] != "starting");
        Ok(connection)
    }
    fn launch(&self, epoch: u64, launch: impl FnOnce() -> Result<Value>) -> Result<Value> {
        {
            let mut state = self.state.lock().map_err(|_| "Prism connection state is unavailable")?;
            if !self.current(epoch) { return Ok(json!({"launched":false,"cancelled":true})); }
            state.dispatching = true;
            state.connection["code"] = json!("starting"); state.connection["autoStart"] = json!(false);
            state.connection["stateRevision"] = json!(self.next_revision());
        }
        // Cancel and dispatch choose their order under the short lock; the helper never holds it.
        let result = launch();
        let mut state = self.state.lock().map_err(|_| "Prism connection state is unavailable")?;
        state.dispatching = false;
        if !matches!(&result, Ok(value) if value["launched"] == true) { state.connection["code"] = json!("apply-error"); }
        state.connection["stateRevision"] = json!(self.next_revision());
        result
    }
    fn next_revision(&self) -> u64 { self.revision.fetch_add(1, Ordering::SeqCst) + 1 }
    fn current(&self, epoch: u64) -> bool { self.epoch.load(Ordering::SeqCst) == epoch }
}
impl Host {
    fn new(directory: PathBuf, script: PathBuf) -> Self {
        let (store, storage_error) = match Store::open(directory.join("backgrounds")) { Ok(store) => (Some(store), String::new()), Err(error) => (None, error) };
        let connection = json!({"code":"checking","detail":"","autoStart":false,"saved":false});
        let control = Arc::new(LaunchControl { epoch: AtomicU64::new(0), revision:AtomicU64::new(0), state: Mutex::new(LaunchState { connection:connection.clone(), dispatching:false }) });
        Self { directory, script, store, storage_error, selected: json!({}), thumbnails: HashMap::new(), fonts: None, status: "Checking Codex…".into(), connection, revision:0, pending_start:false, pending_epoch:0, opening_since:None, control }
    }
    fn store(&mut self) -> Result<&mut Store> { self.store.as_mut().ok_or_else(|| self.storage_error.clone()) }
    fn draft(&self, value: &Value) -> Result<Value> {
        let mut value = value.clone();
        if !value.is_object() { return Err("Invalid wallpaper settings.".into()); }
        for key in ["image", "sidebarImage", "rightImage", "terminalImage"] {
            if let Some(image) = self.selected.get(key) { value[key] = image.clone(); }
            else { value.as_object_mut().unwrap().remove(key); }
        }
        let mut checked = store::options(&value)?;
        for key in ["rightImage", "terminalImage"] { if self.selected.get(key).is_none() { checked.as_object_mut().unwrap().remove(key); } }
        Ok(checked)
    }
    fn history(&mut self) -> Result<Value> {
        self.history_with_startup(startup(&self.script, None))
    }
    fn history_with_startup(&mut self, startup: Result<bool>) -> Result<Value> {
        let state = self.store()?.snapshot();
        let all = state["profiles"].as_array().unwrap();
        let recent = all.iter().filter(|p| p["id"] == state["activeId"]).chain(all.iter().filter(|p| p["id"] != state["activeId"])).take(4);
        let mut profiles = Vec::new(); let mut used = Vec::new();
        for p in recent {
            let key = format!("{}:{}", p["image"], if p["mode"] == "separate" { &p["sidebarImage"] } else { &p["image"] });
            used.push(key.clone());
            if !self.thumbnails.contains_key(&key) {
                let thumb = self.store()?.load(p["id"].as_str().unwrap()).and_then(|v| Ok(json!({"chat":store::thumbnail(v["image"].as_str().unwrap())?,"sidebar":store::thumbnail(v["sidebarImage"].as_str().unwrap())?})));
                self.thumbnails.insert(key.clone(), thumb.unwrap_or(json!({})));
            }
            profiles.push(json!({"id":p["id"],"name":p["name"],"saved":p["saved"],"mode":p["mode"],"veil":p["veil"],"sidebarVeil":p["sidebarVeil"],"rightVeil":p.get("rightVeil").unwrap_or(&p["sidebarVeil"]),"terminalVeil":p.get("terminalVeil").unwrap_or(&p["sidebarVeil"]),"chatEnabled":p["chatEnabled"].as_bool().unwrap_or(p["mode"] != "sidebar"),"sidebarEnabled":p["sidebarEnabled"].as_bool().unwrap_or(p["mode"] != "chat"),"rightEnabled":p["rightEnabled"]==true,"terminalEnabled":p["terminalEnabled"]==true,"updatedAt":p["updatedAt"],"thumbnails":self.thumbnails[&key]}));
        }
        self.thumbnails.retain(|key, _| used.contains(key));
        let (enabled, warning) = match startup { Ok(enabled) => (json!(enabled), String::new()), Err(error) => (Value::Null, format!("Windows startup status is unavailable: {error}")) };
        Ok(json!({"profiles":profiles,"activeId":state["activeId"],"status":self.status,"connection":self.connection,"startAtLogin":enabled,"startupWarning":warning,"stateRevision":self.revision}))
    }
    fn report(&mut self, app: &tauri::AppHandle, message: String) {
        self.report_connection(app, json!({"code":"apply-error","detail":message}));
    }
    fn report_connection(&mut self, app: &tauri::AppHandle, mut connection: Value) {
        if !self.control.current(self.pending_epoch) { self.pending_start = false; }
        connection["autoStart"] = json!(self.pending_start);
        connection["saved"] = json!(self.store.as_ref().is_some_and(|store| !store.snapshot()["activeId"].is_null()));
        connection["stateRevision"] = json!(self.revision);
        if connection["detail"].is_null() { connection["detail"] = json!(""); }
        let message = match connection["code"].as_str().unwrap_or("") {
            "ready" => "Codex is connected. Choose a background and click Apply.",
            "applied" => "Background applied and saved.",
            "codex-open" => "Quit ChatGPT from its Windows tray icon. Use Still running? for help.",
            "codex-closed" => "Codex is closed. Apply will guide you through opening it.",
            "starting" => "Codex is starting. Prism will continue automatically.",
            "codex-loading" => "Open a task in Codex. Your saved background will appear automatically.",
            "partial" => "Some Codex windows are still waiting for the background. Prism will retry.",
            _ => "Prism needs your attention. Follow the steps above.",
        }.to_string();
        if let Ok(mut current) = self.control.state.lock() {
            if !self.control.current(self.pending_epoch) { self.pending_start = false; connection["autoStart"] = json!(false); }
            if self.connection != connection || self.status != message { self.revision = self.control.next_revision(); connection["stateRevision"] = json!(self.revision); }
            current.connection = connection.clone();
        }
        if self.connection != connection || self.status != message {
            self.connection = connection; self.status = message;
            let _ = app.emit_to("main", "background-status", json!({"message":self.status,"connection":self.connection,"stateRevision":self.revision}));
        }
    }
    // Pending opening exists only for an explicitly requested, approved setup in this process.
    fn advance_open(&mut self, mut connection: Value, launch: impl FnOnce() -> Result<Value>) -> Value {
        if !self.control.current(self.pending_epoch) { self.pending_start = false; }
        let code = connection["code"].as_str().unwrap_or("").to_owned();
        if let Some(started) = self.opening_since {
            if ["codex-open", "codex-closed"].contains(&code.as_str()) && started.elapsed() < Duration::from_secs(45) {
                connection["code"] = json!("starting"); return connection;
            }
            self.opening_since = None;
        }
        if !self.pending_start { return connection; }
        if !self.store.as_ref().is_some_and(|store| store.snapshot()["launchApproved"] == true) { self.pending_start = false; return connection; }
        match code.as_str() {
            "codex-open" => {},
            "codex-closed" => {
                self.pending_start = false;
                match self.control.launch(self.pending_epoch, launch) {
                    Ok(result) if result["cancelled"] == true => {},
                    Ok(result) if result["launched"] == true => { self.opening_since = Some(Instant::now()); connection = json!({"code":"starting","detail":""}); },
                    result => { connection = json!({"code":"apply-error","detail":result.err().unwrap_or_else(|| "Codex did not confirm that it started. Click Open Codex to try again.".into())}); },
                }
            },
            _ => self.pending_start = false,
        }
        connection
    }
    fn restore(&mut self, app: &tauri::AppHandle) -> Value {
        let Some(store) = &self.store else {
            self.pending_start = false;
            self.report_connection(app, json!({"code":"storage-error","detail":self.storage_error}));
            return json!({"waiting":true,"message":self.storage_error,"connection":self.connection});
        };
        let state = store.snapshot(); let script = self.script.clone();
        let connection = self.advance_open(wallpaper::connection(&script), || wallpaper::windows(&script, "Launch"));
        if connection["code"] != "ready" {
            self.report_connection(app, connection);
            return json!({"waiting":true,"message":self.status,"connection":self.connection});
        }
        let removing = state["pendingRemoval"] == true;
        if state["activeId"].is_null() && !removing { self.report_connection(app, connection); return json!({"idle":true,"connection":self.connection}); }
        let result = (|| -> Result<Value> {
            let value = if removing { None } else { Some(self.store()?.load(state["activeId"].as_str().ok_or("Invalid active background")?)?) };
            let result = wallpaper::operate(&self.script, value.as_ref())?;
            if removing && result["removed"] == true { self.store()?.removed()?; }
            Ok(result)
        })();
        match result {
            Ok(mut result) => {
                let code = if result["partial"] == true { "partial" } else if result["installed"] == true { "applied" } else if result["removed"] == true { "ready" } else { "apply-error" };
                self.report_connection(app, json!({"code":code,"detail":result["message"].as_str().unwrap_or(""),"appearance":result["appearance"]}));
                result["connection"] = self.connection.clone(); result
            },
            Err(message) => {
                let mut connection = wallpaper::connection(&self.script);
                if connection["code"] == "ready" { connection = json!({"code":if message.starts_with("Codex is still opening.") { "codex-loading" } else { "apply-error" },"detail":message}); }
                self.report_connection(app, connection);
                json!({"waiting":true,"message":message,"connection":self.connection})
            }
        }
    }
    fn request_start(&mut self, app: &tauri::AppHandle, epoch: u64) -> Result<Value> {
        self.store()?;
        if !self.control.current(epoch) { let connection = self.control.cancelled_connection()?; return Ok(json!({"launched":connection["code"]=="starting","cancelled":connection["cancelled"],"connection":connection})); }
        let script = self.script.clone();
        let connection = self.advance_open(wallpaper::connection(&script), || wallpaper::windows(&script, "Launch"));
        self.report_connection(app, connection.clone());
        if !self.control.current(epoch) { self.pending_start = false; return Ok(json!({"launched":self.connection["code"]=="starting","cancelled":self.connection["code"]!="starting","connection":self.connection})); }
        if connection["code"] == "ready" {
            wallpaper::windows(&script, "Show")?;
            let mut result = self.restore(app);
            let connected = ["ready", "applied", "codex-loading", "partial"].contains(&self.connection["code"].as_str().unwrap_or(""));
            result["launched"] = json!(connected); result["alreadyOpen"] = json!(connected); return Ok(result);
        }
        if !["codex-open", "codex-closed"].contains(&connection["code"].as_str().unwrap_or("")) {
            let starting = connection["code"] == "starting";
            self.report_connection(app, connection); return Ok(json!({"launched":starting,"waiting":true,"connection":self.connection}));
        }
        if self.store()?.snapshot()["launchApproved"] != true {
            let answer = rfd::MessageDialog::new().set_title("Let Prism open Codex for backgrounds?").set_level(rfd::MessageLevel::Warning)
                .set_description("Backgrounds work in Codex opened through Prism. A separate Codex profile is used, so you may need to sign in once.\n\nThis enables a local connection at 127.0.0.1:9339. Other programs on this computer could read or control that Codex session, including conversations. This choice is remembered.\n\nWindows calls this Codex app ChatGPT. Prism never closes it for you. Save your work, then choose Quit from its icon near the Windows clock. Closing its windows can leave it running. Prism will then open it and continue automatically. Quit that session to close the connection. A normal launch does not enable it.\n\nSelect OK to allow this setup, or Cancel to keep your background saved without opening Codex.")
                .set_buttons(rfd::MessageButtons::OkCancel).show();
            if answer != rfd::MessageDialogResult::Ok {
                self.pending_start = false; self.report_connection(app, connection);
                return Ok(json!({"launched":false,"cancelled":true,"connection":self.connection}));
            }
            if !self.control.current(epoch) { let connection = self.control.cancelled_connection()?; return Ok(json!({"launched":connection["code"]=="starting","cancelled":connection["cancelled"],"connection":connection})); }
            self.store()?.approve_launch()?;
        }
        self.pending_epoch = epoch; self.pending_start = true;
        let connection = self.advance_open(connection, || wallpaper::windows(&script, "Launch"));
        let launched = connection["code"] == "starting";
        self.report_connection(app, connection);
        if self.connection["code"] == "codex-open" { show(app); }
        Ok(json!({"launched":launched,"waiting":true,"connection":self.connection}))
    }
    fn operate(&mut self, app: &tauri::AppHandle, action: &str, args: Value, epoch: u64) -> Result<Value> {
        match action {
            "connection" => { self.restore(app); Ok(self.connection.clone()) },
            "fonts" => {
                if self.fonts.is_none() {
                    let result = wallpaper::windows(&self.script, "Fonts")?;
                    self.fonts = Some(json!(result["families"].as_array().ok_or("Fonts could not be listed")?.iter().filter(|v| v.as_str().is_some_and(|s| s.chars().count() <= 100)).take(1000).collect::<Vec<_>>()));
                }
                Ok(self.fonts.clone().unwrap())
            },
            "settings" => wallpaper::windows(&self.script, "Settings"),
            "task-manager" => wallpaper::windows(&self.script, "TaskManager"),
            "migrated-library" => {
                let file = self.directory.join("legacy-library.json");
                if !file.exists() { return Ok(Value::Null); }
                let data = store::read_limited(&file, 10 * 1024 * 1024)?;
                Ok(json!(String::from_utf8(data).map_err(|_| "Saved palettes could not be read")?))
            },
            "image" => {
                let area = args["area"].as_str().ok_or("Invalid image area")?;
                let image_key = match area { "chat" => "image", "sidebar" => "sidebarImage", "right" => "rightImage", "terminal" => "terminalImage", _ => return Err("Invalid image area".into()) };
                let Some(file) = rfd::FileDialog::new().set_title("Choose a background image").add_filter("Images", &["png", "jpg", "jpeg", "webp"]).pick_file() else { return Ok(Value::Null); };
                let bytes = store::read_limited(&file, 8 * 1024 * 1024)?;
                let image = store::decode(&bytes)?;
                let image = if image.width() > 2560 || image.height() > 2560 { image.resize(2560, 2560, image::imageops::FilterType::Triangle) } else { image };
                let mut bytes = Vec::new(); image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, 90).encode_image(&image.to_rgb8()).map_err(|e| e.to_string())?;
                let data = format!("data:image/jpeg;base64,{}", STANDARD.encode(bytes));
                self.selected[image_key] = json!(data);
                Ok(json!({"image":data,"name":file.file_name().unwrap_or_default().to_string_lossy()}))
            },
            "backgrounds" => {
                if self.store.is_none() { return Ok(json!({"profiles":[],"activeId":null,"error":self.storage_error,"connection":{"code":"storage-error","detail":self.storage_error,"autoStart":false,"saved":false}})); }
                let mut history = self.history()?;
                if let Some(id) = history["activeId"].as_str() {
                    match self.store()?.load(id) { Ok(value) => { self.selected = value.clone(); history["active"] = value; }, Err(message) => { history["warning"] = json!(message); } }
                }
                Ok(history)
            },
            "load" => { let value = self.store()?.load(args["id"].as_str().ok_or("Invalid background")?)?; self.selected = value.clone(); Ok(value) },
            "save" | "apply" => {
                let value = self.draft(&args["options"])?;
                let name = if action == "save" { args["name"].as_str().filter(|s| !s.trim().is_empty()).ok_or("Give this background a name.")? } else { "" };
                self.store()?.save(&value, action == "apply", name)?;
                self.revision = self.control.next_revision();
                if action == "save" { return self.history(); }
                let mut result = self.request_start(app, epoch)?; result["saved"] = json!(true); result["history"] = self.history()?; Ok(result)
            },
            "remove" => {
                let update = self.remove_background()?;
                let _ = app.emit_to("main", "background-status", update);
                let mut result = self.restore(app); result["history"] = self.history()?; Ok(result)
            },
            "start" => self.request_start(app, epoch),
            "startup" => Ok(json!(startup(&self.script, Some(args["value"].as_bool().ok_or("Invalid startup setting")?))?)),
            _ => Err("Unknown Prism operation.".into())
        }
    }
    fn remove_background(&mut self) -> Result<Value> {
        self.pending_start = false;
        self.store()?.remove()?;
        self.revision = self.control.next_revision();
        Ok(json!({"removalRequested":true,"history":self.history()?,"stateRevision":self.revision,"connection":{"code":"removing","autoStart":false,"saved":false,"stateRevision":self.revision},"message":"Automatic restoration is off. Removing the background when Codex is reachable."}))
    }
}
fn is_packaged() -> Result<bool> {
    #[link(name = "kernel32")]
    extern "system" { fn GetCurrentPackageFullName(length: *mut u32, name: *mut u16) -> i32; }
    let mut length = 0;
    match unsafe { GetCurrentPackageFullName(&mut length, std::ptr::null_mut()) } {
        15700 => Ok(false), // APPMODEL_ERROR_NO_PACKAGE
        122 => Ok(true), // ERROR_INSUFFICIENT_BUFFER: the identity exists.
        _ => Err("Windows package identity is unavailable.".into()),
    }
}
fn native_context(packaged: bool) -> tauri::Context<tauri::Wry> {
    let mut context = tauri::generate_context!();
    if packaged { context.config_mut().identifier.push_str(".store"); }
    context
}
fn startup(script: &std::path::Path, change: Option<bool>) -> Result<bool> {
    let root = RegKey::predef(HKEY_CURRENT_USER);
    if change.is_some() && cfg!(debug_assertions) { return Err("Use the packaged Prism app to change Windows startup.".into()); }
    if is_packaged()? {
        let action = match change { Some(true) => "StartupEnable", Some(false) => "StartupDisable", None => "Startup" };
        return wallpaper::windows(script, action)?.as_bool().ok_or("Unexpected Windows startup state.".into());
    }
    let path = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    let key = match root.open_subkey_with_flags(path, if change.is_some() { KEY_READ | KEY_WRITE } else { KEY_READ }) {
        Ok(key) => key,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            if change != Some(true) { return Ok(false); }
            root.create_subkey(path).map_err(|e| e.to_string())?.0
        },
        Err(error) => return Err(error.to_string()),
    };
    let expected = format!("\"{}\" --background", std::env::current_exe().map_err(|e| e.to_string())?.display());
    if let Some(enable) = change {
        if enable { key.set_value("PrismNative", &expected).map_err(|e| e.to_string())?; }
        else if let Err(error) = key.delete_value("PrismNative") { if error.kind() != std::io::ErrorKind::NotFound { return Err(error.to_string()); } }
    }
    match key.get_value::<String, _>("PrismNative") {
        Ok(value) => Ok(value == expected),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}
fn validate_copy(text: &str) -> Result<()> {
    if text.len() > 32768 { return Err("Theme text must be smaller than 32 KB.".into()); }
    let body = text.trim().strip_prefix("codex-theme-v1:").ok_or("Copy a complete Codex theme.")?;
    let body = if body.starts_with('{') { std::borrow::Cow::Borrowed(body) } else { percent_encoding::percent_decode_str(body).decode_utf8().map_err(|_| "Invalid theme encoding")? };
    let value: Value = serde_json::from_str(&body).map_err(|_| "Invalid theme text")?;
    if !["light", "dark"].contains(&value["variant"].as_str().unwrap_or("")) || !value["theme"].is_object() || !value["codeThemeId"].is_string() { return Err("Invalid Codex theme.".into()); }
    for key in ["surface", "ink", "accent"] { if !value["theme"][key].as_str().is_some_and(|s| s.len() == 7 && s.starts_with('#') && s.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)) { return Err("Invalid theme color.".into()); } }
    Ok(())
}
fn local_page(url: &url::Url) -> bool { (url.scheme() == "http" && url.host_str() == Some("tauri.localhost") || url.scheme() == "tauri" && url.host_str() == Some("localhost")) && url.port().is_none() && url.username().is_empty() && url.password().is_none() }
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn store_and_portable_use_distinct_single_instance_contexts() {
        let portable = native_context(false);
        let store = native_context(true);
        assert_eq!(portable.config().identifier, "local.prism.codexthemes.native");
        assert_eq!(store.config().identifier, "local.prism.codexthemes.native.store");
        assert_eq!(portable.config().product_name, store.config().product_name);
        assert!(!is_packaged().unwrap());
    }
    #[test]
    fn native_sender_clipboard_and_image_boundaries() {
        assert!(local_page(&url::Url::parse("http://tauri.localhost/index.html").unwrap()));
        for url in ["https://example.com", "http://tauri.localhost:9339", "http://user@tauri.localhost", "about:blank"] { assert!(!local_page(&url::Url::parse(url).unwrap())); }
        let text = r##"codex-theme-v1:{"variant":"light","codeThemeId":"github","theme":{"surface":"#FFFFFF","ink":"#000000","accent":"#8060AA"}}"##;
        assert!(validate_copy(text).is_ok());
        assert!(validate_copy(&text.replace("#8060AA", "url(file://x)")).is_err());
        assert!(validate_copy(&"x".repeat(32769)).is_err());
        let image = store::decode(include_bytes!("../../icon.png")).unwrap();
        assert!(image.width() > 0 && image.height() > 0);
        assert!(store::decode(b"not an image").is_err());
        let temp = tempfile::tempdir().unwrap();
        let mut host = Host::new(temp.path().to_owned(), PathBuf::new());
        host.selected = json!({"image":"data:image/png;base64,AA==","sidebarImage":"data:image/png;base64,AQ==","rightImage":"data:image/png;base64,Ag==","terminalImage":"data:image/png;base64,Aw=="});
        let draft = host.draft(&json!({"mode":"separate","veil":0.7,"rightVeil":0.4,"terminalVeil":0.95,"rightImage":"file:///private","rightEnabled":true,"terminalEnabled":false})).unwrap();
        assert_eq!(draft["rightImage"],host.selected["rightImage"]);
        assert_eq!(draft["terminalImage"],host.selected["terminalImage"]);
        assert_eq!(draft["rightVeil"],0.4); assert_eq!(draft["terminalVeil"],0.95);
        assert_eq!(draft["rightEnabled"],true); assert_eq!(draft["terminalEnabled"],false);
    }
    #[test]
    fn pending_open_waits_for_user_and_approval_then_launches_only_once() {
        let temp = tempfile::tempdir().unwrap();
        let mut host = Host::new(temp.path().to_owned(), PathBuf::new());
        host.pending_start = true;
        host.advance_open(json!({"code":"codex-closed"}), || panic!("Unapproved launch"));
        assert!(!host.pending_start);
        host.store().unwrap().approve_launch().unwrap();
        host.pending_start = true;
        assert_eq!(host.advance_open(json!({"code":"codex-open"}), || panic!("User has not closed Codex"))["code"], "codex-open");
        assert!(host.pending_start);
        let mut launches = 0;
        assert_eq!(host.advance_open(json!({"code":"codex-closed"}), || { launches += 1; Ok(json!({"launched":true})) })["code"], "starting");
        assert!(!host.pending_start); assert_eq!(launches, 1);
        assert_eq!(host.advance_open(json!({"code":"codex-closed"}), || panic!("Duplicate startup"))["code"], "starting");
        host.advance_open(json!({"code":"ready"}), || panic!("Already connected"));
        assert!(host.opening_since.is_none());
        host.advance_open(json!({"code":"codex-closed"}), || panic!("Do not reopen after the user quits"));
        for code in ["unsafe-session", "port-in-use", "unsafe-install", "helper-missing"] {
            host.pending_start = true;
            host.advance_open(json!({"code":code}), || panic!("Unsafe launch"));
            assert!(!host.pending_start);
        }
        host.pending_start = true;
        assert_eq!(host.advance_open(json!({"code":"codex-closed"}), || Err("Launch failed".into()))["code"], "apply-error");
        assert!(!host.pending_start);
        host.advance_open(json!({"code":"codex-closed"}), || panic!("Do not repeat a failed launch"));
    }
    #[test]
    fn independent_controls_respond_while_wallpaper_work_is_blocked_and_cancel_stale_launches() {
        let temp = tempfile::tempdir().unwrap();
        let mut host = Host::new(temp.path().to_owned(), PathBuf::new());
        host.store().unwrap().approve_launch().unwrap(); host.pending_start = true;
        let control = host.control.clone();
        let state = Arc::new(Mutex::new(host)); let worker = state.clone();
        let (locked, wait_locked) = std::sync::mpsc::channel();
        let (release, wait_release) = std::sync::mpsc::channel();
        let slow = std::thread::spawn(move || {
            let mut host = worker.lock().unwrap(); locked.send(()).unwrap();
            wait_release.recv_timeout(Duration::from_secs(3)).unwrap();
            host.advance_open(json!({"code":"codex-closed"}), || panic!("Cancelled opening must not launch after the slow check finishes"));
            assert!(!host.pending_start);
        });
        wait_locked.recv_timeout(Duration::from_secs(1)).unwrap();
        assert!(state.try_lock().is_err());
        let started = Instant::now();
        assert_eq!(independent("cancel-start", &json!({}), &control, || panic!("Not Quit")).unwrap().unwrap()["autoStart"], false);
        assert!(independent("copy", &json!({"text":"invalid"}), &control, || panic!("Not Quit")).unwrap().is_err());
        let mut quit = false;
        assert_eq!(independent("quit", &json!({}), &control, || quit = true).unwrap().unwrap(), true);
        assert!(quit && started.elapsed() < Duration::from_millis(500));
        release.send(()).unwrap(); slow.join().unwrap();
        let mut host = state.lock().unwrap();
        host.pending_epoch = control.epoch.load(Ordering::SeqCst); host.pending_start = true;
        assert_eq!(host.advance_open(json!({"code":"codex-closed"}), || Ok(json!({"launched":true})))["code"], "starting");
    }
    #[test]
    fn launch_dispatch_and_cancel_have_one_decision_order_without_blocking_on_the_helper() {
        let temp = tempfile::tempdir().unwrap();
        let control = Host::new(temp.path().to_owned(), PathBuf::new()).control;
        let barrier = Arc::new(std::sync::Barrier::new(2));
        let worker_control = control.clone(); let worker_barrier = barrier.clone();
        let cancelled = std::thread::spawn(move || {
            worker_barrier.wait();
            worker_control.launch(0, || panic!("Cancel won before dispatch"))
        });
        let cancellation = control.cancel().unwrap();
        assert_eq!(cancellation["cancelled"], true);
        assert!(cancellation["stateRevision"].as_u64().unwrap() > 0);
        barrier.wait();
        assert_eq!(cancelled.join().unwrap().unwrap()["cancelled"], true);

        let epoch = control.epoch.load(Ordering::SeqCst);
        let worker_control = control.clone();
        let (dispatched, wait_dispatched) = std::sync::mpsc::channel();
        let (release, wait_release) = std::sync::mpsc::channel();
        let launching = std::thread::spawn(move || worker_control.launch(epoch, || {
            dispatched.send(()).unwrap();
            wait_release.recv_timeout(Duration::from_secs(3)).unwrap();
            Ok(json!({"launched":true}))
        }));
        wait_dispatched.recv_timeout(Duration::from_secs(1)).unwrap();
        let started = Instant::now();
        let result = control.cancel().unwrap();
        assert_eq!(result["cancelled"], false); assert_eq!(result["code"], "starting");
        assert!(result["stateRevision"].as_u64().unwrap() > cancellation["stateRevision"].as_u64().unwrap());
        assert!(started.elapsed() < Duration::from_millis(500));
        release.send(()).unwrap();
        assert_eq!(launching.join().unwrap().unwrap()["launched"], true);
        assert_eq!(control.cancel().unwrap()["cancelled"], false);
    }
    #[test]
    fn history_survives_startup_failure_and_removal_preserves_draft_and_saved_profiles() {
        let temp = tempfile::tempdir().unwrap();
        let mut host = Host::new(temp.path().to_owned(), PathBuf::new());
        let failed = host.history_with_startup(Err("Access denied".into())).unwrap();
        assert!(failed["profiles"].as_array().unwrap().is_empty()); assert!(failed["startAtLogin"].is_null());
        assert!(failed["startupWarning"].as_str().unwrap().contains("Access denied"));
        let image = format!("data:image/png;base64,{}", STANDARD.encode(include_bytes!("../../icon.png")));
        let draft = json!({"image":image,"mode":"span","veil":0.75});
        host.selected = draft.clone();
        host.store().unwrap().save(&store::options(&draft).unwrap(), true, "Saved background").unwrap();
        let saved = host.history_with_startup(Err("Access denied".into())).unwrap();
        assert_eq!(saved["profiles"].as_array().unwrap().len(), 1); assert!(!saved["activeId"].is_null());
        for code in ["applied", "codex-closed"] {
            let revision = host.revision;
            host.connection = json!({"code":code});
            let update = host.remove_background().unwrap();
            assert_eq!(update["stateRevision"], revision + 1); assert_eq!(update["history"]["stateRevision"], update["stateRevision"]);
            assert_eq!(update["removalRequested"], true); assert!(update["history"]["activeId"].is_null());
            assert_eq!(update["history"]["profiles"].as_array().unwrap().len(), 1);
            assert_eq!(host.selected, draft); assert_eq!(host.store().unwrap().snapshot()["pendingRemoval"], true);
        }
    }
}
fn trusted_page(url: &url::Url, development: Option<&url::Url>) -> bool { local_page(url) || cfg!(debug_assertions) && development.is_some_and(|dev| dev.origin() == url.origin()) }
// These actions do not read or mutate saved wallpaper state. Keep them off its lock.
fn independent(action: &str, args: &Value, control: &LaunchControl, quit: impl FnOnce()) -> Option<Result<Value>> {
    if !matches!(action, "copy" | "export" | "project-link" | "cancel-start" | "quit") { return None; }
    Some((|| {
        match action {
            "cancel-start" => control.cancel(),
            "quit" => { let _ = control.cancel(); quit(); Ok(json!(true)) },
            "project-link" => links::open(args["name"].as_str().ok_or("Unknown project link.")?),
            _ => {
                let text = args["text"].as_str().ok_or("Invalid theme text")?; validate_copy(text)?;
                if action == "copy" {
                    arboard::Clipboard::new().map_err(|e| e.to_string())?.set_text(text).map_err(|e| e.to_string())?;
                } else {
                    let Some(file) = rfd::FileDialog::new().set_title("Save Codex theme").set_file_name("prism.codex-theme").add_filter("Codex theme", &["codex-theme"]).save_file() else { return Ok(json!(false)); };
                    store::atomic(&file, text.as_bytes())?;
                }
                Ok(json!(true))
            },
        }
    })())
}
#[tauri::command]
async fn prism(window: tauri::WebviewWindow, app: tauri::AppHandle, state: tauri::State<'_, Shared>, control: tauri::State<'_, Arc<LaunchControl>>, action: String, args: Value) -> Result<Value> {
    if window.label() != "main" || !trusted_page(&window.url().map_err(|e| e.to_string())?, app.config().build.dev_url.as_ref()) { return Err("Invalid Prism sender.".into()); }
    let state = state.inner().clone();
    let control = control.inner().clone(); let epoch = control.epoch.load(Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(result) = independent(&action, &args, &control, || app.exit(0)) { return result; }
        let mut host = state.lock().map_err(|_| "Prism background state is unavailable")?;
        let mut result = host.operate(&app, &action, args, epoch)?;
        if result.is_object() { result["stateRevision"] = json!(host.revision); }
        Ok(result)
    }).await.map_err(|e| e.to_string())?
}
fn show(app: &tauri::AppHandle) { if let Some(window) = app.get_webview_window("main") { let _ = window.unminimize(); let _ = window.show(); let _ = window.set_focus(); } }
fn tray_action(app: &tauri::AppHandle, action: &'static str) {
    let app = app.clone(); let state = app.state::<Shared>().inner().clone();
    let epoch = app.state::<Arc<LaunchControl>>().epoch.load(Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        if let Ok(mut host) = state.lock() {
            match host.operate(&app, action, json!({}), epoch) {
                Err(message) => { host.report(&app, message); show(&app); },
                Ok(result) if action == "start" && result["launched"] != true => show(&app),
                _ => {},
            }
        }
    });
}
fn main() {
    let result = (|| -> Result<()> {
        let context = native_context(is_packaged()?);
        tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _| { if args.iter().any(|arg| arg == "--open-codex") { tray_action(app, "start"); } else { show(app); } }))
        .invoke_handler(tauri::generate_handler![prism])
        .setup(|app| {
            let script = if cfg!(debug_assertions) { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("generated/Prism.Windows.exe") } else { app.path().resource_dir()?.join("Prism.Windows.exe") };
            let storage = wallpaper::windows(&script, "Storage").map_err(std::io::Error::other)?;
            let mut directory = if storage["packaged"] == true {
                PathBuf::from(storage["directory"].as_str().ok_or("Windows package storage is unavailable")?)
            } else { PathBuf::from(std::env::var_os("APPDATA").ok_or("Windows application data is unavailable")?).join("PrismNative") };
            #[cfg(debug_assertions)]
            if let Some(test) = std::env::var_os("PRISM_NATIVE_TEST_DATA") { directory = PathBuf::from(test); }
            let state: Shared = Arc::new(Mutex::new(Host::new(directory.clone(), script)));
            app.manage(state.lock().unwrap().control.clone());
            app.manage(state.clone());
            let development = app.config().build.dev_url.clone();
            let builder = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
                .title(concat!("Prism ", env!("CARGO_PKG_VERSION"))).inner_size(1040.0, 760.0).min_inner_size(800.0, 650.0)
                .data_directory(directory.join("webview")).visible(!std::env::args().any(|arg| arg == "--background"))
                .on_navigation(move |url| trusted_page(url, development.as_ref()) || url.as_str() == "about:blank");
            #[cfg(debug_assertions)]
            let builder = if std::env::var_os("PRISM_NATIVE_TEST_DATA").is_some() { builder.additional_browser_args("--remote-debugging-address=127.0.0.1 --remote-debugging-port=9344") } else { builder };
            builder.build()?;
            use tauri::{menu::{Menu, MenuItem}, tray::{TrayIconBuilder, TrayIconEvent}};
            let open = MenuItem::with_id(app, "open", "Open Prism", true, None::<&str>)?;
            let codex = MenuItem::with_id(app, "codex", "Open Codex", true, None::<&str>)?;
            let remove = MenuItem::with_id(app, "remove", "Remove backgrounds", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Prism (stop automatic restoration)", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &codex, &remove, &quit])?;
            TrayIconBuilder::new().icon(app.default_window_icon().ok_or("Prism icon is unavailable")?.clone()).tooltip("Prism · Backgrounds").menu(&menu).show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| { if matches!(event, TrayIconEvent::DoubleClick { .. }) { show(tray.app_handle()); } })
                .on_menu_event(|app, event| match event.id.as_ref() { "open" => show(app), "codex" => tray_action(app, "start"), "remove" => tray_action(app, "remove"), "quit" => { show(app); let _ = app.emit_to("main", "quit-requested", ()); }, _ => {} }).build(app)?;
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                let delay = if let Ok(mut host) = state.lock() {
                    host.restore(&handle);
                    if host.pending_start || host.opening_since.is_some() || host.connection["code"] == "codex-loading" { 2 } else { 15 }
                } else { 15 };
                std::thread::sleep(Duration::from_secs(delay));
            });
            if std::env::args().any(|arg| arg == "--open-codex") { tray_action(app.handle(), "start"); }
            Ok(())
        })
        .on_window_event(|window, event| { if let tauri::WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); let _ = window.hide(); } })
        .run(context).map_err(|error| error.to_string())
    })();
    if let Err(error) = result { rfd::MessageDialog::new().set_title("Prism could not start").set_description(error.to_string()).set_level(rfd::MessageLevel::Error).show(); }
}
