---
title: "Hack The Box Mini Pro Labs: Mythical"
description: "Completion of Hack The Box Mini Pro Labs: Mythical, with the issued certificate."
---

After using Mythic C2 during Offshore, I wanted to spend more time with the framework in an environment where C2 operation was one of the main parts of the lab rather than something I introduced myself.

That made Mythical an obvious next choice.

Unlike a traditional Hack The Box machine where the first objective is finding a way into the environment, Mythical starts from an assumed-breach position with access already established inside the network.

Because of that, the challenge begins after initial access.

Instead of asking:

**How do I get into the network?**

The question becomes:

**What can I do with the access I already have?**

That made Mythical feel much closer to the operator-style workflow I had started experimenting with during Offshore.

## Becoming more comfortable with Mythic

Offshore was where I first started seriously using Mythic as a C2 framework.

Mythical gave me the opportunity to focus on it much more directly.

Rather than treating Mythic simply as another way to obtain a shell, I spent more time understanding how to actually operate through the framework.

That meant becoming more comfortable with:

- Callbacks
- Agents
- Tasking
- Session management
- Running tooling through the C2
- Post-exploitation
- Maintaining situational awareness
- Managing access across several systems

The biggest difference compared with my earlier penetration-testing workflow was that I was no longer opening another reverse shell every time I compromised something.

The C2 became the central place from which I managed the engagement.

That sounds like a small change, but it changes the way you think about the environment.

## Active Directory attack paths

Mythical is still heavily focused on Active Directory.

The environment required careful enumeration and understanding how the access I already had could be converted into more privileged access.

This included working with areas such as:

- Active Directory enumeration
- Credential discovery
- Lateral movement
- Privilege escalation
- Domain relationships
- Active Directory Certificate Services
- MSSQL-related attack paths
- Moving through trust boundaries

The lab reinforced something I had already learned from Zephyr and Offshore:

**Access by itself is not particularly useful unless you understand what that access allows you to reach next.**

Having a C2 agent running does not automatically give you an attack path.

You still need to enumerate properly and understand the environment.

## C2 is not a replacement for methodology

One of the most useful lessons from Mythical was that using a C2 framework does not replace the fundamentals.

It is easy to look at a framework such as Mythic and focus on all of the capabilities it provides.

But the framework does not tell you which account matters.

It does not automatically identify the important trust relationship.

It does not decide which credentials are useful.

It does not understand the attack path for you.

The same methodology still applies:

**enumerate → understand access → identify an attack path → execute → enumerate again**

The C2 simply gives you a much better platform for managing that process.

## What I learned

Mythical helped me improve my understanding of:

- Mythic C2
- C2-based post-exploitation
- Agent and callback management
- Active Directory enumeration
- Active Directory Certificate Services
- MSSQL attack paths
- Credential discovery
- Lateral movement
- Privilege escalation
- Trust relationships
- Operating from an assumed-breach position
- Managing an engagement through a C2 framework

## Conclusion

Mythical was a short lab, but it was especially useful because of how focused it was.

Offshore was where I first started experimenting with Mythic.

Mythical was where I became considerably more comfortable actually operating through it.

Instead of thinking of Mythic as simply another method for getting command execution, I started treating it as the platform through which the engagement was being managed.

That distinction was probably the most important thing I took away from the lab.

It also reinforced that regardless of how powerful the tooling becomes, successful Active Directory exploitation still comes back to enumeration, understanding relationships, and recognising what your current access actually gives you.

## Credential

This page records my completion of **Hack The Box Mini Pro Labs: Mythical**, issued by
Hack The Box.

## Certificate

<iframe
  class="credential-certificate"
  src="/assets/training/mythical/mythical.pdf"
  title="Hack The Box Mini Pro Labs: Mythical certificate PDF (embedded viewer)"
  loading="lazy"
></iframe>

Fallback link if the embedded viewer does not render:
[Hack The Box Mini Pro Labs: Mythical certificate](/assets/training/mythical/mythical.pdf).

## References

- [Hack The Box](https://www.hackthebox.com/) — the platform that issues this credential.
