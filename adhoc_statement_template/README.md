# Adhoc RSA Statement HTML Template

This is a Handlebars HTML/CSS recreation of the uploaded RSA statement PDF.

## Files

- `templates/adhoc-statement.hbs` - main report template
- `public/css/adhoc-statement.css` - print/PDF styling
- `sample/sample-data.json` - sample data shape matching `ADHOC_STATEMENT_HEADER` and `ADHOC_STATEMENT_BODY`
- `render-example.js` - sample Playwright PDF renderer

## Suggested backend flow

1. Execute `proc_adhoc_statement @PIN, @DATEFROM, @DATETO`
2. Read `ADHOC_STATEMENT_HEADER WHERE PIN = @PIN`
3. Read `ADHOC_STATEMENT_BODY WHERE PIN = @PIN ORDER BY SN, CONTDATE, TRANS_DATE, DESCR DESC`
4. Map SQL columns to the JSON keys used by this template
5. Render with Handlebars
6. Convert to PDF using Playwright

## Note

The logo and bottom banner are represented with placeholders. Replace `logoUrl` and `bannerUrl` with local image paths or base64 data URLs.
