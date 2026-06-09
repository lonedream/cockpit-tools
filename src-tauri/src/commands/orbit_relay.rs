use reqwest::header::{ACCEPT, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{env, time::Duration};

const LOCAL_ORBIT_RELAY_API_BASE: &str = "http://127.0.0.1:8080/api/v1";
const PRODUCTION_ORBIT_RELAY_API_BASE: &str = "https://sub.xingmeng.xin/api/v1";
const ORBIT_RELAY_TIMEOUT_SECS: u64 = 20;

#[derive(Debug, Deserialize)]
struct OrbitRelayEnvelope<T> {
    code: i64,
    message: String,
    data: Option<T>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OrbitRelayUser {
    pub id: i64,
    pub username: String,
    pub email: String,
    pub role: Option<String>,
    pub balance: f64,
    pub concurrency: i64,
    pub status: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OrbitRelayAuthResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<i64>,
    pub token_type: String,
    pub user: OrbitRelayUser,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OrbitRelayTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<i64>,
    pub token_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OrbitRelayRedeemResponse {
    pub id: i64,
    pub code: String,
    #[serde(rename = "type")]
    pub redeem_type: String,
    pub value: f64,
    pub status: String,
    pub used_by: Option<i64>,
    pub used_at: Option<String>,
    pub created_at: Option<String>,
    pub expires_at: Option<String>,
    pub group_id: Option<i64>,
    pub validity_days: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OrbitRelayApiKey {
    pub id: i64,
    pub user_id: i64,
    pub key: String,
    pub name: String,
    pub group_id: Option<i64>,
    pub group: Option<OrbitRelayGroup>,
    pub status: String,
    pub quota: Option<f64>,
    pub quota_used: Option<f64>,
    pub rate_limit_5h: Option<f64>,
    pub rate_limit_1d: Option<f64>,
    pub rate_limit_7d: Option<f64>,
    pub expires_at: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OrbitRelayGroup {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub platform: Option<String>,
    pub rate_multiplier: Option<f64>,
    pub is_exclusive: Option<bool>,
    pub status: Option<String>,
    pub subscription_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OrbitRelayPaginated<T> {
    items: Vec<T>,
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(ORBIT_RELAY_TIMEOUT_SECS))
        .build()
        .map_err(|error| format!("ORBIT_RELAY_CLIENT_FAILED: {}", error))
}

fn endpoint(path: &str) -> String {
    let api_base = env::var("XM_RELAY_API_BASE")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            if cfg!(debug_assertions) {
                LOCAL_ORBIT_RELAY_API_BASE.to_string()
            } else {
                PRODUCTION_ORBIT_RELAY_API_BASE.to_string()
            }
        });
    format!(
        "{}/{}",
        api_base.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
}

fn safe_error_body(text: &str) -> String {
    text.chars().take(300).collect()
}

async fn parse_orbit_response<T>(response: reqwest::Response) -> Result<T, String>
where
    T: serde::de::DeserializeOwned,
{
    let status = response.status();
    let text = response.text().await.unwrap_or_default();

    if !status.is_success() {
        let parsed = serde_json::from_str::<Value>(&text).ok();
        let message = parsed
            .as_ref()
            .and_then(|value| value.get("message").or_else(|| value.get("detail")))
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| safe_error_body(&text));
        return Err(format!("ORBIT_RELAY_HTTP_{}: {}", status.as_u16(), message));
    }

    let envelope = serde_json::from_str::<OrbitRelayEnvelope<T>>(&text)
        .map_err(|error| format!("ORBIT_RELAY_PARSE_FAILED: {}", error))?;
    if envelope.code != 0 {
        return Err(format!("ORBIT_RELAY_API_{}: {}", envelope.code, envelope.message));
    }
    envelope
        .data
        .ok_or_else(|| "ORBIT_RELAY_EMPTY_RESPONSE".to_string())
}

fn normalized_bearer(access_token: &str) -> Result<String, String> {
    let token = access_token.trim();
    if token.is_empty() {
        return Err("ORBIT_RELAY_MISSING_ACCESS_TOKEN".to_string());
    }
    Ok(token.to_string())
}

#[tauri::command]
pub async fn orbit_relay_get_public_settings() -> Result<Value, String> {
    let client = build_client()?;
    let response = client
        .get(endpoint("settings/public"))
        .header(ACCEPT, "application/json")
        .send()
        .await
        .map_err(|error| format!("ORBIT_RELAY_NETWORK_FAILED: {}", error))?;
    parse_orbit_response::<Value>(response).await
}

#[tauri::command]
pub async fn orbit_relay_login(
    email: String,
    password: String,
) -> Result<OrbitRelayAuthResponse, String> {
    let email = email.trim();
    if email.is_empty() || password.is_empty() {
        return Err("ORBIT_RELAY_MISSING_CREDENTIALS".to_string());
    }

    let client = build_client()?;
    let response = client
        .post(endpoint("auth/login"))
        .header(ACCEPT, "application/json")
        .header(CONTENT_TYPE, "application/json")
        .json(&json!({
            "email": email,
            "password": password,
        }))
        .send()
        .await
        .map_err(|error| format!("ORBIT_RELAY_NETWORK_FAILED: {}", error))?;
    parse_orbit_response::<OrbitRelayAuthResponse>(response).await
}

#[tauri::command]
pub async fn orbit_relay_register(
    email: String,
    password: String,
    verify_code: Option<String>,
    promo_code: Option<String>,
    invitation_code: Option<String>,
    aff_code: Option<String>,
) -> Result<OrbitRelayAuthResponse, String> {
    let email = email.trim();
    if email.is_empty() || password.is_empty() {
        return Err("ORBIT_RELAY_MISSING_CREDENTIALS".to_string());
    }
    if password.len() < 6 {
        return Err("ORBIT_RELAY_PASSWORD_TOO_SHORT".to_string());
    }

    let mut payload = json!({
        "email": email,
        "password": password,
    });
    if let Some(object) = payload.as_object_mut() {
        if let Some(value) = verify_code.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()) {
            object.insert("verify_code".to_string(), json!(value));
        }
        if let Some(value) = promo_code.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()) {
            object.insert("promo_code".to_string(), json!(value));
        }
        if let Some(value) = invitation_code.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()) {
            object.insert("invitation_code".to_string(), json!(value));
        }
        if let Some(value) = aff_code.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()) {
            object.insert("aff_code".to_string(), json!(value));
        }
    }

    let client = build_client()?;
    let response = client
        .post(endpoint("auth/register"))
        .header(ACCEPT, "application/json")
        .header(CONTENT_TYPE, "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|error| format!("ORBIT_RELAY_NETWORK_FAILED: {}", error))?;
    parse_orbit_response::<OrbitRelayAuthResponse>(response).await
}

#[tauri::command]
pub async fn orbit_relay_refresh(refresh_token: String) -> Result<OrbitRelayTokenResponse, String> {
    let refresh_token = refresh_token.trim();
    if refresh_token.is_empty() {
        return Err("ORBIT_RELAY_MISSING_REFRESH_TOKEN".to_string());
    }

    let client = build_client()?;
    let response = client
        .post(endpoint("auth/refresh"))
        .header(ACCEPT, "application/json")
        .header(CONTENT_TYPE, "application/json")
        .json(&json!({ "refresh_token": refresh_token }))
        .send()
        .await
        .map_err(|error| format!("ORBIT_RELAY_NETWORK_FAILED: {}", error))?;
    parse_orbit_response::<OrbitRelayTokenResponse>(response).await
}

#[tauri::command]
pub async fn orbit_relay_get_profile(access_token: String) -> Result<OrbitRelayUser, String> {
    let token = normalized_bearer(&access_token)?;
    let client = build_client()?;
    let response = client
        .get(endpoint("user/profile"))
        .bearer_auth(token)
        .header(ACCEPT, "application/json")
        .send()
        .await
        .map_err(|error| format!("ORBIT_RELAY_NETWORK_FAILED: {}", error))?;
    parse_orbit_response::<OrbitRelayUser>(response).await
}

#[tauri::command]
pub async fn orbit_relay_redeem(
    access_token: String,
    code: String,
) -> Result<OrbitRelayRedeemResponse, String> {
    let token = normalized_bearer(&access_token)?;
    let code = code.trim();
    if code.is_empty() {
        return Err("ORBIT_RELAY_MISSING_REDEEM_CODE".to_string());
    }

    let client = build_client()?;
    let response = client
        .post(endpoint("redeem"))
        .bearer_auth(token)
        .header(ACCEPT, "application/json")
        .header(CONTENT_TYPE, "application/json")
        .json(&json!({ "code": code }))
        .send()
        .await
        .map_err(|error| format!("ORBIT_RELAY_NETWORK_FAILED: {}", error))?;
    parse_orbit_response::<OrbitRelayRedeemResponse>(response).await
}

#[tauri::command]
pub async fn orbit_relay_list_api_keys(
    access_token: String,
    group_id: Option<i64>,
) -> Result<Vec<OrbitRelayApiKey>, String> {
    let token = normalized_bearer(&access_token)?;
    let group_query = group_id
        .filter(|value| *value > 0)
        .map(|value| format!("&group_id={}", value))
        .unwrap_or_default();
    let client = build_client()?;
    let response = client
        .get(endpoint(&format!(
            "keys?page=1&page_size=100&sort_by=created_at&sort_order=desc{}",
            group_query
        )))
        .bearer_auth(token)
        .header(ACCEPT, "application/json")
        .send()
        .await
        .map_err(|error| format!("ORBIT_RELAY_NETWORK_FAILED: {}", error))?;
    let paginated = parse_orbit_response::<OrbitRelayPaginated<OrbitRelayApiKey>>(response).await?;
    Ok(paginated.items)
}

#[tauri::command]
pub async fn orbit_relay_list_available_groups(
    access_token: String,
) -> Result<Vec<OrbitRelayGroup>, String> {
    let token = normalized_bearer(&access_token)?;
    let client = build_client()?;
    let response = client
        .get(endpoint("groups/available"))
        .bearer_auth(token)
        .header(ACCEPT, "application/json")
        .send()
        .await
        .map_err(|error| format!("ORBIT_RELAY_NETWORK_FAILED: {}", error))?;
    parse_orbit_response::<Vec<OrbitRelayGroup>>(response).await
}

#[tauri::command]
pub async fn orbit_relay_create_api_key(
    access_token: String,
    name: String,
    group_id: Option<i64>,
) -> Result<OrbitRelayApiKey, String> {
    let token = normalized_bearer(&access_token)?;
    let name = name.trim();
    if name.is_empty() {
        return Err("ORBIT_RELAY_MISSING_API_KEY_NAME".to_string());
    }

    let mut payload = json!({ "name": name });
    if let Some(object) = payload.as_object_mut() {
        if let Some(value) = group_id.filter(|value| *value > 0) {
            object.insert("group_id".to_string(), json!(value));
        }
    }

    let client = build_client()?;
    let response = client
        .post(endpoint("keys"))
        .bearer_auth(token)
        .header(ACCEPT, "application/json")
        .header(CONTENT_TYPE, "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|error| format!("ORBIT_RELAY_NETWORK_FAILED: {}", error))?;
    parse_orbit_response::<OrbitRelayApiKey>(response).await
}

#[tauri::command]
pub async fn orbit_relay_update_api_key(
    access_token: String,
    id: i64,
    name: Option<String>,
    status: Option<String>,
    group_id: Option<i64>,
    group_id_set: Option<bool>,
    quota: Option<f64>,
    rate_limit_5h: Option<f64>,
    rate_limit_1d: Option<f64>,
    rate_limit_7d: Option<f64>,
) -> Result<OrbitRelayApiKey, String> {
    let token = normalized_bearer(&access_token)?;
    if id <= 0 {
        return Err("ORBIT_RELAY_INVALID_API_KEY_ID".to_string());
    }

    let mut payload = json!({});
    if let Some(object) = payload.as_object_mut() {
        if let Some(value) = name.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()) {
            object.insert("name".to_string(), json!(value));
        }
        if let Some(value) = status.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()) {
            object.insert("status".to_string(), json!(value));
        }
        if group_id_set.unwrap_or(false) {
            match group_id.filter(|value| *value > 0) {
                Some(value) => {
                    object.insert("group_id".to_string(), json!(value));
                }
                None => {
                    object.insert("group_id".to_string(), json!(null));
                }
            }
        }
        if let Some(value) = quota.filter(|value| value.is_finite() && *value >= 0.0) {
            object.insert("quota".to_string(), json!(value));
        }
        if let Some(value) = rate_limit_5h.filter(|value| value.is_finite() && *value >= 0.0) {
            object.insert("rate_limit_5h".to_string(), json!(value));
        }
        if let Some(value) = rate_limit_1d.filter(|value| value.is_finite() && *value >= 0.0) {
            object.insert("rate_limit_1d".to_string(), json!(value));
        }
        if let Some(value) = rate_limit_7d.filter(|value| value.is_finite() && *value >= 0.0) {
            object.insert("rate_limit_7d".to_string(), json!(value));
        }
    }

    let client = build_client()?;
    let response = client
        .put(endpoint(&format!("keys/{}", id)))
        .bearer_auth(token)
        .header(ACCEPT, "application/json")
        .header(CONTENT_TYPE, "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|error| format!("ORBIT_RELAY_NETWORK_FAILED: {}", error))?;
    parse_orbit_response::<OrbitRelayApiKey>(response).await
}
