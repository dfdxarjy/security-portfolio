---
title: "Broker: ActiveMQ Exposure and Unsafe Daemon Sudo"
description: "An Apache ActiveMQ deployment with a vulnerable OpenWire service and default console credentials yields a service-account shell; unrestricted nginx sudo enables a root file-write path."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - activemq
  - sudo
  - configuration-security
---

## Summary

This Hack The Box Linux lab exposed an Apache ActiveMQ deployment with a vulnerable OpenWire service and default console credentials. The notes report a resulting service-account shell. An unrestricted sudo rule for nginx then permitted a root file-write path. Target details and all payload material are omitted.

## Context and Objective

Service enumeration identified SSH, HTTP, multiple messaging protocols, management HTTP, and ActiveMQ OpenWire. Objective: assess exposed broker services and privilege boundaries available to the service account.

## Approach and Evidence

### Broker exposure

Observation: recorded scanning identified ActiveMQ OpenWire 5.15.15 and a management interface.

```bash
nmap -Pn -sC -sV -oN <SCAN_OUTPUT> <TARGET>
```

```text
8161/tcp  open  http       Jetty
61616/tcp open  apachemq   ActiveMQ OpenWire transport 5.15.15
```

Action: notes recorded successful management-console access with default credentials and identified CVE-2023-46604 in the exposed OpenWire version. Technical significance: management defaults and vulnerable unauthenticated protocol exposure each expand attack surface.

### Service-account access

Observation: source notes report exploiting CVE-2023-46604 through OpenWire to execute code as the broker service account. The original remote-fetch and reverse-shell payload are deliberately omitted as turnkey content.

```text
Recorded result: <SERVICE_ACCOUNT>@<HOST>:<WORKING_DIRECTORY>$
```

Action: used resulting access to inspect sudo policy.

```bash
sudo -l
```

```text
User <SERVICE_ACCOUNT> may run the following commands:
    (ALL : ALL) NOPASSWD: /usr/sbin/nginx
```

Result: sudo allowed the daemon binary as root without an authentication prompt.

### Daemon configuration boundary

Observation: nginx accepts a caller-selected configuration file, and its configuration can control process identity and write-capable modules.

```bash
sudo /usr/sbin/nginx -c <CONFIG_PATH>
```

```text
Recorded result: root-owned nginx instance started with supplied configuration.
```

Action: notes report using this control to create a root-authorized SSH access path. Specific configuration and key-write commands are omitted because they create an attack-ready root file-write chain. Technical significance: sudo access to configurable daemons is equivalent to broad privileged execution when configuration controls process behavior.

## Outcome

The notes establish a documented path from exposed ActiveMQ services to a service account, followed by root-level impact through nginx sudo access. Shell and escalation outcomes are reported by the source; credential and target details are excluded.

## Lessons and Recommendations

- Patch or isolate vulnerable message-broker protocols and remove unnecessary network exposure.
- Replace default management credentials and restrict management interfaces to trusted administration networks.
- Avoid sudo rules for general-purpose daemon binaries; use tightly scoped wrappers where privileged operations are necessary.
- Review daemon configuration directives that affect user identity, filesystem scope, and write methods.

## References

- Hack The Box, [Broker](https://app.hackthebox.com/machines/Broker) machine.
