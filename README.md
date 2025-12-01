# Warranty Service Portal (SharePoint + Teams)

This repository contains a lightweight web UI for submitting warranty service requests, automatically calculating an importance level, tracking status updates, and reporting by project or discipline. The UI runs as static assets while data is persisted to a SharePoint Online list and optionally posted to Microsoft Teams.

## Features
- Dynamic request form with manager-editable fields.
- Importance calculation based on impact and urgency.
- Status tracker and grouped reporting by project or discipline.
- SharePoint Online integration via Microsoft Graph and optional Teams webhook notifications.

## Quick start
1. Copy `config/sharepointConfig.example.json` to `config/sharepointConfig.json` and fill in your SharePoint site ID, list ID, Graph token, and optional Teams webhook.
2. Host the files in `src/` on SharePoint, Azure Static Web Apps, or any static host. Open `index.html`.
3. Submit a request. Without a config file, the app runs locally; with one, tickets are written to your SharePoint list and summarized in Teams.

For deployment details, see [`docs/deployment.md`](docs/deployment.md).
