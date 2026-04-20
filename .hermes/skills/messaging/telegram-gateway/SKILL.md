---
name: telegram-gateway
description: Manage Telegram integration for Hermes gateway
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [macos, linux]
metadata:
  hermes:
    tags: [telegram, messaging, gateway, bot]
---

# Telegram Gateway

Manage Telegram bot integration for Hermes.

## Setup

1. Get bot token from @BotFather
2. Install python-telegram-bot: `pip install python-telegram-bot`
3. Configure bot token in config file

## Run Gateway

```bash
cd ~/.hermes/hermes-agent
source venv/bin/activate
hermes gateway run
```

Gateway runs in polling mode, listening for incoming messages.

## Common Issues

| Issue | Fix |
|-------|-----|
| Missing library | pip install python-telegram-bot |
| Token problems | Check config directly (some terminals mask values) |
| Not responding | Run hermes gateway status |

## Sending Test Messages

Use the python-telegram-bot library directly for tests - see library docs for Bot API usage.

## When to Use

- Testing Telegram setup
- Troubleshooting connectivity
- Sending one-off messages