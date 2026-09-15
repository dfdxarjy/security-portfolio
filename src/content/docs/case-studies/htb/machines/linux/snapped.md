---
title: "Linux Web Service Backup Disclosure and Local Privilege Escalation"
description: "Virtual host enumeration exposes an administrative interface and a pre-authentication backup disclosure that leaks AES key material; decrypting the application database recovers an SSH credential, and local enumeration identifies a privilege-escalation path."
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

This Linux lab exposed SSH and an Nginx-hosted web service. Virtual host enumeration revealed an administrative subdomain running a versioned management interface. A pre-authentication backup disclosure exposed encrypted backup material alongside key material. The decrypted application database contained password-verifier records; recovering one credential provided SSH access. Local enumeration then identified a privilege-escalation path, allowing elevated access.

All target-specific IPs, hostnames, credential values, and exploit binaries have been replaced with placeholders for public safety.

## Context and Objective

This lab environment ran OpenSSH and Nginx. Objective: identify attack surface, recover application-authentication material from a backup, establish user-level access, and assess local privilege escalation.

## Approach and Evidence

### Stage 1 — Port Scanning and Virtual Host Discovery

A full TCP port scan identified two open services. The HTTP service redirects to the primary vhost, so a host entry was added. Directory enumeration returned minimal results, prompting virtual host fuzzing that discovered an administrative subdomain.

```bash
nmap <TARGET_IP> --ulimit 5000 -p- -Pn -sC -sV -oN <SCAN_OUTPUT>
```

```
PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 9.6p1 Ubuntu 3ubuntu13.15 (Ubuntu Linux; protocol 2.0)
80/tcp open  http    nginx 1.24.0 (Ubuntu)
```

```bash
gobuster vhost \
  --url http://<PRIMARY_VHOST> \
  --wordlist /usr/share/seclists/Discovery/DNS/subdomains-top1million-110000.txt \
  --append-domain
```

```
<ADMIN_VHOST> Status: 200 [Size: 1407]
```

Virtual host enumeration was required to find the administrative attack surface.

### Stage 2 — Application Version Disclosure

The frontend JavaScript on the administrative interface referenced version files. Fetching one file disclosed a vulnerable application version.

```bash
curl -s http://<ADMIN_VHOST>/assets/<APPLICATION_SCRIPT> | grep -oP 'version[-\w]*\.js'
```

```
<VERSION_SCRIPT>
```

```bash
curl -s http://<ADMIN_VHOST>/assets/<VERSION_SCRIPT>
```

```
version: <VULNERABLE_VERSION>
```

### Stage 3 — Backup Disclosure

The backup endpoint exposed an `X-Backup-Security` response header containing the AES-256-CBC encryption key and IV in Base64. These values were converted to hex for use with OpenSSL.

```bash
grep -i '^X-Backup-Security:' headers.txt
```

```
X-Backup-Security: <BACKUP_KEY_BASE64>:<BACKUP_IV_BASE64>
```

```bash
export KEY_B64='<BACKUP_KEY_BASE64>'
export IV_B64='<BACKUP_IV_BASE64>'

KEY_HEX=$(printf '%s' "$KEY_B64" | base64 -d | xxd -p -c 0)
IV_HEX=$(printf '%s' "$IV_B64" | base64 -d | xxd -p -c 0)
```

The leaked backup was unzipped and each artifact decrypted using the extracted key material:

```bash
unzip backup.zip -d backup

openssl enc -aes-256-cbc -d \
  -in backup/<ENCRYPTED_METADATA> \
  -out <DECRYPTED_METADATA> \
  -K "$KEY_HEX" \
  -iv "$IV_HEX"

openssl enc -aes-256-cbc -d \
  -in backup/<APPLICATION_ARCHIVE> \
  -out <DECRYPTED_ARCHIVE> \
  -K "$KEY_HEX" \
  -iv "$IV_HEX"
```

The decrypted application archive was extracted and its SQLite database queried for authentication records.

### Stage 4 — Credential Extraction and SSH Access

The decrypted application database contained password-verifier records for two accounts. Offline password recovery yielded a plaintext password that provided SSH access.

```bash
sqlite3 <APPLICATION_DATABASE> 'select name,password from users;'
```

```
<ADMIN_ACCOUNT>|<PASSWORD_VERIFIER>
<LAB_USER>|<PASSWORD_VERIFIER>
```

```bash
password-recovery-tool <PASSWORD_VERIFIER_INPUT> <WORDLIST> --mode <FORMAT>
```

```
<LAB_USER> : <LAB_USER_PASSWORD>
```

```bash
ssh <LAB_USER>@<PRIMARY_VHOST>
```

The recovered credential provided user-level shell access.

### Stage 5 — Local CVE Enumeration and Privilege Escalation

Local privilege-escalation checks identified a vulnerable condition. A proof-of-concept was assessed in the lab, returning an elevated shell.

```bash
<SANITIZED_LOCAL_PRIVESC_VALIDATION_COMMAND>
```

```
# whoami
root
```

The recorded output shows that the validation returned an elevated shell. This established the local vulnerability assessment's significance: user-level access could be elevated in the lab.

## Challenges and Decisions

- The main vhost yielded minimal enumeration results; virtual host fuzzing was necessary to discover the administrative interface.
- Client-side JavaScript version disclosure made vulnerability mapping straightforward once the administrative vhost was identified.
- The backup disclosure was more severe because the response also leaked the encryption material needed to decrypt the backup contents.

## Outcome

The evidence establishes that a pre-authentication backup disclosure exposed encryption material and enabled application-database decryption. Password recovery provided SSH access, and local vulnerability assessment enabled privilege escalation to elevated access. All technical claims are grounded in the recorded command output.

## Lessons and Recommendations

- Virtual host enumeration is essential when the primary vhost presents limited attack surface. Standard directory fuzzing alone may not reveal the real administrative interface.
- Application backups should be treated as sensitive secrets; in this case, a database backup exposed reusable SSH credentials. Backup endpoints should require authentication and should not expose encryption material in response headers.
- Client-side JavaScript version disclosure enabled trivial CVE mapping. Version information should not be exposed in production deployments.
- Local CVE enumeration tools quickly identified the privilege escalation path. Regular kernel and package updates reduce the window of exposure for known vulnerabilities.
- Credential reuse across application and system services (SSH) amplifies the impact of any single compromise.

## References

- Vulnerability identifiers and product documentation were reviewed during analysis.
