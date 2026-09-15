---
title: "Soccer: Web Application Access to dstat Privilege Escalation"
description: "Default credentials on exposed file-management software and an executable upload provide a web-service shell; WebSocket SQL injection recovers an SSH credential, and a doas rule for dstat is abused through plugin loading to reach root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - web-security
  - websocket
  - sql-injection
  - privilege-escalation
---

## Summary

Soccer is a retired Hack The Box Linux lab. The notes report a chain from exposed file-management software through a WebSocket SQL injection issue to privileged execution via a restricted `doas` rule. Target identifiers, account names, credentials, and flags are replaced with role-based placeholders.

## Context and Objective

The notes describe SSH, HTTP, and a service on port 9091. HTTP redirected to a hostname-based virtual host, and later local configuration review exposed a second application virtual host. Objective: assess documented paths from web access to privileged execution within the lab.

## Approach and Evidence

### Service and content discovery

**Observation:** The notes report SSH, HTTP, and an unidentified service on port 9091; HTTP redirected to a hostname-based site.

**Action:** Enumeration used a TCP scan and content discovery against the HTTP virtual host.

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN <SCAN_OUTPUT>
feroxbuster --url http://<PRIMARY_VHOST> --wordlist <WORDLIST> -o <CONTENT_OUTPUT>
```

```text
22/tcp   open  ssh
80/tcp   open  http
9091/tcp open  <UNIDENTIFIED_SERVICE>
301      GET   /tiny => /tiny/
```

**Significance:** The redirect and discovered path narrowed review to virtual-host handling and the exposed file-management interface.

**Sourced result:** The notes report that the interface accepted its documented default credentials and displayed a successful login message.

### File upload execution

**Observation:** The notes report that the upload directory executed PHP files and that a benign test exposed server-side execution functions.

**Action:** A listener was prepared, then an uploaded PHP file was requested using a sanitized placeholder pattern.

```bash
nc -lvnp <LISTENER_PORT>
curl http://<PRIMARY_VHOST>/tiny/uploads/<UPLOADED_PHP>
```

```text
uid=<WEB_UID>(<WEB_ACCOUNT>) gid=<WEB_GID>(<WEB_ACCOUNT>) groups=<WEB_GROUPS>
```

**Significance:** Executable uploads converted administrative file access into code execution under the web-service account.

**Sourced result:** The notes report an interactive shell as the web-service account.

### Local configuration review

**Observation:** Local socket and web-server configuration inspection showed a loopback database listener and a second enabled virtual host.

**Action:** The notes used socket inspection and listed enabled web-server sites.

```bash
ss -tulpn
ls -la /etc/nginx/sites-enabled/
```

```text
tcp LISTEN <QUEUE> <BACKLOG> <LOOPBACK_ADDRESS>:3306 <WILDCARD_ADDRESS>:*
<DEFAULT_SITE>
<SECONDARY_SITE>
```

**Significance:** Configuration review identified an application surface not visible from initial external enumeration.

**Sourced result:** The notes report that the secondary virtual host provided login, signup, and ticket-checking functionality.

### WebSocket ticket-checking injection

**Observation:** The notes report that ticket checks used a WebSocket message on port 9091 and that its identifier field was SQL-injectable.

**Action:** A local proxy translated a parameterized HTTP request into a WebSocket message for assessment.

```bash
sqlmap-websocket-proxy -u ws://<SECONDARY_VHOST>:9091 -d '{"id":"%param%"}' -H "Origin: http://<SECONDARY_VHOST>"
sqlmap -u "http://localhost:<PROXY_PORT>/?param=1" --dump
```

```text
Database: <APPLICATION_DATABASE>
Table: <ACCOUNT_TABLE>
| <ID> | <EMAIL> | <LAB_USER_PASSWORD> | <LAB_USER> |
```

**Significance:** The database result supplied a separate authentication artifact for the documented SSH access stage.

**Sourced result:** The notes report that the recovered credential authenticated as `<LAB_USER>` over SSH.

### Privileged dstat execution

**Observation:** The notes report a `doas` policy allowing `<LAB_USER>` to run `dstat` as root without a password. They also report that `dstat` loads external Python plugins.

**Action:** The notes used configuration discovery, then invoked the approved program with a plugin-name placeholder.

```bash
find / -name "doas*" 2>/dev/null
doas -u root /usr/bin/dstat --<PLUGIN_NAME>
```

```text
permit nopass <LAB_USER> as root cmd /usr/bin/dstat
root
```

**Significance:** A rule restricted to one executable can still permit arbitrary code execution when that executable loads user-controlled extensions.

**Sourced result:** The notes report that plugin loading through the permitted `dstat` command produced a root shell.

## Challenges and Decisions

The notes report two pivots: local web-server configuration revealed the secondary virtual host, and a WebSocket-to-HTTP proxy made the ticket identifier testable with the selected SQL-injection tooling. They also show why reviewing a permitted binary's extension behavior matters more than evaluating its command name alone.

## Outcome

The notes report complete lab compromise: default access to exposed file-management software led to web-service execution; configuration discovery exposed an injectable WebSocket workflow; recovered database credentials enabled SSH access; and the `doas`-permitted `dstat` plugin mechanism led to root. The draft does not independently reproduce these results.

## Lessons and Recommendations

- **Recommendation:** Remove default credentials from administrative software and restrict administrative interfaces to trusted access paths.
- **Recommendation:** Store uploads outside executable paths, or explicitly deny server-side execution there.
- **Recommendation:** Apply parameterized queries and input validation to WebSocket messages as well as HTTP requests.
- **Recommendation:** Review `sudo` and `doas` allowlists for scripting, plugin, and extension features in permitted programs.

## References

- Hack The Box, *[Soccer](https://app.hackthebox.com/machines/Soccer)* retired machine lab.
