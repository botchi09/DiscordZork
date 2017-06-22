console.log("Starting Zork module")

/* cleanUpOutput, recievedGameOutput, sendGameOutput all from:
 * https://github.com/aeolingamenfel/discord-text-adventure-bot/blob/master/MessageHandler.js
 */
const fs = require("fs")
const child_process = require("child_process")
const stringDecoder = require("string_decoder").StringDecoder
const stripAnsi = require('strip-ansi')
const utf8 = require("utf8")
const botLogin = require("./login.json")
const BOT_TOKEN = botLogin.token
const prefix = "!"

const Discord = require("discord.js")
const Queue = require("better-queue")

var frotzExe = process.cwd() + "/dfrotz/dfrotz.exe"
var game = null //Create associative array of games?
var compiledOutput = null

var bot = new Discord.Client({autoReconnect: true, max_message_cache: 0})
bot.login(BOT_TOKEN)

var storyDir = "/stories/"

/* Backlog
- Save and load textChannels
- Download new stories
- Put those damn save files in their own folder if possible

   Current
- Multi user support
*/

var textChannels = []

//Only handle constructor relevant information inside of here immediately
function channelObject(channelId, storyFile) {
	this.frotzQueue = new Queue(function(message, callback) {
		console.log("Sending message to frotz!")
		message.gameProcess.stdin.write(message.message + "\n")
		callback()
	}, {afterProcessDelay: 1000})
	this.channelId = channelId
	this.gameRunning = function() {
		return !this.gameProcess == null
	}
	
	this.destroy = function() {
		this.frotzQueue.destroy()
		this.gameProcess.kill()
	}
	
	//Only actually create the bot process once every piece of constructor is correct
	var storyDir = process.cwd() + storyDir
	
	this.storyError = function(error) {
		botSend(this.channelId, "Something went wrong :")
		botSend(this.channelId, error, {code: true})
		removeChannelObject(this.channelId)
	}

	//TODO: cwd is probably what's putting the save data there...
	this.gameProcess = child_process.spawn(process.cwd() + "/dfrotz/dfrotz.exe", [storyDir + storyFile], {cwd: process.cwd() + "/savedata"})
	this.gameProcess.on("error", this.storyError) //This doesn't seem to be called on frotz error...
	
	//All pieces are in place. Set up stdio hooks.
	this.frotzReady()
	botSend(this.channelId, "Fully loaded and ready! Remember to load your game!")
}

function getChannelObjectFromId(channelId) {
	for (var i=0; i<textChannels.length; i++) {
		if (textChannels[i].channelId === channelId) {
			return textChannels[i]
		}
	}
}

function createChannelObject(channelId, storyFile) {
	textChannels.push(new channelObject(channelId, storyFile))		
}

function removeChannelObject(channelId) {
	var channelObject = getChannelObjectFromId(channelId)
	
	if (channelObject) {
		channelObject.destroy()

		textChannels = textChannels.filter(function(id) {
			return id !== channelId
		})
	}
}

function cleanUpOutput(raw, forDisplay = false){
	var splitRaw = raw.split(/[\n]|[\r]/)
	var output = ""

	for(var x = 0; x < splitRaw.length; x++){
		// if we're cleaning up the output for display, we can skip the last 
		// line as it just contains the ">" prompt
		if(forDisplay && x == splitRaw.length - 1) {
			continue
		}

		var curr = splitRaw[x]

		// For some reason, dfrotz on macOS outputs random dots here and 
		// there...which we can just skip as far as I can tell
		if(curr.trim() !== '.'){
			if(curr[0] === "d") {
				output += curr.substring(1, curr.length).trim()
			} else {
				output += curr.trim()
			}
		}

		if(forDisplay) {
			output += "\n"
		} else {
			output += "\r"
		}
	}

	return output
}

channelObject.prototype.compiledOutput = "" //TODO: Do we actually need to define this? Can we not pass it from func to func?

channelObject.prototype.recievedGameOutput = function(chunk) {
	
	var decoder = new stringDecoder("utf8")
	var decoded = decoder.write(chunk)

	if(decoded.trim() === "") {
		return
	}

	var output = stripAnsi(decoded)
	output = cleanUpOutput(output)

	this.compiledOutput += decoded
	this.sendGameOutput()
	
}

channelObject.prototype.sendGameOutput = function() {
	var unmodifiedOutput = this.compiledOutput
	var finalOutput = stripAnsi(utf8.encode(this.compiledOutput))

	finalOutput.replace("\r", "\n")

	var cleanOutput = cleanUpOutput(finalOutput, true)
	
	finalOutput = cleanOutput
	// lets also make the output monospace
	finalOutput = "```\n" + finalOutput + "\n```"
	
	//For prompt dialogues (e.g. save) cleanUpOutput wipes it for some reason.
	//In this case, just display what we have before data cleaning.
	if (cleanOutput.length == 0) {
		this.frotzReplied(unmodifiedOutput)
	}
	else {
		this.frotzReplied(finalOutput)
	}
	
	this.compiledOutput = ""
}

channelObject.prototype.frotzReplied = function(reply) {
	console.log("Reply:", reply)
	botSend(this.channelId, reply, {code: true})
}

channelObject.prototype.frotzReady = function() {
	console.log("Frotz ready!")
	this.gameProcess.stdout.on('data', (chunk) => {
		this.recievedGameOutput(chunk)
	})
}


//Called by message queue to send message to frotz
channelObject.prototype.sendToFrotz = function(message) {
	//We must push gameProcess so the anonymous func inside Queue works
	this.frotzQueue.push({message: message, gameProcess: this.gameProcess})
}


//Returns object of command and args (string)
function parseCommand(message) {
	if (message.substring(0, prefix.length) === prefix) {
		var parsed = {}
		var firstSpaceIndex = message.indexOf(" ")
		if (firstSpaceIndex == -1) {
			firstSpaceIndex = message.length
		}
		parsed.command = message.substring(prefix.length, firstSpaceIndex).toLowerCase() //Commands in different case with same name is bad idea
		
		var afterFirstSpace = message.substring(firstSpaceIndex + 1)
		
		parsed.string = afterFirstSpace
		parsed.arguments = afterFirstSpace.split(" ")
		
		return parsed
	}
}

function storyFileExists(storyFile) {
	
	try {
		var stats = fs.statSync(process.cwd + storyDir);
		return true
	}
	catch (e) {
		return false
	}
}

function botSend(channelId, message, options) {
	bot.channels.get(channelId).send(message, options)
}

//It's fine do this small operation sync
function getStoryList() {
	var stories = fs.readdirSync(process.cwd() + storyDir)
	console.log("stories:", stories)
	var storyString = ""
	for (var i=0; i<stories.length; i++) {
		if (stories[i] !== "stories.txt") { //Exclude the helper readme
			storyString += "\n" + stories[i]
		}
	}
	
	return storyString
}

bot.on("message", function(message) {
	var userId = message.author.id
	if (!message.author.bot) {
		var command = parseCommand(message.content)
		if (command != null) {
			var channelId = message.channel.id
			
			if (command.command !== "leave") {
				var foundChannelObject = getChannelObjectFromId(channelId)
				
				if (!foundChannelObject) {
					
					if (command.command === "storyload")
					{
						console.log("Being summoned to channel! Creating myself!")
						var storyFile = command.arguments[0]
						if (storyFile != null && storyFile.length > 0) {
							if (storyFileExists(storyFile)) {
								createChannelObject(channelId, storyFile)
								botSend(channelId, "Loading story " + storyFile)
							}
							else {
								botSend(channelId, "I don't have a story called that.")
							}
						}
						else {
							botSend(channelId, "You didn't specify a story file.")
						}
						
					}
					
					if (command.command === "storylist") {
						botSend(channelId, "Let me tell you what I've got installed...")
						botSend(channelId, getStoryList(), {code: true})
					}
					
					if (command.command === "z") {
						botSend(channelId, "Whoa there, give me a story file to work with first.")
					}
				}
				else {
					if (command.command === "storystop") {
						botSend(channelId, "Killing my process and stopping the story...")
						removeChannelObject(channelId)
					}
					
					if (command.command === "z") {
						foundChannelObject.sendToFrotz(command.string)
					}
				}
				
			}
			else {
				console.log("Leaving channel " + channelId)
				removeChannelObject(channelId)
			}
			if (command.command === "help") {
				botSend(channelId, "Your commands are z, storylist, storyload and storystop")
			}
		}
	}
})
 