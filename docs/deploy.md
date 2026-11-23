# Deploy to Cloud Run (staging, then production)

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

## 6. Production service `calm-flames`

Production is a **second Cloud Run service** built from the **same image** as staging, running as
the **same runtime service account** (step 2), with **its own secrets** (live Razorpay keys etc.).
Staging keeps its test keys. Checkout stays off until you set `CHECKOUT_ENABLED` yourself (6.4).

Paste the variables from step 0 first, then:

```bash
PROD_SERVICE=calm-flames
SITE=https://thecalmflames.com
```

### 6.1 Production secrets

The production copies end in `_PROD` so they can never be mixed up with staging. Use the
`add_secret` helper from step 3 (paste it again in a new Cloud Shell):

```bash
add_secret RAZORPAY_KEY_ID_PROD
```

```bash
add_secret RAZORPAY_KEY_SECRET_PROD
```

```bash
add_secret RAZORPAY_WEBHOOK_SECRET_PROD
```

Optional (each feature stays off without it):

```bash
add_secret GEMINI_API_KEY_PROD
```

```bash
add_secret RESEND_API_KEY_PROD
```

```bash
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create MAINTENANCE_SECRET_PROD --replication-policy=automatic --data-file=- && gcloud secrets add-iam-policy-binding MAINTENANCE_SECRET_PROD --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor >/dev/null
```

### 6.2 Deploy the image staging is running

This reuses the exact image staging runs (no rebuild), mounts each `_PROD` secret that exists
under the normal name the server reads, and sets only non-secret settings. It never sets
`CHECKOUT_ENABLED`.

```bash
IMAGE=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(spec.template.spec.containers[0].image)'); echo "$IMAGE"
```

```bash
SECRETS=""
for s in RAZORPAY_KEY_ID RAZORPAY_KEY_SECRET RAZORPAY_WEBHOOK_SECRET GEMINI_API_KEY MAINTENANCE_SECRET RESEND_API_KEY; do
  if gcloud secrets describe "${s}_PROD" >/dev/null 2>&1; then SECRETS="${SECRETS:+$SECRETS,}$s=${s}_PROD:latest"; fi
done
echo "Mounting: ${SECRETS:-none}"
gcloud run deploy "$PROD_SERVICE" --image "$IMAGE" --region "$REGION" --service-account "$SA" --allow-unauthenticated --memory 512Mi --min-instances 1 --max-instances 10 \
  --update-env-vars "NODE_ENV=production,PUBLIC_SITE_URL=$SITE" ${SECRETS:+--set-secrets "$SECRETS"}
```

Optional email settings (not secret), only once you have a sending domain in Resend:

```bash
gcloud run services update "$PROD_SERVICE" --region "$REGION" --update-env-vars "MAIL_PROVIDER=resend,MAIL_FROM=The Calm Flame <orders@thecalmflames.com>,ORDER_NOTIFY_EMAIL=you@example.com,SUPPORT_NOTIFY_EMAIL=you@example.com"
```

`PUBLIC_SITE_URL` is what makes **only** `thecalmflames.com` indexable: every other host (the
`*.run.app` URL, staging, www) gets `robots.txt: Disallow: /` and `X-Robots-Tag: noindex`, and
`www.` is redirected to the apex by the server. **Never set `PUBLIC_SITE_URL` on staging.**

Check it (expect `"checkoutEnabled":false`):

```bash
PROD_URL=$(gcloud run services describe "$PROD_SERVICE" --region "$REGION" --format='value(status.url)'); curl -s "$PROD_URL/api/checkout/readiness"; echo; curl -s "$PROD_URL/robots.txt"
```

Later releases: deploy staging (step 4), check it, then run 6.2 again to promote that image.

### 6.3 Domain: thecalmflames.com + www

**Region note.** Cloud Run *domain mappings* are only offered in some regions, and as far as we
know **asia-south1 (Mumbai) is not one of them**. Check before choosing:

```bash
gcloud beta run domain-mappings list --region "$REGION"
```

If that errors with a region/unsupported message, use **Option A**. If it works, Option B is
also possible.

**Option A (recommended): Firebase Hosting in front of the Cloud Run service.** Same Firebase
project, free managed SSL, works with any Cloud Run region.

1. In this repo, the file `firebase.hosting.json` (added below) rewrites every path to the
   `calm-flames` service. Deploy it from Cloud Shell in the repo folder:

   ```bash
   npx firebase-tools deploy --only hosting --config firebase.hosting.json --project "$PROJECT_ID"
   ```

2. Firebase console → **Hosting → Add custom domain** → `thecalmflames.com` → follow the steps.
   Then add `www.thecalmflames.com` and choose **"Redirect to thecalmflames.com"**.
3. Add **exactly the DNS records the console shows you** at your domain registrar. They are:
   - a **TXT** record on `thecalmflames.com` (`hosting-site=…`, ownership check), then
   - an **A** record on `thecalmflames.com` (`@`) pointing to the IP address the console gives, and
   - for `www`, the record the console gives (an A record or a CNAME to `thecalmflames.com`).
   Copy them from the console rather than from here: Firebase can change these values.
4. Remove any other A / AAAA / CNAME records on `@` and `www` that point elsewhere. SSL is
   issued automatically (minutes to a few hours).

**Option B: Cloud Run domain mapping** (only if the list command above works in your region):

```bash
gcloud domains verify thecalmflames.com
```

```bash
gcloud beta run domain-mappings create --service "$PROD_SERVICE" --domain thecalmflames.com --region "$REGION"
```

```bash
gcloud beta run domain-mappings create --service "$PROD_SERVICE" --domain www.thecalmflames.com --region "$REGION"
```

Print the records Google expects, then add them at the registrar:

```bash
gcloud beta run domain-mappings describe --domain thecalmflames.com --region "$REGION" --format='table(status.resourceRecords[].type,status.resourceRecords[].rrdata)'
```

```bash
gcloud beta run domain-mappings describe --domain www.thecalmflames.com --region "$REGION" --format='table(status.resourceRecords[].type,status.resourceRecords[].rrdata)'
```

For Cloud Run these are normally:

| Host | Type | Value |
|---|---|---|
| `@` (thecalmflames.com) | A | `216.239.32.21`, `216.239.34.21`, `216.239.36.21`, `216.239.38.21` |
| `@` | AAAA | `2001:4860:4802:32::15`, `2001:4860:4802:34::15`, `2001:4860:4802:36::15`, `2001:4860:4802:38::15` |
| `www` | CNAME | `ghs.googlehosted.com.` |

If the `describe` output differs, **use the describe output**. Both hosts reach the same service;
the server sends `www` to `https://thecalmflames.com` with a permanent (301) redirect.

**After the domain works (either option):** Firebase console → Authentication → Settings →
Authorized domains → add `thecalmflames.com` (Google sign-in). Then set the Razorpay webhook URL
to `https://thecalmflames.com/api/webhooks/razorpay` in the Razorpay dashboard (live mode).

### 6.4 Turning checkout on (owner only)

Run `npm run golive:check -- --url https://thecalmflames.com` first; it changes nothing and
lists anything still blocking (prices, stock, shipping settings, Razorpay secrets). When you have
made a test payment and decided to open the shop:

```bash
gcloud run services update "$PROD_SERVICE" --region "$REGION" --update-env-vars CHECKOUT_ENABLED=true
```

To close checkout again at any time:

```bash
gcloud run services update "$PROD_SERVICE" --region "$REGION" --remove-env-vars CHECKOUT_ENABLED
```

### 6.5 Maintenance sweep for production (second Cloud Scheduler job)

```bash
PROD_URL=$(gcloud run services describe "$PROD_SERVICE" --region "$REGION" --format='value(status.url)')
gcloud scheduler jobs create http calm-flames-maintenance-prod --location="$REGION" --schedule="*/15 * * * *" --time-zone="Asia/Kolkata" --http-method=POST --uri="$PROD_URL/api/admin/maintenance/expire-reservations" --headers="Content-Type=application/json,X-Maintenance-Key=$(gcloud secrets versions access latest --secret=MAINTENANCE_SECRET_PROD)" --message-body='{}' --attempt-deadline=120s
```

```bash
gcloud scheduler jobs run calm-flames-maintenance-prod --location="$REGION"
```

After rotating `MAINTENANCE_SECRET_PROD`: run 6.2 again, then

```bash
gcloud scheduler jobs update http calm-flames-maintenance-prod --location="$REGION" --update-headers="X-Maintenance-Key=$(gcloud secrets versions access latest --secret=MAINTENANCE_SECRET_PROD)"
```

### 6.6 Daily backups

See `docs/backups.md` (daily Firestore export of the named database to a bucket that deletes
exports after 30 days).

## What is NOT done here

- Nothing in this file turns real checkout on except the explicit command in 6.4.
- The image is built from the `Dockerfile` (Node 22, `npm ci`, `npm run build`, production
  dependencies only, runs as the non-root `node` user). No secrets are baked into it.
