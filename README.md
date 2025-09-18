# pastickfight

# Hosting & Deploys

This repo deploys to **https://pastickfight.web.app**.

## CI/CD
- **PRs** → Preview channel link (posted by the Action as a PR comment).
- **Push to `main`** → Live deploy to pastickfight.web.app.

### Secrets required (one-time)
Create a GitHub Action secret named **`FIREBASE_SERVICE_ACCOUNT_PASTICKFIGHT`** that contains a JSON key for a service account with **Firebase Hosting Admin** (and optionally **Firebase Admin**) roles. See “Secrets setup” below.
