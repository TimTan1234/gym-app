# Test fixtures

- `nasi-lemak.jpg`: "Nasi Lemak - Roti King 2025-09-19" by Andy Li, Wikimedia Commons, CC0 (public domain). https://commons.wikimedia.org/wiki/File:Nasi_Lemak_-_Roti_King_2025-09-19.jpg
- `groceries.md`, `groceries.docx`, `groceries.pdf`, `scanned.pdf`: small grocery-list files written for the procurement import tests (a minimal Word package, a one-page text PDF, and a PDF with a drawing but no text layer).
- `grocery-list.jpg`: a typed grocery list on lined paper, rendered with Playwright for the live procurement photo test (no third-party content).
- `luna-backup.json`, `luna-daily-logs.csv`: Luna exports in its JSON backup and CSV formats, written for the cycle import tests. They include the legacy shapes Luna can export: plain-string symptoms, `flow_Medium` and lowercase flow, a loose `2026-8-2` date, duplicate dates, impossible dates, and a CSV period end with no start in the 14 days before it.
