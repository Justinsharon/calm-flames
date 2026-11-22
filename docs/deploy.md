# Deploy to Cloud Run (staging)

Paste these into **Cloud Shell** (console.cloud.google.com → the `>_` icon), signed in as a
project owner. Every block is safe to re-run. Checkout stays **disabled**: `CHECKOUT_ENABLED` is
never set here.

Before the first deploy, finish `docs/catalog-migration.md` (migrate the catalogue, make yourself
admin, deploy the security rules).

## 0. Variables (paste first, in every new Cloud Shell session)

```bash
PROJECT_ID=groovy-patrol-413416
REGION=asia-south1
SERVICE=calm-flames-staging
BUCKET=groovy-patrol-413416.firebasestorage.app
SA_NAME=calm-flames-run
SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud config set project "$PROJECT_ID"
```

## 1. Enable the APIs

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com cloudscheduler.googleapis.com
```

## 2. Runtime service account (least privilege)

The container runs as this account. It can read/write Firestore, manage objects in the product
photo bucket only, and read only the secrets you grant it in step 3. No keys are created.

```bash
gcloud iam service-accounts create "$SA_NAME" --display-name="Calm Flames Cloud Run runtime" || true
```

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role=roles/datastore.user --condition=None
```

```bash
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$SA" --role=roles/storage.objectAdmin
```

## 3. Secrets (all optional on staging)

The server starts and serves the storefront with **none** of these. At startup it logs one line
per feature (`[startup] ON/OFF …`) so you can see what is off. Add only the ones you have.

Paste this helper once. It asks for the value without echoing it (nothing lands in shell
history), stores it in Secret Manager and lets only the runtime account read that one secret:

```bash
add_secret() {
  local name="$1" value
  read -rsp "Value for $name: " value; echo
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=-
  else
    printf '%s' "$value" | gcloud secrets create "$name" --replication-policy=automatic --data-file=-
  fi
  unset value
  gcloud secrets add-iam-policy-binding "$name" --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor >/dev/null
  echo "Stored $name"
}
```

Then, for each secret you want (use Razorpay **test** keys on staging):

```bash
add_secret RAZORPAY_KEY_ID
```

```bash
add_secret RAZORPAY_KEY_SECRET
```

```bash
add_secret RAZORPAY_WEBHOOK_SECRET
```

```bash
add_secret GEMINI_API_KEY
```

The maintenance key is random; generate it instead of typing one:

```bash
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create MAINTENANCE_SECRET --replication-policy=automatic --data-file=- && gcloud secrets add-iam-policy-binding MAINTENANCE_SECRET --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor >/dev/null
```

## 4. Deploy

From a checkout of the branch you want to deploy:

```bash
git clone https://github.com/Justinsharon/calm-flames.git && cd calm-flames
```

```bash
git checkout main
```

This mounts every secret that exists in Secret Manager (and skips the ones that don't), then
builds the `Dockerfile` with Cloud Build and deploys. Accept the prompt to create the
`cloud-run-source-deploy` Artifact Registry repository the first time.

```bash
SECRETS=""
for s in RAZORPAY_KEY_ID RAZORPAY_KEY_SECRET RAZORPAY_WEBHOOK_SECRET GEMINI_API_KEY MAINTENANCE_SECRET; do
  if gcloud secrets describe "$s" >/dev/null 2>&1; then SECRETS="${SECRETS:+$SECRETS,}$s=$s:latest"; fi
done
echo "Mounting: ${SECRETS:-none}"
gcloud run deploy "$SERVICE" --source . --region "$REGION" --service-account "$SA" --allow-unauthenticated --set-env-vars NODE_ENV=production --memory 512Mi --min-instances 0 --max-instances 3 ${SECRETS:+--set-secrets "$SECRETS"}
```

(If you later delete a secret, redeploy with `--clear-secrets` added once, then run the block again.)

Check it:

```bash
URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)'); echo "$URL"
```

```bash
curl -s "$URL/api/checkout/readiness"
```

Expect `"checkoutEnabled":false`. Startup lines:

```bash
gcloud run services logs read "$SERVICE" --region "$REGION" --limit 50 | grep startup
```

**Sign-in on staging:** Firebase console → Authentication → Settings → Authorized domains → add
the `…run.app` host from `$URL`.

## 5. Maintenance sweep every 15 minutes (Cloud Scheduler)

Releases stale reservations and expires abandoned payments (see `docs/reservation-expiry.md`).
Needs the `MAINTENANCE_SECRET` secret from step 3 and a deploy after creating it.

```bash
URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')
gcloud scheduler jobs create http calm-flames-maintenance --location="$REGION" --schedule="*/15 * * * *" --time-zone="Asia/Kolkata" --http-method=POST --uri="$URL/api/admin/maintenance/expire-reservations" --headers="Content-Type=application/json,X-Maintenance-Key=$(gcloud secrets versions access latest --secret=MAINTENANCE_SECRET)" --message-body='{}' --attempt-deadline=120s
```

Run it once now and check the result:

```bash
gcloud scheduler jobs run calm-flames-maintenance --location="$REGION"
```

```bash
gcloud run services logs read "$SERVICE" --region "$REGION" --limit 20
```

Note: the job stores the key in its configuration (visible to anyone with Cloud Scheduler access
in the project). After rotating `MAINTENANCE_SECRET`, redeploy (step 4) and update the job:

```bash
gcloud scheduler jobs update http calm-flames-maintenance --location="$REGION" --update-headers="X-Maintenance-Key=$(gcloud secrets versions access latest --secret=MAINTENANCE_SECRET)"
```

## What is NOT done here

- Real checkout (`CHECKOUT_ENABLED=true`), live Razorpay keys, the Razorpay webhook URL and the
  custom domain are Phase 4 go-live steps.
- The image is built from the `Dockerfile` (Node 22, `npm ci`, `npm run build`, production
  dependencies only, runs as the non-root `node` user). No secrets are baked into it.
