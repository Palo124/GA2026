# Content Admin – Google Sheets

Editors can update the site content by editing a Google Sheet. **No account needed** on the website – only access to the Sheet.

## Setup (one-time)

### 1. Create the content sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new blank spreadsheet.
2. **File → Import → Upload** and upload `content/sheet-template.csv`, or copy-paste the template structure manually.
3. Ensure the first sheet tab has:
   - **Config section**: Rows with `key` and `value` (e.g. `hero.title`, `ESN General Assembly 2026`)
   - **Section markers**: `[FAQ]`, `[DOCUMENTS]`, `[SPONSORS]` on their own rows to separate sections
   - **FAQ**: `question` and `answer` columns
   - **Documents**: `title`, `description`, `url`, `linkText` columns
   - **Sponsors**: `name` column

### 2. Publish the sheet

1. **File → Share → Publish to web**
2. Choose the first sheet (or the one with your content)
3. Format: **CSV**
4. Click **Publish**

### 3. Connect the site

1. After publishing, copy the **CSV link** from the dialog (or use format:  
   `https://docs.google.com/spreadsheets/d/e/PUBLISH_ID/pub?output=csv`)
2. Open `sheet-config.js` and set:
   ```js
   sheetUrl: 'YOUR_PUBLISHED_CSV_LINK',
   ```

### 4. CORS (if needed)

If the site cannot load the sheet (e.g. when opening from `file://` or some hosting), set in `sheet-config.js`:

```js
useCorsProxy: true
```

## Editing

- **Share the Sheet** with editors (View or Edit).
- Editors change the Sheet; the site fetches the latest content on each page load.
- To revoke access: stop sharing the Sheet or clear `sheetUrl` in `sheet-config.js` (site will fall back to `content/site.json`).

## Format notes

- **Arrays** (chips, about items): separate entries with semicolons (`;`), e.g. `chip1;chip2;chip3`
- **FAQ / Documents / Sponsors**: one row per item; header row is required

## Fallback

If `sheetUrl` and `sheetId` are both empty, the site uses `content/site.json` instead.
