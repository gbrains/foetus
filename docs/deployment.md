# Warranty Service Portal Deployment

This portal is designed to run as a static web app with a SharePoint Online backend and Teams notifications. The UI can be hosted on SharePoint (as a page with script links), Azure Static Web Apps, or any web host that can reach Microsoft Graph.

## 1) Create the SharePoint list

1. In SharePoint Online, create a list named **WarrantyRequests**.
2. Add the following columns (case-sensitive to match the UI):
   - `Project` (Single line of text)
   - `Discipline` (Choice: Civil, Mechanical, Electrical, Architectural, Other)
   - `Location` (Single line of text)
   - `Asset` (Single line of text)
   - `Description` (Multiple lines of text)
   - `Impact` (Choice: Low, Medium, High)
   - `Urgency` (Choice: Low, Medium, High)
   - `Importance` (Single line of text)
   - `WarrantyEnd` (Date)
   - `Attachments` (Hyperlink)
   - `Status` (Choice: Submitted, In Progress, Vendor, Resolved)
3. Capture the **Site ID** and **List ID** from the Microsoft Graph Explorer (under `sites/{site-id}/lists`).

## 2) Configure API access

1. Register an Azure AD app with delegated permissions `Sites.ReadWrite.All` or `Lists.ReadWrite.All` and grant admin consent.
2. Obtain an access token (client credential or on-behalf-of) and place it in `config/sharepointConfig.json` alongside `siteId`, `listId`, and optional `teamsWebhook`.
3. Never commit the real token; only commit the example file. Use environment-specific secrets for production.

## 3) Teams notifications

- Create an **Incoming Webhook** connector in the desired Teams channel.
- Paste the webhook URL into `teamsWebhook` inside `config/sharepointConfig.json`.
- Each ticket submission posts a card summarizing the project, discipline, importance, and description.

## 4) Hosting on SharePoint/Teams

- Upload the `src` assets to a SharePoint document library and reference them in a modern page using the **Embed** web part.
- Alternatively package the assets via **SharePoint Framework (SPFx)** web part; the code is static and can live inside the bundle.
- Add the app as a personal tab in Teams by pointing the tab to the hosted page URL.

## 5) Reporting views

- The UI aggregates tickets by project or discipline. For native SharePoint views, create two list views with grouping: one by `Project`, another by `Discipline`, showing `Importance`, `Status`, and `Modified`.
- Power BI users can connect to the list and recreate the same breakdowns for broader reporting.

## 6) Optional automation

- Use **Power Automate** to send reminders for tickets where `Status` <> `Resolved` and `Modified` is older than 7 days.
- Create a flow that escalates high-importance tickets by posting to a Teams channel or tagging the project manager.

## 7) Local testing

- Open `src/index.html` in a browser. Without `sharepointConfig.json`, the app falls back to local data so you can test the UI.
- Once configuration is present, submissions are sent to Microsoft Graph; use the browser network tab to verify requests.
