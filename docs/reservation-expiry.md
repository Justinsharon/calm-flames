# Releasing stale inventory reservations

Checkout reserves stock before the order is saved. If a server instance crashes in between, the
reservation would hold stock forever. The sweeper releases a reservation only when **all** of these
hold, checked inside one Firestore transaction:

- it is still `RESERVED`;
- it is older than the time limit (`RESERVATION_MAX_AGE_MINUTES`, default 30, never below 15);
- no order document exists for its order number.

Reservations that belong to an order are never touched: payment, webhook and failure handling own
those. A checkout whose reservation was released before its order was saved fails with 409, and
the customer starts again. It is safe to run any number of times, concurrently, and alongside the
webhook.

## Run it

Manually, from your computer:

```bash
GOOGLE_APPLICATION_CREDENTIALS="$HOME/keys/calm-flames-admin.json" npm run expire-reservations
```

From the deployed server (as an admin, with your Firebase ID token), or with the maintenance key:

```bash
curl -X POST "https://<your-domain>/api/admin/maintenance/expire-reservations" -H "X-Maintenance-Key: $MAINTENANCE_SECRET"
```

## Schedule it (Phase 4, Cloud Run)

1. Set `MAINTENANCE_SECRET` on the Cloud Run service (Secret Manager), at least 16 random characters.
2. Create a Cloud Scheduler job every 15 minutes:

```bash
gcloud scheduler jobs create http expire-reservations --schedule="*/15 * * * *" --http-method=POST --uri="https://<your-domain>/api/admin/maintenance/expire-reservations" --headers="X-Maintenance-Key=<MAINTENANCE_SECRET>" --location=asia-south1
```

The response lists what was released, skipped and failed. A non-empty `failed` list means a
reservation's inventory was inconsistent; it was left alone for manual review.
