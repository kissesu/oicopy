use base64::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Cursor;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppInfo {
    pub name: String,
    pub bundle_id: String,
    pub icon_path: Option<String>,
    pub icon_base64: Option<String>,
}

#[cfg(target_os = "macos")]
pub fn get_frontmost_app() -> Result<AppInfo, String> {
    use std::process::Command;

    // 使用更简单的 AppleScript 获取前台应用信息
    let script = r#"
        tell application "System Events"
            set frontApp to first application process whose frontmost is true
            set appName to name of frontApp
            try
                set bundleId to bundle identifier of frontApp
            on error
                set bundleId to "unknown.bundle.id"
            end try
            return appName & "|" & bundleId
        end tell
    "#;

    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| format!("执行 AppleScript 失败: {}", e))?;

    if !output.status.success() {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("AppleScript 执行失败: {}", error_msg));
    }

    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let parts: Vec<&str> = result.split('|').collect();

    let (name, bundle_id) = if parts.len() >= 2 {
        (parts[0].to_string(), parts[1].to_string())
    } else {
        (result, "unknown.bundle.id".to_string())
    };

    // 获取应用图标
    let (icon_path, icon_base64) = get_app_icon(&bundle_id);

    Ok(AppInfo {
        name,
        bundle_id,
        icon_path,
        icon_base64,
    })
}

#[cfg(not(target_os = "macos"))]
pub fn get_frontmost_app() -> Result<AppInfo, String> {
    // 非 macOS 平台的占位实现
    Ok(AppInfo {
        name: "Unknown".to_string(),
        bundle_id: "unknown.bundle.id".to_string(),
        icon_path: None,
        icon_base64: None,
    })
}

// 获取应用图标
#[cfg(target_os = "macos")]
pub fn get_app_icon(bundle_id: &str) -> (Option<String>, Option<String>) {
    if bundle_id == "unknown.bundle.id" {
        return (None, None);
    }

    // 首先尝试通过 Bundle ID 获取应用路径
    let app_path = get_app_path_by_bundle_id(bundle_id);

    if let Some(path) = app_path {
        // 尝试获取图标
        if let Some(icon_data) = extract_app_icon(&path) {
            return (Some(path), Some(icon_data));
        }
    }

    (None, None)
}

#[cfg(not(target_os = "macos"))]
pub fn get_app_icon(_bundle_id: &str) -> (Option<String>, Option<String>) {
    (None, None)
}

// 通过 Bundle ID 获取应用路径
#[cfg(target_os = "macos")]
fn get_app_path_by_bundle_id(bundle_id: &str) -> Option<String> {
    use std::process::Command;

    let script = format!(
        r#"
        tell application "System Events"
            try
                set appPath to POSIX path of (path to application id "{}")
                return appPath
            on error
                return ""
            end try
        end tell
        "#,
        bundle_id
    );

    let output = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .ok()?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() && path != "missing value" {
            return Some(path);
        }
    }

    None
}

// 从应用包中提取图标
#[cfg(target_os = "macos")]
fn extract_app_icon(app_path: &str) -> Option<String> {
    let app_path = PathBuf::from(app_path);

    // 检查是否是 .app 包
    if !app_path.extension().map_or(false, |ext| ext == "app") {
        return None;
    }

    // 构建资源目录路径
    let resources_path = app_path.join("Contents").join("Resources");

    if !resources_path.exists() {
        return None;
    }

    // 尝试读取 Info.plist 获取图标文件名
    let info_plist_path = app_path.join("Contents").join("Info.plist");
    let icon_name = if info_plist_path.exists() {
        get_icon_name_from_plist(&info_plist_path).unwrap_or_else(|| "AppIcon".to_string())
    } else {
        "AppIcon".to_string()
    };

    // 尝试多种可能的图标文件名和扩展名
    let possible_names = vec![
        format!("{}.icns", icon_name),
        "AppIcon.icns".to_string(),
        "app.icns".to_string(),
        "icon.icns".to_string(),
        "Icon.icns".to_string(),
    ];

    for name in possible_names {
        let icon_path = resources_path.join(&name);
        if icon_path.exists() {
            if let Ok(icon_data) = fs::read(&icon_path) {
                // 尝试将 .icns 文件转换为 PNG 格式
                if let Some(png_data) = convert_icns_to_png(&icon_data) {
                    let base64_data = base64::prelude::BASE64_STANDARD.encode(&png_data);
                    return Some(base64_data);
                } else {
                    // 如果转换失败，直接返回原始数据
                    let base64_data = base64::prelude::BASE64_STANDARD.encode(&icon_data);
                    return Some(base64_data);
                }
            }
        }
    }

    None
}

// 从 Info.plist 获取图标文件名
#[cfg(target_os = "macos")]
fn get_icon_name_from_plist(plist_path: &PathBuf) -> Option<String> {
    use std::process::Command;

    let output = Command::new("plutil")
        .arg("-extract")
        .arg("CFBundleIconFile")
        .arg("raw")
        .arg(plist_path)
        .output()
        .ok()?;

    if output.status.success() {
        let icon_name = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !icon_name.is_empty() && icon_name != "null" {
            // 移除可能的 .icns 扩展名
            let icon_name = icon_name.strip_suffix(".icns").unwrap_or(&icon_name);
            return Some(icon_name.to_string());
        }
    }

    None
}

// 将 .icns 文件转换为 PNG 格式
#[cfg(target_os = "macos")]
fn convert_icns_to_png(icns_data: &[u8]) -> Option<Vec<u8>> {
    use icns::{IconFamily, IconType};
    use image::{DynamicImage, ImageFormat, RgbaImage};

    // 尝试解析 .icns 文件
    let icon_family = IconFamily::read(Cursor::new(icns_data)).ok()?;

    // 尝试获取最大尺寸的图标 (优先选择高分辨率版本)
    let icon_types = [
        IconType::RGBA32_512x512_2x, // 1024x1024
        IconType::RGBA32_512x512,    // 512x512
        IconType::RGBA32_256x256_2x, // 512x512
        IconType::RGBA32_256x256,    // 256x256
        IconType::RGBA32_128x128_2x, // 256x256
        IconType::RGBA32_128x128,    // 128x128
        IconType::RGBA32_64x64,      // 64x64
        IconType::RGBA32_32x32_2x,   // 64x64
        IconType::RGBA32_32x32,      // 32x32
        IconType::RGBA32_16x16_2x,   // 32x32
        IconType::RGBA32_16x16,      // 16x16
    ];

    for &icon_type in &icon_types {
        if let Ok(image) = icon_family.get_icon_with_type(icon_type) {
            // 获取图像数据
            let rgba_data = image.data();

            // 根据图标类型确定尺寸
            let (width, height) = match icon_type {
                IconType::RGBA32_512x512_2x => (1024, 1024),
                IconType::RGBA32_512x512 => (512, 512),
                IconType::RGBA32_256x256_2x => (512, 512),
                IconType::RGBA32_256x256 => (256, 256),
                IconType::RGBA32_128x128_2x => (256, 256),
                IconType::RGBA32_128x128 => (128, 128),
                IconType::RGBA32_64x64 => (64, 64),
                IconType::RGBA32_32x32_2x => (64, 64),
                IconType::RGBA32_32x32 => (32, 32),
                IconType::RGBA32_16x16_2x => (32, 32),
                IconType::RGBA32_16x16 => (16, 16),
                _ => continue,
            };

            // 创建 DynamicImage
            if let Some(img) = RgbaImage::from_raw(width, height, rgba_data.to_vec()) {
                let dynamic_img = DynamicImage::ImageRgba8(img);

                // 转换为 PNG
                let mut png_data = Vec::new();
                if dynamic_img
                    .write_to(&mut Cursor::new(&mut png_data), ImageFormat::Png)
                    .is_ok()
                {
                    return Some(png_data);
                }
            }
        }
    }

    None
}

#[cfg(not(target_os = "macos"))]
fn convert_icns_to_png(_icns_data: &[u8]) -> Option<Vec<u8>> {
    None
}

// Tauri 命令：获取当前前台应用信息
#[tauri::command]
pub fn get_current_app_info() -> Result<AppInfo, String> {
    get_frontmost_app()
}

// Tauri 命令：获取指定应用的图标
#[tauri::command]
pub fn get_app_icon_by_bundle_id(
    app: tauri::AppHandle,
    bundle_id: String,
) -> Result<Option<String>, String> {
    use crate::db::{cache_app_icon, get_cached_app_icon, init_database};

    // 1. 先从数据库缓存中查找
    if let Ok(conn) = init_database(&app) {
        if let Some(cached_icon) = get_cached_app_icon(&conn, &bundle_id) {
            return Ok(Some(cached_icon));
        }
    }

    // 2. 如果缓存中没有，则获取图标
    let (_, icon_base64) = get_app_icon(&bundle_id);

    // 3. 如果成功获取到图标，则缓存到数据库
    if let Some(ref icon_data) = icon_base64 {
        if let Ok(conn) = init_database(&app) {
            let _ = cache_app_icon(&conn, &bundle_id, None, icon_data);
        }
    }

    Ok(icon_base64)
}
