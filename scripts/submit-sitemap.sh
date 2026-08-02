#!/bin/bash
# Google Search Console Sitemap Submission
echo "Submitting sitemap to Google..."
curl -s "https://www.google.com/search-console/sitemaps/uploadAuth?authuser=0&siteUrl=https%3A%2F%2Fslashmantools.us" \
  -H "Authorization: Bearer $(gcloud auth application-default print-access-token 2>/dev/null || echo 'NEED_GCloud_AUTH')" \
  2>&1 | head -5

echo ""
echo "建議手動提交至:"
echo "https://search.google.com/search-console/sitemaps?resource_id=sc%3Aslashmantools.us"
