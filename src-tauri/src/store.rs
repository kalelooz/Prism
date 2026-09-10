use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, io::{Read, Write}, path::{Path, PathBuf}};

pub type Result<T> = std::result::Result<T, String>;
pub fn hash(bytes: impl AsRef<[u8]>) -> String { format!("{:x}", Sha256::digest(bytes.as_ref())) }
pub fn valid_id(s: &str) -> bool { s.len() == 64 && s.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) }
pub fn read_limited(path: &Path, limit: u64) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    fs::File::open(path).map_err(|e| e.to_string())?.take(limit + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > limit { return Err("Saved file is too large. It has been left untouched.".into()); }
    Ok(bytes)
}
pub fn atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut temp = tempfile::NamedTempFile::new_in(path.parent().ok_or("Invalid storage directory")?).map_err(|e| e.to_string())?;
    temp.write_all(bytes).and_then(|_| temp.as_file().sync_all()).map_err(|e| e.to_string())?;
    temp.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}
fn picture(value: &Value) -> Result<&str> {
    let text = value.as_str().ok_or("Choose a local image.")?;
    if text.len() > 12 * 1024 * 1024 { return Err("Choose an image smaller than 8 MB.".into()); }
    let (header, data) = text.split_once(',').ok_or("Invalid image.")?;
    if !["data:image/png;base64", "data:image/jpeg;base64", "data:image/webp;base64"].contains(&header) || data.is_empty() || STANDARD.decode(data).is_err() { return Err("Choose a local PNG, JPEG, or WebP image.".into()); }
    Ok(text)
}
pub fn options(value: &Value) -> Result<Value> {
    let veil = &value["veil"];
    let side = value.get("sidebarVeil").unwrap_or(veil);
    let right = value.get("rightVeil").unwrap_or(side);
    let terminal = value.get("terminalVeil").unwrap_or(side);
    for v in [veil, side, right, terminal] { if !v.as_f64().is_some_and(|n| n.is_finite() && (0.25..=1.0).contains(&n)) { return Err("Background fading must be between 25% and 100%.".into()); } }
    let mode = value.get("mode").and_then(Value::as_str).unwrap_or("span");
    if !["span", "duplicate", "separate", "chat", "sidebar"].contains(&mode) { return Err("Choose a wallpaper layout.".into()); }
    for key in ["clearText", "soften", "sidebarLinked", "rightLinked", "terminalLinked", "chatEnabled", "sidebarEnabled", "rightEnabled", "terminalEnabled"] { if value.get(key).is_some_and(|v| !v.is_boolean()) { return Err("Reading options must be on or off.".into()); } }
    let enabled = [value["chatEnabled"].as_bool().unwrap_or(mode != "sidebar"), value["sidebarEnabled"].as_bool().unwrap_or(mode != "chat"), value["rightEnabled"].as_bool().unwrap_or(false), value["terminalEnabled"].as_bool().unwrap_or(false)];
    if !enabled.iter().any(|on| *on) { return Err("Select at least one pane.".into()); }
    let pictures = if mode == "separate" { [value.get("image"), value.get("sidebarImage"), value.get("rightImage").or(value.get("sidebarImage")), value.get("terminalImage").or(value.get("sidebarImage"))] } else { [value.get("image"); 4] };
    for (index, image) in pictures.iter().enumerate() { if enabled[index] || image.is_some() { picture(image.ok_or("Choose an image for each selected pane.")?)?; } }
    // Preserve the complete profile format, filling missing images only for unchecked panes.
    let fallback = pictures.iter().find_map(|image| *image).ok_or("Choose a local image.")?;
    let [image, sidebar, right_image, terminal_image] = pictures.map(|image| image.unwrap_or(fallback));
    let linked = value["sidebarLinked"].as_bool().unwrap_or(false);
    Ok(json!({ "image": image, "veil": veil, "mode": mode, "sidebarImage": sidebar, "sidebarVeil": side, "rightImage":right_image, "rightVeil":right, "terminalImage":terminal_image, "terminalVeil":terminal, "chatEnabled":value["chatEnabled"].as_bool().unwrap_or(mode != "sidebar"), "sidebarEnabled":value["sidebarEnabled"].as_bool().unwrap_or(mode != "chat"), "rightEnabled":value["rightEnabled"].as_bool().unwrap_or(false), "terminalEnabled":value["terminalEnabled"].as_bool().unwrap_or(false), "sidebarLinked": linked, "rightLinked":value["rightLinked"].as_bool().unwrap_or(linked), "terminalLinked":value["terminalLinked"].as_bool().unwrap_or(linked), "clearText": value["clearText"].as_bool().unwrap_or(false), "soften": value["soften"].as_bool().unwrap_or(false) }))
}
pub fn decode(bytes: &[u8]) -> Result<image::DynamicImage> {
    let mut reader = image::ImageReader::new(std::io::Cursor::new(bytes)).with_guessed_format().map_err(|e| e.to_string())?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(16_384); limits.max_image_height = Some(16_384); limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    reader.decode().map_err(|_| "This image could not be decoded within the size limit.".into())
}
pub fn thumbnail(data: &str) -> Result<String> {
    let bytes = STANDARD.decode(data.split_once(',').ok_or("Invalid image")?.1).map_err(|e| e.to_string())?;
    let image = decode(&bytes)?.thumbnail(100, 68).to_rgb8();
    let mut out = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 80).encode_image(&image).map_err(|e| e.to_string())?;
    Ok(format!("data:image/jpeg;base64,{}", STANDARD.encode(out)))
}
pub struct Store { directory: PathBuf, state: Value }
impl Store {
    pub fn open(directory: PathBuf) -> Result<Self> {
        fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let path = directory.join("backgrounds.json");
        let state = if path.exists() {
            let bytes = read_limited(&path, 2 * 1024 * 1024)?;
            serde_json::from_slice(&bytes).map_err(|_| "Your background history could not be read. It has been left untouched.")?
        } else { json!({"version":1,"profiles":[],"activeId":null,"pendingRemoval":false,"launchApproved":false}) };
        Self::validate(&state)?;
        Ok(Self { directory, state })
    }
    fn validate(state: &Value) -> Result<()> {
        let invalid = || "Your background history could not be read. It has been left untouched.".to_string();
        if state["version"] != 1 || !state["pendingRemoval"].is_boolean() || !state["launchApproved"].is_boolean() { return Err(invalid()); }
        let profiles = state["profiles"].as_array().ok_or_else(invalid)?;
        let mut ids = std::collections::HashSet::new();
        for p in profiles {
            for k in ["id", "image", "sidebarImage"] { if !p[k].as_str().is_some_and(valid_id) { return Err(invalid()); } }
            for k in ["rightImage", "terminalImage"] { if p.get(k).is_some_and(|v| !v.as_str().is_some_and(valid_id)) { return Err(invalid()); } }
            if !ids.insert(p["id"].as_str().unwrap()) || !p["name"].as_str().is_some_and(|s| s.chars().count() <= 80) || !p["saved"].is_boolean() || !p["updatedAt"].as_f64().is_some_and(f64::is_finite) { return Err(invalid()); }
            let mut test = p.clone();
            for key in ["image", "sidebarImage", "rightImage", "terminalImage"] { test[key] = json!("data:image/png;base64,AA=="); }
            options(&test).map_err(|_| invalid())?;
        }
        if !state["activeId"].is_null() && !state["activeId"].as_str().is_some_and(|id| ids.contains(id)) { return Err(invalid()); }
        Ok(())
    }
    pub fn snapshot(&self) -> Value { self.state.clone() }
    pub fn remove(&mut self) -> Result<()> {
        let mut next = self.state.clone();
        next["activeId"] = Value::Null; next["pendingRemoval"] = json!(true);
        self.commit(next)
    }
    pub fn removed(&mut self) -> Result<()> {
        let mut next = self.state.clone(); next["pendingRemoval"] = json!(false);
        self.commit(next)
    }
    pub fn approve_launch(&mut self) -> Result<()> {
        let mut next = self.state.clone(); next["launchApproved"] = json!(true);
        self.commit(next)
    }
    fn commit(&mut self, next: Value) -> Result<()> {
        Self::validate(&next)?;
        let bytes = serde_json::to_vec(&next).map_err(|e| e.to_string())?;
        if bytes.len() > 2 * 1024 * 1024 { return Err("Background history is full. Existing setups have been preserved.".into()); }
        atomic(&self.directory.join("backgrounds.json"), &bytes)?;
        self.state = next; Ok(())
    }
    fn image(&self, id: &str) -> Result<String> {
        if !valid_id(id) { return Err("Invalid saved image.".into()); }
        let bytes = read_limited(&self.directory.join(format!("{id}.image")), 12 * 1024 * 1024)?;
        if hash(&bytes) != id { return Err("A saved image is damaged. Choose the image again.".into()); }
        String::from_utf8(bytes).map_err(|_| "Invalid saved image.".into())
    }
    pub fn load(&self, id: &str) -> Result<Value> {
        let mut p = self.state["profiles"].as_array().unwrap().iter().find(|p| p["id"] == id).cloned().ok_or("That background is no longer in history.")?;
        let inherited = ["rightImage", "terminalImage"].into_iter().filter(|key| p.get(*key).is_none()).collect::<Vec<_>>();
        let references = ["image", "sidebarImage", "rightImage", "terminalImage"].map(|key| (key, p.get(key).unwrap_or(&p["sidebarImage"]).as_str().unwrap().to_owned()));
        let mut loaded = std::collections::HashMap::new();
        for (key, reference) in references {
            if !loaded.contains_key(&reference) { loaded.insert(reference.clone(), self.image(&reference)?); }
            p[key] = json!(loaded[&reference]);
        }
        let normalized = options(&p)?;
        p.as_object_mut().unwrap().extend(normalized.as_object().unwrap().clone());
        for key in inherited { p.as_object_mut().unwrap().remove(key); }
        Ok(p)
    }
    pub fn save(&mut self, value: &Value, activate: bool, name: &str) -> Result<()> {
        let explicit_images = ["rightImage", "terminalImage"].into_iter().filter(|key| value.get(*key).is_some()).collect::<Vec<_>>();
        let value = options(value)?;
        if name.chars().count() > 80 { return Err("Use a background name of 80 characters or fewer.".into()); }
        let mut refs = json!({ "mode": value["mode"], "veil": value["veil"], "sidebarVeil": value["sidebarVeil"] });
        for key in ["image", "sidebarImage", "rightImage", "terminalImage"] {
            if ["rightImage", "terminalImage"].contains(&key) && (value["mode"] != "separate" || !explicit_images.contains(&key)) { continue; }
            let data = value[key].as_str().unwrap(); let id = hash(data);
            let path = self.directory.join(format!("{id}.image"));
            if read_limited(&path, 12 * 1024 * 1024).ok().as_deref() != Some(data.as_bytes()) { atomic(&path, data.as_bytes())?; }
            refs[key] = json!(id);
        }
        for k in ["clearText", "soften", "sidebarLinked", "rightEnabled", "terminalEnabled"] { if value[k] == true { refs[k] = json!(true); } }
        for (key, fallback) in [("chatEnabled", value["mode"] != "sidebar"), ("sidebarEnabled", value["mode"] != "chat")] {
            if value[key] != fallback { refs[key] = value[key].clone(); }
        }
        for area in ["right", "terminal"] {
            for suffix in ["Veil", "Linked"] {
                let key = format!("{area}{suffix}");
                if value[&key] != value[format!("sidebar{suffix}")] { refs[&key] = value[&key].clone(); }
            }
        }
        let mut identity = refs.to_string();
        let named = !name.trim().is_empty();
        if named { identity.push_str(&format!(":{}", uuid::Uuid::new_v4())); }
        let id = hash(identity);
        let previous = self.state["profiles"].as_array().unwrap().iter().find(|p| p["id"] == id);
        let name = if name.trim().is_empty() { previous.and_then(|p| p["name"].as_str()).unwrap_or("Background") } else { name.trim() };
        let saved = named || previous.is_some_and(|p| p["saved"] == true);
        refs["id"] = json!(id); refs["name"] = json!(name); refs["saved"] = json!(saved);
        refs["updatedAt"] = json!(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis() as u64);
        let mut next = self.state.clone();
        next["profiles"].as_array_mut().unwrap().retain(|p| p["id"] != id);
        next["profiles"].as_array_mut().unwrap().insert(0, refs);
        if activate { next["activeId"] = json!(id); next["pendingRemoval"] = json!(false); }
        self.commit(next)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn history_transitions_preserve_profiles_and_failed_commits() {
        let temp = tempfile::tempdir().unwrap();
        let directory = temp.path().join("backgrounds");
        let mut store = Store::open(directory.clone()).unwrap();
        let value = json!({"image":"data:image/png;base64,AA==","veil":0.75,"sidebarVeil":0.85});
        store.save(&value, true, "Original").unwrap();
        let original = store.snapshot();
        let mut detached = store.snapshot(); detached["activeId"] = Value::Null;
        assert_eq!(store.snapshot(), original, "changing a snapshot must not change history");

        store.remove().unwrap();
        let pending = Store::open(directory.clone()).unwrap().snapshot();
        assert!(pending["activeId"].is_null()); assert_eq!(pending["pendingRemoval"], true);
        assert_eq!(pending["profiles"], original["profiles"]);
        store.save(&value, false, "Keep for later").unwrap();
        assert_eq!(store.snapshot()["pendingRemoval"], true, "named save must not resume restoration");
        assert!(store.snapshot()["activeId"].is_null());
        let saved = store.snapshot()["profiles"].clone();
        store.removed().unwrap(); store.approve_launch().unwrap();
        let confirmed = Store::open(directory.clone()).unwrap().snapshot();
        assert_eq!(confirmed["pendingRemoval"], false); assert!(confirmed["activeId"].is_null());
        assert_eq!(confirmed["launchApproved"], true); assert_eq!(confirmed["profiles"], saved);

        store.remove().unwrap(); store.save(&value, true, "").unwrap();
        let active = store.snapshot();
        assert_eq!(active["pendingRemoval"], false); assert!(active["activeId"].is_string());
        assert_eq!(active["launchApproved"], true);
        let bytes = fs::read(directory.join("backgrounds.json")).unwrap();
        // Both paths are inside this test's fresh temporary directory.
        let unavailable = temp.path().join("temporarily-unavailable");
        fs::rename(&directory, &unavailable).unwrap();
        assert!(store.remove().is_err());
        assert_eq!(store.snapshot(), active, "failed removal must leave the active background intact");
        assert_eq!(fs::read(unavailable.join("backgrounds.json")).unwrap(), bytes);
        fs::rename(&unavailable, &directory).unwrap();
        store.remove().unwrap();
        assert_eq!(Store::open(directory).unwrap().snapshot()["pendingRemoval"], true);
    }
    #[test]
    fn storage_roundtrip_and_corruption_boundary() {
        let temp = tempfile::tempdir().unwrap();
        let directory = temp.path().join("backgrounds");
        let mut store = Store::open(directory.clone()).unwrap();
        let value = json!({"image":"data:image/png;base64,AA==","veil":0.85,"sidebarVeil":1,"mode":"chat","clearText":true,"sidebarLinked":true});
        store.save(&value, true, "Original").unwrap();
        let id = store.state["activeId"].as_str().unwrap().to_owned();
        store.save(&value, false, "Second copy").unwrap();
        assert_eq!(store.state["profiles"].as_array().unwrap().len(), 2);
        let reopened = Store::open(directory.clone()).unwrap();
        assert_eq!(reopened.load(&id).unwrap()["name"], "Original");
        assert_eq!(reopened.state["activeId"], id);
        assert_eq!(reopened.load(&id).unwrap()["sidebarLinked"], true);
        assert_eq!(reopened.load(&id).unwrap()["rightLinked"], true);
        assert_eq!(reopened.load(&id).unwrap()["terminalVeil"], 1);
        assert_eq!(reopened.load(&id).unwrap()["rightEnabled"], false);
        assert_eq!(reopened.load(&id).unwrap()["terminalEnabled"], false);
        assert!(options(&json!({"image":"data:image/png;base64,AA==","veil":0.85,"sidebarLinked":"yes"})).is_err());
        assert!(options(&json!({"image":"https://example.com/a.png","veil":0.9})).is_err());
        assert!(options(&json!({"image":"data:image/png;base64,AA==","veil":0.1})).is_err());
        assert!(options(&json!({"image":"data:image/png;base64,AA==","veil":0.9,"mode":"separate"})).is_err());
        assert!(reopened.load("../backgrounds.json").is_err());
        let split = json!({"image":"data:image/png;base64,AA==","sidebarImage":"data:image/png;base64,AQ==","rightImage":"data:image/png;base64,Ag==","terminalImage":"data:image/png;base64,Aw==","mode":"separate","veil":0.7,"sidebarVeil":0.85,"rightVeil":0.45,"terminalVeil":0.95,"sidebarLinked":true,"rightLinked":false,"rightEnabled":true,"terminalEnabled":false});
        store.save(&split, true, "Independent panels").unwrap();
        let reopened = Store::open(directory.clone()).unwrap();
        let restored = reopened.load(reopened.state["activeId"].as_str().unwrap()).unwrap();
        for key in ["image","sidebarImage","rightImage","terminalImage","veil","sidebarVeil","rightVeil","terminalVeil","sidebarLinked","rightLinked","rightEnabled","terminalEnabled"] { assert_eq!(restored[key],split[key]); }
        assert_eq!(restored["terminalLinked"],true);
        let mut toggled=restored.clone(); toggled["rightEnabled"]=json!(false); toggled["terminalEnabled"]=json!(true);
        store.save(&toggled, true, "Changed panel choices").unwrap();
        let reopened=Store::open(directory.clone()).unwrap();
        let toggled=reopened.load(reopened.state["activeId"].as_str().unwrap()).unwrap();
        assert_eq!(toggled["rightEnabled"],false); assert_eq!(toggled["terminalEnabled"],true);
        let mut terminal_only=toggled.clone(); terminal_only["chatEnabled"]=json!(false); terminal_only["sidebarEnabled"]=json!(false);
        store.save(&terminal_only, true, "Terminal only").unwrap();
        let reopened=Store::open(directory.clone()).unwrap();
        let terminal_only=reopened.load(reopened.state["activeId"].as_str().unwrap()).unwrap();
        assert_eq!(terminal_only["chatEnabled"],false); assert_eq!(terminal_only["sidebarEnabled"],false); assert_eq!(terminal_only["terminalEnabled"],true);
        assert_eq!(options(&value).unwrap()["chatEnabled"],true); assert_eq!(options(&value).unwrap()["sidebarEnabled"],false);
        for key in ["chatEnabled","sidebarEnabled","rightEnabled","terminalEnabled"] {
            let mut invalid=split.clone(); invalid[key]=json!("yes"); assert!(options(&invalid).is_err());
        }
        let mut invalid = split.clone(); invalid["rightVeil"] = json!(1.1); assert!(options(&invalid).is_err());
        invalid = split.clone(); invalid["terminalImage"] = json!("file:///private"); assert!(options(&invalid).is_err());
        invalid = reopened.state.clone(); invalid["profiles"][0]["rightImage"] = json!("../outside"); assert!(Store::validate(&invalid).is_err());
        let mut inherited = split.clone();
        for key in ["rightImage", "terminalImage"] { inherited.as_object_mut().unwrap().remove(key); }
        store.save(&inherited, true, "Inherited panels").unwrap();
        let reopened = Store::open(directory.clone()).unwrap();
        let mut inherited = reopened.load(reopened.state["activeId"].as_str().unwrap()).unwrap();
        for key in ["rightImage", "terminalImage"] { assert!(inherited.get(key).is_none()); }
        inherited["sidebarImage"] = json!("data:image/png;base64,BA==");
        store.save(&inherited, true, "Changed left image").unwrap();
        let reopened = Store::open(directory.clone()).unwrap();
        let inherited = reopened.load(reopened.state["activeId"].as_str().unwrap()).unwrap();
        for key in ["rightImage", "terminalImage"] { assert!(inherited.get(key).is_none()); assert_eq!(options(&inherited).unwrap()[key], inherited["sidebarImage"]); }
        let mut explicit = inherited.clone(); explicit["rightImage"] = explicit["sidebarImage"].clone();
        store.save(&explicit, true, "Explicit same image").unwrap();
        let reopened = Store::open(directory.clone()).unwrap();
        let explicit = reopened.load(reopened.state["activeId"].as_str().unwrap()).unwrap();
        assert_eq!(explicit["rightImage"], explicit["sidebarImage"]);
        for mask in 1..16 {
            let mut draft = json!({"mode":"separate","veil":0.75});
            let mut required = "";
            for (index, (flag, image)) in [("chatEnabled","image"),("sidebarEnabled","sidebarImage"),("rightEnabled","rightImage"),("terminalEnabled","terminalImage")].iter().enumerate() {
                let enabled = mask & (1 << index) != 0;
                draft[*flag] = json!(enabled);
                if enabled { draft[*image] = json!("data:image/png;base64,AA=="); if required.is_empty() { required = image; } }
            }
            store.save(&draft, false, "").unwrap();
            let reopened = Store::open(directory.clone()).unwrap();
            let restored = reopened.load(reopened.state["profiles"][0]["id"].as_str().unwrap()).unwrap();
            for flag in ["chatEnabled","sidebarEnabled","rightEnabled","terminalEnabled"] { assert_eq!(restored[flag], draft[flag]); }
            draft.as_object_mut().unwrap().remove(required);
            assert!(options(&draft).is_err());
        }
        assert!(options(&json!({"image":"data:image/png;base64,AA==","veil":0.75,"chatEnabled":false,"sidebarEnabled":false,"rightEnabled":false,"terminalEnabled":false})).is_err());
        fs::write(directory.join("backgrounds.json"), b"broken").unwrap();
        assert!(Store::open(directory.clone()).is_err());
        assert_eq!(fs::read(directory.join("backgrounds.json")).unwrap(), b"broken");
    }
}
