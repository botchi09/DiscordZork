# DiscordZork
A simple discord interactive fiction bot using nodejs and frotz, no real frills.

# Commands
Default prefix is !

storyload [story file] - Loads specified story file in a channel

storylist - Lists installed stories

storystop - Halts and destroys existing running story in channel

z [command] - Forward a text command to bot

help - List possible commands in chat


# config.json
"token" should be specified as your API token
"prefix" defines the command prefix e.g. "!help" has a prefix of "!"

# External dependencies
Default discord.js dependencies

utf8 - Used to transform char output into string

strip-ansi - Removes useless ansi chars from interpreter output

better-queue - Sends commands to interpreter in orderly, non-overwhelming fashion