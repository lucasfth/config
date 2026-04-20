---
name: apple-calendar
description: Query Apple Calendar events via AppleScript/osascript. Supports recurring events, date filtering, and multi-calendar queries.
version: 1.0.0
author: Hermes Agent
metadata:
  hermes:
    tags: [Apple, Calendar, macOS, osascript, events]
    related_skills: [apple-reminders, apple-notes]
---

# Apple Calendar Query

Query Apple Calendar events using `osascript` via the Calendar app's AppleScript interface.

## Key Properties

- **summary** — event title
- **start date** / **end date** — event times
- **recurrence** — RRULE string (e.g., `FREQ=WEEKLY;INTERVAL=1;BYDAY=FR`) or `missing value` for one-off events
- **name of calendar** — which calendar the event belongs to

## Get All Events (Next 2 Weeks)

```python
script = '''
tell application "Calendar"
    set now to current date
    set twoWeeksLater to now + (14 * days)
    set calEvents to events of calendar "Default - Google" where (start date >= now) and (start date < twoWeeksLater)
    repeat with e in calEvents
        log summary of e & " | " & (start date of e as string) & " | " & (recurrence of e as string)
    end repeat
end tell
'''
result = subprocess.run(['osascript', '-e', script], capture_output=True, text=True)
print(result.stdout)
```

## Get Events for Tomorrow (Relative Date)

```python
script = '''
set tomorrow to (current date) + (1 * days)
set dayAfterTomorrow to tomorrow + (1 * days)

set output to ""
tell application "Calendar"
    set c to calendar "CALENDAR_NAME"
    set calEvents to events of c where (start date >= tomorrow) and (start date < dayAfterTomorrow)
    repeat with e in calEvents
        set output to output & summary of e & " | " & start date of e & "
"
    end repeat
end tell
return output
'''
result = subprocess.run(['osascript', '-e', script], capture_output=True, text=True)
print(result.stdout)
```

## List All Calendar Names

```bash
osascript -e 'tell application "Calendar" to get name of every calendar'
```

## Find Recurring Events

Search for events with a recurrence rule to find weekly/monthly patterns:

```python
script = '''
tell application "Calendar"
    set c to calendar "CALENDAR_NAME"
    set now to current date
    set twoWeeksLater to now + (14 * days)
    set calEvents to events of c where (start date >= now) and (start date < twoWeeksLater)
    repeat with e in calEvents
        set rec to recurrence of e
        if rec is not missing value then
            log summary of e & " || " & rec
        end if
    end repeat
end tell
'''
```

## Parse RRULE for Next Occurrences

When you find a recurring event (e.g., `FREQ=WEEKLY;INTERVAL=1;BYDAY=FR` = every Friday), calculate the next occurrence manually:

```python
from datetime import datetime, timedelta

# Last occurrence known
last_friday = datetime(2026, 3, 27, 8, 0, 0)

# Calculate next Friday (1 week later)
next_friday = last_friday + timedelta(weeks=1)
# For April 17: 2026-04-17 08:00
```

## Critical: Date Syntax

**NEVER use hardcoded AppleScript dates** like `date "April 17, 2026"` or `date "Friday, April 17, 2026 at 00:00:00"` — they cause `Invalid date and time` errors. 

**Always use relative dates via day offset:**
```bash
# Run script with day offset: osascript get_events.scpt -7  (7 days ago)
# osascript get_events.scpt 1  (tomorrow)
```

The working approach uses a parameter passed to the script:
```applescript
on run argv
    if (count of argv) = 0 then
        set dayOffset to 0
    else
        set dayOffset to (item 1 of argv) as integer
    end if
    
    set now to current date
    set targetDate to now + (dayOffset * days)
    set dayAfter to targetDate + (1 * days)
    ...
end run
```

## Working Script Template (Tested)

This script works correctly and handles all the quirks:

```applescript
-- get_events.scpt - Query Apple Calendar for a specific date
on run argv
    if (count of argv) = 0 then
        set dayOffset to 0
    else
        set dayOffset to (item 1 of argv) as integer
    end if
    
    set now to current date
    set targetDate to now + (dayOffset * days)
    set dayAfter to targetDate + (1 * days)
    
    set output to "Events on " & date string of targetDate & ":
"
    set results to {}
    
    tell application "Calendar"
        -- Query each calendar individually (faster, more reliable)
        set calendarsToQuery to {"Kalender", "Default - Google", "lh@ecoray.dk", "CampusCup", "Scrollbar"}
        
        repeat with calName in calendarsToQuery
            try
                set es to events of calendar calName where (start date >= targetDate) and (start date < dayAfter)
                repeat with evt in es
                    try
                        set end of results to {summary of evt, start date of evt, end date of evt, calName}
                    on error
                        -- Skip events that cause property access errors
                    end try
                end repeat
            on error
                -- Skip calendars that fail
            end try
        end repeat
    end tell
    
    if (count of results) = 0 then
        set output to output & "(No events)
"
    else
        repeat with r in results
            set evtSummary to item 1 of r
            set evtStart to item 2 of r
            set evtEnd to item 3 of r
            set calendarName to item 4 of r
            try
                set output to output & "- " & calendarName & ": " & evtSummary & " (" & time string of evtStart & " - " & time string of evtEnd & ")
"
            on error
                set output to output & "- " & calendarName & ": " & evtSummary & "
"
            end try
        end repeat
    end if
    
    return output
end run
```

**IMPORTANT AppleScript gotchas:**
- Variable names like `st`, `e`, `en` cause syntax errors — use longer names like `evtStart`, `evt`, `evtEnd`
- Some events have corrupted/missing properties — wrap in try/catch
- The `where` clause DOES expand recurring events correctly when querying a date range
- Query calendars individually, not all at once with `events of (every calendar)` — that's very slow

## Recurring Events

The `where` clause DOES expand recurring events for the queried date range. If an event isn't appearing, it's likely because:
1. The recurring event's master instance is outside your query range
2. The calendar name is wrong (check with `osascript -e 'tell application "Calendar" to get name of every calendar'`)

Example: Querying April 9 with the working script correctly shows Ecoray (8 AM - 4 PM, weekly on Fri) because the `where` clause expands it.

## RRULE Reference

When inspecting recurring events directly:
- `FREQ=WEEKLY;INTERVAL=1;BYDAY=FR` = every Friday
- `FREQ=WEEKLY;INTERVAL=1;BYDAY=WE,TH,FR` = Wed/Thu/Fri
- `recurrence of e` returns `missing value` for non-recurring events

## Performance: Query Calendars Individually

**CORRECT approach:** Query each named calendar individually with the `where` clause:
```applescript
set calendarsToQuery to {"Kalender", "Default - Google", "lh@ecoray.dk", "CampusCup", "Scrollbar"}

repeat with calName in calendarsToQuery
    try
        set es to events of calendar calName where (start date >= targetDate) and (start date < dayAfter)
        -- process events
    on error
        -- skip
    end try
end repeat
```

**SLOW approach (avoid):** `events of (every calendar)` is extremely slow and can timeout.

## Common Issues

| Issue | Fix |
|-------|-----|
| `Invalid date and time` | Use `(current date) + (dayOffset * days)` — NEVER hardcoded dates |
| `Expected class name` error | AppleScript syntax error — likely variable name conflict (see below) |
| `Can't make time string of...` | Event has corrupted properties — wrap in try/catch |
| Recurring event not in query | Use the working script template with `where` clause |
| Timeout on large query | Query calendars individually, not all at once |
| Calendar name with spaces | Use quoted name: `calendar "Default - Google"` |

**Variable naming gotcha:** Short variable names like `e`, `st`, `en`, `r` cause AppleScript syntax errors (`Expected expression but found "e"`). Use longer names like `evt`, `evtStart`, `evtEnd`, `evtSummary`, `resultItem`.

## Example: Tomorrow's Full Schedule

```python
script = '''
set tomorrow to (current date) + (1 * days)
set dayAfterTomorrow to tomorrow + (1 * days)

set output to "EVENTS FOR TOMORROW:
"

tell application "Calendar"
    set allCalNames to {"Kalender", "Default - Google", "Fødselsdage", "Helligdage", "lh@ecoray.dk", "CampusCup", "Scrollbar"}
    
    repeat with calName in allCalNames
        try
            set c to calendar calName
            set calEvents to events of c where (start date >= tomorrow) and (start date < dayAfterTomorrow)
            repeat with e in calEvents
                set output to output & "- " & calName & ": " & summary of e & " at " & time string of (start date of e) & "
"
            end repeat
        on error
            -- Skip this calendar if it fails
        end try
    end repeat
end tell

return output
'''
result = subprocess.run(['osascript', '-e', script], capture_output=True, text=True)
print(result.stdout)
```

## Notes

- Uses macOS Calendar app (must be signed in and syncing)
- Google Calendar events appear in "Default - Google" calendar
- Event IDs returned by osascript are internal Calendar IDs
- Queries are fast for small date ranges but can be slow for very large ranges