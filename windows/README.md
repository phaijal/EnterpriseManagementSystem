# Windows: ERPNext DB backup & restore

Paths below assume your repo root contains `docker-compose.erpnext.yml`. Open **PowerShell** in that folder (`cd` there first).

---

## Backup (manual)

Default folder: `<repo>\backups\` (zip files).

```powershell
cd C:\path\to\EnterpriseManagementSystem
powershell -ExecutionPolicy Bypass -File .\windows\Backup-Erpnext-Db.ps1
```

Custom folder (example: **D:\erp backups**):

```powershell
powershell -ExecutionPolicy Bypass -File .\windows\Backup-Erpnext-Db.ps1 -BackupDir "D:\erp backups"
```

**Needs:** Docker Desktop running, stack up (`db` container healthy). Root password is read from repo **`.env`** (`ERPNEXT_DB_ROOT_PASSWORD`), or **`admin`** if unset.

---

## Backup (daily at 2:00 PM)

Registers task **EMS ERPNext DB Backup** (runs only when you are logged in).

```powershell
cd C:\path\to\EnterpriseManagementSystem
powershell -ExecutionPolicy Bypass -File .\windows\Register-DailyDbBackup-Task.ps1 -BackupDir "D:\erp backups"
```

Omit `-BackupDir` to use `<repo>\backups`.

**Change time:** set `BACKUP_TASK_HOUR` before registering, e.g. `9` for 9:00:

```powershell
$env:BACKUP_TASK_HOUR = "9"
powershell -ExecutionPolicy Bypass -File .\windows\Register-DailyDbBackup-Task.ps1 -BackupDir "D:\erp backups"
```

**Keep backups longer:** `RETENTION_DAYS` (default 14), e.g.:

```powershell
$env:RETENTION_DAYS = "30"
powershell -ExecutionPolicy Bypass -File .\windows\Backup-Erpnext-Db.ps1 -BackupDir "D:\erp backups"
```

**List / remove task:** Task Scheduler (`taskschd.msc`) → **Task Scheduler Library** → **EMS ERPNext DB Backup**.

---

## Restore (MariaDB emptied or new volume)

Backups are **`erpnext-db-*.sql.zip`** (SQL inside). They are a full **`--all-databases`** dump: restoring puts MariaDB back to how it was when the backup ran (including users/passwords inside MySQL’s own tables).

1. **Unzip** the newest backup and note the `.sql` path.

2. **Start at least the database** (from repo root):

```powershell
cd C:\path\to\EnterpriseManagementSystem
docker compose -f docker-compose.erpnext.yml up -d db
```

Wait until `db` is healthy (Docker Desktop shows it running, or ~30–60s).

3. **Set root password** to match **the same value as when the backup was taken** (your `.env` → `ERPNEXT_DB_ROOT_PASSWORD`, or `admin` if you never changed it). The restore file updates MySQL’s internal user table; use the password you used for backups.

4. **Import** (replace the `.sql` path and password):

```powershell
$sql = "D:\erp backups\erpnext-db-2026-03-29_140501.sql"   # your unzipped .sql file
$pass = "YOUR_ROOT_PASSWORD"   # same as when the backup was taken (see .env)

Get-Content -LiteralPath $sql -Raw | docker compose -f docker-compose.erpnext.yml exec -T -e "MYSQL_PWD=$pass" db mysql -uroot
```

Very large files: run from repo root in **Command Prompt** (not PowerShell), after `cd` to the repo:

```bat
set MYSQL_PWD=YOUR_ROOT_PASSWORD
docker compose -f docker-compose.erpnext.yml exec -T -e MYSQL_PWD=%MYSQL_PWD% db mysql -uroot < "D:\erp backups\erpnext-db-2026-03-29_140501.sql"
```

5. **Start the rest of the stack:**

```powershell
docker compose -f docker-compose.erpnext.yml up -d
```

**If you wiped Docker volumes** (`docker compose down -v`): you get a new empty ERPNext **site** volume too. Restoring **only** the DB is not enough to recreate `sites/` files. Full “everything lost” recovery needs DB restore **plus** a copy of your **`erpnext-sites`** (and any other) volumes or a separate site export. For **DB-only** loss with **sites volume intact**, the steps above are the right fix.

---

## Start the app (no exe)

```powershell
cd C:\path\to\EnterpriseManagementSystem
docker compose -f docker-compose.erpnext.yml up -d
```

Optional GUI helper: `powershell -ExecutionPolicy Bypass -File .\windows\EMSLauncher.ps1`
