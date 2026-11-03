#!/bin/bash
# Google Search Console Sitemap Submission
# Requires gcloud with application-default creds authorized for the
# slashmantools.us GSC property (enable "Search Console API" on the GCP
# project and share the property with the service account / user).
#
# Fallback (manual, no creds needed): add each sitemap in the GSC UI:
#   https://search.google.com/search-console/sitemaps?resource_id=sc-domain%3Aslashmantools.us

SITE_ID="sc-domain%3Aslashmantools.us"
SITEMAPS=(
  "https://slashmantools.us/sitemap.xml"
  "https://slashmantools.us/en/sitemap.xml"
  "https://slashmantools.us/zh-tw/sitemap.xml"
  "https://slashmantools.us/zh-cn/sitemap.xml"
  "https://slashmantools.us/ja/sitemap.xml"
  "https://slashmantools.us/es/sitemap.xml"
)

TOKEN=$(gcloud auth application-default print-access-token --scopes="https://www.googleapis.com/auth/webmasters" 2>/dev/null || echo "NEED_GCloud_AUTH")

if [ "$TOKEN" = "NEED_GCloud_AUTH" ]; then
  echo "gcloud credentials missing. Either run 'gcloud auth application-default login --scopes=https://www.googleapis.com/auth/webmasters,https://www.googleapis.com/auth/cloud-platform' + enable Search Console API,"
  echo "or submit manually: https://search.google.com/search-console/sitemaps?resource_id=sc-domain%3Aslashmantools.us"
  exit 1
fi

for S in "${SITEMAPS[@]}"; do
  ENCODED_S=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$S")
  ENDPOINT="https://www.googleapis.com/webmasters/v3/sites/${SITE_ID}/sitemaps/${ENCODED_S}"
  echo "Submitting $S via PUT $ENDPOINT ..."
  curl -sS -X PUT "$ENDPOINT" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Length: 0" 2>&1 | head -5
  echo ""
done
