#!/usr/bin/osascript

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Invert Scroll
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 🖱️

# Documentation:
# @raycast.description Will invert the scroll direction
# @raycast.author lucasfth
# @raycast.authorURL https://raycast.com/lucasfth

do shell script "open x-apple.systempreferences:com.apple.Trackpad-Settings.extension"tell application "System Events"	tell application process "System Settings"		repeat until window 1 exists			delay 0.1		end repeat				click radio button 2 of tab group 1 of group 1 of group 3 of splitter group 1 of group 1 of window 1		delay 0.5				click checkbox 1 of group 1 of scroll area 1 of group 1 of group 3 of splitter group 1 of group 1 of window 1	end tellend tell

tell application "System Settings" to quit
