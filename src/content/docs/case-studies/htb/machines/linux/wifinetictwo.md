---
title: "WifineticTwo — ICS and Wireless Pivot"
description: "Default OpenPLC credentials and a Structured Text C extension provide container root; wireless scanning and a WPS PixieDust attack recover a WPA passphrase, and association leads to passwordless root SSH on a router."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - ics
  - wireless
  - wps
  - openplc
---

## Summary

WifineticTwo is a Medium Linux Hack The Box lab. The notes report an OpenPLC runtime using default credentials, execution through a Structured Text program with a C extension, and root access in a container. They then report wireless reconnaissance, WPS credential recovery, association with an access point, and passwordless root SSH access to a router. Target identifiers, credentials, and secret values are replaced with role-based placeholders.

## Context and Objective

Recorded enumeration identified SSH and a web-facing OpenPLC runtime. Objective: assess documented paths from the exposed industrial-control interface to the adjacent wireless segment and router. This case study reports only outcomes documented in lab notes; it does not establish behavior outside this lab.

## Approach and Evidence

### Service enumeration

**Observation.** The recorded scan showed SSH and HTTP on the target.

**Action.** Service and version detection was run across TCP ports.

```bash
nmap -sC -sV -p- --min-rate 5000 -oA nmap/wifinetictwo <TARGET_IP>
```

```text
22/tcp   open  ssh
8080/tcp open  http-proxy
```

**Technical significance.** The notes identify the HTTP service as an OpenPLC runtime, providing the application surface evaluated next.

**Result.** The notes report that port 8080 served the OpenPLC web interface.

### OpenPLC program execution

**Observation.** The notes report default OpenPLC credentials and Structured Text support for C extensions through custom output functions.

**Action.** A custom program containing an extension was uploaded and started through the OpenPLC interface; unsafe payload implementation is omitted.

```bash
nc -lvnp <LISTEN_PORT>
```

```text
<ROOT_SHELL_PROMPT>
```

**Technical significance.** Compiling and running an extension in a privileged runtime can turn application-level program upload into operating-system command execution.

**Result.** The notes report a root shell inside the container.

### Wireless interface discovery

**Observation.** The container exposed a managed wireless interface, and scanning identified an access point with WPS enabled.

**Action.** The interface and nearby wireless capabilities were inspected.

```bash
iw dev
iw dev <WIRELESS_INTERFACE> scan | grep -E "^BSS|SSID|WPS"
```

```text
Interface <WIRELESS_INTERFACE>
SSID: <WIRELESS_SSID>
WPS: ...
```

**Technical significance.** WPS availability created a separate authentication path to the adjacent wireless network.

**Result.** The notes report a WPS-enabled access point discoverable from the container.

### WPS credential recovery

**Observation.** The discovered access point exposed WPS.

**Action.** The notes report use of a PixieDust-capable WPS tool against the access point.

```bash
python3 oneshot.py -b <AP_MAC_ADDRESS> -i <WIRELESS_INTERFACE> -K
```

```text
[+] WPS PIN: '<WPS_PIN>'
[+] WPA PSK: '<WPA2_PASSPHRASE>'
[+] AP SSID: '<WIRELESS_SSID>'
```

**Technical significance.** PixieDust targets implementations with predictable WPS nonces, allowing recovery of wireless credentials when the implementation is vulnerable.

**Result.** The notes report recovery of a WPS PIN and WPA2 passphrase.

### Wireless association and router access

**Observation.** The notes report that the recovered WPA2 passphrase allowed wireless association and DHCP configuration; ARP then identified a reachable gateway with SSH.

**Action.** The container was associated with the wireless network, obtained a lease, and connected to the gateway over SSH.

```bash
wpa_supplicant -B -i <WIRELESS_INTERFACE> -c <WPA_CONFIG>
dhclient <WIRELESS_INTERFACE>
arp -a
ssh <ROUTER_ROOT_ACCOUNT>@<ROUTER_GATEWAY>
```

```text
inet <DHCP_LEASE>
<ROUTER_GATEWAY> at <AP_MAC_ADDRESS>
<ROUTER_ROOT_PROMPT>
```

**Technical significance.** Association crossed the container boundary into the wireless segment. Passwordless root SSH, if present, removes authentication from administrative access.

**Result.** The notes report a DHCP lease and a passwordless root SSH session on the router.

## Challenges and Decisions

The notes do not document failed attempts, troubleshooting, or alternative paths. The custom program's payload implementation is intentionally excluded because it would be turnkey attack content; the recorded execution outcome remains qualified as reported by the notes.

## Outcome

The notes report a chain from OpenPLC default-credential access to root execution in a container, WPS credential recovery, wireless association, and root access to an adjacent router. Recorded command excerpts support service discovery, wireless discovery, recovered credential fields, DHCP assignment, and an SSH prompt. The notes do not provide independent validation beyond the recorded lab outputs.

## Lessons and Recommendations

- **Recommendation — remove default credentials from ICS interfaces.** Restrict management interfaces to authorized networks and accounts, and review program-upload and execution privileges.
- **Recommendation — disable WPS.** Use modern wireless authentication controls and verify that WPS is unavailable on access points.
- **Recommendation — require authenticated administrative SSH.** Disable passwordless root access; use named administrative accounts and managed key-based authentication.

## References

- Hack The Box lab: [WifineticTwo](https://app.hackthebox.com/machines/WifineticTwo).
