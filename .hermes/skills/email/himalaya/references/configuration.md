# Himalaya Configuration Reference

## Configuration File Location

Platform-specific paths:
- **Linux**: `~/.config/himalaya/config.toml`
- **macOS**: `~/Library/Application Support/himalaya/config.toml`
- **Windows**: `%APPDATA%\himalaya\config.toml`

## Minimal IMAP + SMTP Setup

```toml
[accounts.default]
email = "user@example.com"
display-name = "Your Name"
default = true

# IMAP backend for reading emails
backend.type = "imap"
backend.host = "imap.example.com"
backend.port = 993
backend.encryption.type = "tls"
backend.login = "user@example.com"
backend.auth.type = "password"
backend.auth.raw = "your-password"

# SMTP backend for sending emails
message.send.backend.type = "smtp"
message.send.backend.host = "smtp.example.com"
message.send.backend.port = 587
message.send.backend.encryption.type = "start-tls"
message.send.backend.login = "user@example.com"
message.send.backend.auth.type = "password"
message.send.backend.auth.raw = "your-password"
```

## Password Options

### Raw password (testing only, not recommended)

```toml
backend.auth.raw = "your-password"
```

### Password from command (recommended)

```toml
backend.auth.cmd = "pass show email/imap"
# backend.auth.cmd = "security find-generic-password -a user@example.com -s imap -w"
```

### System keyring (requires keyring feature)

```toml
backend.auth.keyring = "imap-example"
```

Then run `himalaya account configure <account>` to store the password.

## Gmail Configuration

### Option 1: App Passwords (recommended - simpler)

Generate App Passwords at https://myaccount.google.com/apppasswords for each Gmail account. Works with 2FA enabled.

```toml
[accounts.gmail]
email = "you@gmail.com"
display-name = "Your Name"
default = true

backend.type = "imap"
backend.host = "imap.gmail.com"
backend.port = 993
backend.encryption.type = "tls"
backend.login = "you@gmail.com"
backend.auth.type = "password"
backend.auth.raw = "xxxx xxxx xxxx xxxx"  # 16-char App Password

message.send.backend.type = "smtp"
message.send.backend.host = "smtp.gmail.com"
message.send.backend.port = 587
message.send.backend.encryption.type = "start-tls"
message.send.backend.login = "you@gmail.com"
message.send.backend.auth.type = "password"
backend.auth.raw = "xxxx xxxx xxxx xxxx"  # Same App Password
```

### Option 2: Password from command (for pass users)

```toml
[accounts.gmail]
email = "you@gmail.com"
display-name = "Your Name"
default = true

backend.type = "imap"
backend.host = "imap.gmail.com"
backend.port = 993
backend.encryption.type = "tls"
backend.login = "you@gmail.com"
backend.auth.type = "password"
backend.auth.cmd = "pass show google/app-password"

message.send.backend.type = "smtp"
message.send.backend.host = "smtp.gmail.com"
message.send.backend.port = 587
message.send.backend.encryption.type = "start-tls"
message.send.backend.login = "you@gmail.com"
message.send.backend.auth.type = "password"
message.send.backend.auth.cmd = "pass show google/app-password"
```

**Note:** Gmail requires an App Password if 2FA is enabled.

## iCloud Configuration

```toml
[accounts.icloud]
email = "you@icloud.com"
display-name = "Your Name"

backend.type = "imap"
backend.host = "imap.mail.me.com"
backend.port = 993
backend.encryption.type = "tls"
backend.login = "you@icloud.com"
backend.auth.type = "password"
backend.auth.cmd = "pass show icloud/app-password"

message.send.backend.type = "smtp"
message.send.backend.host = "smtp.mail.me.com"
message.send.backend.port = 587
message.send.backend.encryption.type = "start-tls"
message.send.backend.login = "you@icloud.com"
message.send.backend.auth.type = "password"
message.send.backend.auth.cmd = "pass show icloud/app-password"
```

**Note:** Generate an app-specific password at appleid.apple.com

## Folder Aliases

Map custom folder names:

```toml
[accounts.default.folder.alias]
inbox = "INBOX"
sent = "Sent"
drafts = "Drafts"
trash = "Trash"
```

## Multiple Accounts

```toml
[accounts.personal]
email = "personal@example.com"
default = true
# ... backend config ...

[accounts.work]
email = "work@company.com"
# ... backend config ...
```

Switch accounts with `--account`:

```bash
himalaya --account work envelope list
```

## Notmuch Backend (local mail)

```toml
[accounts.local]
email = "user@example.com"

backend.type = "notmuch"
backend.db-path = "~/.mail/.notmuch"
```

## OAuth2 Authentication (for providers that support it)

### Important: OAuth2 requires cargo build

The Homebrew and Scoop installations do NOT include OAuth2 support. To use OAuth2, you must build from source with the oauth2 feature:

```bash
cargo install himalaya --locked --features oauth2
```

### Full OAuth2 Configuration (complex)

Requires Google Cloud Console project, client-id, client-secret, and keyring setup:

```toml
backend.auth.type = "oauth2"
backend.auth.method = "xoauth2"
backend.auth.client-id = "your-client-id"
backend.auth.client-secret.keyring = "gmail-oauth2-client-secret"
backend.auth.access-token.keyring = "gmail-oauth2-access-token"
backend.auth.refresh-token.keyring = "gmail-oauth2-refresh-token"
backend.auth.auth-url = "https://provider.com/oauth/authorize"
backend.auth.token-url = "https://provider.com/oauth/token"
backend.auth.pkce = true
backend.auth.scope = "https://mail.google.com/"
```

Then run the interactive setup:
```bash
himalaya account configure <account-name>
```

This is complex to set up. For Gmail, consider using App Passwords instead.

## Additional Options

### Verifying Account Configuration

After creating or modifying an account, verify it's working:

```bash
# List all configured accounts
himalaya account list

# Test a specific account by listing emails
himalaya envelope list -a <account-name> -s 5
```

This will quickly reveal configuration errors (wrong password, wrong host, etc.).

### Signature

```toml
[accounts.default]
signature = "Best regards,\nYour Name"
signature-delim = "-- \n"
```

### Downloads directory

```toml
[accounts.default]
downloads-dir = "~/Downloads/himalaya"
```

### Editor for composing

Set via environment variable:

```bash
export EDITOR="vim"
```
