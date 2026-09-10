use crate::store::{hash, options, Result};
use serde_json::{json, Value};
use std::{io::Read, net::{TcpStream, SocketAddr}, path::Path, process::{Command, Stdio}, sync::mpsc, time::{Duration, Instant}};
use std::os::windows::process::CommandExt;

fn powershell_path(path: &Path) -> Result<String> {
    let path = path.to_str().ok_or("The Windows helper path is not valid Unicode.")?;
    Ok(if let Some(unc) = path.strip_prefix(r"\\?\UNC\") { format!(r"\\{unc}") } else { path.strip_prefix(r"\\?\").unwrap_or(path).to_owned() })
}
pub fn windows(script: &Path, action: &str) -> Result<Value> {
    if !["Inspect", "Verify", "Launch", "Show", "Settings", "Fonts", "TaskManager"].contains(&action) { return Err("Unknown Windows operation.".into()); }
    if crate::store::read_limited(script, 100 * 1024)?.as_slice() != include_bytes!("../../wallpaper-windows.ps1") { return Err("The Windows helper does not match this Prism build.".into()); }
    let mut child = Command::new("powershell.exe").args(["-NoProfile", "-NonInteractive", "-File"]).arg(powershell_path(script)?).args(["-Action", action])
        .env_remove("PSModulePath").creation_flags(0x08000000).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("Windows helper output is unavailable")?;
    let stderr = child.stderr.take().ok_or("Windows helper errors are unavailable")?;
    let (error_send, error_receive) = mpsc::channel();
    std::thread::spawn(move || { let mut data = Vec::new(); let _ = stderr.take(65537).read_to_end(&mut data); let _ = error_send.send(data); });
    let (send, receive) = mpsc::channel();
    std::thread::spawn(move || { let mut data = Vec::new(); let result = stdout.take(65537).read_to_end(&mut data).map(|_| data); let _ = send.send(result); });
    let deadline = Instant::now() + Duration::from_secs(20);
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? { break status; }
        if Instant::now() >= deadline { let _ = child.kill(); let _ = child.wait(); return Err("The Windows helper timed out.".into()); }
        std::thread::sleep(Duration::from_millis(40));
    };
    let bytes = receive.recv_timeout(Duration::from_secs(2)).map_err(|_| "Windows helper output timed out")?.map_err(|e| e.to_string())?;
    if bytes.len() > 65536 { return Err("Unexpected Windows helper output.".into()); }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| {
        let errors = error_receive.recv_timeout(Duration::from_secs(2)).unwrap_or_default();
        let detail: String = String::from_utf8_lossy(&errors).chars().take(600).collect();
        if detail.trim().is_empty() { "The Windows helper returned no readable result.".to_string() } else { format!("Windows helper: {}", detail.trim()) }
    })?;
    if !status.success() { return Err(value["error"].as_str().unwrap_or("The Windows helper could not complete its check.").into()); }
    Ok(value)
}
pub fn connection(script: &Path) -> Value {
    let bytes = match crate::store::read_limited(script, 100 * 1024) {
        Ok(bytes) => bytes,
        Err(detail) => return json!({"code":"helper-missing","detail":detail}),
    };
    if bytes.as_slice() != include_bytes!("../../wallpaper-windows.ps1") { return json!({"code":"helper-mismatch","detail":"The Windows helper does not match this Prism build."}); }
    match windows(script, "Inspect") {
        Ok(value) if value["code"].is_string() => value,
        Ok(_) => json!({"code":"helper-unavailable","detail":"The Windows helper returned no connection diagnosis."}),
        Err(detail) => {
            let text = detail.to_lowercase();
            let code = if text.contains("timed out") { "helper-timeout" } else if text.contains("digitally signed") || text.contains("running scripts is disabled") || text.contains("pssecurityexception") { "helper-blocked" } else { "helper-unavailable" };
            json!({"code":code,"detail":detail})
        }
    }
}
pub fn available() -> bool { TcpStream::connect_timeout(&SocketAddr::from(([127, 0, 0, 1], 9339)), Duration::from_millis(500)).is_ok() }
pub fn target_socket(target: &Value) -> Result<String> {
    let invalid = || "Not an eligible local Codex renderer.".to_string();
    let id = target["id"].as_str().ok_or_else(invalid)?;
    if target["type"] != "page" || id.is_empty() || id.len() > 200 || !id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-') { return Err(invalid()); }
    let page = url::Url::parse(target["url"].as_str().ok_or_else(invalid)?).map_err(|_| invalid())?;
    let socket = url::Url::parse(target["webSocketDebuggerUrl"].as_str().ok_or_else(invalid)?).map_err(|_| invalid())?;
    let route = format!("{}{}", page.path(), page.query().unwrap_or("")).to_lowercase();
    if page.scheme() != "app" || route.contains("avatar") || route.contains("overlay") || socket.scheme() != "ws" || socket.host_str() != Some("127.0.0.1") || socket.port() != Some(9339) || !socket.username().is_empty() || socket.password().is_some() || socket.query().is_some() || socket.fragment().is_some() || socket.path() != format!("/devtools/page/{id}") { return Err(invalid()); }
    Ok(socket.to_string())
}
fn evaluate(socket: &str, expression: &str) -> Result<Value> {
    let stream = TcpStream::connect_timeout(&SocketAddr::from(([127, 0, 0, 1], 9339)), Duration::from_secs(3)).map_err(|_| "The local Codex connection failed.")?;
    stream.set_read_timeout(Some(Duration::from_secs(8))).map_err(|e| e.to_string())?;
    stream.set_write_timeout(Some(Duration::from_secs(8))).map_err(|e| e.to_string())?;
    let mut config = tungstenite::protocol::WebSocketConfig::default();
    config.max_message_size = Some(1024 * 1024); config.max_frame_size = Some(1024 * 1024);
    let (mut connection, _) = tungstenite::client::client_with_config(socket, stream, Some(config)).map_err(|_| "Codex refused the local connection.")?;
    connection.send(tungstenite::Message::Text(json!({"id":1,"method":"Runtime.evaluate","params":{"expression":expression,"returnByValue":true}}).to_string().into())).map_err(|_| "Codex closed the local connection.")?;
    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        if Instant::now() >= deadline { return Err("Codex did not answer within 8 seconds.".into()); }
        connection.get_mut().set_read_timeout(Some(deadline.saturating_duration_since(Instant::now()))).map_err(|e| e.to_string())?;
        let message = connection.read().map_err(|_| "Codex did not answer the wallpaper operation.")?;
        let tungstenite::Message::Text(text) = message else { continue };
        let reply: Value = match serde_json::from_str(&text) { Ok(value) => value, Err(_) => continue };
        if reply["id"] != 1 { continue; }
        let _ = connection.close(None);
        if !reply["error"].is_null() || !reply["result"]["exceptionDetails"].is_null() { return Err("Codex rejected the wallpaper operation. Its layout may have changed.".into()); }
        return Ok(reply["result"]["result"]["value"].clone());
    }
}
pub fn operate(script: &Path, value: Option<&Value>) -> Result<Value> {
    let checked = value.map(options).transpose()?;
    let adapter: Value = serde_json::from_str(include_str!("../generated/wallpaper.json")).map_err(|e| e.to_string())?;
    let install = checked.as_ref().map(|value| format!("{}({})", adapter["install"].as_str().unwrap(), value));
    let stamp = install.as_ref().map(hash);
    if !available() { return Err("Waiting for wallpaper access. Use Open Codex in Prism.".into()); }
    windows(script, "Verify")?;
    let client = reqwest::blocking::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(5)).build().map_err(|e| e.to_string())?;
    let response = client.get("http://127.0.0.1:9339/json/list").send().map_err(|_| "Could not read local Codex targets.")?;
    if !response.status().is_success() { return Err("Could not read local Codex targets.".into()); }
    let mut bytes = Vec::new(); response.take(1024 * 1024 + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() > 1024 * 1024 { return Err("Unexpected endpoint response.".into()); }
    let targets: Vec<Value> = serde_json::from_slice(&bytes).map_err(|_| "Unexpected endpoint targets.")?;
    if targets.len() > 50 { return Err("Unexpected endpoint targets.".into()); }
    let mut eligible = Vec::new(); let mut failed = 0;
    for target in targets {
        let socket = match target_socket(&target) { Ok(socket) => socket, Err(_) => continue };
        match evaluate(&socket, adapter["probe"].as_str().unwrap()) {
            Ok(probe) if probe["shell"] == true || (checked.is_none() && probe["installed"] == true) => eligible.push((socket, probe)),
            Ok(_) => {}, Err(_) => failed += 1,
        }
    }
    if eligible.is_empty() { return Err("Codex is still opening. Open a task or Settings and try Apply again.".into()); }
    // ponytail: one preview follows the first available window; add a selector if per-window themes are needed.
    let appearance = &eligible[0].1["appearance"];
    let pending: Vec<_> = eligible.iter().filter(|(_, probe)| !(checked.is_some() && probe["profile"].as_str() == stamp.as_deref() && probe["installed"] == true && probe["appearance"] == probe["appliedAppearance"])).collect();
    if pending.is_empty() && failed == 0 { return Ok(json!({"installed":true,"unchanged":true,"windows":eligible.len(),"appearance":appearance})); }
    windows(script, "Verify")?;
    let expression = match &checked {
        None => adapter["remove"].as_str().unwrap().to_owned(),
        Some(_) => format!("(() => {{ const result = {}; document.documentElement.setAttribute('data-prism-profile',{}); return result; }})()", install.as_ref().unwrap(), json!(stamp)),
    };
    for (socket, _) in pending {
        match evaluate(socket, &expression) {
            Ok(result) if result[if checked.is_none() { "removed" } else { "installed" }] == true => {},
            _ => failed += 1,
        }
    }
    if failed > 0 { return Ok(json!({"waiting":true,"partial":true,"failed":failed,"appearance":appearance,"message":format!("Updated available Codex windows. {failed} window(s) could not be reached; Prism will retry.")})); }
    Ok(if checked.is_none() { json!({"removed":true,"windows":eligible.len(),"appearance":appearance}) } else { json!({"installed":true,"windows":eligible.len(),"appearance":appearance}) })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn packaged_helper_accepts_canonical_windows_paths() {
        assert_eq!(powershell_path(Path::new(r"\\?\C:\Prism\helper.ps1")).unwrap(), r"C:\Prism\helper.ps1");
        assert_eq!(powershell_path(Path::new(r"\\?\UNC\server\share\helper.ps1")).unwrap(), r"\\server\share\helper.ps1");
        let script = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../wallpaper-windows.ps1").canonicalize().unwrap();
        assert!(script.to_str().unwrap().starts_with(r"\\?\"));
        let result = windows(&script, "Fonts").unwrap();
        assert!(!result["families"].as_array().unwrap().is_empty());
    }
    #[test]
    #[ignore = "Explicit live check: reapplies the current saved Prism background to the verified Codex session"]
    fn live_current_background() {
        assert_eq!(std::env::var("PRISM_NATIVE_LIVE_CHECK").as_deref(), Ok("1"));
        let directory = std::path::PathBuf::from(std::env::var_os("APPDATA").unwrap()).join("Prism/backgrounds");
        let store = crate::store::Store::open(directory).unwrap();
        let history = store.snapshot();
        assert_ne!(history["pendingRemoval"], true);
        let current = store.load(history["activeId"].as_str().expect("No current background to preserve")).unwrap();
        let script = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../wallpaper-windows.ps1");
        let result = operate(&script, Some(&current)).unwrap();
        assert_eq!(result["installed"], true, "{result}");
        let unchanged = operate(&script, Some(&current)).unwrap();
        assert_eq!(unchanged["unchanged"], true, "{unchanged}");
        println!("PASS: native current-background apply and unchanged-layer skip; stored settings untouched");
    }
    #[test]
    fn targets_reject_external_or_ambiguous_endpoints() {
        let good = json!({"id":"A","type":"page","url":"app://-/index.html","webSocketDebuggerUrl":"ws://127.0.0.1:9339/devtools/page/A"});
        assert!(target_socket(&good).is_ok());
        for bad in ["ws://localhost:9339/devtools/page/A", "ws://127.0.0.1:9340/devtools/page/A", "ws://127.0.0.1:9339/devtools/page/B", "ws://user@127.0.0.1:9339/devtools/page/A", "ws://127.0.0.1:9339/devtools/page/A?x"] {
            let mut value = good.clone(); value["webSocketDebuggerUrl"] = json!(bad); assert!(target_socket(&value).is_err());
        }
        let mut value = good; value["url"] = json!("https://example.com"); assert!(target_socket(&value).is_err());
    }
}
