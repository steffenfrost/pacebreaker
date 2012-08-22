
var express   = require('express');

var app = express.createServer(
	express.logger(),
  express.static(__dirname + '/public'),
  express.bodyParser(),
  express.cookieParser(),
  // set this to a secret value to encrypt session cookies
  express.session({ secret: process.env.SESSION_SECRET || 'secret123' })
);


// listen to the PORT given to us in the environment
var port = process.env.PORT || 3000;

app.listen(port, function() {
  console.log("Listening on " + port);
});

app.get('/', function(req, res){
	console.log(req.params.message);
	res.send("hi, there");
});

//var port = Number(process.env.PORT) || 3000;

var io = require('socket.io').listen(app);
// assuming io is the Socket.IO server object
io.configure(function () { 
  io.set("transports", ["xhr-polling"]); 
  io.set("polling duration", 10); 
});

//console.log(sio);


  
var chat = io
	.of('/chat')
	.on('connection', function (socket) {
	  socket.emit('a message', {
	      that: 'only'
	    , '/chat': 'will get'
	  });
	  chat.emit('a message', {
	      everyone: 'in'
	    , '/chat': 'will get'
	  });
});

var news = io
	.of('/news')
	.on('connection', function (socket) {
	  socket.emit('item', { news: 'item' });
});

