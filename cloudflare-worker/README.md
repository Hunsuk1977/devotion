# Tozer devotion Workers AI fallback

This Worker accepts an authenticated devotional-editing prompt and runs it on
Cloudflare Workers AI. The Python importer uses it when Gemini is unavailable.

Deploy with `wrangler deploy`, then set the Worker secret:

```sh
wrangler secret put IMPORT_SECRET
```

Set the same value in the GitHub Actions secret `CLOUDFLARE_AI_SECRET`, and set
`CLOUDFLARE_AI_URL` to the deployed Worker URL.
