# Example import files

Place **sample** CSV files here only if you want to share safe, anonymized examples in Git.

**Do not commit real bank exports** — they contain account numbers and personal data. Real imports stay on your machine (uploaded via the app or a watched folder outside this repo).

## Supported formats

| Broker / bank | Where to import in app |
|---------------|------------------------|
| LHV Bank | Transactions → Import |
| Revolut | Revolut section |
| Lightyear | Investments → Import CSV |
| Swedbank funds | Investments → Import CSV |

Format details are in the main [README](../README.md) and parser code under `backend/src/services/parsers/`.
