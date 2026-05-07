use serde::{Deserialize, Serialize};

use crate::errors::AppResult;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerOpenRequest {
    pub server_id: String,
    pub item_id: String,
    pub media_source_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSession {
    pub id: String,
    pub server_id: String,
    pub item_id: String,
    pub state: PlayerState,
    pub position_seconds: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlayerState {
    Opening,
    Playing,
    Paused,
    Buffering,
    Ended,
    Error,
    Closed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlaybackCommand {
    Play,
    Pause,
    Seek { position_seconds: u32 },
    SetVolume { volume: u8 },
    Close,
}

pub trait PlayerService: Send + Sync {
    fn open(&self, request: PlayerOpenRequest) -> AppResult<PlayerSession>;

    fn command(&self, session_id: &str, command: PlaybackCommand) -> AppResult<PlayerSession>;

    fn close(&self, session_id: &str) -> AppResult<PlayerSession>;
}
