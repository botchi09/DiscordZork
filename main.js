console.log("Starting Zork module")

/* cleanUpOutput, recievedGameOutput, sendGameOutput all from:
 * https://github.com/aeolingamenfel/discord-text-adventure-bot/blob/master/MessageHandler.js
 */
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

var frotzQueue = null

function createQueues() {
	//Message queue so as not to overwhelm child proc
	frotzQueue = new Queue(function(message, callback) {
		console.log("Sending message to frotz!")
		game.stdin.write(message + "\n")
		callback()
	}, {afterProcessDelay: 1000})
	//Unfortunately it isn't possible to find status of stdin. Assume reasonable processing time of 1s.
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

function recievedGameOutput(chunk) {
	
	var decoder = new stringDecoder("utf8")
	var decoded = decoder.write(chunk)

	if(decoded.trim() === "") {
		return
	}

	var output = stripAnsi(decoded)
	output = cleanUpOutput(output)

	compiledOutput += decoded
	//frotzReplied(compiledOutput)
	// this marks the end of input
	//if(output.match(/(>\r)/)) {
		sendGameOutput()
	//}
}

function sendGameOutput() {
	var unmodifiedOutput = compiledOutput
	var finalOutput = stripAnsi(utf8.encode(compiledOutput))

	finalOutput.replace("\r", "\n")

	var cleanOutput = cleanUpOutput(finalOutput, true)
	
	finalOutput = cleanOutput
	// lets also make the output monospace
	finalOutput = "```\n" + finalOutput + "\n```"
	
	//For prompt dialogues (e.g. save) cleanUpOutput wipes it for some reason.
	//In this case, just display what we have before data cleaning.
	if (cleanOutput.length == 0) {
		frotzReplied(unmodifiedOutput)
	}
	else {
		frotzReplied(finalOutput)
	}
	
	compiledOutput = ""
}

function frotzReady() {
	console.log("Frotz ready!")
	game.stdout.on('data', (chunk) => {
		recievedGameOutput(chunk)
	})
}

function frotzReplied(reply) {
	console.log(reply)
	bot.channels.get(replyChannel).send(reply, {code: true})
}

//Called by message queue to send message to frotz
function sendToFrotz(message) {
	console.log("sent:", message)
	frotzQueue.push(message)
	console.log(frotzQueue.length)
}

function initFrotz(storyFile) {
	var storyDir = process.cwd() + "/stories/"
	/*exec(frotzExe + " " + process.cwd() + "/stories/" + storyFile, (err, stdout, stderr) => {
		if (err) {
			console.error(err)
			return
		}
		console.log(stdout)
		frotzReady()
	})*/
	game = child_process.spawn("dfrotz/dfrotz.exe", [storyDir + storyFile], {cwd: process.cwd()})
	frotzReady()
	
}

//Returns object of command and args (string)
function parseCommand(message) {
	if (message.substring(0, prefix.length) === prefix) {
		var parsed = {}
		var firstSpaceIndex = message.indexOf(" ")
		if (firstSpaceIndex == -1) {
			firstSpaceIndex = message.length
		}
		parsed.command = message.substring(prefix.length, firstSpaceIndex)
		parsed.arguments = message.substring(firstSpaceIndex + 1)
		
		return parsed
	}
}

function gameRunning() {
	return game != null
}

var replyChannel = null //Lazy way to do it! Figure out some kind of "zork subscribe and unsubscribe" system


function terminateZork() {
	
}

bot.on("message", function(message) {
	var userId = message.author.id
	if (!message.author.bot) {
		var command = parseCommand(message.content)
		if (command != null) {
			
			if (command.command !== "leave") {
				
				//Work on command processing for general purpose easy lib
				if (command.command === "z") {
					if (!gameRunning()) {
						console.log("Starting zork!")
						replyChannel = message.channel.id
						initFrotz("zork1.z5")

					}
					else
					{
						sendToFrotz(command.arguments)
					}
				}
			}
			else {
				console.log("Leaving channel...")
				//leaveChannel()
				terminateZork()
			}
		}
	}
})



createQueues()

 