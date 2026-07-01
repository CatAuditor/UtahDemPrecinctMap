# Google Sheet templates

Import these into two Google spreadsheets so the tabs + headers match the code.
Importing a CSV names the new tab after the file, which is exactly what the app
expects (`Candidates`, `Config`, `Submissions`).

## 1. Candidate spreadsheet

1. Create a new Google Sheet. Name it e.g. "Precinct Tool — Candidates".
2. **File → Import → Upload →** `Candidates.csv`.
3. Import location: **Replace current sheet**. (Then rename the tab to `Candidates`
   if it isn't already.)
4. Delete the two sample rows once you've added real candidates.
5. Copy its Sheet ID (URL between `/d/` and `/edit`) → `CANDIDATE_SHEET_ID`.

`DistrictType` must be one of: `house`, `senate`, `congress`, `school_board`.
`District` is the number (e.g. `10`). `TopIssues` is comma-separated in one cell.
`Active` = TRUE/FALSE. Share this sheet with the service account as **Viewer**.

## 2. Volunteer spreadsheet

1. Create a second Google Sheet. Name it e.g. "Precinct Tool — Volunteers".
2. **File → Import → Upload →** `Config.csv` → **Insert new sheet(s)**.
   Rename that tab to `Config` if needed.
3. **File → Import → Upload →** `Submissions.csv` → **Insert new sheet(s)**.
   Rename that tab to `Submissions` if needed.
4. Delete the default empty "Sheet1".
5. Copy its Sheet ID → `VOLUNTEER_SHEET_ID`.

- **Config** tab: edit the `Issues` and `Capacity` columns anytime — the funnel
  updates within ~60s. The two columns are independent lists.
- **Submissions** tab: the app appends signups here. Leave the header row intact.
  `Status` fills in as `New`; `DateContacted` is yours to fill during follow-up.

Share this sheet with the service account as **Editor** (it writes signups).
