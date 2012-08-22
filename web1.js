var async     = require('async');
var express   = require('express');
var util      = require('util');
var io        = require('socket.io');
var cradle    = require("cradle");
var geojs     = require("geojs");
var settings  = require("./settings");    
var SimpleGeo = require("simplegeo-client").SimpleGeo;


// create an express webserver
var app = express.createServer(
  express.logger(),
  express.static(__dirname + '/public'),
  express.bodyParser(),
  express.cookieParser(),
  // set this to a secret value to encrypt session cookies
  express.session({ secret: process.env.SESSION_SECRET || 'secret123' }),
  require('faceplate').middleware({
    app_id: process.env.FACEBOOK_APP_ID,
    secret: process.env.FACEBOOK_SECRET,
    scope:  'user_likes,user_photos,user_photo_video_tags'
  })
);

// Socket IO 
var sio = io.listen(app);

// listen to the PORT given to us in the environment
var port = process.env.PORT || 3000;

app.listen(port, function() {
  console.log("Listening on " + port);
});


app.dynamicHelpers({
  'host': function(req, res) {
    return req.headers['host'];
  },
  'scheme': function(req, res) {
    req.headers['x-forwarded-proto'] || 'http'
  },
  'url': function(req, res) {
    return function(path) {
      return app.dynamicViewHelpers.scheme(req, res) + app.dynamicViewHelpers.url_no_scheme(path);
    }
  },
  'url_no_scheme': function(req, res) {
    return function(path) {
      return '://' + app.dynamicViewHelpers.host(req, res) + path;
    }
  },
});

function render_page(req, res) {
  req.facebook.app(function(app) {
    req.facebook.me(function(user) {
      res.render('index.ejs', {
        layout:    false,
        req:       req,
        app:       app,
        user:      user
      });
    });
  });
}

function handle_facebook_request(req, res) {

  // if the user is logged in
  if (req.facebook.token) {

    async.parallel([
      function(cb) {
        // query 4 friends and send them to the socket for this socket id
        req.facebook.get('/me/friends', { limit: 4 }, function(friends) {
          req.friends = friends;
          cb();
        });
      },
      function(cb) {
        // query 16 photos and send them to the socket for this socket id
        req.facebook.get('/me/photos', { limit: 16 }, function(photos) {
          req.photos = photos;
          cb();
        });
      },
      function(cb) {
        // query 4 likes and send them to the socket for this socket id
        req.facebook.get('/me/likes', { limit: 4 }, function(likes) {
          req.likes = likes;
          cb();
        });
      },
      function(cb) {
        // use fql to get a list of my friends that are using this app
        req.facebook.fql('SELECT uid, name, is_app_user, pic_square FROM user WHERE uid in (SELECT uid2 FROM friend WHERE uid1 = me()) AND is_app_user = 1', function(result) {
          req.friends_using_app = result;
          cb();
        });
      }
    ], function() {
      render_page(req, res);
    });

  } else {
    render_page(req, res);
  }
}

mapchat = {
    subscriptions: [],
    
    subscribe:function(client, msg){

        bottomlatlng = new geojs.latLng(msg.bounds[0][1], msg.bounds[0][0]);
        toplatlng = new geojs.latLng(msg.bounds[1][1], msg.bounds[1][0]);
        bounds = new geojs.bounds(bottomlatlng, toplatlng);
        
        var allReadySubscribed = false;
        for(s in mapchat.subscriptions){
            if(mapchat.subscriptions[s].client.sessionId == client.sessionId){
                allReadySubscribed = true;

                //Set new bounds.
                mapchat.subscriptions[s].bounds = bounds
                break;
            }
        }
        if(!allReadySubscribed){
            mapchat.subscriptions.push({client:client,
                                        bounds:bounds});
            mapchat.sendChatClusters(client);
        }
        bbox = bounds.toBoundsArray().join(",");
        // db.spatial("geo/recentPoints", {"bbox":bbox},
        //     function(er, docs) {
        //         if(er){sys.puts("Error: "+sys.inspect(er)); return;}
        //         for(d in docs){
        //             client.send({"type":"message",
        //                         "geometry":docs[d].geometry,
        //                         "date":docs[d].value.date,
        //                         "message":docs[d].value.message});
        //         }

        //     });

    },
    message: function(client, msg){

        console.log(msg);
        // save message to the database
        msg.date = new Date();
        // db.save(msg, function (err, res) {
        //         if(err){sys.puts("error: "+sys.inspect(err));}
        //     });

        for(s in mapchat.subscriptions){
            sub = mapchat.subscriptions[s];
            
            //We dont need to send a message to the same client that sent the message.
            if(sub.client.sessionId != client.sessionId){

                //check see if the bounds match.
                point = new geojs.point(msg.geometry);
                if(sub.bounds.contains(point)){
                    sub.client.send({"type":"message", "geometry":msg.geometry, "message":msg.message});
                }else{
                    sys.puts("not in the box")
                }
            }
        }

    },
    sendChatClusters: function(client){
        if(client != undefined){
            // Send to just the one client
            client.send({"type":"clusters", "clusters":mapchat.clusters});
        }else{
            // Send to all subscriptions
            for(s in mapchat.subscriptions){
                sub = mapchat.subscriptions[s];
                sub.client.send({"type":"clusters", "clusters":mapchat.clusters});
            }
        }
    },
    getChatClusters: function(){
    //     db.spatiallist("geo/proximity-clustering/recentPoints", {"bbox":"-180,-90,180,90",
    //                                                              "sort":"true",
    //                                                              "limit":"5",
    //                                                              "nopoints":"true"},
    //         function(er, docs) {
    //             if(er){sys.puts("Error: "+sys.inspect(er));return;}

    //             var doneFetchingContext = function(docswithcontext){
    //                 mapchat.clusters = docswithcontext;
    //                 mapchat.sendChatClusters();
    //                 setTimeout(mapchat.getChatClusters, (1000*600));
    //             }
    //             count = docs.length;
    //             for(d in docs){
    //                 (function(doc){
    //                     sg.getContextByLatLng(docs[d].center.coordinates[1],
    //                                           docs[d].center.coordinates[0],
    //                                           function(error,data,res){
    //                         var city = "",
    //                             state = "",
    //                             country = "";
    //                         for(f in data.features){
    //                             if(data.features[f].classifiers[0].category == "National"){
    //                                 country = data.features[f].name.replace("United States of America", "USA");
    //                             }else if(data.features[f].classifiers[0].category == "Subnational"){
    //                                 state = data.features[f].name;
    //                             }else if(data.features[f].classifiers[0].category == "Municipal"){
    //                                 city = data.features[f].name;
    //                             }else if(data.features[f].classifiers[0].category == "Urban Area"){
    //                                 city = data.features[f].name;
    //                             }
    //                         }
    //                         names = [];
    //                         if(city != ""){ names.push(city);}
    //                         if(state != ""){ names.push(state);}
    //                         if(country != ""){ names.push(country);}
    //                         doc.locationName = names.join(", ");
    //                         count--;
    //                         if(count === 0){doneFetchingContext(docs)};
    //                     });})(docs[d]);

    //             }


    //         });
    }
};

mapchat.getChatClusters();


sio.sockets.on('connection', function (socket) {
 
    // socket.emit('news', {
    //   title: 'Welcome to World News',
    //   contents: 'This news flash was sent from Node.js!',
    //   allowResponse: true 
    // });

    // socket.on('scoop', function(data) { 
    //   socket.emit('news', {
    //     title: 'Circular Emissions Worked',
    //     contents: 'Received this content: ' + data.contents 
    //   });
    // });

    //socket.send({message: "hello" });
    
    socket.on('message', function(msg){ 
      
      if(msg.action == "subscribe"){
        mapchat.subscribe(this, msg);
      }
      else if(msg.action="message"){ 
        mapchat.message(this,msg);
      }

    });

});



app.get('/', handle_facebook_request);
app.post('/', handle_facebook_request);
