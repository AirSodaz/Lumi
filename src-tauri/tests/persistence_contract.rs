use lumi_lib::{
    persistence::{
        CredentialKey, CredentialStore, Database, MediaCacheRepository, MemoryCredentialStore,
        ServerProfileRepository,
    },
    providers::{LibraryItem, ProviderKind, ServerProfile},
};

#[test]
fn persistence_database_initialization_applies_schema_migrations() {
    let database = Database::open_in_memory().expect("open database");

    database.initialize().expect("initialize database");

    assert_eq!(database.applied_migration_versions().unwrap(), vec![1]);
    assert!(database.table_exists("server_profiles").unwrap());
    assert!(database.table_exists("media_cache").unwrap());
}

#[test]
fn persistence_server_profile_repository_upserts_lists_and_deletes_profiles() {
    let database = initialized_database();
    let repository = ServerProfileRepository::new(database.connection());
    let profile = demo_server_profile();

    repository.upsert(&profile).expect("upsert server profile");

    assert_eq!(repository.list().unwrap(), vec![profile.clone()]);

    let renamed = ServerProfile {
        name: "Renamed Server".into(),
        updated_at: "2026-05-08T00:00:00Z".into(),
        ..profile.clone()
    };
    repository.upsert(&renamed).expect("update server profile");

    assert_eq!(repository.list().unwrap(), vec![renamed]);

    repository
        .delete("server-1")
        .expect("delete server profile");

    assert!(repository.list().unwrap().is_empty());
}

#[test]
fn persistence_media_cache_uses_provider_server_item_identity() {
    let database = initialized_database();
    let repository = MediaCacheRepository::new(database.connection());
    let item = demo_library_item("server-a", "movie-1", "Demo Movie");
    let same_item_different_server = demo_library_item("server-b", "movie-1", "Other Server Movie");

    repository.upsert(&item).expect("cache item");
    repository
        .upsert(&same_item_different_server)
        .expect("cache item for another server");

    assert_eq!(
        repository
            .get(ProviderKind::Emby, "server-a", "movie-1")
            .unwrap()
            .unwrap()
            .title,
        "Demo Movie"
    );
    assert_eq!(
        repository
            .get(ProviderKind::Emby, "server-b", "movie-1")
            .unwrap()
            .unwrap()
            .title,
        "Other Server Movie"
    );
}

#[test]
fn credential_key_is_deterministic_and_contains_no_secret_material() {
    let profile = demo_server_profile();
    let key = CredentialKey::server_token(&profile);

    assert_eq!(key.service(), "app.lumi.desktop.emby.token");
    assert_eq!(key.account(), "server:server-1:user:user-1");
    assert!(!key.service().contains("token-value"));
    assert!(!key.account().contains("token-value"));
}

#[test]
fn credential_store_writes_reads_and_deletes_tokens() {
    let store = MemoryCredentialStore::default();
    let key = CredentialKey::server_token(&demo_server_profile());

    assert_eq!(store.get_token(&key).unwrap(), None);

    store.set_token(&key, "token-value").expect("set token");

    assert_eq!(store.get_token(&key).unwrap(), Some("token-value".into()));

    store.delete_token(&key).expect("delete token");

    assert_eq!(store.get_token(&key).unwrap(), None);
}

fn initialized_database() -> Database {
    let database = Database::open_in_memory().expect("open database");
    database.initialize().expect("initialize database");
    database
}

fn demo_server_profile() -> ServerProfile {
    ServerProfile {
        id: "server-1".into(),
        provider_kind: ProviderKind::Emby,
        name: "Demo Server".into(),
        base_url: "http://localhost:8096".into(),
        user_id: "user-1".into(),
        created_at: "2026-05-07T00:00:00Z".into(),
        updated_at: "2026-05-07T00:00:00Z".into(),
    }
}

fn demo_library_item(server_id: &str, item_id: &str, title: &str) -> LibraryItem {
    LibraryItem {
        id: item_id.into(),
        provider_kind: ProviderKind::Emby,
        server_id: server_id.into(),
        item_type: "movie".into(),
        title: title.into(),
        sort_title: Some(title.into()),
        poster_url: None,
        logo_url: None,
        backdrop_url: None,
        year: Some(2026),
        runtime_seconds: Some(7200),
        overview: Some("A cached demo item".into()),
        played_percentage: None,
        playback_position_seconds: None,
    }
}
