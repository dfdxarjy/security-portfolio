---
title: "Titanic — Path Traversal to ImageMagick Shared-Library Hijacking"
description: "A download endpoint's path traversal exposes Gitea configuration and database data for password recovery and SSH access; an ImageMagick shared-library hijack (CVE-2024-41817) in a scheduled process provides elevated access."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - path-traversal
  - gitea
  - imagemagick
  - cve-2024-41817
---

## Summary

Titanic is a Hack The Box Linux lab. The notes report a path-traversal flaw in a download endpoint, access to Gitea configuration and database data, password recovery leading to SSH access, and an ImageMagick shared-library hijack leading to elevated access. Target identifiers, paths, account names, credentials, hashes, and lab secrets are replaced with role-based placeholders.

## Context and Objective

The notes report SSH and HTTP services, with the HTTP service redirecting to a lab hostname. Virtual-host enumeration identified a Gitea instance. Objective: trace documented attack path from exposed web functionality through authenticated access and privilege escalation within this lab.

## Approach and Evidence

### Service and Virtual-Host Discovery

**Observation.** The notes report SSH and Apache HTTP services, plus a Gitea virtual host.

**Action.** Service and virtual-host enumeration used representative scans:

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV
gobuster vhost --url http://<TARGET_HOSTNAME> --wordlist <SUBDOMAIN_WORDLIST> --append-domain -r
```

```text
22/tcp open  ssh
80/tcp open  http
Found: <GITEA_VHOST> Status: 200
```

**Technical significance.** The virtual host narrowed web review to a separate application surface.

**Result.** The notes report that the discovered virtual host hosted Gitea.

### File-Read Validation

**Observation.** The notes report that the download endpoint accepted an unsanitized `ticket` value.

**Action.** A representative request tested a system-file path:

```text
http://<TARGET_HOSTNAME>/download?ticket=<SYSTEM_FILE>
```

```text
root:x:0:0:root:<REDACTED>
...
```

**Technical significance.** Returning file content establishes arbitrary file-read impact and enables review of application-side configuration.

**Result.** The notes report that this request confirmed path traversal.

### Gitea Configuration and Database Access

**Observation.** The notes report that repository configuration exposed the Gitea data-volume layout.

**Action.** The file-read primitive retrieved configuration and database material; a hash-extraction utility then processed the database:

```bash
curl "http://<TARGET_HOSTNAME>/download?ticket=<GITEA_CONFIG_PATH>"
curl "http://<TARGET_HOSTNAME>/download?ticket=<GITEA_DATABASE_PATH>" --output gitea.db
python3 <GITEA_HASH_EXTRACTOR> gitea.db
```

```text
[database]
DB_TYPE = sqlite3
<LAB_USER>:<PASSWORD_HASH>
```

**Technical significance.** Configuration identified SQLite as the backend; database access exposed password-verification material for offline review.

**Result.** The notes report recovery of two user password hashes from the Gitea database.

### Password Recovery and SSH Access

**Observation.** The notes report that one recovered hash matched a common-wordlist candidate.

**Action.** The recovered data was tested offline, then used for SSH authentication:

```bash
hashcat <HASH_FILE> <WORDLIST> -D2 --username
ssh <LAB_USER>@<TARGET_HOSTNAME>
```

```text
<LAB_USER>:<LAB_USER_PASSWORD>
<LAB_USER>@<TARGET_HOSTNAME>:~$
```

**Technical significance.** Offline password recovery converted application data exposure into authenticated operating-system access.

**Result.** The notes report SSH access as the recovered lab user using that password.

### Scheduled Image Processing Discovery

**Observation.** The notes report a scheduled image-identification script that ran ImageMagick from a predictable image directory.

**Action.** Local enumeration inspected the script and ImageMagick version:

```bash
cat <IMAGE_IDENTIFICATION_SCRIPT>
magick --version
```

```text
find <IMAGE_DIRECTORY> -type f -name "*.jpg" | xargs /usr/bin/magick identify
ImageMagick 7.1.1-35
```

**Technical significance.** A privileged scheduled process operating from a writable, predictable directory can make runtime library loading security-critical.

**Result.** The notes report that this version was vulnerable to CVE-2024-41817.

### ImageMagick Shared-Library Hijacking

**Observation.** The notes report that ImageMagick loaded `libxcb.so.1` while processing images and that the scheduled process ran with elevated privileges.

**Action.** The notes describe placing a malicious shared library in the image-processing working directory and waiting for scheduled processing. Unsafe constructor and reverse-shell details are intentionally omitted; the representative listener pattern is retained:

```bash
nc -lvnp <LISTENER_PORT>
```

```text
<ROOT_USER>@<TARGET_HOSTNAME>:<IMAGE_DIRECTORY>#
```

**Technical significance.** CVE-2024-41817 allowed attacker-controlled library code to execute in the scheduled ImageMagick process context.

**Result.** The notes report that scheduled processing produced an elevated shell.

## Challenges and Decisions

No challenges or decision points are included because the source notes do not document them.

## Outcome

The notes report complete lab compromise through path traversal, Gitea database access, offline password recovery, SSH access, and ImageMagick shared-library hijacking. Recorded command output supports service discovery, file-read validation, SQLite identification, password recovery, SSH access, ImageMagick version identification, and an elevated shell. The notes do not provide independent reproduction evidence beyond their recorded commands and excerpts.

## Lessons and Recommendations

- **Recommendation:** Canonicalize download paths, enforce an allowlist of intended files, and reject traversal sequences before file access.
- **Recommendation:** Keep credentials and database connection settings out of repository history; rotate any exposed values.
- **Recommendation:** Enforce unique, resistant passwords and prevent recovered application credentials from authenticating to operating-system accounts.
- **Recommendation:** Upgrade vulnerable ImageMagick releases and ensure scheduled jobs run from controlled directories with least privilege.

## References

- Hack The Box [Titanic](https://app.hackthebox.com/machines/Titanic) lab.
