#!/bin/bash
# Google Search Console Sitemap Submission
# Requires gcloud with application-default creds authorized for the
# slashmantools.us GSC property (enable "Search Console API" on the GCP
# project and share the property with the service account / user).
#
# Fallback (manual, no creds needed): add each sitemap in the GSC UI:
#   https://search.google.com/search-console/sitemaps?resource_id=sc%3Aslashmantools.us

SITEMAPS=(
  "https://slashmantools.us/sitemap.xml"
  "https://slashmantools.us/en/sitemap.xml"
  "https://slashmantools.us/zh-tw/sitemap.xml"
  "https://slashmantools.us/zh-cn/sitemap.xml"
  "https://slashmantools.us/ja/sitemap.xml"
  "https://slashmantools.us/es/sitemap.xml"
)

TOKEN=$(gcloud auth application-default print-access-token 2>/dev/null || echo "NEED_GCloud_AUTH")

if [ "$TOKEN" = "NEED_GCloud_AUTH" ]; then
  echo "gcloud credentials missing. Either run 'gcloud auth login' + enable Search Console API,"
  echo "or submit manually: https://search.google.com/search-console/sitemaps?resource_id=sc%3Aslashmantools.us"
  exit 1
fi

for S in "${SITEMAPS[@]}"; do
  echo "Submitting $S ..."
  curl -s "https://www.google.com/search-console/sitemaps/uploadAuth?authuser=0&siteUrl=https%3A%2F%2Fslashmantools.us" \
    -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"sitemapUri\":\"$S\"}" 2>&1 | head -5
  echo ""
done
