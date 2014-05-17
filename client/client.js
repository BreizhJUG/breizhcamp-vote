/**
 * Node file for client poll machine
 */
var debug = process.env.DEBUG,
	button = debug ? require('./modules/button_virtual.js') : require('./modules/button.js'),
	lcd = debug ? require('./modules/lcd_virtual.js') : require('./modules/lcd.js'),
	scheduleReader = require('./modules/schedule.js'),
	votes = require('./modules/votes.js')(),
	moment = require('moment');

/**
 * State of the vote machine. Could be the following state :
 * - init: init mode (opening database, getting current session...)
 * - voting: voting in progress (displaying current session, time left for voting, and votes count)
 * - voted: the user has just vote, displaying confirmation message and blocking for 2 seconds
 * @type {string}
 */
var state = 'init';

/** Number of cols on the LCD screen */
var nbCols = 20;

/** Room's name of the polling box */
var room = 'Ouessant';

/** Current voting session */
var currentSession;

var screen = lcd('/dev/i2c-1', 0x27, 4, 20),
	greenButton = button(23),
	redButton = button(24),
	schedule = scheduleReader('schedule.json');

/** Display current voting session on the LCD screen */
function displayCurrentSession() {
	if (state != 'voting') return;

	schedule.getCurrentSession(room).then(function(session) {
		currentSession = session;

		screen.goto(0,0);
		screen.print(currentSession.title.substr(0, nbCols * 2));
		displayRemainingTime();

		return votes.getCount(session.id);

	}).then(function(votes) {
		currentSession.m = votes.m;
		currentSession.p = votes.p;
		displayVoteCount();

		setTimeout(displayCurrentSession, 3000);
	});
}

/** Display the voting remaining time on the LCD screen */
function displayRemainingTime() {
	var nbMinLeft = moment(currentSession.endVote).diff(moment(), 'minutes');
	if (nbMinLeft <= 0) {
		displayCurrentSession();
		return;
	}
	screen.goto(0,2);
	screen.print(('Reste ' + nbMinLeft + 'min de vote  ').substr(0, nbCols));
}

/** Display current vote count on the LCD screen */
function displayVoteCount() {
	screen.goto(0,3);
	screen.print(('   Nb votes : ' + (currentSession.m + currentSession.p) + '     ').substr(0, nbCols));
}

/**
 * Function to call when a user push a button during the voting mode
 * @param vote numeric Vote value: -1 or 1
 */
function userVoted(vote) {
	console.log("User vote [" + vote + "]");

	state = 'voted';
	screen.goto(0,2);
	screen.print("       A VOTE       ");

	votes.addVote(currentSession.id, vote);
	if (vote == 1) {
		currentSession.p++;
	} else {
		currentSession.m++;
	}
	displayVoteCount();

	setTimeout(function() {
		state = 'voting';
		displayRemainingTime();
	}, 800);
}

//--- BINDING BUTTONS ---
greenButton.events().on('released', function(){
	if (state == 'voting') {
		userVoted(1);
	}
});

redButton.events().on('released', function(){
	if (state == 'voting') {
		userVoted(-1);
	}
});

//--- VOTE INITIALISATION ---
votes.start().then(function() {
	//database opened successfully, switching to voting mode
	state = 'voting';

	displayCurrentSession();
});


setInterval(function() {
	if (state == 'voting') {
		votes.getCount(currentSession.id).then(function(data) {
			console.log("-: " + data.m + " | +: " + data.p);
		});
//		votes.listVotes(1399592105779, function(votes) {
//			console.log(votes);
//		});
	}
}, 3000);