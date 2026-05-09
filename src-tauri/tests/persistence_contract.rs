use lumi_lib::{
    persistence::{
        CredentialKey, CredentialStore, Database, MediaCacheRepository, MemoryCredentialStore,
        ServerProfileRepository,
    },
    providers::{LibraryItem, ProviderKind, ServerLine, ServerProfile},
};

#[test]
fn persistence_database_initialization_applies_schema_migrations() {
    let database = Database::open_in_memory().expect("open database");

    database.initialize().expect("initialize database");

    assert_eq!(database.applied_migration_versions().unwrap(), vec![1, 2]);
    assert!(database.table_exists("server_profiles").unwrap());
    assert!(database.table_exists("server_profile_lines").unwrap());
    assert!(database.table_exists("media_cache").unwrap());
}

#[test]
fn persistence_server_profile_repository_upserts_lists_lines_and_deletes_profiles() {
    let database = initialized_database();
    let repository = ServerProfileRepository::new(database.connection());
    let profile = demo_server_profile();

    repository.upsert(&profile).expect("upsert server profile");

    assert_eq!(repository.list().unwrap(), vec![profile.clone()]);
    assert_eq!(
        repository.get("server-1").unwrap().unwrap().lines,
        profile.lines
    );

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
fn persistence_server_profile_repository_manages_lines_and_current_base_url() {
    let database = initialized_database();
    let repository = ServerProfileRepository::new(database.connection());
    let profile = demo_server_profile();

    repository.upsert(&profile).expect("upsert server profile");

    let updated = repository
        .create_line(
            "server-1",
            "Remote",
            "https://remote.example.com/emby/",
            "2026-05-08T00:00:00Z",
        )
        .expect("create secondary line");

    assert_eq!(updated.base_url, "http://localhost:8096");
    assert_eq!(updated.lines.len(), 2);
    assert!(updated.lines.iter().any(|line| {
        line.name == "Remote"
            && line.base_url == "https://remote.example.com/emby"
            && !line.is_active
    }));

    let remote_line_id = updated
        .lines
        .iter()
        .find(|line| line.name == "Remote")
        .expect("remote line")
        .id
        .clone();
    let selected = repository
        .select_line("server-1", &remote_line_id, "2026-05-08T00:01:00Z")
        .expect("select remote line");

    assert_eq!(selected.base_url, "https://remote.example.com/emby");
    assert_eq!(selected.lines.iter().filter(|line| line.is_active).count(), 1);
    assert!(selected
        .lines
        .iter()
        .any(|line| line.id == remote_line_id && line.is_active));

    let renamed = repository
        .update_line(
            "server-1",
            &remote_line_id,
            "Remote 2",
            "https://remote2.example.com/emby",
            "2026-05-08T00:02:00Z",
        )
        .expect("update active line");

    assert_eq!(renamed.base_url, "https://remote2.example.com/emby");
    assert!(renamed.lines.iter().any(|line| {
        line.id == remote_line_id
            && line.name == "Remote 2"
            && line.base_url == "https://remote2.example.com/emby"
            && line.is_active
    }));

    let after_delete = repository
        .delete_line("server-1", &remote_line_id, "2026-05-08T00:03:00Z")
        .expect("delete active line");

    assert_eq!(after_delete.lines.len(), 1);
    assert_eq!(after_delete.base_url, "http://localhost:8096");
    assert!(after_delete.lines[0].is_active);
}

#[test]
fn persistence_server_profile_repository_rejects_duplicate_lines_and_last_line_delete() {
    let database = initialized_database();
    let repository = ServerProfileRepository::new(database.connection());
    let profile = demo_server_profile();

    repository.upsert(&profile).expect("upsert server profile");

    let duplicate = repository
        .create_line(
            "server-1",
            "Duplicate",
            "http://localhost:8096/",
            "2026-05-08T00:00:00Z",
        )
        .expect_err("duplicate line url is rejected");

    assert_eq!(duplicate.code(), "providers.server_line_url_duplicate");

    let last_line = profile.lines[0].id.clone();
    let delete = repository
        .delete_line("server-1", &last_line, "2026-05-08T00:01:00Z")
        .expect_err("last line cannot be deleted");

    assert_eq!(delete.code(), "providers.server_line_last");
    assert!(delete.recoverable());
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
        lines: vec![ServerLine {
            id: "line-1".into(),
            server_id: "server-1".into(),
            name: "Primary".into(),
            base_url: "http://localhost:8096".into(),
            is_active: true,
            created_at: "2026-05-07T00:00:00Z".into(),
            updated_at: "2026-05-07T00:00:00Z".into(),
        }],
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
