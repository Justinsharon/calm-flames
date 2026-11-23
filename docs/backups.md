# Daily Firestore backups

A Cloud Scheduler job calls the Firestore **export** API once a day for the app's **named
database**. Exports go to a dedicated bucket that **deletes them after 30 days**. Exports cover
orders, customers, products, settings, pages, coupons and support requests. Product photos are
in Firebase Storage and are not part of this export.

Paste into **Cloud Shell** as a project owner. Every block is safe to re-run.

## 0. Variables

```bash
PROJECT_ID=groovy-patrol-413416
REGION=asia-south1
DB_ID=$(node -e "console.log(require('./firebase-applet-config.json').firestoreDatabaseId)" 2>/dev/null)
echo "Database: $DB_ID"   # run from the repo folder; or set DB_ID by hand (Firebase console → Firestore)
BACKUP_BUCKET="${PROJECT_ID}-firestore-backups"
BACKUP_SA_NAME=calm-flames-backup
BACKUP_SA="${BACKUP_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
FIRESTORE_AGENT="service-${PROJECT_NUMBER}@gcp-sa-firestore.iam.gserviceaccount.com"
gcloud config set project "$PROJECT_ID"
```

## 1. Bucket with a 30-day lifecycle

Same region as the database, uniform access, no public access:

```bash
gcloud storage buckets create "gs://$BACKUP_BUCKET" --location="$REGION" --uniform-bucket-level-access --public-access-prevention
```

```bash
cat > /tmp/lifecycle.json <<'JSON'
{ "rule": [ { "action": { "type": "Delete" }, "condition": { "age": 30 } } ] }
JSON
gcloud storage buckets update "gs://$BACKUP_BUCKET" --lifecycle-file=/tmp/lifecycle.json
```

```bash
gcloud storage buckets describe "gs://$BACKUP_BUCKET" --format='value(lifecycle_config)'
```

## 2. Least-privilege identities

- `calm-flames-backup` (the scheduler's caller) may **only start exports**
  (`roles/datastore.importExportAdmin`). It cannot read or change documents, and it has no access
  to the bucket.
- The **Firestore service agent** writes the export files, so it gets object create/read on
  **this bucket only**.

```bash
gcloud iam service-accounts create "$BACKUP_SA_NAME" --display-name="Calm Flames Firestore backup (export only)" || true
```

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$BACKUP_SA" --role=roles/datastore.importExportAdmin --condition=None
```

```bash
gcloud beta services identity create --service=firestore.googleapis.com --project="$PROJECT_ID"
```

```bash
gcloud storage buckets add-iam-policy-binding "gs://$BACKUP_BUCKET" --member="serviceAccount:$FIRESTORE_AGENT" --role=roles/storage.objectAdmin
```

Cloud Scheduler must be allowed to mint tokens for the backup account:

```bash
gcloud iam service-accounts add-iam-policy-binding "$BACKUP_SA" --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-cloudscheduler.iam.gserviceaccount.com" --role=roles/iam.serviceAccountTokenCreator
```

## 3. Daily export job (02:30 India time)

```bash
gcloud scheduler jobs create http calm-flames-firestore-backup --location="$REGION" --schedule="30 2 * * *" --time-zone="Asia/Kolkata" \
  --http-method=POST --uri="https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DB_ID}:exportDocuments" \
  --headers="Content-Type=application/json" --message-body="{\"outputUriPrefix\":\"gs://${BACKUP_BUCKET}/daily\"}" \
  --oauth-service-account-email="$BACKUP_SA" --oauth-token-scope="https://www.googleapis.com/auth/datastore" --attempt-deadline=180s
```

Run it once now, then check the export started and the files arrived:

```bash
gcloud scheduler jobs run calm-flames-firestore-backup --location="$REGION"
```

```bash
gcloud firestore operations list --database="$DB_ID" --limit=3
```

```bash
gcloud storage ls "gs://$BACKUP_BUCKET/daily/"
```

Each export is a timestamped folder under `daily/`. Exports older than 30 days are deleted
automatically.

## Restore (only when you mean it)

Importing **overwrites** documents with the same IDs. Restore into the live database only after
deciding to. A safer first step is to import into a separate, empty database and compare.

```bash
gcloud firestore import "gs://$BACKUP_BUCKET/daily/<EXPORT_FOLDER>" --database="$DB_ID"
```

## Alternative: Firestore's built-in scheduled backups

Firestore can also keep daily backups itself, without a bucket (retention up to 14 weeks):

```bash
gcloud firestore backups schedules create --database="$DB_ID" --recurrence=daily --retention=30d
```

These are restored with `gcloud firestore databases restore`. You can use either method, or both.
