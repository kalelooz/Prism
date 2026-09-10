use crate::store::Result;
use serde_json::Value;
use std::{os::windows::process::CommandExt, process::{Command, Stdio}};

fn destination(config: &Value, name: &str) -> Result<String> {
    let (prefix, count) = match name {
        "github" => ("https://github.com/", 2),
        "support" => ("https://buymeacoffee.com/", 1),
        _ => return Err("Unknown project link.".into()),
    };
    let value = config[name].as_str().filter(|v| !v.is_empty()).ok_or_else(|| format!("The {} page is not available yet.", if name == "github" { "GitHub" } else { "support" }))?;
    let path = value.strip_prefix(prefix).ok_or("Invalid project link.")?;
    let parts: Vec<_> = path.split('/').collect();
    if parts.len() != count || parts.iter().any(|part| !part.starts_with(|c: char| c.is_ascii_alphanumeric()) || !part.bytes().all(|c| c.is_ascii_alphanumeric() || b"_.-".contains(&c))) {
        return Err("Invalid project link.".into());
    }
    Ok(value.to_owned())
}

pub fn open(name: &str) -> Result<Value> {
    let config: Value = serde_json::from_str(include_str!("../../project-links.json")).map_err(|_| "Project links could not be read.")?;
    let url = destination(&config, name)?;
    // Only the fixed HTTPS destinations above reach PowerShell; quotes and arguments are rejected.
    let result = Command::new("powershell.exe").args(["-NoProfile", "-NonInteractive", "-Command", &format!("$ErrorActionPreference='Stop'; Start-Process -FilePath '{url}'")])
        .creation_flags(0x08000000).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).status().map_err(|_| "Your browser could not be opened.")?;
    if !result.success() { return Err("Your browser could not be opened.".into()); }
    Ok(Value::Bool(true))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn only_configured_project_pages_can_open() {
        let config = json!({"github":"https://github.com/kalelooz/Prism", "support":"https://buymeacoffee.com/prism"});
        assert_eq!(destination(&config, "github").unwrap(), config["github"]);
        assert_eq!(destination(&config, "support").unwrap(), config["support"]);
        assert!(destination(&json!({"support":"https://buymeacoffee.com.evil/prism"}), "support").is_err());
        for name in ["https://example.com", "settings", "__proto__", ""] { assert!(destination(&config, name).is_err()); }
        for value in [Value::Null, json!(""), json!(true), json!("file:///C:/Windows"), json!("https://github.com.evil/a/b"), json!("https://github.com/a/b?x=';calc'"), json!("https://github.com/a/.."), json!("https://github.com/a/b\n")] {
            assert!(destination(&json!({"github":value}), "github").is_err());
        }
        let configured: Value = serde_json::from_str(include_str!("../../project-links.json")).unwrap();
        for name in ["github", "support"] { if !configured[name].is_null() { destination(&configured, name).unwrap(); } }
    }
}
