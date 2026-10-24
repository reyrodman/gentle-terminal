# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.x | ✅ |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's private vulnerability reporting: go to the [Security tab](https://github.com/reyrodman/gentle-terminal/security) and choose **Report a vulnerability**. Include:

- What is affected (launcher, skill policy, runtime pin, documentation that leads to unsafe use)
- Steps to reproduce, with your OS, shell, Node version and MCP client
- The impact you observed or expect

You can expect an acknowledgement within a few days and a status update once the report has been triaged. Please give us a reasonable time to fix the issue before any public disclosure.

## Scope

gentle-terminal is intentionally **not a sandbox**: terminal sessions run with the privileges of the user who starts the MCP server. Reports that an agent can run commands the user could run are expected behavior. In scope:

- The launcher executing anything other than the pinned upstream entry point
- Weaknesses in how the runtime pin or integrity is enforced
- Skill or workflow guidance that would lead an agent to bypass approval prompts, persist approvals, or leak credentials
- Private data or secrets shipped in the repository or packaged archive

Vulnerabilities in [terminal-use](https://github.com/computer-agent-labs/terminal-use) itself should be reported to that project; we will update the pin once a fix is released.
