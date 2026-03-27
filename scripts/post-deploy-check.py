#!/usr/bin/env python3
"""Post-deploy sanity checker for MACONA website on Azure Static Web Apps."""

import sys
import urllib.request
import urllib.error

# Update this after Azure SWA is provisioned
BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "https://macona.org"

PAGES = [
    "/",
    "/about/",
    "/programs/",
    "/donate/",
    "/blog/",
    "/blog/your-next-hire-ai/",
    "/blog/spring-campaign/",
    "/contact/",
]

def check_page(url: str) -> bool:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "MACONA-Deploy-Check/1.0"})
        resp = urllib.request.urlopen(req, timeout=10)
        status = resp.getcode()
        length = len(resp.read())
        if status == 200 and length > 500:
            print(f"  OK  {url} ({length:,} bytes)")
            return True
        else:
            print(f"  WARN {url} — status={status}, size={length}")
            return False
    except urllib.error.HTTPError as e:
        print(f"  FAIL {url} — HTTP {e.code}")
        return False
    except Exception as e:
        print(f"  FAIL {url} — {e}")
        return False

def main():
    print(f"Checking MACONA site: {BASE_URL}")
    print("-" * 50)

    results = []
    for page in PAGES:
        url = BASE_URL.rstrip("/") + page
        results.append(check_page(url))

    print("-" * 50)
    passed = sum(results)
    total = len(results)
    print(f"Results: {passed}/{total} pages OK")

    if all(results):
        print("All pages healthy.")
        return 0
    else:
        print("Some pages failed — check above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
