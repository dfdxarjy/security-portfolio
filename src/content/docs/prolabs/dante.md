---
title: "Hack The Box Pro Labs: Dante"
description: "Completion of Hack The Box Pro Labs: Dante, with the issued certificate."
---

After getting tired of working through isolated machines, I wanted something larger where I could sharpen my skills in a multi-machine, enterprise-style environment.

Dante was my first Hack The Box Pro Lab. I chose it because it is generally considered one of the more beginner-friendly Pro Labs and seemed like the natural place to start before moving into more Active Directory-heavy environments.

Going into Dante, I already had experience compromising individual Linux and Windows machines, but working through an entire network is different. Getting root or SYSTEM on one machine is no longer necessarily the end goal. Sometimes it is just the beginning of the next stage.

That change in mindset was probably the most valuable part of the lab.

Dante felt less like a realistic red-team operation and more like a large practical test of different penetration-testing techniques. It forces you to combine enumeration, exploitation, privilege escalation and lateral movement instead of treating each skill separately.

## Pivoting and tunneling

The biggest new skill I had to properly learn during Dante was pivoting.

Once internal networks and machines are no longer directly reachable from your attacking machine, simply finding a vulnerability is not enough. You also have to understand how traffic is moving through the environment and how to reach the next target.

I ended up using **Ligolo-ng** extensively throughout the lab.

It quickly became one of my favourite tools for tunneling because it allowed me to interact with internal networks much more naturally than some of the SOCKS/proxy-based approaches I had used before.

Dante was where pivoting stopped being something I understood theoretically and became something I was actually comfortable doing repeatedly.

It also taught me the importance of keeping track of:

- Network segments
- Compromised hosts
- Credentials
- Routes and pivots
- Privilege levels
- Potential attack paths

Once a network becomes larger, good enumeration and documentation become almost as important as exploitation itself.

## What I learned

During Dante I got practical experience with:

- Network pivoting and tunneling
- Lateral movement
- Windows privilege escalation
- Linux privilege escalation
- Buffer overflows
- Public exploit research
- Web application attacks
- Credential reuse
- Multi-host enumeration
- Maintaining access across several network segments

## Conclusion

Dante was a very good introduction to multi-machine penetration testing.

The individual vulnerabilities were not always the difficult part. The challenge was understanding how the machines connected together and learning how to continue moving after compromising the first host.

More than anything, Dante improved my methodology.

Instead of thinking:

**find machine → exploit machine → root machine → finished**

I started thinking in terms of:

**enumerate → compromise → understand position → pivot → enumerate again → continue the attack path**

That change in mindset prepared me much better for the Pro Labs that came next.

## Credential

This page records my completion of **Hack The Box Pro Labs: Dante**, issued by
Hack The Box.

## Certificate

<iframe
  class="credential-certificate"
  src="/assets/training/dante/Dante.pdf"
  title="Hack The Box Pro Labs: Dante certificate PDF (embedded viewer)"
  loading="lazy"
></iframe>

Fallback link if the embedded viewer does not render:
[Hack The Box Pro Labs: Dante certificate](/assets/training/dante/Dante.pdf).

## References

- [Hack The Box](https://www.hackthebox.com/) — the platform that issues this credential.
