---
name: looking-up-firebase-auth-users
description: Use when needing to identify Firebase Auth users by UID - resolving display names, emails, or Google provider info for UIDs that show blank in the EcoRay admin panel or Firestore.
---

# Looking Up Firebase Auth Users

## Overview

EcoRay admin panel user records (Firestore) can have blank name/email fields even though Firebase Auth holds the full profile. Firebase Auth UIDs are NOT Google Gaia IDs - People API lookups fail on them. The authoritative source is the Firebase Auth record itself, read via the Admin SDK.

## When to Use

- Admin panel (localhost:3001/da/admin/users) shows a UID instead of a name
- Need email/photo for a Firebase UID
- User asks "who is this user ID?"

## Core Pattern

Service account key lives at ~/Desktop/work/ecoray/ecoray-web/firebase-service-account.json

Write a script to /tmp/fb-lookup.mjs with this content (replace the UIDs array):

```js
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync(
  '/Users/lucasfreytorreshanson/Desktop/work/ecoray/ecoray-web/firebase-service-account.json',
  'utf8'
));
initializeApp({ credential: cert(serviceAccount) });

const uids = ['UID1', 'UID2']; // replace

const result = await getAuth().getUsers(uids.map(uid => ({ uid })));
for (const u of result.users) {
  console.log(JSON.stringify({
    uid: u.uid,
    displayName: u.displayName ?? null,
    email: u.email ?? null,
    providers: u.providerData?.map(p => p.providerId) ?? [],
    photoURL: u.photoURL ?? null,
  }));
}
for (const e of result.notFound) console.log('NOT FOUND:', JSON.stringify(e));
```

Then run from the ecoray-web directory so firebase-admin resolves from its node_modules:

```bash
cd ~/Desktop/work/ecoray/ecoray-web && bun /tmp/fb-lookup.mjs
```

## Gotchas

- Default import fails under Bun: `import admin from 'firebase-admin'` gives `admin.credential` undefined. Use named imports: `import { initializeApp, cert } from 'firebase-admin/app'` and `import { getAuth } from 'firebase-admin/auth'`.
- Google provider data: if `providers` includes `google.com`, the displayName/email/photoURL come from the user's Google profile at sign-up time.
- Batch limit: `getUsers` accepts up to 100 identifiers per call.
- Writing back: to fix blank admin-panel fields, update the Firestore user doc (not just Auth) - the admin panel reads Firestore.
