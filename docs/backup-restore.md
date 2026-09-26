# Backup & restore

RadTempo can back up and restore its own database from the admin UI, using standard, established tools (`pg_dump`/`pg_restore` and [`age`](https://github.com/FiloSottile/age) for encryption) rather than any custom cryptography.

## How backups work

1. An admin triggers a backup from the admin UI and supplies a passphrase.
2. RadTempo runs `pg_dump` in custom format (`-Fc`) against the database.
3. The dump is encrypted with `age` in passphrase (scrypt) mode, using the passphrase the admin supplied.
4. The resulting encrypted file (`.age`) is what gets stored/downloaded.

Nobody, including RadTempo itself, retains the passphrase — it exists only in the admin's head (or their own password manager) at backup time. **Anyone who has both the backup file and the passphrase can read all data in it.** Store backups and passphrases separately, and treat both as sensitive.

## How restore works

Restoring is destructive — it replaces the current database contents. RadTempo requires all of the following before it will proceed:

1. The admin supplies the correct passphrase for the backup being restored.
2. The admin types an explicit confirmation phrase (not just a checkbox).
3. The instance is placed into maintenance mode, blocking normal user access during the restore.
4. RadTempo decrypts the file with `age`, then runs `pg_restore --clean` to replace the existing schema/data.

## Doing it manually via the CLI

You don't need the admin UI to take or restore a backup — the same tools work directly against the `postgres` container. This is useful for scripted/off-instance backups.

### Manual backup

```bash
docker compose exec postgres pg_dump -Fc -U radtempo radtempo > radtempo.dump
age -p radtempo.dump > radtempo-backup-$(date +%Y-%m-%d).dump.age
rm radtempo.dump
```

(`age -p` prompts you interactively for a passphrase and encrypts standard input; adjust the pipeline if you'd rather not write the unencrypted dump to disk at all — `pg_dump ... | age -p > file.age` avoids the intermediate file.)

### Manual restore

```bash
age -d -o radtempo.dump radtempo-backup-2026-01-01.dump.age
# enter the passphrase when prompted
docker compose exec -T postgres pg_restore --clean -U radtempo -d radtempo < radtempo.dump
rm radtempo.dump
```

Put the instance into maintenance mode (via the admin UI) before running a manual restore, since `pg_restore --clean` drops and recreates objects while the app may still be serving requests.

## Volume-level backups

Backing up the entire `postgres` data volume (e.g. with your infrastructure's disk-snapshot tooling, or `docker run --rm -v radtempo_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/pgdata.tar.gz /data`) is also an acceptable backup strategy, and can be simpler to automate. It carries the same disclosure as above: anyone with access to the raw volume backup can read the data directly, since it isn't encrypted unless your snapshot/storage layer encrypts it independently. Encrypt volume-level backups at rest using your own infrastructure's tooling if you go this route.

## Retention

RadTempo does not automatically expire old backups for you; retention is an operational decision for whoever runs the instance. Remember that account deletions in the app do not retroactively remove a user's data from backups already taken — see [`docs/privacy.md`](privacy.md).
